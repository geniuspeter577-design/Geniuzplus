# Migrations to check and run

The live migration history was not queried, and no migration was run. The task identifies the first, third, and fourth entries below plus the new Reel bucket limit as pending. Compare every file with the live Supabase migration history before applying it; do not rerun an applied file. The creator-withdrawal migration status is unknown here.

Run migrations in timestamp order. Each line says what must exist first:

1. `20261102000300_new_season_notifications.sql` — Pending per the task; needs the series/episode tables (`20261005000000_series_seasons_episodes.sql`), notification tables (`20261010000000_notifications.sql`), and push-token setup (`20261102000200_member_advantages_push.sql`) first.
2. `20261102000400_creator_earnings_manual_withdrawals.sql` — Status unknown; run only if missing live, after the Reel/creator tables (`20261025000000_reels_and_creator_earnings.sql`) and membership rules (`20261026000000_reels_active_members_only.sql`).
3. `20261102000500_reel_publish_schedule.sql` — Pending per the task; needs the `reels` table from `20261025000000_reels_and_creator_earnings.sql` first.
4. `20261103000000_movie_tmdb_id.sql` — Pending per the task; needs the `movies` table from `20261002000000_movies.sql` first.
5. `20261103000100_reels_file_size_limit.sql` — New and not applied; needs the private `reels` storage bucket from `20261025000000_reels_and_creator_earnings.sql` first.

Before applying a file, test that one file at a time on a safe staging database:

```sql
begin;
-- Paste one migration file here and inspect the results.
rollback;
```

After review, use the normal approved migration process. Do not run migrations from this task and do not use `supabase db push`. Earlier migration status must be checked as well; this list does not prove that any prerequisite is applied.
