do $$
begin
  if to_regclass('public.guest_push_tokens') is null then
    create table if not exists public.guest_push_tokens (
      expo_push_token text primary key check (
        expo_push_token like 'ExponentPushToken[%]'
        and length(expo_push_token) > length('ExponentPushToken[]')
      ),
      updated_at timestamptz not null default now()
    );
    alter table public.guest_push_tokens enable row level security;
    revoke all on public.guest_push_tokens from public, anon, authenticated;
    grant all on public.guest_push_tokens to service_role;
  end if;
end;
$$;

do $$
begin
  if to_regprocedure('public.register_guest_push_token(text)') is null then
    execute $create_function$
      create function public.register_guest_push_token(p_token text)
      returns void
      language plpgsql
      security definer
      set search_path = public, pg_temp
      as $function_body$
      begin
        if p_token is null
          or p_token not like 'ExponentPushToken[%]'
          or length(p_token) <= length('ExponentPushToken[]') then
          raise exception 'A valid Expo push token is required.' using errcode = '22023';
        end if;

        insert into public.guest_push_tokens (expo_push_token)
        values (p_token)
        on conflict (expo_push_token) do update set updated_at = now();
      end;
      $function_body$
    $create_function$;
    revoke all on function public.register_guest_push_token(text) from public;
    grant execute on function public.register_guest_push_token(text) to anon, authenticated;
  end if;
end;
$$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'notification_push_queue'
      and column_name = 'user_id'
      and is_nullable = 'NO'
  ) then
    alter table public.notification_push_queue alter column user_id drop not null;
  end if;
end;
$$;

alter table public.notification_push_queue
  add column if not exists expo_push_token text,
  add column if not exists image_url text;

do $$
begin
  if to_regclass('public.season_notification_announcements') is null then
    create table if not exists public.season_notification_announcements (
      season_id uuid primary key references public.seasons(id) on delete cascade,
      notification_id uuid references public.notifications(id) on delete set null,
      announced_at timestamptz not null default now()
    );
    alter table public.season_notification_announcements enable row level security;
    revoke all on public.season_notification_announcements from public, anon, authenticated;
    grant all on public.season_notification_announcements to service_role;
  end if;
end;
$$;

insert into public.season_notification_announcements (season_id)
select season.id
from public.seasons as season
where season.published is true
  and exists (
    select 1
    from public.episodes as episode
    where episode.season_id = season.id
      and episode.published is true
  )
on conflict (season_id) do nothing;

create or replace function public.notify_published_season()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  series_title text;
  series_poster text;
  target_season_id uuid;
  target_series_id uuid;
  target_season_number integer;
  notification_title text := 'New season available';
  notification_body text;
  created_notification_id uuid;
  target_token record;
  claimed_count integer;
begin
  if tg_table_name = 'episodes' then
    if new.published is not true then
      return new;
    end if;
    if tg_op = 'UPDATE' and old.published is true and old.season_id = new.season_id then
      return new;
    end if;
    target_season_id := new.season_id;
  else
    if new.published is not true then
      return new;
    end if;
    if tg_op = 'UPDATE' and old.published is true then
      return new;
    end if;
    target_season_id := new.id;
  end if;

  begin
    select season.series_id, season.season_number, series.title, series.poster_url
      into target_series_id, target_season_number, series_title, series_poster
      from public.seasons as season
      join public.movies as series on series.id = season.series_id
      where season.id = target_season_id
        and season.published is true
        and exists (
          select 1
          from public.episodes as episode
          where episode.season_id = season.id
            and episode.published is true
        );

    if not found then
      return new;
    end if;

    insert into public.season_notification_announcements (season_id)
    values (target_season_id)
    on conflict (season_id) do nothing;
    get diagnostics claimed_count = row_count;
    if claimed_count = 0 then
      return new;
    end if;

    notification_body := series_title || ' - Season ' || target_season_number::text
      || ' is now available on Geniuzplus.';

    insert into public.notifications (user_id, type, title, body, content_id)
    values (null, 'broadcast', notification_title, notification_body, target_series_id::text)
    returning id into created_notification_id;

    update public.season_notification_announcements
      set notification_id = created_notification_id
      where season_id = target_season_id;

    for target_token in
      select expo_push_token from public.device_push_tokens
      union
      select expo_push_token from public.guest_push_tokens
    loop
      insert into public.notification_push_queue (
        user_id, notification_id, title, body, content_id, expo_push_token, image_url
      )
      values (
        null, created_notification_id, notification_title, notification_body,
        target_series_id::text, target_token.expo_push_token, series_poster
      );
    end loop;
  exception when others then
    raise warning 'notify_published_season failed for %: %', target_season_id, sqlerrm;
  end;

  return new;
end;
$$;

revoke all on function public.notify_published_season() from public, anon, authenticated;

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'seasons_published_notification'
      and tgrelid = 'public.seasons'::regclass
      and not tgisinternal
  ) then
    execute 'create trigger seasons_published_notification after insert or update of published on public.seasons for each row execute function public.notify_published_season()';
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgname = 'episodes_season_published_notification'
      and tgrelid = 'public.episodes'::regclass
      and not tgisinternal
  ) then
    execute 'create trigger episodes_season_published_notification after insert or update of published, season_id on public.episodes for each row execute function public.notify_published_season()';
  end if;
end;
$$;
