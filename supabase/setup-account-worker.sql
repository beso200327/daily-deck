-- OPTIONAL OPERATOR SETUP, PREVIEW PROJECT ONLY. Not a migration and never run
-- automatically. Enable pg_cron and pg_net first. Create these two Vault secrets
-- using Dashboard Vault (not a literal secret in SQL query history):
-- daily_deck_account_function_url = https://PROJECT_REF.supabase.co/functions/v1/account-data
-- daily_deck_account_worker_secret = same secret configured in the Edge Function
-- This named job is independent of all other cron jobs.
do $$ begin
 if (select count(*) from vault.decrypted_secrets where name in('daily_deck_account_function_url','daily_deck_account_worker_secret'))<>2 then
  raise exception 'Configure both named account worker Vault secrets first';
 end if;
end $$;
select cron.schedule('daily-deck-account-erasure-preview','* * * * *',$job$
 select net.http_post(
  url:=(select decrypted_secret from vault.decrypted_secrets where name='daily_deck_account_function_url'),
  headers:=jsonb_build_object('Content-Type','application/json','x-daily-deck-worker-secret',(select decrypted_secret from vault.decrypted_secrets where name='daily_deck_account_worker_secret')),
  body:='{"action":"worker"}'::jsonb,timeout_milliseconds:=60000
 );
$job$);
