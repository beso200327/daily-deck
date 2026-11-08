-- Read-only owner inventory AFTER applying only the new Auth migration.
begin transaction read only;
select mode from daily_deck_private.auth_configuration where singleton;
select relname,relrowsecurity,relforcerowsecurity from pg_class where oid='public.daily_deck_profiles'::regclass;
select schemaname,tablename,policyname,permissive,roles,cmd from pg_policies
where policyname='onboarding_required' or policyname in ('dd_onboarding_required','profile_owner_read') order by schemaname,tablename;
select p.proname,p.prosecdef,p.proconfig from pg_proc p join pg_namespace n on p.pronamespace=n.oid
where n.nspname='public' and p.proname in ('daily_deck_account_access','daily_deck_auth_status','daily_deck_complete_preview_onboarding');
select table_name,grantee,privilege_type from information_schema.role_table_grants where table_schema='public' and table_name='daily_deck_profiles';
commit;
