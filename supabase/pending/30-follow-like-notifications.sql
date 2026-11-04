create or replace function public.notify_reel_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  owner_id uuid;
  actor_name text;
  activity_id uuid;
  target_notification_id uuid;
  notification_created_at timestamptz;
  notification_body text;
  like_count integer;
  notification_content_id text;
begin
  select reel.user_id into owner_id
  from public.reels as reel
  where reel.id = new.reel_id;

  if owner_id is null or owner_id = new.user_id then
    return new;
  end if;

  if tg_argv[0] = 'like' then
    insert into public.reel_notifications (recipient_id, actor_id, kind, reel_id)
    values (owner_id, new.user_id, tg_argv[0], new.reel_id)
    on conflict (recipient_id, actor_id, reel_id, kind)
      where kind in ('like', 'save', 'tag')
    do update set created_at = excluded.created_at, read_at = null
    returning id into activity_id;
  else
    insert into public.reel_notifications (recipient_id, actor_id, kind, reel_id)
    values (owner_id, new.user_id, tg_argv[0], new.reel_id)
    on conflict do nothing
    returning id into activity_id;
  end if;

  if tg_argv[0] <> 'like' or activity_id is null then
    return new;
  end if;

  select coalesce(nullif(btrim(profile.display_name), ''), 'Geniuzplus user')
  into actor_name
  from public.profiles as profile
  where profile.id = new.user_id;
  actor_name := coalesce(actor_name, 'Geniuzplus user');

  notification_content_id := 'reel:' || new.reel_id::text;
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text || new.reel_id::text, 0));

  select notification.id, notification.created_at
  into target_notification_id, notification_created_at
  from public.notifications as notification
  where notification.user_id = owner_id
    and notification.type = 'personal'
    and notification.title = 'New like'
    and notification.content_id = notification_content_id
    and notification.created_at >= now() - interval '15 minutes'
  order by notification.created_at desc
  limit 1
  for update;

  if found then
    select count(*) into like_count
    from public.reel_notifications as activity
    where activity.recipient_id = owner_id
      and activity.reel_id = new.reel_id
      and activity.kind = 'like'
      and activity.created_at >= notification_created_at;

    notification_body := actor_name || ' liked your video';
    if like_count > 1 then
      notification_body := actor_name || ' and ' || (like_count - 1)::text
        || case when like_count = 2 then ' other' else ' others' end
        || ' liked your video';
    end if;

    update public.notifications
    set body = notification_body,
        read_at = null
    where id = target_notification_id;

    update public.notification_push_queue
    set body = notification_body
    where notification_push_queue.notification_id = target_notification_id
      and sent_at is null;
  else
    notification_body := actor_name || ' liked your video';
    insert into public.notifications (user_id, type, title, body, content_id)
    values (owner_id, 'personal', 'New like', notification_body, notification_content_id)
    returning id into target_notification_id;

    insert into public.notification_push_queue (user_id, notification_id, title, body, content_id)
    values (owner_id, target_notification_id, 'New like', notification_body, notification_content_id);
  end if;

  return new;
end;
$$;

revoke all on function public.notify_reel_event() from public, anon, authenticated;

create or replace function public.notify_reel_follow()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_name text;
  target_notification_id uuid;
  notification_body text;
  notification_content_id text;
begin
  if new.follower_id = new.creator_id then
    return new;
  end if;

  select coalesce(nullif(btrim(profile.display_name), ''), 'Geniuzplus user')
  into actor_name
  from public.profiles as profile
  where profile.id = new.follower_id;
  actor_name := coalesce(actor_name, 'Geniuzplus user');
  notification_body := actor_name || ' started following you';
  notification_content_id := 'profile:' || new.follower_id::text;

  if exists (
    select 1
    from public.notifications as notification
    where notification.user_id = new.creator_id
      and notification.type = 'personal'
      and notification.title = 'New follower'
      and notification.content_id = notification_content_id
  ) then
    return new;
  end if;

  insert into public.notifications (user_id, type, title, body, content_id)
  values (new.creator_id, 'personal', 'New follower', notification_body, notification_content_id)
  returning id into target_notification_id;

  insert into public.notification_push_queue (user_id, notification_id, title, body, content_id)
  values (new.creator_id, target_notification_id, 'New follower', notification_body, notification_content_id);

  return new;
end;
$$;

revoke all on function public.notify_reel_follow() from public, anon, authenticated;

drop trigger if exists reel_follows_notify on public.reel_follows;
create trigger reel_follows_notify
  after insert on public.reel_follows
  for each row execute function public.notify_reel_follow();
