drop policy if exists "Creators read their earnings" on public.creator_earnings;
create policy "Creators read their earnings" on public.creator_earnings for select to authenticated
using (
  user_id = auth.uid()
  and exists (
    select 1 from public.memberships m
    where m.user_id = auth.uid()
      and m.status = 'active'
      and m.current_period_end > now()
  )
);

drop policy if exists "Creators read their payout methods" on public.creator_payout_methods;
create policy "Creators read their payout methods" on public.creator_payout_methods for select to authenticated
using (
  user_id = auth.uid()
  and exists (
    select 1 from public.memberships m
    where m.user_id = auth.uid()
      and m.status = 'active'
      and m.current_period_end > now()
  )
);

drop policy if exists "Creators read their withdrawals" on public.creator_withdrawals;
create policy "Creators read their withdrawals" on public.creator_withdrawals for select to authenticated
using (
  user_id = auth.uid()
  and exists (
    select 1 from public.memberships m
    where m.user_id = auth.uid()
      and m.status = 'active'
      and m.current_period_end > now()
  )
);

create or replace function public.get_creator_earnings_summary()
returns table (total_earned_usd numeric, available_usd numeric)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'UNAUTHENTICATED';
  end if;
  if not exists (
    select 1 from public.memberships m
    where m.user_id = auth.uid()
      and m.status = 'active'
      and m.current_period_end > now()
  ) then
    raise exception 'MEMBERSHIP_REQUIRED';
  end if;

  return query
  select
    coalesce(sum(e.amount_usd), 0)::numeric,
    greatest(
      coalesce(sum(e.amount_usd), 0) - coalesce((
        select sum(w.amount_usd) from public.creator_withdrawals w
        where w.user_id = auth.uid() and w.status in ('pending', 'paid')
      ), 0),
      0
    )::numeric
  from public.creator_earnings e
  where e.user_id = auth.uid();
end;
$$;
revoke all on function public.get_creator_earnings_summary() from public, anon;
grant execute on function public.get_creator_earnings_summary() to authenticated;

create or replace function public.record_creator_earning(
  p_user_id uuid,
  p_reel_id uuid,
  p_entry_key text,
  p_amount_usd numeric,
  p_description text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  earning_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'FORBIDDEN';
  end if;
  if p_amount_usd <= 0 or char_length(trim(p_entry_key)) not between 1 and 160
    or char_length(trim(p_description)) not between 1 and 300 then
    raise exception 'INVALID_EARNING';
  end if;
  if not exists (
    select 1 from public.memberships m
    where m.user_id = p_user_id
      and m.status = 'active'
      and m.current_period_end > now()
  ) then
    raise exception 'MEMBERSHIP_REQUIRED';
  end if;

  insert into public.creator_earnings (user_id, reel_id, entry_key, amount_usd, description)
  values (p_user_id, p_reel_id, trim(p_entry_key), p_amount_usd, trim(p_description))
  on conflict (entry_key) do nothing
  returning id into earning_id;

  if earning_id is not null then
    insert into public.creator_monetisation_audit (user_id, action, reference_id, amount_usd)
    values (p_user_id, 'earning_recorded', earning_id, p_amount_usd);
  end if;
  return earning_id;
end;
$$;
revoke all on function public.record_creator_earning(uuid, uuid, text, numeric, text) from public, anon, authenticated;
grant execute on function public.record_creator_earning(uuid, uuid, text, numeric, text) to service_role;

create or replace function public.request_creator_withdrawal(
  p_user_id uuid,
  p_payout_method_id uuid,
  p_amount_usd numeric
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  withdrawal_id uuid;
  available_amount numeric;
begin
  if auth.role() <> 'service_role' then
    raise exception 'FORBIDDEN';
  end if;
  if p_amount_usd <= 0 then
    raise exception 'INVALID_WITHDRAWAL';
  end if;
  if not exists (
    select 1 from public.memberships m
    where m.user_id = p_user_id
      and m.status = 'active'
      and m.current_period_end > now()
  ) then
    raise exception 'MEMBERSHIP_REQUIRED';
  end if;
  if not exists (
    select 1 from public.creator_payout_methods pm
    where pm.id = p_payout_method_id and pm.user_id = p_user_id
  ) then
    raise exception 'PAYOUT_METHOD_REQUIRED';
  end if;

  select greatest(
    coalesce((select sum(e.amount_usd) from public.creator_earnings e where e.user_id = p_user_id), 0)
    - coalesce((select sum(w.amount_usd) from public.creator_withdrawals w where w.user_id = p_user_id and w.status in ('pending', 'paid')), 0),
    0
  ) into available_amount;
  if p_amount_usd > available_amount then
    raise exception 'INSUFFICIENT_EARNINGS';
  end if;

  insert into public.creator_withdrawals (user_id, payout_method_id, amount_usd, status)
  values (p_user_id, p_payout_method_id, p_amount_usd, 'pending')
  returning id into withdrawal_id;
  insert into public.creator_monetisation_audit (user_id, action, reference_id, amount_usd)
  values (p_user_id, 'withdrawal_requested', withdrawal_id, p_amount_usd);
  return withdrawal_id;
end;
$$;
revoke all on function public.request_creator_withdrawal(uuid, uuid, numeric) from public, anon, authenticated;
grant execute on function public.request_creator_withdrawal(uuid, uuid, numeric) to service_role;