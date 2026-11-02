alter table public.movies
  add column if not exists tmdb_id integer;