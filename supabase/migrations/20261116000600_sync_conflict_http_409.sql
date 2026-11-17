-- Business conflicts must reach the caller, not Hasql's serialization retry loop.
-- Keep every guard, lock, receipt lookup and write unchanged; only the six
-- application conflict SQLSTATEs become PostgREST HTTP 409 (PT409).
begin;
create or replace function public.daily_deck_sync(p_expected_user uuid,p_operation text,p_request_id uuid,p_revision bigint,p_args jsonb,p_timezone text) returns jsonb
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
 if p_operation<>'read' and p_revision is distinct from h.revision then raise exception 'Cloud revision changed; refresh before trying again' using errcode='PT409';end if;
 if p_operation<>'read' and p_args->>'localDay' is distinct from today::text then raise exception 'Local day changed; refresh before trying again' using errcode='PT409';end if;
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
   if c.id is null or c.id is distinct from (p_args->>'cardId')::uuid then raise exception 'Active card changed' using errcode='PT409';end if;
   n:=daily_deck_private.card_order(u,c.id);
   if p_args->>'action'='later' then select greatest(0,coalesce(max(daily_deck_private.card_order(u,id)),0))+1 into n from public.daily_deck_occurrences where owner_id=u;end if;
   perform daily_deck_private.event(u,c.id,p_args->>'action',today,n);changed:=true;
  elsif p_operation='undo' then
   perform daily_deck_private.keys(p_args,array['localDay','eventId']);
   select * into e from public.daily_deck_events where owner_id=u and id=(p_args->>'eventId')::uuid;
   if e.id is null or e.action not in('done','later','skip') or e.action_on<>today
    or exists(select 1 from public.daily_deck_events where owner_id=u and occurrence_id=e.occurrence_id and sequence>e.sequence)
    or exists(select 1 from public.daily_deck_occurrences oc join public.daily_deck_items it on it.owner_id=oc.owner_id and it.id=oc.item_id where oc.owner_id=u and oc.id=e.occurrence_id and oc.kind='habit' and it.archived) then raise exception 'Undo is no longer available' using errcode='PT409';end if;
   perform daily_deck_private.event(u,e.occurrence_id,'undo',today,e.deck_order,e.id);changed:=true;
  elsif p_operation='delete' then
   perform daily_deck_private.keys(p_args,array['localDay','taskId']);
   update public.daily_deck_items set archived=true where owner_id=u and id=(p_args->>'taskId')::uuid and not archived;
   if not found then raise exception 'Task changed or does not exist' using errcode='PT409';end if;
   for c in select * from public.daily_deck_occurrences where owner_id=u and item_id=(p_args->>'taskId')::uuid and not daily_deck_private.terminal(u,id) and(kind='today' or scheduled_on>=today) loop
    perform daily_deck_private.event(u,c.id,'delete',greatest(today,c.scheduled_on),daily_deck_private.card_order(u,c.id));
   end loop;changed:=true;
  elsif p_operation='reorder' then
   perform daily_deck_private.keys(p_args,array['localDay','ids']);
   select array_agg(x::uuid) into ids from jsonb_array_elements_text(p_args->'ids')x;
   if coalesce(cardinality(ids),0)<>(select count(*) from daily_deck_private.pending(u,today)) or cardinality(ids)<>(select count(distinct x) from unnest(ids)x) or exists(select 1 from unnest(ids)x where not exists(select 1 from daily_deck_private.pending(u,today)oc where oc.id=x)) then raise exception 'Deck order changed' using errcode='PT409';end if;
   i:=0;foreach cid in array coalesce(ids,'{}') loop perform daily_deck_private.event(u,cid,'reorder',today,i);i:=i+1;end loop;changed:=true;
  else raise exception 'Unsupported operation' using errcode='22023';end if;
 end if;
 if changed then update public.daily_deck_sync_heads set revision=revision+1,updated_at=clock_timestamp() where owner_id=u returning * into h;end if;
 if p_operation<>'read' then insert into daily_deck_private.sync_receipts(owner_id,request_id,request,revision) values(u,p_request_id,request,h.revision);end if;
 return daily_deck_private.snapshot(u);
end $$;
notify pgrst,'reload schema';
commit;