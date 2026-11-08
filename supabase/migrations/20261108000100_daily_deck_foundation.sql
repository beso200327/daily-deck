-- Foundation only. Apply manually after review; never imports a browser/native deck.
-- Assumes a Supabase project with auth.users/auth.uid() and managed Storage installed.
begin;

create table public.daily_deck_photos (
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  source_extension text not null check (source_extension in ('png','jpg','jpeg','webp','avif')),
  source_path text generated always as (owner_id::text || '/' || id::text || '/original.' || source_extension) stored,
  rendered_path text generated always as (owner_id::text || '/' || id::text || '/card.jpg') stored,
  source_width integer not null check (source_width > 0),
  source_height integer not null check (source_height > 0),
  source_bytes integer not null check (source_bytes between 1 and 20971520),
  rendered_width integer not null check (rendered_width between 2 and 1200 and rendered_width % 2 = 0),
  rendered_height integer generated always as (rendered_width / 2) stored,
  rendered_bytes integer not null check (rendered_bytes between 1 and 1048576),
  crop_x double precision not null default 0.5 check (crop_x between 0 and 1),
  crop_y double precision not null default 0.5 check (crop_y between 0 and 1),
  crop_zoom double precision not null default 1 check (crop_zoom between 1 and 4),
  created_at timestamptz not null default clock_timestamp(),
  primary key (owner_id,id),
  check (source_width::bigint * source_height::bigint <= 48000000)
);

-- The current app has one shared definition model for one-time tasks and habits.
create table public.daily_deck_items (
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  kind text not null check (kind in ('today','habit')),
  title text not null check (length(btrim(title)) between 1 and 180),
  notes text not null default '' check (length(notes) <= 3000),
  legacy_minutes integer check (legacy_minutes between 0 and 1440),
  weekdays smallint[] not null default '{}',
  created_on date not null,
  generated_through date,
  archived boolean not null default false,
  icon text not null default 'neutral' check (icon in ('neutral','walk','read','water','focus','stretch')),
  photo_id uuid,
  deadline_local time(0) without time zone,
  remind_30_min boolean not null default false,
  created_at timestamptz not null default clock_timestamp(),
  primary key (owner_id,id),
  unique (owner_id,id,kind),
  foreign key (owner_id,photo_id) references public.daily_deck_photos(owner_id,id) on delete restrict,
  check (weekdays <@ array[0,1,2,3,4,5,6]::smallint[] and array_position(weekdays,null) is null and coalesce(array_ndims(weekdays),0) <= 1),
  check ((kind = 'today' and cardinality(weekdays) = 0) or (kind = 'habit' and cardinality(weekdays) between 1 and 7)),
  check (deadline_local is null or (deadline_local < time '24:00' and extract(second from deadline_local) = 0)),
  check (not remind_30_min or deadline_local is not null)
);

-- Append revisions instead of overwriting a prior schedule/deadline/appearance.
-- For an effective date, the latest recorded_at,id revision is authoritative.
create table public.daily_deck_schedule_versions (
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  item_id uuid not null,
  effective_from date not null,
  weekdays smallint[] not null,
  title text not null check (length(btrim(title)) between 1 and 180),
  notes text not null default '' check (length(notes) <= 3000),
  legacy_minutes integer check (legacy_minutes between 0 and 1440),
  edited boolean not null default false,
  recorded_at timestamptz not null default clock_timestamp(),
  primary key (owner_id,id),
  foreign key (owner_id,item_id) references public.daily_deck_items(owner_id,id) on delete restrict,
  check (cardinality(weekdays) between 1 and 7 and weekdays <@ array[0,1,2,3,4,5,6]::smallint[] and array_position(weekdays,null) is null and array_ndims(weekdays) = 1)
);
create index daily_deck_schedule_lookup on public.daily_deck_schedule_versions(owner_id,item_id,effective_from,recorded_at,id);

create table public.daily_deck_deadline_versions (
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  item_id uuid not null,
  effective_from date not null,
  deadline_local time(0) without time zone,
  remind_30_min boolean not null default false,
  recorded_at timestamptz not null default clock_timestamp(),
  primary key (owner_id,id),
  foreign key (owner_id,item_id) references public.daily_deck_items(owner_id,id) on delete restrict,
  check (deadline_local is null or (deadline_local < time '24:00' and extract(second from deadline_local) = 0)),
  check (not remind_30_min or deadline_local is not null)
);
create index daily_deck_deadline_lookup on public.daily_deck_deadline_versions(owner_id,item_id,effective_from,recorded_at,id);

create table public.daily_deck_occurrences (
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  item_id uuid not null,
  kind text not null check (kind in ('today','habit')),
  scheduled_on date not null,
  title text not null check (length(btrim(title)) between 1 and 180),
  notes text not null default '' check (length(notes) <= 3000),
  legacy_minutes integer check (legacy_minutes between 0 and 1440),
  initial_order bigint not null check (initial_order between -9007199254740991 and 9007199254740991),
  icon text not null default 'neutral' check (icon in ('neutral','walk','read','water','focus','stretch')),
  photo_id uuid,
  deadline_local time(0) without time zone,
  remind_30_min boolean not null default false,
  created_at timestamptz not null default clock_timestamp(),
  primary key (owner_id,id),
  unique (owner_id,item_id,scheduled_on),
  foreign key (owner_id,item_id,kind) references public.daily_deck_items(owner_id,id,kind) on delete restrict,
  foreign key (owner_id,photo_id) references public.daily_deck_photos(owner_id,id) on delete restrict,
  check (deadline_local is null or (deadline_local < time '24:00' and extract(second from deadline_local) = 0)),
  check (not remind_30_min or deadline_local is not null)
);
-- One-time tasks carry forward as one record; recurring habits have one record per civil date.
create unique index daily_deck_one_time_occurrence on public.daily_deck_occurrences(owner_id,item_id) where kind = 'today';
create index daily_deck_occurrence_history on public.daily_deck_occurrences(owner_id,scheduled_on,id);

create table public.daily_deck_appearance_versions (
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  occurrence_id uuid not null,
  effective_on date not null,
  icon text not null default 'neutral' check (icon in ('neutral','walk','read','water','focus','stretch')),
  photo_id uuid,
  recorded_at timestamptz not null default clock_timestamp(),
  primary key (owner_id,id),
  foreign key (owner_id,occurrence_id) references public.daily_deck_occurrences(owner_id,id) on delete restrict,
  foreign key (owner_id,photo_id) references public.daily_deck_photos(owner_id,id) on delete restrict
);
create index daily_deck_appearance_lookup on public.daily_deck_appearance_versions(owner_id,occurrence_id,effective_on,recorded_at,id);

-- Outcomes are derived from these actions, never a mutable completion flag.
-- Later remains distinct from Done/Skip; Undo references its original event.
create table public.daily_deck_events (
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  occurrence_id uuid not null,
  action text not null check (action in ('done','later','skip','delete','undo','reorder')),
  occurred_at timestamptz not null,
  action_on date not null,
  sequence bigint not null check (sequence between 0 and 9007199254740991),
  deck_order bigint not null check (deck_order between -9007199254740991 and 9007199254740991),
  undo_target_id uuid,
  recorded_at timestamptz not null default clock_timestamp(),
  primary key (owner_id,id),
  unique (owner_id,occurrence_id,id),
  unique (owner_id,occurrence_id,sequence),
  foreign key (owner_id,occurrence_id) references public.daily_deck_occurrences(owner_id,id) on delete restrict,
  foreign key (owner_id,occurrence_id,undo_target_id) references public.daily_deck_events(owner_id,occurrence_id,id) on delete restrict,
  check ((action = 'undo') = (undo_target_id is not null)),
  check (id is distinct from undo_target_id)
);
create index daily_deck_event_history on public.daily_deck_events(owner_id,action_on,occurred_at,id);

-- Explicit ACLs: works when "Automatically expose new tables" is disabled.
-- No default privileges are changed, and no unrelated tables are touched.
grant usage on schema public to authenticated;
do $$
declare relation text;
begin
  foreach relation in array array['daily_deck_photos','daily_deck_items','daily_deck_schedule_versions','daily_deck_deadline_versions','daily_deck_occurrences','daily_deck_appearance_versions','daily_deck_events'] loop
    execute format('alter table public.%I enable row level security',relation);
    execute format('alter table public.%I force row level security',relation);
    execute format('revoke all on table public.%I from public, anon, authenticated',relation);
    execute format('grant select, insert on table public.%I to authenticated',relation);
    execute format('create policy owner_select on public.%I for select to authenticated using (owner_id = (select auth.uid()))',relation);
    execute format('create policy owner_insert on public.%I for insert to authenticated with check (owner_id = (select auth.uid()))',relation);
  end loop;
end $$;
-- Definitions can be edited/archived; ownership/type/creation anchors cannot change.
grant update (title,notes,legacy_minutes,weekdays,generated_through,archived,icon,photo_id,deadline_local,remind_30_min) on public.daily_deck_items to authenticated;
create policy owner_update on public.daily_deck_items for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
-- Only unreferenced immutable photo metadata can be deleted; historical FKs restrict removal.
grant delete on public.daily_deck_photos to authenticated;
create policy owner_delete on public.daily_deck_photos for delete to authenticated using (owner_id = (select auth.uid()));
-- No UPDATE/DELETE for events, revisions or occurrence snapshots. A future reviewed
-- transaction API must handle pending-only snapshot edits before enabling synchronization.

-- Fail closed rather than silently reuse/reconfigure an existing bucket of this name.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('daily-deck-photos','daily-deck-photos',false,20971520,array['image/jpeg','image/png','image/webp','image/avif']);
do $$ begin
  if not (select bool_and(relrowsecurity) from pg_class where oid in ('storage.objects'::regclass,'storage.buckets'::regclass)) then
    raise exception 'Storage RLS must already be enabled; review managed Storage before applying this migration';
  end if;
end $$;
grant usage on schema storage to authenticated;
grant select,insert,delete on storage.objects to authenticated;

-- Managed Storage may already have permissive policies for other buckets. These
-- bucket-scoped RESTRICTIVE guards prevent those policies exposing our photos,
-- without revoking shared Storage privileges or restricting unrelated buckets.
-- Also prevent permissive bucket-management policies from making this bucket
-- public or deleting/renaming it. Managed administrators still retain control.
create policy dd_photo_bucket_update_guard on storage.buckets as restrictive for update to public
  using (id is distinct from 'daily-deck-photos') with check (id is distinct from 'daily-deck-photos');
create policy dd_photo_bucket_delete_guard on storage.buckets as restrictive for delete to public
  using (id is distinct from 'daily-deck-photos');

create policy dd_photo_select_owner_guard on storage.objects as restrictive for select to public
  using (bucket_id is distinct from 'daily-deck-photos' or (current_user = 'authenticated' and auth.uid() is not null and split_part(name,'/',1) = (select auth.uid())::text));
create policy dd_photo_insert_owner_guard on storage.objects as restrictive for insert to public
  with check (bucket_id is distinct from 'daily-deck-photos' or (current_user = 'authenticated' and auth.uid() is not null and split_part(name,'/',1) = (select auth.uid())::text));
create policy dd_photo_delete_owner_guard on storage.objects as restrictive for delete to public
  using (bucket_id is distinct from 'daily-deck-photos' or (current_user = 'authenticated' and auth.uid() is not null and split_part(name,'/',1) = (select auth.uid())::text));
create policy dd_photo_immutable_guard on storage.objects as restrictive for update to public
  using (bucket_id is distinct from 'daily-deck-photos') with check (bucket_id is distinct from 'daily-deck-photos');

create policy dd_photo_insert_metadata_guard on storage.objects as restrictive for insert to authenticated
  with check (bucket_id is distinct from 'daily-deck-photos' or exists (
    select 1 from public.daily_deck_photos p where p.owner_id = (select auth.uid()) and name in (p.source_path,p.rendered_path)
  ));
create policy dd_photo_delete_metadata_guard on storage.objects as restrictive for delete to authenticated
  using (bucket_id is distinct from 'daily-deck-photos' or not exists (
    select 1 from public.daily_deck_photos p where p.owner_id = (select auth.uid()) and name in (p.source_path,p.rendered_path)
  ));
create policy dd_photo_select on storage.objects for select to authenticated using (bucket_id = 'daily-deck-photos');
create policy dd_photo_insert on storage.objects for insert to authenticated with check (bucket_id = 'daily-deck-photos');
create policy dd_photo_delete on storage.objects for delete to authenticated using (bucket_id = 'daily-deck-photos');

comment on table public.daily_deck_items is 'Definitions only. Archive instead of hard deleting; no local deck is uploaded automatically.';
comment on table public.daily_deck_occurrences is 'Civil-date snapshots. Pending edits require a future transaction API; no direct update/delete grants.';
comment on table public.daily_deck_events is 'Append-only outcome/action history, including completion timestamps, Later and Undo.';
comment on table public.daily_deck_photos is 'Immutable originals/crops. Delete metadata only when no definition, occurrence or appearance references it.';
commit;
