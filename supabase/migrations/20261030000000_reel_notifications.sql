create table if not exists public.reel_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('tag','like','comment','save')),
  reel_id uuid references public.reels(id) on delete cascade,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists reel_notifications_recipient_idx on public.reel_notifications (recipient_id, created_at desc);
create unique index if not exists reel_notifications_once on public.reel_notifications (recipient_id, actor_id, reel_id, kind) where kind in ('like','save','tag');
alter table public.reel_notifications enable row level security;
grant select on public.reel_notifications to authenticated;
grant update (read_at) on public.reel_notifications to authenticated;
drop policy if exists "Read own reel notifications" on public.reel_notifications;
create policy "Read own reel notifications" on public.reel_notifications for select to authenticated using (recipient_id = auth.uid());
drop policy if exists "Mark own reel notifications read" on public.reel_notifications;
create policy "Mark own reel notifications read" on public.reel_notifications for update to authenticated using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());

create or replace function public.notify_reel_event()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare owner uuid;
begin
  select user_id into owner from public.reels where id = new.reel_id;
  if owner is not null and owner <> new.user_id then
    insert into public.reel_notifications (recipient_id, actor_id, kind, reel_id)
    values (owner, new.user_id, tg_argv[0], new.reel_id)
    on conflict do nothing;
  end if;
  return new;
end $$;
revoke all on function public.notify_reel_event() from public, anon, authenticated;

create or replace function public.notify_reel_tags()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if coalesce(new.edits->>'tags', '') <> '' then
    insert into public.reel_notifications (recipient_id, actor_id, kind, reel_id)
    select distinct p.id, new.user_id, 'tag', new.id
    from regexp_split_to_table(lower(new.edits->>'tags'), '\s+') as t(handle)
    join public.profiles p on p.username = ltrim(t.handle, '@')
    where p.id <> new.user_id
    on conflict do nothing;
  end if;
  return new;
end $$;
revoke all on function public.notify_reel_tags() from public, anon, authenticated;

drop trigger if exists reel_likes_notify on public.reel_likes;
create trigger reel_likes_notify after insert on public.reel_likes for each row execute function public.notify_reel_event('like');
drop trigger if exists reel_comments_notify on public.reel_comments;
create trigger reel_comments_notify after insert on public.reel_comments for each row execute function public.notify_reel_event('comment');
drop trigger if exists reel_saves_notify on public.reel_saves;
create trigger reel_saves_notify after insert on public.reel_saves for each row execute function public.notify_reel_event('save');
drop trigger if exists reels_tags_notify on public.reels;
create trigger reels_tags_notify after insert on public.reels for each row execute function public.notify_reel_tags();
