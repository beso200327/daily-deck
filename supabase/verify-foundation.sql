-- Read-only inventory for the project owner AFTER manually applying the migration.
-- This does not create users or access task/photo contents; SQL-admin visibility
-- is not a substitute for authenticated API/RLS tests.
begin transaction read only;
select c.relname as table_name,c.relrowsecurity as rls_enabled,c.relforcerowsecurity as rls_forced
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind='r' and c.relname like 'daily_deck_%' order by c.relname;
select table_name,grantee,privilege_type from information_schema.role_table_grants
where table_schema='public' and table_name like 'daily_deck_%' and grantee in ('anon','authenticated','PUBLIC') order by table_name,grantee,privilege_type;
select table_name,column_name,privilege_type from information_schema.column_privileges
where table_schema='public' and table_name='daily_deck_items' and grantee='authenticated' and privilege_type='UPDATE' order by column_name;
select schemaname,tablename,policyname,permissive,roles,cmd from pg_policies
where (schemaname='public' and tablename like 'daily_deck_%') or (schemaname='storage' and policyname like 'dd_photo_%') order by schemaname,tablename,policyname;
select id,public,file_size_limit,allowed_mime_types from storage.buckets where id='daily-deck-photos';
commit;
