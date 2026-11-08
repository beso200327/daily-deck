-- ISOLATED TEST FIXTURE ONLY, never hosted. Prove trusted gating, not just UI checks.
begin;
insert into auth.users(id) values ('11111111-1111-1111-1111-111111111111'),('22222222-2222-2222-2222-222222222222');
insert into public.daily_deck_photos(owner_id,id,source_extension,source_width,source_height,source_bytes,rendered_width,rendered_bytes)
values ('22222222-2222-2222-2222-222222222222','bbbbbbbb-0000-0000-0000-000000000001','png',800,400,1000,800,500);
insert into public.daily_deck_items(owner_id,id,kind,title,weekdays,created_on,photo_id)
values ('22222222-2222-2222-2222-222222222222','bbbbbbbb-0000-0000-0000-000000000010','habit','B fixture','{4}','2026-11-05','bbbbbbbb-0000-0000-0000-000000000001');
insert into public.daily_deck_schedule_versions(owner_id,item_id,effective_from,weekdays,title)
values ('22222222-2222-2222-2222-222222222222','bbbbbbbb-0000-0000-0000-000000000010','2026-11-05','{4}','B fixture');
insert into public.daily_deck_deadline_versions(owner_id,item_id,effective_from)
values ('22222222-2222-2222-2222-222222222222','bbbbbbbb-0000-0000-0000-000000000010','2026-11-05');
insert into public.daily_deck_occurrences(owner_id,id,item_id,kind,scheduled_on,title,initial_order)
values ('22222222-2222-2222-2222-222222222222','bbbbbbbb-0000-0000-0000-000000000020','bbbbbbbb-0000-0000-0000-000000000010','habit','2026-11-05','B snapshot',1);
insert into public.daily_deck_appearance_versions(owner_id,occurrence_id,effective_on)
values ('22222222-2222-2222-2222-222222222222','bbbbbbbb-0000-0000-0000-000000000020','2026-11-05');
insert into public.daily_deck_events(owner_id,occurrence_id,action,occurred_at,action_on,sequence,deck_order)
values ('22222222-2222-2222-2222-222222222222','bbbbbbbb-0000-0000-0000-000000000020','later',now(),'2026-11-05',1,2);
insert into storage.objects(bucket_id,name) values ('daily-deck-photos','22222222-2222-2222-2222-222222222222/bbbbbbbb-0000-0000-0000-000000000001/card.jpg');
insert into storage.buckets(id,name,public) values ('unrelated-onboarding','unrelated-onboarding',true);
insert into storage.objects(bucket_id,name) values ('unrelated-onboarding','unrelated.txt');
set local role authenticated;
select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',true);
select test_support.assert_true(not public.daily_deck_account_access(),'new authenticated/OAuth user has no approval automatically');
select test_support.assert_true(public.daily_deck_auth_status()->>'mode'='blocked','onboarding defaults to blocked');
select test_support.expect_error('select public.daily_deck_complete_preview_onboarding(auth.uid(),true,true,false)',array['42501'],'client cannot enable Preview onboarding');
select test_support.expect_error('update daily_deck_private.auth_configuration set mode=''preview''',array['42501'],'private mode not writable by browser');
select test_support.expect_error($q$insert into public.daily_deck_profiles(owner_id,age_self_declared_at,preview_acknowledged_at,onboarding_kind) values ('22222222-2222-2222-2222-222222222222',now(),now(),'preview_test')$q$,array['42501'],'direct self-approval insert denied');
select set_config('request.jwt.claims','{"user_metadata":{"age_verified":true,"onboarding_complete":true}}',true);
select test_support.assert_true(not public.daily_deck_account_access(),'user-editable metadata cannot approve onboarding');
do $$ declare t text; n bigint; begin
 foreach t in array array['daily_deck_photos','daily_deck_items','daily_deck_schedule_versions','daily_deck_deadline_versions','daily_deck_occurrences','daily_deck_appearance_versions','daily_deck_events'] loop
   execute format('select count(*) from public.%I',t) into n;
   perform test_support.assert_true(n=0,t||': own records hidden until trusted onboarding');
 end loop;
end $$;
select test_support.assert_true((select count(*)=0 from storage.objects where bucket_id='daily-deck-photos'),'own private Storage hidden until onboarding');
select test_support.assert_true((select count(*)=1 from storage.objects where bucket_id='unrelated-onboarding'),'unrelated bucket unaffected by onboarding gate');
select test_support.expect_error($q$insert into public.daily_deck_items(kind,title,created_on) values ('today','blocked write','2026-11-05')$q$,array['42501'],'unapproved authenticated user cannot insert cloud tasks');
reset role;
update daily_deck_private.auth_configuration set mode='preview' where singleton;
set local role authenticated;
select test_support.expect_error('select public.daily_deck_complete_preview_onboarding(auth.uid(),false,true,false)',array['23514'],'under-16/non-declaration rejected on server');
select test_support.expect_error('select public.daily_deck_complete_preview_onboarding(auth.uid(),null,true,false)',array['23514'],'missing age declaration rejected');
select test_support.expect_error('select public.daily_deck_complete_preview_onboarding(auth.uid(),true,false,false)',array['23514'],'missing Preview acknowledgement rejected');
select test_support.assert_true((select count(*)=0 from public.daily_deck_profiles),'failed onboarding creates no profile');
select test_support.assert_true((public.daily_deck_complete_preview_onboarding(auth.uid(),true,true)->>'complete')::boolean,'authorized server RPC records self-declaration');
select test_support.assert_true((select minimum_age=16 and onboarding_kind='preview_test' and not marketing_opt_in and terms_version is null and terms_accepted_at is null and privacy_version is null and privacy_accepted_at is null from public.daily_deck_profiles),'no fabricated approved legal acceptance; marketing defaults off');
select set_config('test.original_age',(select age_self_declared_at::text from public.daily_deck_profiles),true);
select public.daily_deck_complete_preview_onboarding(auth.uid(),true,true,true);
select test_support.assert_true((select marketing_opt_in and age_self_declared_at::text=current_setting('test.original_age') from public.daily_deck_profiles),'retry preserves original self-declaration; marketing independently optional');
select public.daily_deck_complete_preview_onboarding(auth.uid(),true,true,false);
select test_support.assert_true((select not marketing_opt_in from public.daily_deck_profiles),'marketing opt-out does not revoke onboarding');
select test_support.expect_error('update public.daily_deck_profiles set minimum_age=16',array['42501'],'profile approval cannot be rewritten by client');
select test_support.expect_error('delete from public.daily_deck_profiles',array['42501'],'profile approval cannot be directly deleted by client');
select test_support.expect_error($q$update public.daily_deck_profiles set terms_version='invented'$q$,array['42501'],'client cannot fabricate terms version');
do $$ declare t text; n bigint; begin
 foreach t in array array['daily_deck_photos','daily_deck_items','daily_deck_schedule_versions','daily_deck_deadline_versions','daily_deck_occurrences','daily_deck_appearance_versions','daily_deck_events'] loop
   execute format('select count(*) from public.%I',t) into n;
   perform test_support.assert_true(n=1,t||': approved user sees own row');
 end loop;
end $$;
select test_support.assert_true((select count(*)=1 from storage.objects where bucket_id='daily-deck-photos'),'approved owner sees private Storage');
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',true);
select test_support.assert_true((select count(*)=0 from public.daily_deck_profiles),'other user cannot read declaration');
select test_support.assert_true(not public.daily_deck_account_access(),'another user cannot borrow approval');
select test_support.expect_error($q$select public.daily_deck_complete_preview_onboarding('22222222-2222-2222-2222-222222222222',true,true,false)$q$,array['42501'],'consent cannot be rebound to a different authenticated user');
select public.daily_deck_complete_preview_onboarding(auth.uid(),true,true,false);
select test_support.assert_true((select count(*)=0 from public.daily_deck_items),'approved A still cannot read B data');
select test_support.assert_true((select count(*)=0 from storage.objects where bucket_id='daily-deck-photos'),'approved A still cannot read B photos');
reset role;
update daily_deck_private.auth_configuration set mode='blocked' where singleton;
set local role authenticated;
select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',true);
select test_support.assert_true(not public.daily_deck_account_access(),'owner disabling Preview revokes database gate immediately');
select test_support.assert_true((select count(*)=0 from public.daily_deck_items),'blocked mode hides previously approved cloud records');
reset role;
set local role anon;
select test_support.expect_error('select public.daily_deck_auth_status()',array['42501'],'anonymous status RPC denied');
select test_support.expect_error('select public.daily_deck_complete_preview_onboarding(auth.uid(),true,true,false)',array['42501'],'anonymous cannot self-approve');
select test_support.expect_error('select * from public.daily_deck_profiles',array['42501'],'anonymous profile read denied');
reset role;
rollback;
