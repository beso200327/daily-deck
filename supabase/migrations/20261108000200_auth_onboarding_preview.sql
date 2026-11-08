-- Additive authentication/onboarding only. Do not rerun the applied foundation.
-- Legal documents are not approved: public release is deliberately unsupported.
begin;
create schema daily_deck_private;
revoke all on schema daily_deck_private from public,anon,authenticated;
create table daily_deck_private.auth_configuration (
  singleton boolean primary key default true check (singleton),
  mode text not null default 'blocked' check (mode in ('blocked','preview'))
);
revoke all on daily_deck_private.auth_configuration from public,anon,authenticated;
insert into daily_deck_private.auth_configuration(singleton,mode) values (true,'blocked');

create table public.daily_deck_profiles (
  owner_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  minimum_age smallint not null default 16 check (minimum_age=16),
  age_self_declared_at timestamptz not null,
  preview_acknowledged_at timestamptz not null,
  onboarding_kind text not null check (onboarding_kind='preview_test'),
  marketing_opt_in boolean not null default false,
  marketing_updated_at timestamptz not null default clock_timestamp(),
  -- Null until approved documents and a reviewed acceptance mechanism exist.
  terms_version text check (terms_version is null),
  terms_accepted_at timestamptz check (terms_accepted_at is null),
  privacy_version text check (privacy_version is null),
  privacy_accepted_at timestamptz check (privacy_accepted_at is null)
);
alter table public.daily_deck_profiles enable row level security;
alter table public.daily_deck_profiles force row level security;
revoke all on public.daily_deck_profiles from public,anon,authenticated;
grant select on public.daily_deck_profiles to authenticated;
create policy profile_owner_read on public.daily_deck_profiles for select to authenticated using (owner_id=(select auth.uid()));

-- Fixed search path and no owner argument: callers can affect only their signed-in identity.
create function public.daily_deck_account_access() returns boolean
language sql stable security definer set search_path='' as $$
  select auth.uid() is not null
    and exists(select 1 from daily_deck_private.auth_configuration where singleton and mode='preview')
    and exists(select 1 from public.daily_deck_profiles where owner_id=auth.uid() and minimum_age=16 and onboarding_kind='preview_test');
$$;
revoke all on function public.daily_deck_account_access() from public,anon,authenticated;
grant execute on function public.daily_deck_account_access() to authenticated;

create function public.daily_deck_auth_status() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare configured_mode text;
begin
  if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
  select mode into configured_mode from daily_deck_private.auth_configuration where singleton;
  return jsonb_build_object('owner_id',auth.uid(),'mode',coalesce(configured_mode,'blocked'),'complete',public.daily_deck_account_access(),
    'minimum_age',16,'preview_only',true,'legal_pending',true);
end $$;
revoke all on function public.daily_deck_auth_status() from public,anon,authenticated;
grant execute on function public.daily_deck_auth_status() to authenticated;

create function public.daily_deck_complete_preview_onboarding(p_expected_user uuid,p_age_at_least_16 boolean,p_preview_acknowledged boolean,p_marketing_opt_in boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare subject uuid := auth.uid();
begin
  if subject is null then raise exception 'Sign in required' using errcode='42501'; end if;
  if p_expected_user is distinct from subject then raise exception 'Account changed; review onboarding again' using errcode='42501'; end if;
  if not exists(select 1 from daily_deck_private.auth_configuration where singleton and mode='preview') then
    raise exception 'Preview onboarding is not enabled' using errcode='42501';
  end if;
  if p_age_at_least_16 is distinct from true or p_preview_acknowledged is distinct from true then
    raise exception '16+ self-declaration and Preview acknowledgement are required' using errcode='23514';
  end if;
  insert into public.daily_deck_profiles(owner_id,age_self_declared_at,preview_acknowledged_at,onboarding_kind,marketing_opt_in)
    values(subject,clock_timestamp(),clock_timestamp(),'preview_test',coalesce(p_marketing_opt_in,false))
    on conflict(owner_id) do update set marketing_opt_in=excluded.marketing_opt_in,marketing_updated_at=clock_timestamp();
  return public.daily_deck_auth_status();
end $$;
revoke all on function public.daily_deck_complete_preview_onboarding(uuid,boolean,boolean,boolean) from public,anon,authenticated;
grant execute on function public.daily_deck_complete_preview_onboarding(uuid,boolean,boolean,boolean) to authenticated;

-- Narrow existing permissions; never broaden the foundation's grants.
do $$ declare relation text; begin
  foreach relation in array array['daily_deck_photos','daily_deck_items','daily_deck_schedule_versions','daily_deck_deadline_versions','daily_deck_occurrences','daily_deck_appearance_versions','daily_deck_events'] loop
    execute format('create policy onboarding_required on public.%I as restrictive for all to authenticated using ((select public.daily_deck_account_access())) with check ((select public.daily_deck_account_access()))',relation);
  end loop;
end $$;
create policy dd_onboarding_required on storage.objects as restrictive for all to authenticated
  using (bucket_id is distinct from 'daily-deck-photos' or (select public.daily_deck_account_access()))
  with check (bucket_id is distinct from 'daily-deck-photos' or (select public.daily_deck_account_access()));
comment on table public.daily_deck_profiles is 'Server-recorded self-declaration, NOT age verification or approved legal acceptance. Preview only; no account/task association or sync.';
comment on function public.daily_deck_complete_preview_onboarding(uuid,boolean,boolean,boolean) is 'Authenticated Preview-only self-declaration; marketing optional. No actual terms/privacy document has been approved.';
notify pgrst, 'reload schema';
commit;
