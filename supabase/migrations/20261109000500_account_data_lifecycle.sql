-- NEW migration only. Never rerun 001-004. Browser roles cannot administer jobs.
begin;
create table daily_deck_private.account_worker(singleton boolean primary key default true check(singleton),last_seen timestamptz);
revoke all on daily_deck_private.account_worker from public,anon,authenticated,service_role;
insert into daily_deck_private.account_worker(singleton) values(true);
create table daily_deck_private.account_deletions (
 owner_id uuid primary key, request_id uuid not null unique, token_hash text not null check(token_hash~'^[a-f0-9]{64}$'),
 stage text not null default 'storage' check(stage in('storage','app','auth','complete')),
 lease uuid, lease_until timestamptz, created_at timestamptz not null default clock_timestamp(), completed_at timestamptz
);
revoke all on daily_deck_private.account_deletions from public,anon,authenticated,service_role;

create or replace function public.daily_deck_account_access() returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from auth.users where id=auth.uid())
 and exists(select 1 from daily_deck_private.auth_configuration where singleton and mode='preview')
 and exists(select 1 from public.daily_deck_profiles where owner_id=auth.uid() and minimum_age=16 and onboarding_kind='preview_test')
 and not exists(select 1 from daily_deck_private.account_deletions where owner_id=auth.uid());
$$;
create function public.daily_deck_lifecycle_status() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('owner_id',auth.uid(),'state',case when auth.uid() is null or not exists(select 1 from auth.users where id=auth.uid()) then 'deleted' when exists(select 1 from daily_deck_private.account_deletions where owner_id=auth.uid()) then 'deleting' when not exists(select 1 from auth.sessions s where s.user_id=auth.uid() and s.id::text=coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'session_id','') and (to_jsonb(s)->>'not_after' is null or (to_jsonb(s)->>'not_after')::timestamptz>clock_timestamp())) then 'invalid' else 'active' end)
$$;
revoke all on function public.daily_deck_lifecycle_status() from public,anon;
grant execute on function public.daily_deck_lifecycle_status() to authenticated;

-- Check AFTER acquiring the same lock as sync/import. This closes the race in
-- older RPCs whose permission check precedes their advisory lock.
create function daily_deck_private.lifecycle_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare u uuid; claims jsonb:=coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}');
begin
 if tg_table_schema='storage' then
  if (case when tg_op='DELETE' then old.bucket_id else new.bucket_id end)<>'daily-deck-photos' then return coalesce(new,old);end if;
  u:=split_part(case when tg_op='DELETE' then old.name else new.name end,'/',1)::uuid;
 else u:=case when tg_op='DELETE' then old.owner_id else new.owner_id end;end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 if exists(select 1 from daily_deck_private.account_deletions where owner_id=u)
 and coalesce(claims->>'role',nullif(current_setting('request.jwt.claim.role',true),''),'')<>'service_role' then
  raise exception 'Account deletion is in progress' using errcode='PDA01';
 end if;
 return coalesce(new,old);
end $$;
do $$ declare t text;begin
 foreach t in array array['daily_deck_items','daily_deck_photos','daily_deck_schedule_versions','daily_deck_deadline_versions','daily_deck_occurrences','daily_deck_appearance_versions','daily_deck_events','daily_deck_profiles','daily_deck_sync_heads'] loop
 execute format('create trigger account_lifecycle before insert or update or delete on public.%I for each row execute function daily_deck_private.lifecycle_guard()',t);
 end loop;
end $$;
create trigger account_lifecycle before insert or update or delete on daily_deck_private.sync_receipts for each row execute function daily_deck_private.lifecycle_guard();
create trigger dd_account_lifecycle before insert or update or delete on storage.objects for each row execute function daily_deck_private.lifecycle_guard();

create function public.daily_deck_account_export(p_owner uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; t text; rows jsonb;begin
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text,0));
 if not exists(select 1 from auth.users where id=p_owner) or exists(select 1 from daily_deck_private.account_deletions where owner_id=p_owner) then raise exception 'Account unavailable' using errcode='PDA01';end if;
 result:=jsonb_build_object('owner_id',p_owner,'format_version',1);
 foreach t in array array['daily_deck_profiles','daily_deck_items','daily_deck_photos','daily_deck_schedule_versions','daily_deck_deadline_versions','daily_deck_occurrences','daily_deck_appearance_versions','daily_deck_events','daily_deck_sync_heads'] loop
 execute format('select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),''[]'') from public.%I r where owner_id=$1',t) into rows using p_owner;
 result:=result||jsonb_build_object(t,rows);
 end loop;
 return result||jsonb_build_object('sync_receipts',(select coalesce(jsonb_agg(to_jsonb(r) order by request_id),'[]') from daily_deck_private.sync_receipts r where owner_id=p_owner),
 'files',(select coalesce(jsonb_agg(jsonb_build_object('name',name,'metadata',metadata,'updated_at',to_jsonb(o)->'updated_at') order by name),'[]') from storage.objects o where bucket_id='daily-deck-photos' and starts_with(name,p_owner::text||'/')));
end $$;

create function public.daily_deck_delete_begin(p_owner uuid,p_request uuid,p_hash text) returns jsonb language plpgsql security definer set search_path='' as $$
declare j daily_deck_private.account_deletions;begin
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text,0));
 select * into j from daily_deck_private.account_deletions where owner_id=p_owner;
 if j.owner_id is not null then
  if j.request_id<>p_request or j.token_hash<>p_hash then raise exception 'Deletion already requested' using errcode='PDA03';end if;
  return to_jsonb(j);
 end if;
 if not exists(select 1 from daily_deck_private.account_worker where singleton and last_seen>clock_timestamp()-interval '5 minutes') then raise exception 'The erasure worker is not ready. No deletion started' using errcode='PDA02';end if;
 if not exists(select 1 from auth.users where id=p_owner) then raise exception 'Account unavailable' using errcode='42501';end if;
 insert into daily_deck_private.account_deletions(owner_id,request_id,token_hash) values(p_owner,p_request,p_hash) returning * into j;
 return to_jsonb(j);
end $$;
create function public.daily_deck_delete_job(p_request uuid) returns jsonb language sql security definer set search_path='' as $$
 select to_jsonb(j) from daily_deck_private.account_deletions j where request_id=p_request
$$;
create function public.daily_deck_delete_claim(p_request uuid,p_lease uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare j daily_deck_private.account_deletions;begin
 select * into j from daily_deck_private.account_deletions where request_id=p_request for update;
 if j.owner_id is null then return null;end if;
 if j.stage='complete' then return to_jsonb(j);end if;
 if j.lease_until>clock_timestamp() and j.lease is distinct from p_lease then return null;end if;
 update daily_deck_private.account_deletions set lease=p_lease,lease_until=clock_timestamp()+interval '90 seconds' where request_id=p_request returning * into j;
 return to_jsonb(j);
end $$;
create function public.daily_deck_delete_files(p_request uuid) returns jsonb language sql security definer set search_path='' as $$
 select coalesce(jsonb_agg(name order by name),'[]') from storage.objects where bucket_id='daily-deck-photos'
 and starts_with(name,(select owner_id::text||'/' from daily_deck_private.account_deletions where request_id=p_request))
$$;
create function public.daily_deck_delete_step(p_request uuid,p_lease uuid,p_next text) returns jsonb language plpgsql security definer set search_path='' as $$
declare j daily_deck_private.account_deletions;e record;begin
 select * into j from daily_deck_private.account_deletions where request_id=p_request for update;
 if j.owner_id is null or j.lease is distinct from p_lease or j.lease_until<clock_timestamp() then raise exception 'Deletion lease unavailable' using errcode='40001';end if;
 perform pg_advisory_xact_lock(hashtextextended(j.owner_id::text,0));
 if p_next='app' and j.stage='storage' then
  if jsonb_array_length(public.daily_deck_delete_files(p_request))<>0 then raise exception 'Storage is not empty' using errcode='23514';end if;
 elsif p_next='auth' and j.stage='app' then
  -- Undo references point backwards. Remove newest events first in bounded batches.
  for e in select id from public.daily_deck_events where owner_id=j.owner_id order by sequence desc limit 1000 loop
   delete from public.daily_deck_events where owner_id=j.owner_id and id=e.id;
  end loop;
  if exists(select 1 from public.daily_deck_events where owner_id=j.owner_id) then return to_jsonb(j);end if;
  delete from public.daily_deck_appearance_versions where owner_id=j.owner_id;
  delete from public.daily_deck_occurrences where owner_id=j.owner_id;
  delete from public.daily_deck_schedule_versions where owner_id=j.owner_id;
  delete from public.daily_deck_deadline_versions where owner_id=j.owner_id;
  delete from public.daily_deck_items where owner_id=j.owner_id;
  delete from public.daily_deck_photos where owner_id=j.owner_id;
  delete from daily_deck_private.sync_receipts where owner_id=j.owner_id;
  delete from public.daily_deck_sync_heads where owner_id=j.owner_id;
  delete from public.daily_deck_profiles where owner_id=j.owner_id;
 elsif p_next='complete' and j.stage='auth' then
  if exists(select 1 from auth.users where id=j.owner_id) or jsonb_array_length(public.daily_deck_delete_files(p_request))<>0 then raise exception 'Erasure is not complete' using errcode='23514';end if;
 else raise exception 'Invalid deletion stage' using errcode='22023';end if;
 update daily_deck_private.account_deletions set stage=p_next,completed_at=case when p_next='complete' then clock_timestamp() end where request_id=p_request returning * into j;
 return to_jsonb(j);
end $$;
create function public.daily_deck_delete_release(p_request uuid,p_lease uuid) returns void language sql security definer set search_path='' as $$
 update daily_deck_private.account_deletions set lease=null,lease_until=null where request_id=p_request and lease=p_lease
$$;
create function public.daily_deck_delete_queue() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 update daily_deck_private.account_worker set last_seen=clock_timestamp() where singleton;
 delete from daily_deck_private.account_deletions where stage='complete' and completed_at<clock_timestamp()-interval '24 hours';
 return (select coalesce(jsonb_agg(request_id),'[]') from(select request_id from daily_deck_private.account_deletions where stage<>'complete' and (lease_until is null or lease_until<clock_timestamp()) order by created_at limit 5)j);
end $$;
create function public.daily_deck_verify_session(p_owner uuid,p_session uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.sessions s where s.user_id=p_owner and s.id=p_session and (to_jsonb(s)->>'not_after' is null or (to_jsonb(s)->>'not_after')::timestamptz>clock_timestamp()))
$$;
revoke all on function public.daily_deck_verify_session(uuid,uuid) from public,anon,authenticated;
grant execute on function public.daily_deck_verify_session(uuid,uuid) to service_role;

-- No browser/admin-table exposure. All privileged RPCs are service-only.
do $$ declare f record;begin
 for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname like 'daily_deck_delete_%' or p.proname='daily_deck_account_export') loop
 execute format('revoke all on function %s from public,anon,authenticated',f.sig);
 execute format('grant execute on function %s to service_role',f.sig);
 end loop;
end $$;
revoke all on all functions in schema daily_deck_private from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
