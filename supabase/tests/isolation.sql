-- ISOLATED TEST ONLY. All fixtures roll back; roles are switched (not just SQL admin queries).
begin;
insert into auth.users(id) values ('11111111-1111-1111-1111-111111111111'),('22222222-2222-2222-2222-222222222222');
insert into storage.buckets(id,name,public) values ('unrelated-bucket','unrelated-bucket',true);
insert into storage.objects(bucket_id,name) values ('unrelated-bucket','unrelated.txt'),(null,'unrelated-orphan.txt');
select test_support.assert_true((select not public and file_size_limit=20971520 and allowed_mime_types=array['image/jpeg','image/png','image/webp','image/avif'] from storage.buckets where id='daily-deck-photos'),'private bucket, size and MIME limits');

-- Seed B as trusted fixture administrator, then prove A never sees/modifies it.
insert into public.daily_deck_photos(owner_id,id,source_extension,source_width,source_height,source_bytes,rendered_width,rendered_bytes)
values ('22222222-2222-2222-2222-222222222222','bbbbbbbb-0000-0000-0000-000000000001','png',800,400,1000,800,500);
insert into public.daily_deck_items(owner_id,id,kind,title,weekdays,created_on,photo_id,deadline_local,remind_30_min)
values ('22222222-2222-2222-2222-222222222222','bbbbbbbb-0000-0000-0000-000000000010','habit','B private habit','{1,4}','2026-11-05','bbbbbbbb-0000-0000-0000-000000000001','14:00',true);
insert into public.daily_deck_schedule_versions(owner_id,item_id,effective_from,weekdays,title)
values ('22222222-2222-2222-2222-222222222222','bbbbbbbb-0000-0000-0000-000000000010','2026-11-05','{1,4}','B old schedule');
insert into public.daily_deck_deadline_versions(owner_id,item_id,effective_from,deadline_local,remind_30_min)
values ('22222222-2222-2222-2222-222222222222','bbbbbbbb-0000-0000-0000-000000000010','2026-11-05','14:00',true);
insert into public.daily_deck_occurrences(owner_id,id,item_id,kind,scheduled_on,title,initial_order,photo_id,deadline_local,remind_30_min)
values ('22222222-2222-2222-2222-222222222222','bbbbbbbb-0000-0000-0000-000000000020','bbbbbbbb-0000-0000-0000-000000000010','habit','2026-11-05','B historical title',1,'bbbbbbbb-0000-0000-0000-000000000001','14:00',true);
insert into public.daily_deck_appearance_versions(owner_id,occurrence_id,effective_on,photo_id)
values ('22222222-2222-2222-2222-222222222222','bbbbbbbb-0000-0000-0000-000000000020','2026-11-05','bbbbbbbb-0000-0000-0000-000000000001');
insert into public.daily_deck_events(owner_id,id,occurrence_id,action,occurred_at,action_on,sequence,deck_order)
values ('22222222-2222-2222-2222-222222222222','bbbbbbbb-0000-0000-0000-000000000060','bbbbbbbb-0000-0000-0000-000000000020','done','2026-11-05T13:00:00Z','2026-11-05',1,1);
insert into storage.objects(bucket_id,name) values ('daily-deck-photos','22222222-2222-2222-2222-222222222222/bbbbbbbb-0000-0000-0000-000000000001/card.jpg');

set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',true);
select test_support.assert_true(current_user='authenticated','authorization checks run as authenticated, not SQL admin');
insert into public.daily_deck_photos(id,source_extension,source_width,source_height,source_bytes,rendered_width,rendered_bytes)
values ('aaaaaaaa-0000-0000-0000-000000000001','png',800,400,1000,800,500);
insert into public.daily_deck_items(id,kind,title,weekdays,created_on,photo_id,deadline_local,remind_30_min)
values ('aaaaaaaa-0000-0000-0000-000000000010','habit','A habit','{1,4}','2026-11-05','aaaaaaaa-0000-0000-0000-000000000001','14:00',true);
insert into public.daily_deck_schedule_versions(item_id,effective_from,weekdays,title)
values ('aaaaaaaa-0000-0000-0000-000000000010','2026-11-05','{1,4}','A schedule');
insert into public.daily_deck_deadline_versions(item_id,effective_from,deadline_local,remind_30_min)
values ('aaaaaaaa-0000-0000-0000-000000000010','2026-11-05','14:00',true);
insert into public.daily_deck_occurrences(id,item_id,kind,scheduled_on,title,initial_order,photo_id,deadline_local,remind_30_min)
values ('aaaaaaaa-0000-0000-0000-000000000020','aaaaaaaa-0000-0000-0000-000000000010','habit','2026-11-05','A snapshot',-1,'aaaaaaaa-0000-0000-0000-000000000001','14:00',true);
insert into public.daily_deck_appearance_versions(occurrence_id,effective_on,photo_id)
values ('aaaaaaaa-0000-0000-0000-000000000020','2026-11-05','aaaaaaaa-0000-0000-0000-000000000001');
insert into public.daily_deck_events(id,occurrence_id,action,occurred_at,action_on,sequence,deck_order)
values ('aaaaaaaa-0000-0000-0000-000000000060','aaaaaaaa-0000-0000-0000-000000000020','later','2026-11-05T12:00:00Z','2026-11-05',1,5);
insert into storage.objects(bucket_id,name) values ('daily-deck-photos','11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000001/card.jpg');

-- Every app table is readable/insertable only by its owner, despite exposure defaults being off.
do $$ declare t text; n bigint; begin
 foreach t in array array['daily_deck_photos','daily_deck_items','daily_deck_schedule_versions','daily_deck_deadline_versions','daily_deck_occurrences','daily_deck_appearance_versions','daily_deck_events'] loop
   execute format('select count(*) from public.%I',t) into n;
   perform test_support.assert_true(n=1,t||': only own row is visible');
   execute format('select count(*) from public.%I where owner_id=%L',t,'22222222-2222-2222-2222-222222222222') into n;
   perform test_support.assert_true(n=0,t||': B is invisible by explicit owner filter');
 end loop;
end $$;
select test_support.assert_true(test_support.affected($q$update public.daily_deck_items set title='A edited' where id='aaaaaaaa-0000-0000-0000-000000000010'$q$)=1,'A can update own mutable definition');
select test_support.assert_true(test_support.affected($q$update public.daily_deck_items set title='stolen' where id='bbbbbbbb-0000-0000-0000-000000000010'$q$)=0,'A cannot update B');
select test_support.assert_true(test_support.affected($q$delete from public.daily_deck_photos where id='bbbbbbbb-0000-0000-0000-000000000001'$q$)=0,'A cannot delete B photo');
select test_support.expect_error($q$update public.daily_deck_items set owner_id='22222222-2222-2222-2222-222222222222'$q$,array['42501'],'ownership transfer denied by column ACL');
select test_support.expect_error($q$update public.daily_deck_items set kind='today'$q$,array['42501'],'type anchor immutable');

-- Spoofed owners on each table are rejected by WITH CHECK, not just hidden on reads.
select test_support.expect_error($q$insert into public.daily_deck_items(owner_id,kind,title,created_on) values ('22222222-2222-2222-2222-222222222222','today','spoof','2026-11-05')$q$,array['42501'],'item owner spoof');
select test_support.expect_error($q$insert into public.daily_deck_photos(owner_id,source_extension,source_width,source_height,source_bytes,rendered_width,rendered_bytes) values ('22222222-2222-2222-2222-222222222222','png',2,1,1,2,1)$q$,array['42501'],'photo owner spoof');
select test_support.expect_error($q$insert into public.daily_deck_schedule_versions(owner_id,item_id,effective_from,weekdays,title) values ('22222222-2222-2222-2222-222222222222','bbbbbbbb-0000-0000-0000-000000000010','2026-11-06','{1}','spoof')$q$,array['42501'],'schedule owner spoof');
select test_support.expect_error($q$insert into public.daily_deck_deadline_versions(owner_id,item_id,effective_from) values ('22222222-2222-2222-2222-222222222222','bbbbbbbb-0000-0000-0000-000000000010','2026-11-06')$q$,array['42501'],'deadline owner spoof');
select test_support.expect_error($q$insert into public.daily_deck_occurrences(owner_id,item_id,kind,scheduled_on,title,initial_order) values ('22222222-2222-2222-2222-222222222222','bbbbbbbb-0000-0000-0000-000000000010','habit','2026-11-06','spoof',1)$q$,array['42501'],'occurrence owner spoof');
select test_support.expect_error($q$insert into public.daily_deck_appearance_versions(owner_id,occurrence_id,effective_on) values ('22222222-2222-2222-2222-222222222222','bbbbbbbb-0000-0000-0000-000000000020','2026-11-06')$q$,array['42501'],'appearance owner spoof');
select test_support.expect_error($q$insert into public.daily_deck_events(owner_id,occurrence_id,action,occurred_at,action_on,sequence,deck_order) values ('22222222-2222-2222-2222-222222222222','bbbbbbbb-0000-0000-0000-000000000020','skip',now(),'2026-11-05',2,1)$q$,array['42501'],'event owner spoof');

-- Composite FKs prohibit attaching another user's IDs to an otherwise owned row.
select test_support.expect_error($q$update public.daily_deck_items set photo_id='bbbbbbbb-0000-0000-0000-000000000001'$q$,array['23503'],'cross-owner photo attachment');
select test_support.expect_error($q$insert into public.daily_deck_schedule_versions(item_id,effective_from,weekdays,title) values ('bbbbbbbb-0000-0000-0000-000000000010','2026-11-06','{1}','cross')$q$,array['23503'],'cross-owner schedule');
select test_support.expect_error($q$insert into public.daily_deck_deadline_versions(item_id,effective_from) values ('bbbbbbbb-0000-0000-0000-000000000010','2026-11-06')$q$,array['23503'],'cross-owner deadline');
select test_support.expect_error($q$insert into public.daily_deck_occurrences(item_id,kind,scheduled_on,title,initial_order) values ('bbbbbbbb-0000-0000-0000-000000000010','habit','2026-11-06','cross',1)$q$,array['23503'],'cross-owner occurrence');
select test_support.expect_error($q$insert into public.daily_deck_appearance_versions(occurrence_id,effective_on) values ('bbbbbbbb-0000-0000-0000-000000000020','2026-11-06')$q$,array['23503'],'cross-owner appearance');
select test_support.expect_error($q$insert into public.daily_deck_events(occurrence_id,action,occurred_at,action_on,sequence,deck_order) values ('bbbbbbbb-0000-0000-0000-000000000020','skip',now(),'2026-11-05',2,1)$q$,array['23503'],'cross-owner event');
select test_support.expect_error($q$insert into public.daily_deck_events(occurrence_id,action,occurred_at,action_on,sequence,deck_order,undo_target_id) values ('aaaaaaaa-0000-0000-0000-000000000020','undo',now(),'2026-11-05',2,1,'bbbbbbbb-0000-0000-0000-000000000060')$q$,array['23503'],'cross-owner undo target');
select test_support.expect_error($q$insert into public.daily_deck_occurrences(item_id,kind,scheduled_on,title,initial_order) values ('aaaaaaaa-0000-0000-0000-000000000010','habit','2026-11-05','duplicate',1)$q$,array['23505'],'duplicate habit/date occurrence');
select test_support.expect_error($q$update public.daily_deck_items set deadline_local=null,remind_30_min=true$q$,array['23514'],'reminder requires deadline');
select test_support.expect_error($q$update public.daily_deck_items set deadline_local='24:00'$q$,array['23514'],'midnight must be 00:00 on its actual civil date');

-- History and originals are immutable through direct browser permissions.
do $$ declare t text; begin
 foreach t in array array['daily_deck_schedule_versions','daily_deck_deadline_versions','daily_deck_occurrences','daily_deck_appearance_versions','daily_deck_events'] loop
   perform test_support.expect_error(format('update public.%I set owner_id=owner_id',t),array['42501'],t||' update forbidden');
   perform test_support.expect_error(format('delete from public.%I',t),array['42501'],t||' delete forbidden');
 end loop;
end $$;
select test_support.expect_error($q$delete from public.daily_deck_items$q$,array['42501'],'definitions must archive instead of destructive delete');
update public.daily_deck_items set archived=true,photo_id=null where id='aaaaaaaa-0000-0000-0000-000000000010';
select test_support.expect_error($q$delete from public.daily_deck_photos where id='aaaaaaaa-0000-0000-0000-000000000001'$q$,array['23503'],'historical photo reference survives archive/photo replacement');
select test_support.assert_true((select title='A snapshot' and deadline_local='14:00' from public.daily_deck_occurrences),'archiving leaves historical snapshot intact');
insert into public.daily_deck_events(occurrence_id,action,occurred_at,action_on,sequence,deck_order)
values ('aaaaaaaa-0000-0000-0000-000000000020','done','2026-11-05T13:00:00Z','2026-11-05',2,5);
insert into public.daily_deck_events(occurrence_id,action,occurred_at,action_on,sequence,deck_order,undo_target_id)
select occurrence_id,'undo','2026-11-05T13:01:00Z','2026-11-05',3,5,id from public.daily_deck_events where action='done';
select test_support.assert_true((select count(*)=3 from public.daily_deck_events),'Later, Done and Undo retained with completion timestamp');

-- Storage remains isolated even with an existing blanket permissive policy.
select test_support.assert_true((select count(*)=1 from storage.objects where bucket_id='daily-deck-photos'),'A sees only own Storage object');
select test_support.assert_true(test_support.affected($q$delete from storage.objects where name like '22222222-%'$q$)=0,'cross-owner Storage delete denied');
select test_support.assert_true(test_support.affected($q$update storage.objects set name='renamed' where bucket_id='daily-deck-photos'$q$)=0,'photo bytes/path overwrite denied');
select test_support.assert_true(test_support.affected($q$delete from storage.objects where bucket_id='daily-deck-photos'$q$)=0,'metadata protects original/crop from deletion');
select test_support.expect_error($q$insert into storage.objects(bucket_id,name) values ('daily-deck-photos','22222222-2222-2222-2222-222222222222/forged/card.jpg')$q$,array['42501'],'cross-owner Storage upload denied');
select test_support.expect_error($q$insert into storage.objects(bucket_id,name) values ('daily-deck-photos','11111111-1111-1111-1111-111111111111/unregistered/card.jpg')$q$,array['42501'],'unregistered file path denied');
select test_support.expect_error($q$update storage.objects set bucket_id='daily-deck-photos',name='11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000001/original.png' where bucket_id='unrelated-bucket'$q$,array['42501'],'moving another bucket object into immutable bucket denied');
select test_support.assert_true(test_support.affected($q$update storage.buckets set public=true where id='daily-deck-photos'$q$)=0,'browser cannot make bucket public despite broad bucket-management policy');
select test_support.assert_true(test_support.affected($q$delete from storage.buckets where id='daily-deck-photos'$q$)=0,'browser cannot delete private bucket');
select test_support.assert_true((select not public from storage.buckets where id='daily-deck-photos'),'bucket remains private after manipulation attempts');
select test_support.assert_true(test_support.affected($q$update storage.buckets set file_size_limit=12345 where id='unrelated-bucket'$q$)=1,'other bucket management remains unchanged');
-- Unreferenced metadata is removed first; own orphan file remains readable for cleanup.
insert into public.daily_deck_photos(id,source_extension,source_width,source_height,source_bytes,rendered_width,rendered_bytes)
values ('aaaaaaaa-0000-0000-0000-000000000099','png',2,1,1,2,1);
insert into storage.objects(bucket_id,name) values ('daily-deck-photos','11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000099/card.jpg');
delete from public.daily_deck_photos where id='aaaaaaaa-0000-0000-0000-000000000099';
select test_support.assert_true(test_support.affected($q$delete from storage.objects where name='11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000099/card.jpg'$q$)=1,'unreferenced own file cleanup allowed');
select test_support.assert_true((select count(*)=1 from storage.objects where bucket_id='unrelated-bucket'),'other bucket policy remains unchanged');
select test_support.assert_true((select count(*)=1 from storage.objects where bucket_id is null),'unrelated null-bucket orphan policy unchanged');

-- Reverse direction and a JWT with sub claim in PostgREST JSON format.
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}',true);
select test_support.assert_true((select count(*)=1 and min(title)='B private habit' from public.daily_deck_items),'B cannot see A and B definition was unchanged');
select test_support.assert_true(test_support.affected($q$update public.daily_deck_items set title='stolen by B' where id='aaaaaaaa-0000-0000-0000-000000000010'$q$)=0,'B cannot modify A');
select test_support.assert_true((select count(*)=1 from storage.objects where bucket_id='daily-deck-photos'),'B sees only B Storage object');

reset role;
set local role anon;
select set_config('request.jwt.claims','{}',true);
do $$ declare t text; begin
 foreach t in array array['daily_deck_photos','daily_deck_items','daily_deck_schedule_versions','daily_deck_deadline_versions','daily_deck_occurrences','daily_deck_appearance_versions','daily_deck_events'] loop
   perform test_support.expect_error(format('select * from public.%I',t),array['42501'],t||' anonymous read denied');
 end loop;
end $$;
select test_support.assert_true((select count(*)=0 from storage.objects where bucket_id='daily-deck-photos'),'anonymous cannot read private objects despite pre-existing blanket policy');
select test_support.assert_true(test_support.affected($q$update storage.buckets set public=true where id='daily-deck-photos'$q$)=0,'anonymous cannot flip bucket privacy');
select test_support.assert_true(test_support.affected($q$delete from storage.buckets where id='daily-deck-photos'$q$)=0,'anonymous cannot delete private bucket');
select test_support.assert_true((select count(*)=1 from storage.objects where bucket_id='unrelated-bucket'),'anonymous unrelated bucket unchanged');
select test_support.assert_true((select count(*)=1 from storage.objects where bucket_id is null),'anonymous unrelated orphan unchanged');
reset role;
select test_support.assert_true((select count(*)=7 from pg_class c join pg_namespace n on c.relnamespace=n.oid where n.nspname='public' and c.relname like 'daily_deck_%' and c.relkind='r' and c.relrowsecurity and c.relforcerowsecurity),'all seven tables enable and force RLS');
-- A trusted future account-purge workflow must not be blocked by child FK order.
delete from auth.users where id='22222222-2222-2222-2222-222222222222';
select test_support.assert_true((select count(*)=0 from public.daily_deck_items where owner_id='22222222-2222-2222-2222-222222222222'),'trusted Auth user deletion clears owned definitions');
rollback;
