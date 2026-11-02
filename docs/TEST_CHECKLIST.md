# Geniuzplus manual test checklist

These are checks to run on a real device or browser. None of the live behavior below is verified here. Run a migration only after checking whether it is already applied. Use test content and do not send real money just to test.

## Manual payouts and withdrawals

- **Tap:** Me → Creator earnings → Payout method, then Withdraw and Withdrawal history.
- **See:** Saved bank details, a clear eligibility/minimum message, and a real withdrawal request in history.
- **Failure:** Invalid details or an ineligible/under-$5 request is accepted, or a request has no visible result.
- **Migration first:** `20261025000000_reels_and_creator_earnings.sql`, then `20261102000400_creator_earnings_manual_withdrawals.sql` (confirm whether the latter is already applied).

## Wallet credit

- **Tap:** Me → Creator earnings → Overview and Earnings history.
- **See:** Only backend-recorded credits and the matching available balance. The current launch rule is $0.01 per 20 qualified Reel views.
- **Failure:** A made-up credit appears, the balance does not match the ledger, or a non-qualified view is credited.
- **Migration first:** `20261025000000_reels_and_creator_earnings.sql`, then `20261102000400_creator_earnings_manual_withdrawals.sql` (confirm whether the latter is already applied).

## Pay a creator

- **Tap:** Admin → Withdrawals. Pay a test request outside the app in Flutterwave, enter its payment reference, then tap Mark as paid.
- **See:** The request leaves Pending and the creator sees the updated withdrawal history.
- **Failure:** The screen sends money itself, accepts an empty reference, or marks a request without saved payout details as paid.
- **Migration first:** `20261025000000_reels_and_creator_earnings.sql`, then `20261102000400_creator_earnings_manual_withdrawals.sql` (confirm whether the latter is already applied).

## Replace videos

- **Tap:** Admin → Replace videos → choose a test series/season → choose replacement episode files.
- **See:** The selected episode/file pairing is correct, the replacement result is clear, and the test episode plays the new file.
- **Failure:** The wrong episode is replaced, a failed upload is reported as successful, or the old file stops playing before the new one is checked.
- **Migration first:** `20261002000000_movies.sql`, `20261004000000_movies_backblaze_storage.sql`, and `20261005000000_series_seasons_episodes.sql` if any are missing.

## Reels

- **Tap:** Home → Reels → open a Reel; try like, comment, save, and create a test Reel.
- **See:** The correct clip plays, actions show their saved state, and the new Reel appears in the feed.
- **Failure:** A hidden/future Reel appears, an action claims success but does not persist, or upload errors are hidden.
- **Migration first:** `20261025000000_reels_and_creator_earnings.sql`, `20261026000000_reels_active_members_only.sql`, `20261102000500_reel_publish_schedule.sql`, and `20261103000100_reels_file_size_limit.sql`. Apply `20261029000000_reel_playlist.sql` and `20261030000000_reel_notifications.sql` before testing playlist/notification actions.

## Creator earnings

- **Tap:** Me → Creator earnings → Overview, Eligibility and progress, Earnings history, and Withdrawal history.
- **See:** Real server totals, view progress, and ledger rows; do not expect earnings without qualified views.
- **Failure:** The screen invents earnings, totals disagree with the ledger, or a withdrawal is shown as paid before an admin records it.
- **Migration first:** `20261025000000_reels_and_creator_earnings.sql`, `20261026000000_reels_active_members_only.sql`, and `20261102000400_creator_earnings_manual_withdrawals.sql` (confirm whether the latter is already applied).

## Web audio boost

- **Tap:** Open a movie in a web browser → Play → use Volume boost.
- **See:** The control changes the web player's volume from normal up to 200%.
- **Failure:** The slider moves but audio does not change, or native playback changes unexpectedly.
- **Migration first:** None for this web control.

## Web single-movie play and download

- **Tap:** In a web browser, open a downloadable movie → Play, then Download.
- **See:** Play opens the movie; Download saves it in this browser and shows it in Downloads.
- **Failure:** The wrong title plays, a failed download is shown as complete, or the download is described as an operating-system file.
- **Migration first:** None for this web change. The existing movie and Backblaze schema must be present: `20261002000000_movies.sql` and `20261004000000_movies_backblaze_storage.sql`.

## Web downloads on this device

- **Tap:** After downloading a title in the browser, open Downloads → Geniuz; reload the page, then choose the saved title.
- **See:** The title and size remain listed and it plays after disconnecting from the internet.
- **Failure:** The record disappears after reload, playback needs the network, or the UI says the file is in the computer's Downloads folder.
- **Migration first:** None for browser storage. The existing movie schema must be present: `20261002000000_movies.sql`.

## Offline mode

- **Tap:** Open Home, Search, and Library online once; then disconnect the device and reopen those screens.
- **See:** Cached catalog items remain visible with Offline labels. A downloaded title plays; an undownloaded stream asks for a connection.
- **Failure:** The app says an undownloaded movie is playable offline or removes all cached catalog browsing.
- **Migration first:** None for the local catalog cache. Existing movie/catalog schema must already be set up.

## Background download permission prompt

- **Tap:** On Android or iPhone, deny notification permission, then start or resume a download.
- **See:** Geniuzplus explains the permission and offers Allow; if the phone will not ask again, it offers phone Settings. The download waits for permission.
- **Failure:** A background download starts before permission is granted, or the prompt claims permission guarantees downloads continue after the app is killed.
- **Migration first:** None. This check is for the native app, not browser downloads.

## Laptop layout

- **Tap:** Open the web app on a laptop. Check Home, Search, Library, and Downloads at wide and phone-sized browser widths.
- **See:** Content is centered and readable on the laptop, with more columns; phone layout remains narrow.
- **Failure:** Content stretches edge-to-edge, overlaps, or loses the phone-width layout.
- **Migration first:** None.

## New-season notifications

- **Tap:** After an admin publishes a test season with a published episode, open Me → Notifications on a registered device.
- **See:** One “New season available” message appears and opens the correct series.
- **Failure:** A draft season notifies users, the same season sends duplicates, or the message opens the wrong series.
- **Migration first:** `20261005000000_series_seasons_episodes.sql`, `20261010000000_notifications.sql`, then `20261102000300_new_season_notifications.sql`.

## Terms and Privacy

- **Tap:** Me → Settings → Terms, then Privacy. Also try the public `/terms` and `/privacy` web pages.
- **See:** Each page opens without signing in and has readable Geniuzplus text.
- **Failure:** A link is broken, content is blank, or `[CONTACT EMAIL]` is still present before release.
- **Migration first:** None.

## Reel size guard

- **Tap:** Reels → create a Reel → choose a video larger than 30 MB and tap Share.
- **See:** A friendly “larger than 30 MB” message appears before upload starts. A file at or below 30 MB passes this size check.
- **Failure:** The oversized file starts uploading or the size is unknown but upload proceeds.
- **Migration first:** `20261025000000_reels_and_creator_earnings.sql`, then `20261103000100_reels_file_size_limit.sql`. The bucket-limit migration has not been run.
