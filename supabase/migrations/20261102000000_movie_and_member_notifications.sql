-- 1) New published movie -> one broadcast notification for everyone.
create or replace function public.notify_new_movie()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  do_notify boolean := false;
  cid text := 'movie:new:' || new.id::text;
begin
  if new.published then
    if tg_op = 'INSERT' then
      do_notify := true;
    else
      do_notify := old.published is distinct from true;
    end if;
  end if;
  if do_notify then
    begin
      insert into public.notifications (user_id, type, title, body, content_id)
      select null::uuid, 'broadcast', 'New on Geniuzplus',
        new.title || ' is now available. Tap to watch.', cid
      where not exists (select 1 from public.notifications where content_id = cid);
    exception when others then
      raise warning 'notify_new_movie failed: %', sqlerrm;
    end;
  end if;
  return new;
end $$;
revoke all on function public.notify_new_movie() from public, anon, authenticated;

drop trigger if exists movies_new_notify on public.movies;
create trigger movies_new_notify after insert or update of published on public.movies
for each row execute function public.notify_new_movie();

-- 2) New member (or member coming back after expiry) -> advantages message.
create or replace function public.notify_member_advantages()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  send_it boolean := false;
  cid text;
begin
  if new.status = 'active' then
    if tg_op = 'INSERT' then
      send_it := true;
    else
      send_it := old.status in ('expired', 'refunded');
    end if;
  end if;
  if send_it then
    cid := 'membership:advantages:' || new.user_id::text || ':' || extract(epoch from new.current_period_start)::bigint::text;
    begin
      insert into public.notifications (user_id, type, title, body, content_id)
      select new.user_id, 'personal', 'You are a Geniuzplus Member',
        'Welcome! Your Member badge is now on your profile. What you can do now: send and share movies to other devices, post Reels and earn dollars, and watch with no ads. Start today: post your first Reel and send a movie to a friend. Your membership is active until '
        || to_char(new.current_period_end at time zone 'UTC', 'YYYY-MM-DD') || '.',
        cid
      where not exists (select 1 from public.notifications where content_id = cid);
    exception when others then
      raise warning 'notify_member_advantages failed: %', sqlerrm;
    end;
  end if;
  return new;
end $$;
revoke all on function public.notify_member_advantages() from public, anon, authenticated;

drop trigger if exists memberships_advantages_notify on public.memberships;
create trigger memberships_advantages_notify after insert or update of status on public.memberships
for each row execute function public.notify_member_advantages();
