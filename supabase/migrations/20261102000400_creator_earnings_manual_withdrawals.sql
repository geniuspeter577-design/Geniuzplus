create table if not exists public.launch_rate_settings (
  id integer primary key check (id = 1),
  enabled boolean not null default true,
  promo_min_views integer not null default 500,
  views_per_credit integer not null default 20,
  updated_at timestamptz not null default now()
);
alter table public.launch_rate_settings enable row level security;
revoke all on public.launch_rate_settings from public, anon, authenticated;
grant all on public.launch_rate_settings to service_role;
insert into public.launch_rate_settings (id, enabled, promo_min_views, views_per_credit)
values (1, true, 500, 20)
on conflict (id) do nothing;

create table if not exists public.reel_watch_sessions (
  reel_id uuid not null references public.reels(id) on delete cascade,
  viewer_id uuid not null references auth.users(id) on delete cascade,
  watched_seconds integer not null default 0 check (watched_seconds between 0 and 10),
  last_heartbeat_at timestamptz not null default now(),
  primary key (reel_id, viewer_id)
);
alter table public.reel_watch_sessions enable row level security;
revoke all on public.reel_watch_sessions from public, anon, authenticated;
grant all on public.reel_watch_sessions to service_role;

create table if not exists public.reel_qualified_views (
  reel_id uuid not null references public.reels(id) on delete cascade,
  viewer_id uuid not null references auth.users(id) on delete cascade,
  creator_id uuid not null references auth.users(id) on delete cascade,
  counted_at timestamptz not null default now(),
  primary key (reel_id, viewer_id)
);
create index if not exists reel_qualified_views_creator_idx
  on public.reel_qualified_views (creator_id, counted_at desc);
alter table public.reel_qualified_views enable row level security;
revoke all on public.reel_qualified_views from public, anon, authenticated;
grant all on public.reel_qualified_views to service_role;

create table if not exists public.creator_bank_details (
  user_id uuid primary key references auth.users(id) on delete cascade,
  country text not null,
  bank_name text not null,
  account_name text not null,
  account_number text not null,
  updated_at timestamptz not null default now()
);
alter table public.creator_bank_details enable row level security;
revoke all on public.creator_bank_details from public, anon, authenticated;
grant select on public.creator_bank_details to authenticated;
grant all on public.creator_bank_details to service_role;
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'creator_bank_details'
      and policyname = 'Creators read own bank details'
  ) then
    create policy "Creators read own bank details"
      on public.creator_bank_details for select to authenticated
      using (user_id = auth.uid());
  end if;
end;
$$;

create or replace function public.record_reel_watch_session(p_reel_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  creator_id uuid;
  total_watched integer;
begin
  if auth.uid() is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  select reel.user_id into creator_id
  from public.reels as reel
  where reel.id = p_reel_id
    and (
      reel.visibility = 'public'
      or (
        reel.visibility = 'followers'
        and exists (
          select 1 from public.reel_follows as follow
          where follow.creator_id = reel.user_id
            and follow.follower_id = auth.uid()
        )
      )
    );

  if not found or creator_id = auth.uid() then
    return;
  end if;

  if exists (
    select 1
    from public.reel_views as old_view
    where old_view.reel_id = p_reel_id
      and old_view.viewer_id = auth.uid()
      and old_view.viewer_id <> creator_id
      and old_view.watched_seconds >= 10
  ) then
    return;
  end if;

  insert into public.reel_watch_sessions (reel_id, viewer_id, watched_seconds, last_heartbeat_at)
  values (p_reel_id, auth.uid(), 0, now())
  on conflict (reel_id, viewer_id) do update
    set watched_seconds = least(
          10,
          reel_watch_sessions.watched_seconds + case
            when reel_watch_sessions.last_heartbeat_at >= now() - interval '15 seconds'
              then greatest(floor(extract(epoch from now() - reel_watch_sessions.last_heartbeat_at))::integer, 0)
            else 0
          end
        ),
        last_heartbeat_at = now()
    where reel_watch_sessions.watched_seconds < 10
      and reel_watch_sessions.last_heartbeat_at <= now() - interval '5 seconds'
  returning watched_seconds into total_watched;

  if coalesce(total_watched, 0) >= 10 then
    insert into public.reel_qualified_views (reel_id, viewer_id, creator_id)
    values (p_reel_id, auth.uid(), creator_id)
    on conflict (reel_id, viewer_id) do nothing;
  end if;
end;
$$;
revoke all on function public.record_reel_watch_session(uuid) from public, anon, authenticated;
grant execute on function public.record_reel_watch_session(uuid) to authenticated;

create or replace function public.record_reel_watch(p_reel_id uuid)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  select public.record_reel_watch_session(p_reel_id);
$$;
revoke all on function public.record_reel_watch(uuid) from public, anon, authenticated;
grant execute on function public.record_reel_watch(uuid) to authenticated;

create or replace function public.record_reel_watch(p_reel_id uuid, p_watched_seconds integer)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  select public.record_reel_watch_session(p_reel_id);
$$;
revoke all on function public.record_reel_watch(uuid, integer) from public, anon, authenticated;
grant execute on function public.record_reel_watch(uuid, integer) to authenticated;

create or replace function public.get_creator_metrics(p_user_id uuid)
returns table (posts bigint, followers bigint, following bigint, views bigint, watched_seconds bigint)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or auth.uid() <> p_user_id then
    raise exception 'FORBIDDEN';
  end if;
  return query
  select
    (select count(*) from public.reels as reel where reel.user_id = p_user_id),
    (select count(*) from public.reel_follows as follow where follow.creator_id = p_user_id),
    (select count(*) from public.reel_follows as follow where follow.follower_id = p_user_id),
    (
      select count(*)
      from public.reel_views as old_view
      join public.reels as reel on reel.id = old_view.reel_id
      where reel.user_id = p_user_id
        and old_view.viewer_id <> reel.user_id
        and old_view.watched_seconds >= 10
    ) + (select count(*) from public.reel_qualified_views as qualified_view where qualified_view.creator_id = p_user_id),
    (
      select coalesce(sum(old_view.watched_seconds), 0)
      from public.reel_views as old_view
      join public.reels as reel on reel.id = old_view.reel_id
      where reel.user_id = p_user_id
        and old_view.viewer_id <> reel.user_id
        and old_view.watched_seconds >= 10
    ) + (select count(*) * 10 from public.reel_qualified_views as qualified_view where qualified_view.creator_id = p_user_id);
end;
$$;
revoke all on function public.get_creator_metrics(uuid) from public, anon;
grant execute on function public.get_creator_metrics(uuid) to authenticated;

create or replace function public.credit_creator_promo_view()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  qualified_view_count bigint;
  views_per_credit integer;
  credit_block bigint;
  credit_key text;
  earning_id uuid;
begin
  if not exists (
    select 1 from public.memberships as membership
    where membership.user_id = new.creator_id
      and membership.status = 'active'
      and membership.current_period_end > now()
  ) then
    return new;
  end if;

  select setting.views_per_credit into views_per_credit
  from public.launch_rate_settings as setting
  where setting.id = 1 and setting.enabled;
  if coalesce(views_per_credit, 0) <= 0 then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(new.reel_id::text, 0));
  select count(*) into qualified_view_count
  from public.reel_qualified_views as qualified_view
  where qualified_view.reel_id = new.reel_id;

  if qualified_view_count < views_per_credit or mod(qualified_view_count, views_per_credit) <> 0 then
    return new;
  end if;

  credit_block := qualified_view_count / views_per_credit;
  -- The v2 prefix cannot collide with the hand-run legacy launch:<reel_id>:<block> keys.
  credit_key := 'launch-v2:' || new.reel_id::text || ':' || credit_block::text;
  insert into public.creator_earnings (user_id, reel_id, entry_key, amount_usd, description)
  values (new.creator_id, new.reel_id, credit_key, 0.01, 'Launch promo: qualified Reel view block')
  on conflict (entry_key) do nothing
  returning id into earning_id;

  if earning_id is not null then
    insert into public.creator_monetisation_audit (user_id, action, reference_id, amount_usd)
    values (new.creator_id, 'earning_recorded', earning_id, 0.01);
  end if;
  return new;
end;
$$;
revoke all on function public.credit_creator_promo_view() from public, anon, authenticated;
revoke execute on function public.record_creator_earning(uuid, uuid, text, numeric, text) from service_role;
do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'reel_qualified_view_creator_credit'
      and tgrelid = 'public.reel_qualified_views'::regclass
      and not tgisinternal
  ) then
    execute 'create trigger reel_qualified_view_creator_credit after insert on public.reel_qualified_views for each row execute function public.credit_creator_promo_view()';
  end if;
end;
$$;

-- Remove only the hand-run credit trigger. Keep credit_launch_views and its function, reel_views, and all existing rows.
drop trigger if exists credit_launch_views_trg on public.reel_views;

create or replace function public.request_manual_withdrawal(p_user_id uuid, p_amount_usd numeric)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  withdrawal_id uuid;
  available_amount numeric;
  promo_enabled boolean;
  promo_min_views integer;
  counted_views bigint;
begin
  if auth.role() <> 'service_role' then
    raise exception 'FORBIDDEN';
  end if;
  if p_amount_usd is null or round(p_amount_usd, 2) < 5 then
    raise exception 'BELOW_MINIMUM_5_USD';
  end if;
  if round(p_amount_usd, 2) > 100000 then
    raise exception 'INVALID_WITHDRAWAL';
  end if;
  if not exists (
    select 1 from public.memberships as membership
    where membership.user_id = p_user_id
      and membership.status = 'active'
      and membership.current_period_end > now()
  ) then
    raise exception 'MEMBERSHIP_REQUIRED';
  end if;
  if not exists (select 1 from public.creator_bank_details where user_id = p_user_id) then
    raise exception 'PAYOUT_DETAILS_REQUIRED';
  end if;

  select setting.enabled, setting.promo_min_views
    into promo_enabled, promo_min_views
    from public.launch_rate_settings as setting
    where setting.id = 1;
  if coalesce(promo_enabled, true) then
    select
      (select count(*)
        from public.reel_views as old_view
        join public.reels as reel on reel.id = old_view.reel_id
        where reel.user_id = p_user_id
          and old_view.viewer_id <> reel.user_id
          and old_view.watched_seconds >= 10)
      + (select count(*)
        from public.reel_qualified_views as qualified_view
        where qualified_view.creator_id = p_user_id)
      into counted_views;
    if counted_views < coalesce(promo_min_views, 500) then
      raise exception 'PROMO_MIN_VIEWS_NOT_MET';
    end if;
  elsif (select count(*) from public.reel_follows where creator_id = p_user_id) < 1000
     or (select count(*) from public.reels where user_id = p_user_id) < 5 then
    raise exception 'ORIGINAL_ELIGIBILITY_NOT_MET';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  select greatest(
    coalesce((select sum(earning.amount_usd) from public.creator_earnings as earning where earning.user_id = p_user_id), 0)
    - coalesce((select sum(withdrawal.amount_usd) from public.creator_withdrawals as withdrawal where withdrawal.user_id = p_user_id and withdrawal.status in ('pending', 'paid')), 0),
    0
  ) into available_amount;
  if round(p_amount_usd, 2) > available_amount then
    raise exception 'INSUFFICIENT_EARNINGS';
  end if;

  insert into public.creator_withdrawals (user_id, payout_method_id, amount_usd, status)
  values (p_user_id, null, round(p_amount_usd, 2), 'pending')
  returning id into withdrawal_id;
  insert into public.creator_monetisation_audit (user_id, action, reference_id, amount_usd)
  values (p_user_id, 'withdrawal_requested', withdrawal_id, round(p_amount_usd, 2));
  return withdrawal_id;
end;
$$;
revoke all on function public.request_manual_withdrawal(uuid, numeric) from public, anon, authenticated;
grant execute on function public.request_manual_withdrawal(uuid, numeric) to service_role;

create or replace function public.check_withdrawal_eligibility()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  promo_enabled boolean;
  promo_min_views integer;
  counted_views bigint;
begin
  if new.amount_usd < 5 then
    raise exception 'BELOW_MINIMUM_5_USD';
  end if;

  select setting.enabled, setting.promo_min_views
    into promo_enabled, promo_min_views
    from public.launch_rate_settings as setting
    where setting.id = 1;

  if coalesce(promo_enabled, true) then
    select
      (select count(*)
        from public.reel_views as old_view
        join public.reels as reel on reel.id = old_view.reel_id
        where reel.user_id = new.user_id
          and old_view.viewer_id <> reel.user_id
          and old_view.watched_seconds >= 10)
      + (select count(*)
        from public.reel_qualified_views as qualified_view
        where qualified_view.creator_id = new.user_id)
      into counted_views;
    if counted_views < coalesce(promo_min_views, 500) then
      raise exception 'PROMO_MIN_VIEWS_NOT_MET';
    end if;
  else
    if (select count(*) from public.reel_follows as follow where follow.creator_id = new.user_id) < 1000
      or (select count(*) from public.reels as reel where reel.user_id = new.user_id and reel.visibility = 'public') < 5 then
      raise exception 'ORIGINAL_ELIGIBILITY_NOT_MET';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.mark_manual_withdrawal_paid(
  p_withdrawal_id uuid,
  p_admin_user_id uuid,
  p_provider_reference text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  withdrawal_row public.creator_withdrawals%rowtype;
  clean_reference text := trim(coalesce(p_provider_reference, ''));
begin
  if auth.role() <> 'service_role' then
    raise exception 'FORBIDDEN';
  end if;
  if length(clean_reference) < 3 or length(clean_reference) > 100 then
    raise exception 'INVALID_REFERENCE';
  end if;
  if not exists (
    select 1
    from public.creator_withdrawals as withdrawal
    join public.creator_bank_details as bank on bank.user_id = withdrawal.user_id
    where withdrawal.id = p_withdrawal_id
      and withdrawal.status = 'pending'
  ) then
    raise exception 'PAYOUT_DETAILS_REQUIRED';
  end if;

  update public.creator_withdrawals
  set status = 'paid', provider_reference = clean_reference, updated_at = now()
  where id = p_withdrawal_id and status = 'pending'
  returning * into withdrawal_row;
  if not found then
    raise exception 'NOT_PENDING';
  end if;

  insert into public.creator_monetisation_audit (user_id, action, reference_id, amount_usd, details)
  values (
    withdrawal_row.user_id, 'withdrawal_paid', withdrawal_row.id, withdrawal_row.amount_usd,
    jsonb_build_object('adminUserId', p_admin_user_id, 'reference', clean_reference)
  );
end;
$$;
revoke all on function public.mark_manual_withdrawal_paid(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.mark_manual_withdrawal_paid(uuid, uuid, text) to service_role;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'creator_earnings'
    ) then
    alter publication supabase_realtime add table public.creator_earnings;
  end if;
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'creator_withdrawals'
    ) then
    alter publication supabase_realtime add table public.creator_withdrawals;
  end if;
end;
$$;