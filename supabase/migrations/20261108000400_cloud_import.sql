-- Atomic, explicit empty-account import. IDs/legacy sequencing are normalized in
-- the browser; the server independently validates relationships and transitions.
begin;
create function daily_deck_private.import_deck(u uuid,deck jsonb) returns void language plpgsql set search_path='' as $$
declare t jsonb; c jsonb; e jsonb; v jsonb; a jsonb; id uuid; tid uuid; cid uuid; prior date; previous public.daily_deck_events; day date; kind text; event_id uuid; last_seq bigint; seq bigint; seen_seq bigint[]:='{}'; n integer; terminal boolean; action text;
begin
 perform daily_deck_private.keys(deck,array['version','tasks','cards']);
 if deck->>'version' is distinct from '1' or jsonb_typeof(deck->'tasks') is distinct from 'array' or jsonb_typeof(deck->'cards') is distinct from 'array'
 or jsonb_array_length(deck->'tasks')>10000 or jsonb_array_length(deck->'cards')>100000 then raise exception 'Invalid import format or size' using errcode='22023';end if;
 for t in select * from jsonb_array_elements(deck->'tasks') loop
  perform daily_deck_private.keys(t,array['id','kind','title','notes','minutes','weekdays','created','through','archived','icon','photoId','deadline','remind','scheduleVersions','deadlineVersions']);
  id:=(t->>'id')::uuid;
  if jsonb_typeof(t->'weekdays') is distinct from 'array' or (t->>'minutes')::integer<1 or jsonb_array_length(t->'weekdays')<>(select count(distinct x) from jsonb_array_elements_text(t->'weekdays')x) then raise exception 'Invalid task metadata' using errcode='22023';end if;
  if (t->>'created')!~'^\d{4}-\d{2}-\d{2}$' or jsonb_typeof(t->'archived') is distinct from 'boolean' then raise exception 'Invalid imported task' using errcode='22023';end if;
  if t->>'deadline' is not null and (t->>'deadline')!~'^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'Invalid deadline' using errcode='22023';end if;
  perform daily_deck_private.require_photo(u,(t->>'photoId')::uuid);
  insert into public.daily_deck_items(owner_id,id,kind,title,notes,legacy_minutes,weekdays,created_on,generated_through,archived,icon,photo_id,deadline_local,remind_30_min)
  values(u,id,t->>'kind',t->>'title',t->>'notes',(t->>'minutes')::integer,array(select x::smallint from jsonb_array_elements_text(t->'weekdays')x),(t->>'created')::date,(t->>'through')::date,(t->>'archived')::boolean,coalesce(t->>'icon','neutral'),(t->>'photoId')::uuid,(t->>'deadline')::time,coalesce((t->>'remind')::boolean,false));
  if t->>'kind'='habit' then
   prior:=null;
   for v in select * from jsonb_array_elements(coalesce(t->'scheduleVersions',jsonb_build_array(jsonb_build_object('effectiveFrom',coalesce(((t->>'through')::date+1)::text,t->>'created'),'weekdays',t->'weekdays','title',t->>'title','notes',t->>'notes','minutes',t->'minutes')))) loop
    if (v->>'minutes')::integer<1 or jsonb_array_length(v->'weekdays')<>(select count(distinct x) from jsonb_array_elements_text(v->'weekdays')x) then raise exception 'Invalid schedule metadata' using errcode='22023';end if;
    perform daily_deck_private.keys(v,array['effectiveFrom','weekdays','title','notes','minutes','edited']);day:=(v->>'effectiveFrom')::date;
    if day is null or (prior is not null and day<=prior) then raise exception 'Invalid schedule revision order' using errcode='23514';end if;prior:=day;
    insert into public.daily_deck_schedule_versions(owner_id,item_id,effective_from,weekdays,title,notes,legacy_minutes,edited)
    values(u,id,day,array(select x::smallint from jsonb_array_elements_text(v->'weekdays')x),v->>'title',v->>'notes',(v->>'minutes')::integer,coalesce((v->>'edited')::boolean,false));
   end loop;
   if prior is null then raise exception 'Missing habit schedule' using errcode='23514';end if;
  elsif t ? 'scheduleVersions' then raise exception 'One-time task cannot have habit revisions' using errcode='23514';end if;
  prior:=null;
  for v in select * from jsonb_array_elements(coalesce(t->'deadlineVersions',jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('effectiveFrom',t->>'created','deadline',t->>'deadline','remind',coalesce((t->>'remind')::boolean,false)))))) loop
   perform daily_deck_private.keys(v,array['effectiveFrom','deadline','remind']);day:=(v->>'effectiveFrom')::date;
   if day is null or (prior is not null and day<=prior) or(v->>'deadline' is not null and(v->>'deadline')!~'^([01][0-9]|2[0-3]):[0-5][0-9]$') then raise exception 'Invalid deadline revision' using errcode='23514';end if;prior:=day;
   insert into public.daily_deck_deadline_versions(owner_id,item_id,effective_from,deadline_local,remind_30_min) values(u,id,day,(v->>'deadline')::time,coalesce((v->>'remind')::boolean,false));
  end loop;
 end loop;
 for c in select * from jsonb_array_elements(deck->'cards') loop
  perform daily_deck_private.keys(c,array['id','taskId','habit','day','title','notes','minutes','initialOrder','icon','photoId','deadline','remind','appearances','events']);
  if jsonb_typeof(c->'habit') is distinct from 'boolean' or jsonb_typeof(c->'events') is distinct from 'array' or (c->>'minutes')::integer<1 then raise exception 'Invalid occurrence metadata' using errcode='22023';end if;
  cid:=(c->>'id')::uuid;tid:=(c->>'taskId')::uuid;kind:=case when (c->>'habit')::boolean then 'habit' else 'today' end;
  if not exists(select 1 from public.daily_deck_items it where it.owner_id=u and it.id=tid and it.created_on<=(c->>'day')::date) or(c->>'deadline' is not null and(c->>'deadline')!~'^([01][0-9]|2[0-3]):[0-5][0-9]$') then raise exception 'Invalid occurrence snapshot' using errcode='23514';end if;
  perform daily_deck_private.require_photo(u,(c->>'photoId')::uuid);
  insert into public.daily_deck_occurrences(owner_id,id,item_id,kind,scheduled_on,title,notes,legacy_minutes,initial_order,icon,photo_id,deadline_local,remind_30_min)
  values(u,cid,tid,kind,(c->>'day')::date,c->>'title',c->>'notes',(c->>'minutes')::integer,(c->>'initialOrder')::bigint,coalesce(c->>'icon','neutral'),(c->>'photoId')::uuid,(c->>'deadline')::time,coalesce((c->>'remind')::boolean,false));
  prior:=null;
  for a in select * from jsonb_array_elements(coalesce(c->'appearances','[]')) loop
   perform daily_deck_private.keys(a,array['day','icon','photoId']);day:=(a->>'day')::date;
   if day<(c->>'day')::date or(prior is not null and day<=prior) then raise exception 'Invalid appearance revision' using errcode='23514';end if;prior:=day;
   perform daily_deck_private.require_photo(u,(a->>'photoId')::uuid);
   insert into public.daily_deck_appearance_versions(owner_id,occurrence_id,effective_on,icon,photo_id) values(u,cid,day,a->>'icon',(a->>'photoId')::uuid);
  end loop;
  last_seq:=0;previous:=null;
  for e in select * from jsonb_array_elements(c->'events') loop
   perform daily_deck_private.keys(e,array['id','action','at','day','order','sequence','target']);seq:=(e->>'sequence')::bigint;action:=e->>'action';
   if not isfinite((e->>'at')::timestamptz) or seq is null or seq<=last_seq or seq=any(seen_seq) or (e->>'day')::date<(c->>'day')::date then raise exception 'Invalid event sequence/date' using errcode='23514';end if;
   seen_seq:=array_append(seen_seq,seq);last_seq:=seq;
   if action='undo' then
    if previous.id is null or previous.id is distinct from (e->>'target')::uuid or previous.action not in('done','later','skip') or previous.action_on<>(e->>'day')::date then raise exception 'Invalid historical Undo' using errcode='23514';end if;
   elsif e ? 'target' or daily_deck_private.terminal(u,cid) then raise exception 'Invalid historical transition' using errcode='23514';end if;
   insert into public.daily_deck_events(owner_id,id,occurrence_id,action,occurred_at,action_on,sequence,deck_order,undo_target_id)
   values(u,(e->>'id')::uuid,cid,action,(e->>'at')::timestamptz,(e->>'day')::date,seq,(e->>'order')::bigint,(e->>'target')::uuid) returning * into previous;
  end loop;
 end loop;
 if exists(select 1 from public.daily_deck_items it where it.owner_id=u and it.kind='today' and not exists(select 1 from public.daily_deck_occurrences oc where oc.owner_id=u and oc.item_id=it.id)) then raise exception 'One-time task is missing its occurrence' using errcode='23514';end if;
end $$;
revoke all on function daily_deck_private.import_deck(uuid,jsonb) from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
