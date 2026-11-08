-- Read-only inventory after 003 and 004. Administrator metadata is NOT user isolation proof.
begin transaction read only;
select mode from daily_deck_private.auth_configuration where singleton;
select relname,relrowsecurity,relforcerowsecurity from pg_class where oid='public.daily_deck_sync_heads'::regclass;
select table_name,grantee,privilege_type from information_schema.role_table_grants where table_schema='public' and table_name like 'daily_deck_%' order by table_name,grantee,privilege_type;
select table_name,column_name,grantee,privilege_type from information_schema.column_privileges where table_schema='public' and table_name='daily_deck_items' and grantee in('anon','authenticated') and privilege_type<>'SELECT';
select p.proname,p.prosecdef,p.proconfig,has_function_privilege('authenticated',p.oid,'execute') authenticated_execute,has_function_privilege('anon',p.oid,'execute') anon_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in('daily_deck_sync','daily_deck_sync_status','daily_deck_photo');
select id,public,file_size_limit,allowed_mime_types from storage.buckets where id='daily-deck-photos';
commit;
