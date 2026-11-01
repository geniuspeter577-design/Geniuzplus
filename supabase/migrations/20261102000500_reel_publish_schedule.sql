alter table public.reels
  add column if not exists publish_at timestamptz not null default now();

create index if not exists reels_publish_feed_idx
  on public.reels (publish_at, created_at desc);
