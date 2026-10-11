create table if not exists public.reel_playlist_items (
  user_id uuid not null references auth.users(id) on delete cascade,
  reel_id uuid not null references public.reels(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, reel_id)
);
create index if not exists reel_playlist_user_created_idx on public.reel_playlist_items (user_id, created_at desc);
alter table public.reel_playlist_items enable row level security;
grant select, insert, delete on public.reel_playlist_items to authenticated;
drop policy if exists "Users read their playlist" on public.reel_playlist_items;
create policy "Users read their playlist" on public.reel_playlist_items for select to authenticated using (user_id = auth.uid());
drop policy if exists "Users add to their playlist" on public.reel_playlist_items;
create policy "Users add to their playlist" on public.reel_playlist_items for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "Users remove from their playlist" on public.reel_playlist_items;
create policy "Users remove from their playlist" on public.reel_playlist_items for delete to authenticated using (user_id = auth.uid());
