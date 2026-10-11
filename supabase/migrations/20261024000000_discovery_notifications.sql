alter table public.movies
  add column if not exists release_date date;

update public.profiles
set display_name = replace(replace(display_name, 'Geniuz' || chr(43), 'Geniuzplus'), 'Geniuz ' || 'Plus', 'Geniuzplus')
where position('Geniuz' || chr(43) in display_name) > 0
  or position('Geniuz ' || 'Plus' in display_name) > 0;

update public.notifications
set title = replace(replace(title, 'Geniuz' || chr(43), 'Geniuzplus'), 'Geniuz ' || 'Plus', 'Geniuzplus'),
   body = replace(replace(body, 'Geniuz' || chr(43), 'Geniuzplus'), 'Geniuz ' || 'Plus', 'Geniuzplus')
where position('Geniuz' || chr(43) in title) > 0
  or position('Geniuz ' || 'Plus' in title) > 0
  or position('Geniuz' || chr(43) in body) > 0
  or position('Geniuz ' || 'Plus' in body) > 0;

alter table public.movies
  drop constraint if exists published_movies_require_video;

alter table public.movies
  add constraint published_movies_require_video
  check (
    not published
    or release_date is not null
    or (storage_provider = 'supabase' and video_path is not null)
    or (storage_provider = 'b2' and storage_key is not null)
  );

drop policy if exists "Published movies are visible to everyone" on public.movies;
create policy "Published movies are visible to everyone"
  on public.movies for select
  to anon, authenticated
  using (
    published
    and (
      content_type = 'series'
      or (release_date is not null and release_date > current_date)
      or (storage_provider = 'supabase' and video_path is not null)
      or (storage_provider = 'b2' and storage_key is not null)
    )
  );

create table if not exists public.device_push_tokens (
  user_id uuid not null references auth.users(id) on delete cascade,
  expo_push_token text not null unique check (expo_push_token like 'ExponentPushToken[%'),
  updated_at timestamptz not null default now(),
  primary key (user_id, expo_push_token)
);

alter table public.device_push_tokens enable row level security;
grant select, insert, delete on public.device_push_tokens to authenticated;
grant update on public.device_push_tokens to authenticated;

drop policy if exists "Users manage their own push tokens" on public.device_push_tokens;
create policy "Users manage their own push tokens"
  on public.device_push_tokens for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);

create table if not exists public.notification_push_queue (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  notification_id uuid not null references public.notifications(id) on delete cascade,
  title text not null,
  body text not null,
  content_id text,
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  sent_at timestamptz,
  attempts integer not null default 0,
  last_error text
);

create index if not exists notification_push_queue_pending_idx
  on public.notification_push_queue (created_at)
  where sent_at is null;

alter table public.notification_push_queue enable row level security;
revoke all on public.notification_push_queue from public, anon, authenticated;
grant all on public.notification_push_queue to service_role;

create or replace function public.notify_published_movie()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  notification_title text;
  notification_body text;
  target_user record;
  notification_id uuid;
begin
  if not new.published then
    return new;
  end if;

  if tg_op = 'UPDATE'
    and old.published = new.published
    and old.release_date is not distinct from new.release_date then
    return new;
  end if;

  if new.release_date is not null and new.release_date > current_date then
    notification_title := 'Upcoming movie added';
    notification_body := new.title || ' is coming on ' || to_char(new.release_date, 'Mon DD, YYYY') || '.';
  else
    notification_title := 'New movie uploaded';
    notification_body := new.title || ' is now available on Geniuzplus.';
  end if;

  for target_user in select id from auth.users loop
    insert into public.notifications (user_id, type, title, body, content_id)
    values (target_user.id, 'personal', notification_title, notification_body, new.id::text)
    returning id into notification_id;

    insert into public.notification_push_queue (user_id, notification_id, title, body, content_id)
    values (target_user.id, notification_id, notification_title, notification_body, new.id::text);
  end loop;

  return new;
end;
$$;

revoke all on function public.notify_published_movie() from public, anon, authenticated;

drop trigger if exists movies_published_notification on public.movies;
create trigger movies_published_notification
  after insert or update of published, release_date on public.movies
  for each row execute procedure public.notify_published_movie();
