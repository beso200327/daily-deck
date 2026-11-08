-- Additive, Preview-gated web synchronization. Never rerun migrations 001/002.
begin;
create table public.daily_deck_sync_heads (
 owner_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
 revision bigint not null default 0 check (revision>=0),
 import_id uuid,
 updated_at timestamptz not null default clock_timestamp()
);
alter table public.daily_deck_sync_heads enable row level security;
alter table public.daily_deck_sync_heads force row level security;
revoke all on public.daily_deck_sync_heads from public,anon,authenticated;
grant select on public.daily_deck_sync_heads to authenticated;
create policy sync_head_owner on public.daily_deck_sync_heads for select to authenticated using(owner_id=(select auth.uid()) and (select public.daily_deck_account_access()));
create table daily_deck_private.sync_receipts (
 owner_id uuid not null references auth.users(id) on delete cascade,
 request_id uuid not null,
 request jsonb not null,
 revision bigint not null,
 primary key(owner_id,request_id)
);
revoke all on daily_deck_private.sync_receipts from public,anon,authenticated;
-- All semantic writes now go through the serialized, validated transaction API.
do $$ declare t text; begin
 foreach t in array array['daily_deck_photos','daily_deck_items','daily_deck_schedule_versions','daily_deck_deadline_versions','daily_deck_occurrences','daily_deck_appearance_versions','daily_deck_events'] loop
  execute format('revoke insert,update,delete on public.%I from authenticated',t);
 end loop;
 -- REVOKE table UPDATE does not remove the foundation's column grants.
 revoke update(title,notes,legacy_minutes,weekdays,generated_through,archived,icon,photo_id,deadline_local,remind_30_min) on public.daily_deck_items from authenticated;
end $$;

create function daily_deck_private.keys(v jsonb, allowed text[]) returns void language plpgsql set search_path='' as $$
begin
 if jsonb_typeof(v) is distinct from 'object' or exists(select 1 from jsonb_object_keys(v) k where not k=any(allowed)) then
  raise exception 'Invalid transaction fields' using errcode='22023';
 end if;
end $$;
create function daily_deck_private.last_event(u uuid,c uuid,d date default '9999-12-31') returns public.daily_deck_events
language sql stable set search_path='' as $$
 select e from public.daily_deck_events e where e.owner_id=u and e.occurrence_id=c and e.action_on<=d and e.action<>'undo'
 and not exists(select 1 from public.daily_deck_events x where x.owner_id=u and x.occurrence_id=c and x.action='undo' and x.undo_target_id=e.id and x.action_on<=d)
 order by e.sequence desc limit 1
$$;
create function daily_deck_private.terminal(u uuid,c uuid) returns boolean language sql stable set search_path='' as $$
 select coalesce((select e.action in ('done','skip','delete') from public.daily_deck_events e where e.owner_id=u and e.occurrence_id=c and e.action not in ('undo','reorder')
 and not exists(select 1 from public.daily_deck_events x where x.owner_id=u and x.occurrence_id=c and x.action='undo' and x.undo_target_id=e.id) order by e.sequence desc limit 1),false)
$$;
create function daily_deck_private.card_order(u uuid,c uuid) returns bigint language sql stable set search_path='' as $$
 select coalesce((daily_deck_private.last_event(u,c)).deck_order,(select initial_order from public.daily_deck_occurrences where owner_id=u and id=c))
$$;
create function daily_deck_private.pending(u uuid,d date) returns setof public.daily_deck_occurrences language sql stable set search_path='' as $$
 select c from public.daily_deck_occurrences c where c.owner_id=u and ((c.kind='habit' and c.scheduled_on=d) or(c.kind='today' and c.scheduled_on<=d)) and not daily_deck_private.terminal(u,c.id)
 order by daily_deck_private.card_order(u,c.id),c.id
$$;
create function daily_deck_private.event(u uuid,c uuid,a text,d date,o bigint,target uuid default null,stamp timestamptz default clock_timestamp()) returns void language sql set search_path='' as $$
 insert into public.daily_deck_events(owner_id,occurrence_id,action,action_on,occurred_at,sequence,deck_order,undo_target_id)
 values(u,c,a,d,stamp,(select coalesce(max(sequence),0)+1 from public.daily_deck_events where owner_id=u),o,target)
$$;

create function daily_deck_private.reconcile(u uuid,today date) returns boolean language plpgsql set search_path='' as $$
declare t public.daily_deck_items; v public.daily_deck_schedule_versions; dl public.daily_deck_deadline_versions; day date; from_day date; end_day date; next_order bigint; changed boolean:=false; n bigint;
begin
 select coalesce(max(daily_deck_private.card_order(u,id)),0) into next_order from public.daily_deck_occurrences where owner_id=u;
 for t in select * from public.daily_deck_items where owner_id=u and not archived order by created_at,id loop
  -- A carried one-time task is one occurrence, not one query per missed date.
  if t.kind='today' and exists(select 1 from public.daily_deck_occurrences oc where oc.owner_id=u and oc.item_id=t.id) then
   if t.generated_through is null or t.generated_through<today then update public.daily_deck_items set generated_through=today where owner_id=u and id=t.id;changed:=true;end if;
   continue;
  end if;
  from_day:=case when t.kind='today' then t.created_on else coalesce(t.generated_through+1,t.created_on) end;
  end_day:=case when t.kind='today' then t.created_on else today end;
  -- Ensure today even after travel/backwards clock changes, without rewriting the cursor.
  for day in select x::date from generate_series(from_day::timestamp,end_day::timestamp,interval '1 day') x union select today loop
   if day<t.created_on then continue; end if;
   if exists(select 1 from public.daily_deck_occurrences where owner_id=u and item_id=t.id and (scheduled_on=day or t.kind='today')) then continue; end if;
   if t.kind='habit' then
    select * into v from public.daily_deck_schedule_versions where owner_id=u and item_id=t.id and effective_from<=day order by effective_from desc,recorded_at desc,id desc limit 1;
    if v.id is null or not extract(dow from day)::smallint=any(v.weekdays) then continue; end if;
   elsif day<>t.created_on then continue;
   end if;
   select * into dl from public.daily_deck_deadline_versions where owner_id=u and item_id=t.id and effective_from<=day order by effective_from desc,recorded_at desc,id desc limit 1;
   next_order:=greatest(0,next_order)+1;
   insert into public.daily_deck_occurrences(owner_id,item_id,kind,scheduled_on,title,notes,legacy_minutes,initial_order,icon,photo_id,deadline_local,remind_30_min)
   values(u,t.id,t.kind,day,case when t.kind='habit' then v.title else t.title end,case when t.kind='habit' then v.notes else t.notes end,case when t.kind='habit' then v.legacy_minutes else t.legacy_minutes end,next_order,t.icon,t.photo_id,dl.deadline_local,coalesce(dl.remind_30_min,false));
   changed:=true;
   select count(*) into n from public.daily_deck_occurrences where owner_id=u;
   if n>100000 then raise exception 'Cloud history limit reached' using errcode='54000'; end if;
  end loop;
  if t.generated_through is null or t.generated_through<today then update public.daily_deck_items set generated_through=today where owner_id=u and id=t.id;changed:=true;end if;
 end loop;
 return changed;
end $$;

create function daily_deck_private.snapshot(u uuid) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('owner_id',u,'revision',coalesce((select revision from public.daily_deck_sync_heads where owner_id=u),0),
 'import_id',(select import_id from public.daily_deck_sync_heads where owner_id=u),
 'imported',coalesce((select import_id is not null from public.daily_deck_sync_heads where owner_id=u),false),
 'deck',jsonb_build_object('version',1,'tasks',coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
 'id',t.id,'kind',t.kind,'title',t.title,'notes',t.notes,'weekdays',t.weekdays,'created',t.created_on,'through',t.generated_through,'archived',t.archived,'icon',t.icon,'photoId',t.photo_id,'deadline',to_char(t.deadline_local,'HH24:MI'),'remind',t.remind_30_min,
 'deadlineVersions',(select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('effectiveFrom',s.effective_from,'deadline',to_char(s.deadline_local,'HH24:MI'),'remind',s.remind_30_min)) order by s.effective_from) from(select distinct on(effective_from) * from public.daily_deck_deadline_versions where owner_id=u and item_id=t.id order by effective_from,recorded_at desc,id desc)s)
 ))||jsonb_build_object('minutes',t.legacy_minutes)||case when t.kind='habit' then jsonb_build_object('scheduleVersions',case when t.kind='habit' then (select jsonb_agg(jsonb_build_object('effectiveFrom',s.effective_from,'weekdays',s.weekdays,'title',s.title,'notes',s.notes,'minutes',s.legacy_minutes,'edited',s.edited) order by s.effective_from) from(select distinct on(effective_from) * from public.daily_deck_schedule_versions where owner_id=u and item_id=t.id order by effective_from,recorded_at desc,id desc)s) end) else '{}'::jsonb end order by t.created_at,t.id) from public.daily_deck_items t where owner_id=u),'[]'::jsonb),
 'cards',coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id',c.id,'taskId',c.item_id,'habit',c.kind='habit','day',c.scheduled_on,'title',c.title,'notes',c.notes,'initialOrder',c.initial_order,'icon',c.icon,'photoId',c.photo_id,'deadline',to_char(c.deadline_local,'HH24:MI'),'remind',c.remind_30_min,
 'appearances',(select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('day',a.effective_on,'icon',a.icon,'photoId',a.photo_id)) order by a.effective_on) from(select distinct on(effective_on)* from public.daily_deck_appearance_versions where owner_id=u and occurrence_id=c.id order by effective_on,recorded_at desc,id desc)a),
 'events',coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id',e.id,'action',e.action,'day',e.action_on,'at',e.occurred_at,'order',e.deck_order,'target',e.undo_target_id,'sequence',e.sequence)) order by e.sequence) from public.daily_deck_events e where e.owner_id=u and e.occurrence_id=c.id),'[]'::jsonb)
 ))||jsonb_build_object('minutes',c.legacy_minutes) order by c.created_at,c.id) from public.daily_deck_occurrences c where owner_id=u),'[]'::jsonb)),
 'photos',coalesce((select jsonb_agg(to_jsonb(p)||jsonb_build_object('referenced',exists(select 1 from public.daily_deck_items it where it.owner_id=u and it.photo_id=p.id) or exists(select 1 from public.daily_deck_occurrences oc where oc.owner_id=u and oc.photo_id=p.id) or exists(select 1 from public.daily_deck_appearance_versions av where av.owner_id=u and av.photo_id=p.id)) order by p.id) from public.daily_deck_photos p where owner_id=u),'[]'::jsonb))
$$;

-- Photo metadata registration is immutable and idempotent. Storage bytes still use
-- the authenticated Storage API, never SQL writes to managed objects.
create function public.daily_deck_photo(p_expected_user uuid,p_id uuid,p_metadata jsonb default null,p_cleanup boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); p public.daily_deck_photos; existing public.daily_deck_photos;
begin
 if u is null or p_expected_user is distinct from u or not public.daily_deck_account_access() then raise exception 'Account access required' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 if p_cleanup then
  if p_metadata is not null then raise exception 'Invalid cleanup' using errcode='22023';end if;
  select * into p from public.daily_deck_photos where owner_id=u and id=p_id for update;
  if p.id is null then return jsonb_build_object('removed',true);end if;
  -- Foreign keys on every historical/base/appearance reference deliberately block removal.
  delete from public.daily_deck_photos where owner_id=u and id=p_id;
  return jsonb_build_object('removed',true,'source_path',p.source_path,'rendered_path',p.rendered_path);
 end if;
 perform daily_deck_private.keys(p_metadata,array['source_extension','source_width','source_height','source_bytes','rendered_width','rendered_bytes','crop_x','crop_y','crop_zoom']);
 p:=jsonb_populate_record(null::public.daily_deck_photos,p_metadata||jsonb_build_object('owner_id',u,'id',p_id));
 select * into existing from public.daily_deck_photos where owner_id=u and id=p_id;
 if existing.id is not null then
  if (to_jsonb(existing)-array['created_at','source_path','rendered_path','rendered_height']) is distinct from (to_jsonb(p)-array['created_at','source_path','rendered_path','rendered_height']) then raise exception 'Photo ID already has different metadata' using errcode='23505';end if;
  return to_jsonb(existing);
 end if;
 insert into public.daily_deck_photos(owner_id,id,source_extension,source_width,source_height,source_bytes,rendered_width,rendered_bytes,crop_x,crop_y,crop_zoom)
 values(u,p_id,p.source_extension,p.source_width,p.source_height,p.source_bytes,p.rendered_width,p.rendered_bytes,p.crop_x,p.crop_y,p.crop_zoom) returning * into p;
 return to_jsonb(p);
end $$;
create function daily_deck_private.require_photo(u uuid,p uuid) returns void language plpgsql set search_path='' as $$
declare m public.daily_deck_photos; begin
 if p is null then return;end if;
 select * into m from public.daily_deck_photos where owner_id=u and id=p for key share;
 if m.id is null or not exists(select 1 from storage.objects where bucket_id='daily-deck-photos' and name=m.source_path and (metadata->>'size')::bigint=m.source_bytes and metadata->>'mimetype'=case when m.source_extension in('jpg','jpeg') then 'image/jpeg' else 'image/'||m.source_extension end)
 or not exists(select 1 from storage.objects where bucket_id='daily-deck-photos' and name=m.rendered_path and (metadata->>'size')::bigint=m.rendered_bytes and metadata->>'mimetype'='image/jpeg') then raise exception 'Photo upload is incomplete' using errcode='23514';end if;
end $$;

create function daily_deck_private.save_item(u uuid,v jsonb,today date) returns void language plpgsql set search_path='' as $$
declare old public.daily_deck_items; t public.daily_deck_items; days smallint[]; effective date; c public.daily_deck_occurrences; n bigint; fresh boolean;
begin
 perform daily_deck_private.keys(v,array['id','kind','title','notes','minutes','weekdays','icon','photoId','deadline','remind']);
 if jsonb_typeof(v->'weekdays') is distinct from 'array' or jsonb_typeof(v->'title') is distinct from 'string' or jsonb_typeof(v->'notes') is distinct from 'string' then raise exception 'Invalid task' using errcode='22023';end if;
 select array_agg(x::smallint) into days from jsonb_array_elements_text(v->'weekdays')x;
 days:=coalesce(days,'{}');if cardinality(days)<>(select count(distinct x) from unnest(days)x) then raise exception 'Duplicate weekdays' using errcode='22023';end if;
 if v->>'deadline' is not null and (v->>'deadline')!~'^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'Invalid deadline' using errcode='22023';end if;
 t:=jsonb_populate_record(null::public.daily_deck_items,jsonb_build_object('owner_id',u,'id',(v->>'id')::uuid,'kind',v->>'kind','title',btrim(v->>'title'),'notes',v->>'notes','legacy_minutes',v->'minutes','weekdays',to_jsonb(days),'icon',coalesce(v->>'icon','neutral'),'photo_id',(v->>'photoId')::uuid,'deadline_local',v->>'deadline','remind_30_min',coalesce((v->>'remind')::boolean,false)));
 if t.legacy_minutes is not null and t.legacy_minutes<1 then raise exception 'Invalid archived duration' using errcode='22023';end if;
 perform daily_deck_private.require_photo(u,t.photo_id);
 select * into old from public.daily_deck_items where owner_id=u and id=t.id;
 fresh:=old.id is null;
 if fresh then
  if t.kind='habit' and (select count(*) from public.daily_deck_items where owner_id=u and kind='habit' and not archived)>=5 then raise exception 'Free habit allowance reached' using errcode='P0001';end if;
  if t.kind='today' and (select count(*) from public.daily_deck_items x where x.owner_id=u and x.kind='today' and not x.archived and exists(select 1 from public.daily_deck_occurrences oc where oc.owner_id=u and oc.item_id=x.id and not daily_deck_private.terminal(u,oc.id)))>=10 then raise exception 'Free task allowance reached' using errcode='P0001';end if;
  insert into public.daily_deck_items(owner_id,id,kind,title,notes,legacy_minutes,weekdays,created_on,icon,photo_id,deadline_local,remind_30_min)
  values(u,t.id,t.kind,t.title,t.notes,t.legacy_minutes,days,today,t.icon,t.photo_id,t.deadline_local,t.remind_30_min);
  if t.kind='habit' then insert into public.daily_deck_schedule_versions(owner_id,item_id,effective_from,weekdays,title,notes,legacy_minutes) values(u,t.id,today,days,t.title,t.notes,t.legacy_minutes);end if;
  insert into public.daily_deck_deadline_versions(owner_id,item_id,effective_from,deadline_local,remind_30_min) values(u,t.id,today,t.deadline_local,t.remind_30_min);
 else
  if old.archived or old.kind<>t.kind then raise exception 'Task is deleted or type changed' using errcode='23514';end if;
  effective:=greatest(today,coalesce(old.generated_through,today))+1;
  if t.kind='habit' and (old.title,old.notes,old.legacy_minutes,old.weekdays) is distinct from (t.title,t.notes,t.legacy_minutes,days) then
   insert into public.daily_deck_schedule_versions(owner_id,item_id,effective_from,weekdays,title,notes,legacy_minutes,edited) values(u,t.id,effective,days,t.title,t.notes,t.legacy_minutes,true);
  end if;
  if (old.deadline_local,old.remind_30_min) is distinct from(t.deadline_local,t.remind_30_min) then
   insert into public.daily_deck_deadline_versions(owner_id,item_id,effective_from,deadline_local,remind_30_min) values(u,t.id,today,t.deadline_local,t.remind_30_min);
   update public.daily_deck_occurrences set deadline_local=t.deadline_local,remind_30_min=t.remind_30_min where owner_id=u and item_id=t.id and not daily_deck_private.terminal(u,id) and(kind='today' or scheduled_on>=today);
  end if;
  if t.kind='today' then update public.daily_deck_occurrences set title=t.title,notes=t.notes,legacy_minutes=t.legacy_minutes where owner_id=u and item_id=t.id and not daily_deck_private.terminal(u,id);end if;
  if (old.icon,old.photo_id) is distinct from(t.icon,t.photo_id) then
   for c in select * from daily_deck_private.pending(u,today) where item_id=t.id loop
    insert into public.daily_deck_appearance_versions(owner_id,occurrence_id,effective_on,icon,photo_id) values(u,c.id,today,t.icon,t.photo_id);
   end loop;
  end if;
  update public.daily_deck_items set title=t.title,notes=t.notes,legacy_minutes=t.legacy_minutes,weekdays=days,icon=t.icon,photo_id=t.photo_id,deadline_local=t.deadline_local,remind_30_min=t.remind_30_min where owner_id=u and id=t.id;
 end if;
 perform daily_deck_private.reconcile(u,today);
 if fresh then
  select coalesce(min(daily_deck_private.card_order(u,id)),0)-1 into n from daily_deck_private.pending(u,today) where item_id<>t.id;
  update public.daily_deck_occurrences set initial_order=least(0,n) where owner_id=u and item_id=t.id and scheduled_on=today;
 end if;
end $$;

create function public.daily_deck_sync(p_expected_user uuid,p_operation text,p_request_id uuid,p_revision bigint,p_args jsonb,p_timezone text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); h public.daily_deck_sync_heads; receipt daily_deck_private.sync_receipts; request jsonb; today date; changed boolean; c public.daily_deck_occurrences; e public.daily_deck_events; n bigint; ids uuid[]; cid uuid; i integer; v jsonb;
begin
 if u is null or p_expected_user is distinct from u or not public.daily_deck_account_access() then raise exception 'Account access required' using errcode='42501';end if;
 if not exists(select 1 from pg_timezone_names where name=p_timezone) then raise exception 'Invalid local timezone' using errcode='22023';end if;
 today:=(clock_timestamp() at time zone p_timezone)::date;
 if p_request_id is null or p_args is null or pg_column_size(p_args)>10485760 then raise exception 'Invalid or oversized request' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 insert into public.daily_deck_sync_heads(owner_id) values(u) on conflict do nothing;
 select * into h from public.daily_deck_sync_heads where owner_id=u for update;
 request:=jsonb_build_object('operation',p_operation,'revision',p_revision,'args',p_args,'timezone',p_timezone);
 select * into receipt from daily_deck_private.sync_receipts where owner_id=u and request_id=p_request_id;
 if receipt.request_id is not null then
  if receipt.request is distinct from request then raise exception 'Request ID reused with different content' using errcode='23505';end if;
  return daily_deck_private.snapshot(u);
 end if;
 if p_operation<>'read' and p_revision is distinct from h.revision then raise exception 'Cloud revision changed; refresh before trying again' using errcode='40001';end if;
 if p_operation<>'read' and p_args->>'localDay' is distinct from today::text then raise exception 'Local day changed; refresh before trying again' using errcode='40001';end if;
 if p_operation='import' then
  perform daily_deck_private.keys(p_args,array['localDay','deck']);
  if exists(select 1 from public.daily_deck_items where owner_id=u) or h.import_id is not null then raise exception 'Cloud already contains a deck; import cannot merge or replace it' using errcode='23514';end if;
  perform daily_deck_private.import_deck(u,p_args->'deck');
  update public.daily_deck_sync_heads set import_id=p_request_id where owner_id=u;
  changed:=true;
 else
  changed:=daily_deck_private.reconcile(u,today);
  if p_operation='read' then perform daily_deck_private.keys(p_args,'{}');
  elsif p_operation='save' then
   perform daily_deck_private.keys(p_args,array['localDay','task']);perform daily_deck_private.save_item(u,p_args->'task',today);changed:=true;
  elsif p_operation='action' then
   perform daily_deck_private.keys(p_args,array['localDay','cardId','action']);
   if p_args->>'action' not in('done','later','skip') then raise exception 'Invalid action' using errcode='22023';end if;
   select * into c from daily_deck_private.pending(u,today) limit 1;
   if c.id is null or c.id is distinct from (p_args->>'cardId')::uuid then raise exception 'Active card changed' using errcode='40001';end if;
   n:=daily_deck_private.card_order(u,c.id);
   if p_args->>'action'='later' then select greatest(0,coalesce(max(daily_deck_private.card_order(u,id)),0))+1 into n from public.daily_deck_occurrences where owner_id=u;end if;
   perform daily_deck_private.event(u,c.id,p_args->>'action',today,n);changed:=true;
  elsif p_operation='undo' then
   perform daily_deck_private.keys(p_args,array['localDay','eventId']);
   select * into e from public.daily_deck_events where owner_id=u and id=(p_args->>'eventId')::uuid;
   if e.id is null or e.action not in('done','later','skip') or e.action_on<>today
    or exists(select 1 from public.daily_deck_events where owner_id=u and occurrence_id=e.occurrence_id and sequence>e.sequence)
    or exists(select 1 from public.daily_deck_occurrences oc join public.daily_deck_items it on it.owner_id=oc.owner_id and it.id=oc.item_id where oc.owner_id=u and oc.id=e.occurrence_id and oc.kind='habit' and it.archived) then raise exception 'Undo is no longer available' using errcode='40001';end if;
   perform daily_deck_private.event(u,e.occurrence_id,'undo',today,e.deck_order,e.id);changed:=true;
  elsif p_operation='delete' then
   perform daily_deck_private.keys(p_args,array['localDay','taskId']);
   update public.daily_deck_items set archived=true where owner_id=u and id=(p_args->>'taskId')::uuid and not archived;
   if not found then raise exception 'Task changed or does not exist' using errcode='40001';end if;
   for c in select * from public.daily_deck_occurrences where owner_id=u and item_id=(p_args->>'taskId')::uuid and not daily_deck_private.terminal(u,id) and(kind='today' or scheduled_on>=today) loop
    perform daily_deck_private.event(u,c.id,'delete',greatest(today,c.scheduled_on),daily_deck_private.card_order(u,c.id));
   end loop;changed:=true;
  elsif p_operation='reorder' then
   perform daily_deck_private.keys(p_args,array['localDay','ids']);
   select array_agg(x::uuid) into ids from jsonb_array_elements_text(p_args->'ids')x;
   if coalesce(cardinality(ids),0)<>(select count(*) from daily_deck_private.pending(u,today)) or cardinality(ids)<>(select count(distinct x) from unnest(ids)x) or exists(select 1 from unnest(ids)x where not exists(select 1 from daily_deck_private.pending(u,today)oc where oc.id=x)) then raise exception 'Deck order changed' using errcode='40001';end if;
   i:=0;foreach cid in array coalesce(ids,'{}') loop perform daily_deck_private.event(u,cid,'reorder',today,i);i:=i+1;end loop;changed:=true;
  else raise exception 'Unsupported operation' using errcode='22023';end if;
 end if;
 if changed then update public.daily_deck_sync_heads set revision=revision+1,updated_at=clock_timestamp() where owner_id=u returning * into h;end if;
 if p_operation<>'read' then insert into daily_deck_private.sync_receipts(owner_id,request_id,request,revision) values(u,p_request_id,request,h.revision);end if;
 return daily_deck_private.snapshot(u);
end $$;
-- Resolve a lost response without resending photo bytes or trusting a browser cache.
create function public.daily_deck_sync_status(p_expected_user uuid,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); begin
 if u is null or p_expected_user is distinct from u or not public.daily_deck_account_access() then raise exception 'Account access required' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 return jsonb_build_object('applied',exists(select 1 from daily_deck_private.sync_receipts where owner_id=u and request_id=p_request_id),'snapshot',daily_deck_private.snapshot(u));
end $$;
revoke all on function public.daily_deck_sync_status(uuid,uuid) from public,anon,authenticated;
grant execute on function public.daily_deck_sync_status(uuid,uuid) to authenticated;
-- import_deck is defined in the next migration; all migrations must be applied in order.
revoke all on all functions in schema daily_deck_private from public,anon,authenticated;
revoke all on function public.daily_deck_photo(uuid,uuid,jsonb,boolean) from public,anon,authenticated;
revoke all on function public.daily_deck_sync(uuid,text,uuid,bigint,jsonb,text) from public,anon,authenticated;
grant execute on function public.daily_deck_photo(uuid,uuid,jsonb,boolean) to authenticated;
grant execute on function public.daily_deck_sync(uuid,text,uuid,bigint,jsonb,text) to authenticated;
notify pgrst,'reload schema';
commit;
