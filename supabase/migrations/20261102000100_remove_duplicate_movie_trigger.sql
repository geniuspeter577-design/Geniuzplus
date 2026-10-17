-- The older trigger movies_published_notification already notifies users about new movies.
-- Remove the duplicate trigger and function added in 20261102000000.
drop trigger if exists movies_new_notify on public.movies;
drop function if exists public.notify_new_movie();
