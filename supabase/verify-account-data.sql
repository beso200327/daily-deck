-- Read-only operator verification after NEW migration 005. Does not erase or
-- export any user records. Run only in the intended Preview project's SQL Editor.
begin read only;
select p.proname,
 has_function_privilege('authenticated',p.oid,'execute') as browser_must_be_false,
 has_function_privilege('anon',p.oid,'execute') as anon_must_be_false,
 has_function_privilege('service_role',p.oid,'execute') as trusted_service_must_be_true
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and (p.proname like 'daily_deck_delete_%' or p.proname in('daily_deck_account_export','daily_deck_verify_session')) order by p.proname;
select has_function_privilege('authenticated','public.daily_deck_lifecycle_status()','execute') as own_status_must_be_true,
 has_function_privilege('anon','public.daily_deck_lifecycle_status()','execute') as anonymous_status_must_be_false;
select has_table_privilege('authenticated','daily_deck_private.account_deletions','select') as browser_jobs_must_be_false,
 has_table_privilege('authenticated','daily_deck_private.account_worker','update') as browser_heartbeat_must_be_false;
select count(*)=11 as all_lifecycle_triggers_present from pg_trigger where not tgisinternal and tgname in('account_lifecycle','dd_account_lifecycle');
select last_seen,last_seen>clock_timestamp()-interval '5 minutes' as worker_ready_for_new_deletions from daily_deck_private.account_worker where singleton;
commit;
