-- ISOLATED TEST FIXTURE ONLY. Never run on a Supabase project.
-- Reproduces the Supabase roles/JWT helper and the managed Storage columns used
-- by the migration. It does not implement GoTrue, PostgREST or Storage HTTP.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid;
$$;
grant usage on schema auth to anon,authenticated;
grant execute on function auth.uid() to anon,authenticated;
create schema storage;
create table storage.buckets(id text primary key,name text not null,public boolean not null default false,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text not null,metadata jsonb,unique(bucket_id,name));
alter table storage.objects enable row level security;
alter table storage.buckets enable row level security;
grant select,insert,update,delete on storage.buckets to anon,authenticated;
create policy existing_bucket_management_policy on storage.buckets for all to public using (true) with check (true);
grant usage on schema storage to anon,authenticated;
-- Deliberately hostile pre-existing permissive policy: app guards must still win.
grant select,insert,update,delete on storage.objects to anon,authenticated;
create policy existing_other_bucket_policy on storage.objects for all to public using (true) with check (true);
create schema test_support;
create function test_support.assert_true(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %',label; end if; raise notice 'PASS: %',label; end $$;
create function test_support.expect_error(statement text,states text[],label text) returns void language plpgsql as $$
begin
  begin execute statement;
  exception when others then
    if sqlstate = any(states) then raise notice 'PASS: % [%]',label,sqlstate; return; end if;
    raise;
  end;
  raise exception 'FAIL: % did not reject the statement',label;
end $$;
create function test_support.affected(statement text) returns bigint language plpgsql as $$
declare n bigint; begin execute statement; get diagnostics n = row_count; return n; end $$;
grant usage on schema test_support to anon,authenticated;
grant execute on all functions in schema test_support to anon,authenticated;
