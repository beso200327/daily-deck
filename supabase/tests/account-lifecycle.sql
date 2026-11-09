-- ISOLATED TESTS ONLY. Never apply this fixture to a hosted project.
begin;
insert into auth.users(id) values('77777777-7777-7777-7777-777777777777'),('88888888-8888-8888-8888-888888888888');
insert into auth.sessions(id,user_id) select id,id from auth.users where id in('77777777-7777-7777-7777-777777777777','88888888-8888-8888-8888-888888888888');
insert into public.daily_deck_profiles(owner_id,age_self_declared_at,preview_acknowledged_at,onboarding_kind) select id,now(),now(),'preview_test' from auth.users where id in('77777777-7777-7777-7777-777777777777','88888888-8888-8888-8888-888888888888');
insert into public.daily_deck_photos(owner_id,id,source_extension,source_width,source_height,source_bytes,rendered_width,rendered_bytes) values('77777777-7777-7777-7777-777777777777','77777777-7777-7777-7777-777777777770','png',2,2,3,2,3);
insert into storage.objects(bucket_id,name,metadata) values
 ('daily-deck-photos','77777777-7777-7777-7777-777777777777/77777777-7777-7777-7777-777777777770/original.png','{"size":3}'),
 ('daily-deck-photos','77777777-7777-7777-7777-777777777777/77777777-7777-7777-7777-777777777770/card.jpg','{"size":3}'),
 ('daily-deck-photos','88888888-8888-8888-8888-888888888888/88888888-8888-8888-8888-888888888880/original.png','{"size":3}');
insert into public.daily_deck_items(owner_id,id,kind,title,created_on,photo_id) values('77777777-7777-7777-7777-777777777777','77777777-7777-7777-7777-777777777771','today','A private history',current_date,'77777777-7777-7777-7777-777777777770'),('88888888-8888-8888-8888-888888888888','88888888-8888-8888-8888-888888888881','today','B private task',current_date,null);
insert into public.daily_deck_occurrences(owner_id,id,item_id,kind,scheduled_on,title,initial_order,photo_id) values('77777777-7777-7777-7777-777777777777','77777777-7777-7777-7777-777777777772','77777777-7777-7777-7777-777777777771','today',current_date,'A private history',1,'77777777-7777-7777-7777-777777777770');
insert into public.daily_deck_events(owner_id,id,occurrence_id,action,action_on,occurred_at,sequence,deck_order) values('77777777-7777-7777-7777-777777777777','77777777-7777-7777-7777-777777777773','77777777-7777-7777-7777-777777777772','done',current_date,now(),1,1);
insert into public.daily_deck_events(owner_id,occurrence_id,action,action_on,occurred_at,sequence,deck_order,undo_target_id) values('77777777-7777-7777-7777-777777777777','77777777-7777-7777-7777-777777777772','undo',current_date,now(),2,1,'77777777-7777-7777-7777-777777777773');
insert into daily_deck_private.sync_receipts(owner_id,request_id,request,revision) values('77777777-7777-7777-7777-777777777777','77777777-7777-7777-7777-777777777774','{"operation":"import"}',1);

set local role authenticated;
set local "request.jwt.claims"='{"sub":"77777777-7777-7777-7777-777777777777","role":"authenticated","session_id":"77777777-7777-7777-7777-777777777777"}';
select test_support.assert_true(public.daily_deck_lifecycle_status()->>'state'='active','own live session is active');
select test_support.expect_error($q$select public.daily_deck_account_export('88888888-8888-8888-8888-888888888888')$q$,array['42501'],'browser cannot export arbitrary accounts');
select test_support.expect_error($q$select public.daily_deck_delete_begin('88888888-8888-8888-8888-888888888888',gen_random_uuid(),repeat('a',64))$q$,array['42501'],'browser cannot invoke privileged deletion');
select test_support.expect_error($q$select * from daily_deck_private.account_deletions$q$,array['42501'],'browser cannot read job capabilities');
reset role;
set local role service_role;
set local "request.jwt.claims"='{"role":"service_role"}';
select test_support.assert_true(public.daily_deck_verify_session('77777777-7777-7777-7777-777777777777','77777777-7777-7777-7777-777777777777'),'verified session belongs to user');
select test_support.assert_true(not public.daily_deck_verify_session('88888888-8888-8888-8888-888888888888','77777777-7777-7777-7777-777777777777'),'another user session cannot reauthenticate');
select test_support.assert_true(public.daily_deck_account_export('77777777-7777-7777-7777-777777777777')::text not like '%B private task%','export contains no foreign task');
select test_support.assert_true(jsonb_array_length(public.daily_deck_account_export('77777777-7777-7777-7777-777777777777')->'daily_deck_events')=2,'export includes completed and undone history');
select test_support.assert_true(jsonb_array_length(public.daily_deck_account_export('77777777-7777-7777-7777-777777777777')->'files')=2,'export includes original and cropped manifest only for owner');
select test_support.expect_error($q$select public.daily_deck_delete_begin('77777777-7777-7777-7777-777777777777',gen_random_uuid(),repeat('a',64))$q$,array['PDA02'],'deletion cannot start before the server worker is ready');
select public.daily_deck_delete_queue();
select public.daily_deck_delete_begin('77777777-7777-7777-7777-777777777777','77777777-7777-7777-7777-777777777775',repeat('a',64));
select test_support.expect_error($q$select public.daily_deck_delete_begin('77777777-7777-7777-7777-777777777777',gen_random_uuid(),repeat('b',64))$q$,array['PDA03'],'a second request cannot replace the recovery capability');
select public.daily_deck_delete_claim('77777777-7777-7777-7777-777777777775','77777777-7777-7777-7777-777777777776');
select test_support.assert_true(public.daily_deck_delete_claim('77777777-7777-7777-7777-777777777775',gen_random_uuid()) is null,'concurrent worker cannot steal an active lease');
select test_support.expect_error($q$select public.daily_deck_delete_step('77777777-7777-7777-7777-777777777775','77777777-7777-7777-7777-777777777776','app')$q$,array['23514'],'partial Storage failure cannot advance deletion');
reset role;
set local role authenticated;
set local "request.jwt.claims"='{"sub":"77777777-7777-7777-7777-777777777777","role":"authenticated","session_id":"77777777-7777-7777-7777-777777777777"}';
select test_support.assert_true(not public.daily_deck_account_access(),'deleting account cannot access task APIs');
select test_support.assert_true((select count(*) from public.daily_deck_items)=0,'deletion hides cloud rows');
select test_support.assert_true(public.daily_deck_lifecycle_status()->>'state'='deleting','other devices detect deletion');
select test_support.expect_error($q$select public.daily_deck_sync('77777777-7777-7777-7777-777777777777','read',gen_random_uuid(),0,'{}','UTC')$q$,array['42501'],'new sync operations blocked');
reset role;
-- Simulate a write whose old RPC permission check happened before deletion began.
select test_support.expect_error($q$insert into public.daily_deck_items(owner_id,kind,title,created_on) values('77777777-7777-7777-7777-777777777777','today','Late write',current_date)$q$,array['PDA01'],'trigger guards writes after the serialized permission check');
set local "request.jwt.claims"='{"role":"service_role"}';
delete from storage.objects where name like '77777777-7777-7777-7777-777777777777/%';
set local role service_role;
select public.daily_deck_delete_step('77777777-7777-7777-7777-777777777775','77777777-7777-7777-7777-777777777776','app');
select public.daily_deck_delete_step('77777777-7777-7777-7777-777777777775','77777777-7777-7777-7777-777777777776','auth');
select test_support.expect_error($q$select public.daily_deck_delete_step('77777777-7777-7777-7777-777777777775','77777777-7777-7777-7777-777777777776','complete')$q$,array['23514'],'completion requires confirmed identity deletion');
reset role;
select test_support.assert_true(not exists(select 1 from daily_deck_private.sync_receipts where owner_id='77777777-7777-7777-7777-777777777777'),'private import/sync receipts erased');
select test_support.assert_true(not exists(select 1 from public.daily_deck_events where owner_id='77777777-7777-7777-7777-777777777777'),'history FK protections allow authorized erasure including Undo');
delete from auth.users where id='77777777-7777-7777-7777-777777777777';
set local role service_role;
select public.daily_deck_delete_step('77777777-7777-7777-7777-777777777775','77777777-7777-7777-7777-777777777776','complete');
reset role;
select test_support.assert_true(exists(select 1 from auth.users where id='88888888-8888-8888-8888-888888888888'),'other identity preserved');
select test_support.assert_true(exists(select 1 from public.daily_deck_items where title='B private task'),'other tasks preserved');
select test_support.assert_true(exists(select 1 from storage.objects where name like '88888888%'),'other photo bytes preserved');
set local role authenticated;
set local "request.jwt.claims"='{"sub":"77777777-7777-7777-7777-777777777777","role":"authenticated","session_id":"77777777-7777-7777-7777-777777777777"}';
select test_support.assert_true(public.daily_deck_lifecycle_status()->>'state'='deleted','still-signed JWT cannot revive deleted account');
set local "request.jwt.claims"='{"sub":"88888888-8888-8888-8888-888888888888","role":"authenticated","session_id":"00000000-0000-0000-0000-000000000000"}';
select test_support.assert_true(public.daily_deck_lifecycle_status()->>'state'='invalid','revoked session is explicitly invalid');
rollback;
