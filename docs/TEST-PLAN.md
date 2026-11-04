# Payment and creator earnings test plan

Run these checks in a non-production environment with a test creator, a test admin, and the required database migrations already applied. Do not use real payout details or make a real transfer during testing. The admin screen records an external payout; it does not send money.

Replace `:creator_id`, `:reel_id`, `:withdrawal_id`, and `:admin_id` with the UUIDs from the test accounts and rows. Run the SQL in the Supabase SQL Editor; it is read-only.

## 1. Qualified Reel view wallet credit

1. Sign in as a member creator and open **Reels**.
2. Publish a test Reel if the creator has none available.
3. Sign in as a different account and open that Reel. Watch for at least 10 seconds. Repeat with distinct viewer accounts until the configured `views_per_credit` threshold is reached; one account counts once per Reel.
4. Return to the creator account and tap **Profile → Creator tools → Earnings history**. Refresh the screen.
5. In SQL, compare the qualified-view count to the configured credit block and inspect the resulting ledger entries:

```sql
with rate as (
  select views_per_credit
  from public.launch_rate_settings
  where id = 1 and enabled is true
),
views as (
  select count(*) as qualified_views
  from public.reel_qualified_views
  where reel_id = ':reel_id'
),
credits as (
  select count(*) as ledger_entries, coalesce(sum(amount_usd), 0) as credited_usd
  from public.creator_earnings
  where user_id = ':creator_id'
    and reel_id = ':reel_id'
    and entry_key like 'launch-v2:%'
)
select rate.views_per_credit, views.qualified_views,
       floor(views.qualified_views / rate.views_per_credit) as completed_blocks,
       credits.ledger_entries, credits.credited_usd
from rate cross join views cross join credits;
```

The ledger entry count must match the completed view blocks, with no duplicate entry for a block. Also inspect the rows themselves:

```sql
select entry_key, amount_usd, description, created_at
from public.creator_earnings
where user_id = ':creator_id'
  and reel_id = ':reel_id'
order by created_at desc;
```

## 2. Creator balance and withdrawal request

1. As the creator, tap **Profile → Creator tools → Payout method**.
2. Enter test country, bank name, account name, account number, and the account password; tap **Save payout details**.
3. Tap **Withdraw**. Enter an amount at or above the displayed minimum and no greater than the available amount. Enter the account password and tap **Withdraw**.
4. Tap **Withdrawal history** and confirm the request is pending.
5. Verify the balance and pending withdrawal in SQL:

```sql
with earnings as (
  select coalesce(sum(amount_usd), 0) as earned
  from public.creator_earnings
  where user_id = ':creator_id'
),
withdrawals as (
  select
    coalesce(sum(amount_usd) filter (where status = 'pending'), 0) as pending,
    coalesce(sum(amount_usd) filter (where status = 'paid'), 0) as paid
  from public.creator_withdrawals
  where user_id = ':creator_id'
)
select earned, pending, paid, greatest(earned - pending - paid, 0) as available
from earnings cross join withdrawals;
```

The new request should reduce `available` by its amount and increase `pending` by the same amount. Confirm the request and its audit row:

```sql
select w.id, w.user_id, w.amount_usd, w.status, w.created_at,
       a.action, a.created_at as audited_at
from public.creator_withdrawals w
left join public.creator_monetisation_audit a on a.reference_id = w.id
where w.id = ':withdrawal_id'
order by a.created_at;
```

## 3. Admin manual payout

1. Pay the test creator using the test payout provider outside the app; retain its test payment reference.
2. Sign in as an admin and tap **Admin → Withdrawals**.
3. Check that the creator's account name, bank, country, account number, and amount match the test request.
4. Enter the external payment reference and tap **Pay user**. This records the completed external transfer; it does not initiate a transfer.
5. As the creator, tap **Profile → Creator tools → Withdrawal history** and confirm the status is paid.
6. Verify the final state and admin audit data:

```sql
select w.id, w.user_id, w.amount_usd, w.status, w.provider_reference,
       a.action, a.details ->> 'adminUserId' as admin_id,
       a.details ->> 'reference' as audited_reference, a.created_at as audited_at
from public.creator_withdrawals w
left join public.creator_monetisation_audit a
  on a.reference_id = w.id and a.action = 'withdrawal_paid'
where w.id = ':withdrawal_id';
```

The withdrawal must be `paid`, the provider reference must match the entered reference, and the audit row must identify the admin and same reference.

## 4. Failure and authorization checks

1. As a non-admin, open **Admin → Withdrawals**. The list and payout action must be denied.
2. As an admin, try to mark a request paid without a reference, with an invalid request ID, or after it is already paid. Each attempt must show an error and must not add another paid audit row.
3. Try a creator withdrawal without saved payout details, below the displayed minimum, or above available earnings. Each must show an error and create no pending withdrawal.
4. For duplicate-view accounting, inspect the combined legacy and qualified rows for a creator:

```sql
select count(*) as unique_qualified_views
from (
  select old_view.reel_id, old_view.viewer_id
  from public.reel_views old_view
  join public.reels reel on reel.id = old_view.reel_id
  where reel.user_id = ':creator_id'
    and old_view.viewer_id <> reel.user_id
    and old_view.watched_seconds >= 10
  union
  select qualified_view.reel_id, qualified_view.viewer_id
  from public.reel_qualified_views qualified_view
  where qualified_view.creator_id = ':creator_id'
) counted;
```

The count should not double-count the same viewer/Reel pair present in both tables.
