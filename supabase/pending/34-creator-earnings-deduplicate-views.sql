-- Run after 20261102000400_creator_earnings_manual_withdrawals.sql.
-- This preserves the existing ledger and makes legacy and qualified-view counts unique.

create or replace function public.count_creator_qualified_views(p_user_id uuid)
returns bigint
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select count(*)
  from (
    select old_view.reel_id, old_view.viewer_id
    from public.reel_views as old_view
    join public.reels as reel on reel.id = old_view.reel_id
    where reel.user_id = p_user_id
      and old_view.viewer_id <> reel.user_id
      and old_view.watched_seconds >= 10
    union
    select qualified_view.reel_id, qualified_view.viewer_id
    from public.reel_qualified_views as qualified_view
    where qualified_view.creator_id = p_user_id
  ) as counted_views;
$$;
revoke all on function public.count_creator_qualified_views(uuid) from public, anon, authenticated;

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
    public.count_creator_qualified_views(p_user_id),
    (
      select coalesce(sum(counted.watched_seconds), 0)
      from (
        select old_view.reel_id, old_view.viewer_id, old_view.watched_seconds
        from public.reel_views as old_view
        join public.reels as reel on reel.id = old_view.reel_id
        where reel.user_id = p_user_id
          and old_view.viewer_id <> reel.user_id
          and old_view.watched_seconds >= 10
        union all
        select qualified_view.reel_id, qualified_view.viewer_id, 10
        from public.reel_qualified_views as qualified_view
        where qualified_view.creator_id = p_user_id
          and not exists (
            select 1
            from public.reel_views as old_view
            where old_view.reel_id = qualified_view.reel_id
              and old_view.viewer_id = qualified_view.viewer_id
              and old_view.watched_seconds >= 10
          )
      ) as counted
    );
end;
$$;
revoke all on function public.get_creator_metrics(uuid) from public, anon;
grant execute on function public.get_creator_metrics(uuid) to authenticated;

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
    if public.count_creator_qualified_views(p_user_id) < coalesce(promo_min_views, 500) then
      raise exception 'PROMO_MIN_VIEWS_NOT_MET';
    end if;
  elsif (select count(*) from public.reel_follows where creator_id = p_user_id) < 1000
     or (select count(*) from public.reels where user_id = p_user_id and visibility = 'public') < 5 then
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
begin
  if new.amount_usd < 5 then
    raise exception 'BELOW_MINIMUM_5_USD';
  end if;

  select setting.enabled, setting.promo_min_views
    into promo_enabled, promo_min_views
    from public.launch_rate_settings as setting
    where setting.id = 1;

  if coalesce(promo_enabled, true) then
    if public.count_creator_qualified_views(new.user_id) < coalesce(promo_min_views, 500) then
      raise exception 'PROMO_MIN_VIEWS_NOT_MET';
    end if;
  elsif (select count(*) from public.reel_follows as follow where follow.creator_id = new.user_id) < 1000
     or (select count(*) from public.reels as reel where reel.user_id = new.user_id and reel.visibility = 'public') < 5 then
    raise exception 'ORIGINAL_ELIGIBILITY_NOT_MET';
  end if;

  return new;
end;
$$;
