create or replace function public.notify_member_advantages()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  send_it boolean := false;
  cid text;
  nid uuid;
  msg_title text := 'You are a Geniuzplus Member';
  msg_body text;
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
    msg_body := 'Welcome! Your Member badge is now on your profile. What you can do now: send and share movies to other devices, post Reels and earn dollars, and watch with no ads. Start today: post your first Reel and send a movie to a friend. Your membership is active until '
      || to_char(new.current_period_end at time zone 'UTC', 'YYYY-MM-DD') || '.';
    begin
      if not exists (select 1 from public.notifications where content_id = cid) then
        insert into public.notifications (user_id, type, title, body, content_id)
        values (new.user_id, 'personal', msg_title, msg_body, cid)
        returning id into nid;
        begin
          insert into public.notification_push_queue (user_id, notification_id, title, body, content_id)
          values (new.user_id, nid, msg_title, msg_body, cid);
        exception when others then
          raise warning 'member push queue failed: %', sqlerrm;
        end;
      end if;
    exception when others then
      raise warning 'notify_member_advantages failed: %', sqlerrm;
    end;
  end if;
  return new;
end $$;
revoke all on function public.notify_member_advantages() from public, anon, authenticated;
