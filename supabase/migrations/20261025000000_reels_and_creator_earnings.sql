create table if not exists public.reels (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null unique,
  caption text not null default '' check (char_length(caption) <= 2200),
  hashtags text[] not null default '{}',
  visibility text not null default 'public' check (visibility in ('public', 'followers')),
  allow_comments boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists reels_feed_created_idx on public.reels (created_at desc);
create index if not exists reels_owner_created_idx on public.reels (user_id, created_at desc);
alter table public.reels enable row level security;
grant select, insert, update, delete on public.reels to authenticated;
grant select on public.reels to anon;

create table if not exists public.reel_follows (
  follower_id uuid not null references auth.users(id) on delete cascade,
  creator_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, creator_id),
  check (follower_id <> creator_id)
);
create index if not exists reel_follows_creator_idx on public.reel_follows (creator_id);
alter table public.reel_follows enable row level security;
grant select on public.reel_follows to anon, authenticated;
grant insert, delete on public.reel_follows to authenticated;

create table if not exists public.reel_likes (
  reel_id uuid not null references public.reels(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (reel_id, user_id)
);
create index if not exists reel_likes_reel_idx on public.reel_likes (reel_id);
alter table public.reel_likes enable row level security;
grant select on public.reel_likes to anon, authenticated;
grant insert, delete on public.reel_likes to authenticated;

create table if not exists public.reel_comments (
  id uuid primary key default gen_random_uuid(),
  reel_id uuid not null references public.reels(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists reel_comments_reel_created_idx on public.reel_comments (reel_id, created_at);
alter table public.reel_comments enable row level security;
grant select on public.reel_comments to anon, authenticated;
grant insert, delete on public.reel_comments to authenticated;

create table if not exists public.reel_saves (
  reel_id uuid not null references public.reels(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (reel_id, user_id)
);
alter table public.reel_saves enable row level security;
grant select, insert, delete on public.reel_saves to authenticated;

create table if not exists public.reel_reports (
  id uuid primary key default gen_random_uuid(),
  reel_id uuid not null references public.reels(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (char_length(trim(reason)) between 1 and 500),
  created_at timestamptz not null default now(),
  unique (reel_id, user_id)
);
alter table public.reel_reports enable row level security;
grant insert on public.reel_reports to authenticated;

create table if not exists public.reel_views (
  reel_id uuid not null references public.reels(id) on delete cascade,
  viewer_id uuid not null references auth.users(id) on delete cascade,
  watched_seconds integer not null default 0 check (watched_seconds >= 0),
  last_heartbeat_at timestamptz not null default now(),
  primary key (reel_id, viewer_id)
);
create index if not exists reel_views_reel_idx on public.reel_views (reel_id);
alter table public.reel_views enable row level security;
grant select on public.reel_views to authenticated;

create or replace function public.record_reel_watch(p_reel_id uuid, p_watched_seconds integer)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or p_watched_seconds < 1 or p_watched_seconds > 30 then
    raise exception 'INVALID_WATCH_EVENT';
  end if;
  insert into public.reel_views (reel_id, viewer_id, watched_seconds, last_heartbeat_at)
  values (p_reel_id, auth.uid(), least(p_watched_seconds, 30), now())
  on conflict (reel_id, viewer_id) do update
    set watched_seconds = reel_views.watched_seconds + least(p_watched_seconds, 30),
        last_heartbeat_at = now()
    where reel_views.last_heartbeat_at <= now() - interval '20 seconds';
end;
$$;
revoke all on function public.record_reel_watch(uuid, integer) from public, anon;
grant execute on function public.record_reel_watch(uuid, integer) to authenticated;

drop policy if exists "Reels are visible by visibility" on public.reels;
create policy "Reels are visible by visibility" on public.reels for select to anon, authenticated
using (
  visibility = 'public'
  or user_id = auth.uid()
  or exists (select 1 from public.reel_follows f where f.creator_id = user_id and f.follower_id = auth.uid())
);
create policy "Users create their own reels" on public.reels for insert to authenticated
with check (user_id = auth.uid());
create policy "Users update their own reels" on public.reels for update to authenticated
using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "Users delete their own reels" on public.reels for delete to authenticated
using (user_id = auth.uid());

create policy "Follows are visible" on public.reel_follows for select to anon, authenticated using (true);
create policy "Users follow creators" on public.reel_follows for insert to authenticated
with check (follower_id = auth.uid());
create policy "Users unfollow creators" on public.reel_follows for delete to authenticated
using (follower_id = auth.uid());

create policy "Likes are visible" on public.reel_likes for select to anon, authenticated using (true);
create policy "Users like reels" on public.reel_likes for insert to authenticated
with check (user_id = auth.uid());
create policy "Users unlike reels" on public.reel_likes for delete to authenticated
using (user_id = auth.uid());

create policy "Comments follow reel visibility" on public.reel_comments for select to anon, authenticated
using (exists (select 1 from public.reels r where r.id = reel_id));
create policy "Users comment on enabled reels" on public.reel_comments for insert to authenticated
with check (
  user_id = auth.uid()
  and exists (select 1 from public.reels r where r.id = reel_id and r.allow_comments)
);
create policy "Users delete their own comments" on public.reel_comments for delete to authenticated
using (user_id = auth.uid());

create policy "Users manage their own saves" on public.reel_saves for select to authenticated using (user_id = auth.uid());
create policy "Users save reels" on public.reel_saves for insert to authenticated with check (user_id = auth.uid());
create policy "Users unsave reels" on public.reel_saves for delete to authenticated using (user_id = auth.uid());
create policy "Users report reels" on public.reel_reports for insert to authenticated with check (user_id = auth.uid());
create policy "Creators read reel metrics" on public.reel_views for select to authenticated
using (exists (select 1 from public.reels r where r.id = reel_id and r.user_id = auth.uid()));

create or replace view public.reel_creator_profiles as
select p.id, p.display_name, p.username, p.avatar_url,
  exists (
    select 1 from public.memberships m
    where m.user_id = p.id and (
      (m.status = 'active' and m.current_period_end > now())
      or (m.status = 'grace' and m.grace_until > now())
    )
  ) as is_member,
  p.bio
from public.profiles p;
grant select on public.reel_creator_profiles to anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('reels', 'reels', false, 209715200, array['video/mp4', 'video/quicktime', 'video/webm'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Creators upload their own reel videos" on storage.objects for insert to authenticated
with check (bucket_id = 'reels' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Reel videos follow reel visibility" on storage.objects for select to anon, authenticated
using (
  bucket_id = 'reels'
  and exists (select 1 from public.reels r where r.storage_path = name)
);
create policy "Creators update their own reel videos" on storage.objects for update to authenticated
using (bucket_id = 'reels' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'reels' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Creators delete their own reel videos" on storage.objects for delete to authenticated
using (bucket_id = 'reels' and (storage.foldername(name))[1] = auth.uid()::text);

create table if not exists public.creator_earnings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  reel_id uuid references public.reels(id) on delete set null,
  entry_key text not null unique,
  amount_usd numeric(12, 2) not null check (amount_usd >= 0),
  description text not null,
  created_at timestamptz not null default now()
);
create index if not exists creator_earnings_user_created_idx on public.creator_earnings (user_id, created_at desc);
alter table public.creator_earnings enable row level security;
grant select on public.creator_earnings to authenticated;
create policy "Creators read their earnings" on public.creator_earnings for select to authenticated
using (
  user_id = auth.uid()
  and exists (
    select 1 from public.memberships m
    where m.user_id = auth.uid() and (
      (m.status = 'active' and m.current_period_end > now())
      or (m.status = 'grace' and m.grace_until > now())
    )
  )
);

create table if not exists public.creator_payout_methods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  masked_account text not null,
  provider_method_id text not null,
  created_at timestamptz not null default now(),
  unique (user_id, id)
);
alter table public.creator_payout_methods enable row level security;
grant select on public.creator_payout_methods to authenticated;
create policy "Creators read their payout methods" on public.creator_payout_methods for select to authenticated
using (
  user_id = auth.uid()
  and exists (
    select 1 from public.memberships m
    where m.user_id = auth.uid() and (
      (m.status = 'active' and m.current_period_end > now())
      or (m.status = 'grace' and m.grace_until > now())
    )
  )
);

create table if not exists public.creator_withdrawals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  payout_method_id uuid references public.creator_payout_methods(id) on delete set null,
  amount_usd numeric(12, 2) not null check (amount_usd > 0),
  status text not null check (status in ('pending', 'paid', 'failed', 'cancelled')),
  provider_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists creator_withdrawals_user_created_idx on public.creator_withdrawals (user_id, created_at desc);
alter table public.creator_withdrawals enable row level security;
grant select on public.creator_withdrawals to authenticated;
create policy "Creators read their withdrawals" on public.creator_withdrawals for select to authenticated
using (
  user_id = auth.uid()
  and exists (
    select 1 from public.memberships m
    where m.user_id = auth.uid() and (
      (m.status = 'active' and m.current_period_end > now())
      or (m.status = 'grace' and m.grace_until > now())
    )
  )
);

create table if not exists public.creator_monetisation_audit (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  reference_id uuid,
  amount_usd numeric(12, 2),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists creator_monetisation_audit_user_created_idx
  on public.creator_monetisation_audit (user_id, created_at desc);
alter table public.creator_monetisation_audit enable row level security;
revoke all on public.creator_monetisation_audit from public, anon, authenticated;

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
    where m.user_id = auth.uid() and (
      (m.status = 'active' and m.current_period_end > now())
      or (m.status = 'grace' and m.grace_until > now())
    )
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
    (select count(*) from public.reels r where r.user_id = p_user_id),
    (select count(*) from public.reel_follows f where f.creator_id = p_user_id),
    (select count(*) from public.reel_follows f where f.follower_id = p_user_id),
    (select count(*) from public.reel_views v join public.reels r on r.id = v.reel_id where r.user_id = p_user_id),
    (select coalesce(sum(v.watched_seconds), 0) from public.reel_views v join public.reels r on r.id = v.reel_id where r.user_id = p_user_id);
end;
$$;
revoke all on function public.get_creator_metrics(uuid) from public, anon;
grant execute on function public.get_creator_metrics(uuid) to authenticated;

create or replace function public.get_public_creator_counts(p_user_id uuid)
returns table (posts bigint, followers bigint, following bigint)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    (select count(*) from public.reels r where r.user_id = p_user_id),
    (select count(*) from public.reel_follows f where f.creator_id = p_user_id),
    (select count(*) from public.reel_follows f where f.follower_id = p_user_id);
$$;
revoke all on function public.get_public_creator_counts(uuid) from public;
grant execute on function public.get_public_creator_counts(uuid) to anon, authenticated;

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
    where m.user_id = p_user_id and (
      (m.status = 'active' and m.current_period_end > now())
      or (m.status = 'grace' and m.grace_until > now())
    )
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
    where m.user_id = p_user_id and (
      (m.status = 'active' and m.current_period_end > now())
      or (m.status = 'grace' and m.grace_until > now())
    )
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