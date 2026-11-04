create table if not exists public.membership_badge_reminder_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  previous_sent_at timestamptz,
  last_sent_at timestamptz,
  next_message smallint not null default 0 check (next_message between 0 and 5)
);

alter table public.membership_badge_reminder_state enable row level security;
revoke all on public.membership_badge_reminder_state from public, anon, authenticated;
grant all on public.membership_badge_reminder_state to service_role;

create or replace function public.create_membership_badge_reminders()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target record;
  reminder_state public.membership_badge_reminder_state%rowtype;
  notification_id uuid;
  created_count integer := 0;
  reminder_messages text[] := array[
    'Earn dollars from your Reels and get a verified badge with membership.',
    'Membership unlocks Reel posting rights and sending files between your devices.',
    'Get a verified badge, post Reels, and earn dollars from your creator activity.',
    'Send files between your devices and unlock the right to post Reels.',
    'Earn dollars from Reels, stand out with a verified badge, and unlock posting rights.',
    'Membership includes Reel earnings, a verified badge, posting rights, and device-to-device file transfers.'
  ];
  reminder_title text := 'Explore membership benefits';
  reminder_body text;
begin
  for target in
    select p.id
    from public.profiles p
    left join public.membership_badge_reminder_state s on s.user_id = p.id
    where (
      s.user_id is null
      or (
        (s.previous_sent_at is null or s.previous_sent_at < now() - interval '7 days')
        and (s.last_sent_at is null or s.last_sent_at <= now() - interval '3 days')
      )
    )
      and not exists (
        select 1
        from public.memberships m
        where m.user_id = p.id
          and (
            (m.status = 'active' and m.current_period_end > now())
            or (m.status = 'grace' and m.grace_until > now())
          )
      )
    order by p.id
    limit 500
  loop
    insert into public.membership_badge_reminder_state (user_id)
    values (target.id)
    on conflict (user_id) do nothing;

    select * into reminder_state
    from public.membership_badge_reminder_state
    where user_id = target.id
    for update;

    if (reminder_state.previous_sent_at is not null
        and reminder_state.previous_sent_at >= now() - interval '7 days')
      or (reminder_state.last_sent_at is not null
        and reminder_state.last_sent_at > now() - interval '3 days') then
      continue;
    end if;

    if exists (
      select 1
      from public.memberships m
      where m.user_id = target.id
        and (
          (m.status = 'active' and m.current_period_end > now())
          or (m.status = 'grace' and m.grace_until > now())
        )
    ) then
      continue;
    end if;

    reminder_body := reminder_messages[reminder_state.next_message + 1];
    insert into public.notifications (user_id, type, title, body, content_id)
    values (
      target.id,
      'personal',
      reminder_title,
      reminder_body,
      'membership:badge-reminder'
    )
    returning id into notification_id;

    if exists (select 1 from public.device_push_tokens where user_id = target.id) then
      insert into public.notification_push_queue (
        user_id, notification_id, title, body, content_id
      )
      values (
        target.id,
        notification_id,
        reminder_title,
        reminder_body,
        'membership:badge-reminder'
      );
    end if;

    update public.membership_badge_reminder_state
    set previous_sent_at = last_sent_at,
        last_sent_at = now(),
        next_message = (next_message + 1) % 6
    where user_id = target.id;

    created_count := created_count + 1;
  end loop;

  return created_count;
end;
$$;

revoke all on function public.create_membership_badge_reminders() from public, anon, authenticated;
grant execute on function public.create_membership_badge_reminders() to service_role;
