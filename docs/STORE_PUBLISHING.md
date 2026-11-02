# Geniuzplus Android store publishing

Documentation only. No build, signing action, or store submission was run. Store rules and prices can change; check the linked store pages again before release.

## Shared items to prepare

- Use the app name **Geniuzplus** and confirm the permanent Android package ID `com.geniuz.entertainment` before creating store records.
- Publish the privacy page on the real HTTPS website and use `https://<your-public-domain>/privacy` as the policy URL. The app has a `/privacy` page, but the public domain is not configured in this repository. Do not submit a placeholder URL.
- Replace `[CONTACT EMAIL]` in the Terms and Privacy pages and have the legal text reviewed. See [legal-review.md](./legal-review.md).
- Make real phone screenshots of the current app, an accurate short and full description, the app icon, and any store graphics. Do not show demo content or claim unverified features.
- Complete the store's content-rating questions for the actual movie/series catalog and user-posted Reels. Consider user-generated video, comments, account features, payments, and the content users can reach. Do not guess a rating.
- Give reviewers working account access and short steps for any sign-in or member-only screens. Do not put credentials in the public listing.

## Google Play

### Package and signing steps

1. Create a Play Console developer account and verify the account owner.
2. Check the Expo-managed Android signing credentials with `npx eas-cli credentials --platform android`. Keep the upload key and recovery information private.
3. Build the production Android App Bundle (AAB) with `npx eas-cli build --profile production --platform android`. The existing [eas.json](../eas.json) production profile sets `android.buildType` to `app-bundle`.
4. Download the signed AAB from EAS and upload it to an internal test track first. Enroll in Play App Signing and keep using the matching upload key for updates.
5. Increase the remote Android version code for each release. The app version is currently `1.0.0`; its Play version code and signing setup are not verified.

These are instructions only; do not run the commands until ready. New Google Play apps must use AAB. See [Android App Bundles](https://developer.android.com/guide/app-bundle) and [Play Console setup](https://support.google.com/googleplay/android-developer/answer/9859152).

### Listing and declarations

- Add the app icon, phone screenshots, a short description (up to 80 characters), a full description, and the 1024 × 500 feature graphic. Keep the screenshots and claims true to the shipped app. See [Google Play preview asset rules](https://support.google.com/googleplay/android-developer/answer/9866151).
- Complete the content-rating questionnaire, target-audience declaration, ads declaration, app-access instructions, and other items in Play Console's App content section. See [content ratings](https://support.google.com/googleplay/android-developer/answer/9859655).
- Complete Data safety from the app's actual behavior and all SDKs/services. The current app sends or stores account data (email, display name, username, date of birth, account ID, and avatar); user content (Reels, captions, selected audio, comments, likes, follows, and saves); membership and creator records (payment references, earnings, payout requests, and payout bank details); service activity (search, playback/watch records, playlists, and download records); and push tokens. Some downloads are local to the device/browser. Confirm which fields leave the device, which providers receive them, and whether each transfer is “collection” or “sharing” under Google's definitions. Include the configured payment provider and any data collected by SDKs. Do not answer “no data collected” without checking the deployed app and provider settings. See [Data safety requirements](https://support.google.com/googleplay/android-developer/answer/10787469).
- The app supports account creation and currently offers an in-app account-deletion request. Google also requires a working web resource where users can request account and associated-data deletion. That external deletion page is **not present in this repository** and must be provided before submitting. See [account deletion requirements](https://support.google.com/googleplay/android-developer/answer/13327111).
- Google Play generally requires Play Billing for digital subscriptions and app features, except where an approved exception or program applies. Geniuzplus currently uses hosted checkout through its configured payment provider, including Flutterwave. Resolve this policy question before Play release; do not assume an external checkout is allowed. See [Google Play Payments policy](https://support.google.com/googleplay/android-developer/answer/9858738).
- If the Play Console account is a personal account created after November 13, 2023, Google currently requires a closed test with at least 12 testers opted in continuously for 14 days before applying for production access. See [testing requirements](https://support.google.com/googleplay/android-developer/answer/14151465).

### Google Play costs

- Developer registration: **US$25 one time**. Google may also request identity verification. See [Play Console account setup](https://support.google.com/googleplay/android-developer/answer/6112435).
- Google Play service fees apply to paid apps and eligible paid transactions. The rate depends on region, payment route, and program; check the current [service-fee rules](https://support.google.com/googleplay/android-developer/answer/112622). Payment-provider processing fees may also apply.
- EAS currently lists a **Free** plan with 15 Android builds per month and updates for 1,000 monthly active users. Queues and quotas apply; check [EAS pricing](https://expo.dev/pricing) before building.

## Palm Store

- Create the publisher account through the official Transsion/Palm Store channel and confirm the account, review, and country requirements.
- Prepare the same package identity, signed Android release, privacy URL, screenshots, app icon, accurate app description, contact details, and content/age-rating answers. Confirm any additional data-safety, permission, and account-deletion declarations the portal requires.
- The current production EAS profile creates an AAB. **Confirm whether Palm Store accepts AAB or requires a signed APK before building.** If it requires an APK, use a store/release signing profile and the correct release key; the current `preview` profile is marked `distribution: internal` and is not confirmed as a store artifact.
- Palm Store's current public developer requirements, accepted upload format, and any submission fee could not be verified from accessible official developer documentation in this check. Treat all three as **unknown** and confirm them with the portal before spending time on a build. The [Palm Store site](https://www.palmplaystore.com/) is a consumer listing, not a verified developer rulebook.

## Already in the repository

- [app.json](../app.json) already names the app Geniuzplus, uses package ID `com.geniuz.entertainment`, and configures app/adaptive icons and an Expo project ID.
- [eas.json](../eas.json) already has a production AAB profile and a preview APK profile. Signing credentials, the remote version code, and any store artifact have not been verified.
- App and backend public `/privacy` and `/terms` pages exist. They still contain `[CONTACT EMAIL]`; the legal review and public privacy URL are unfinished.
- No store screenshots, feature graphic, final store description, Play Data safety answers, rating questionnaire, or store submission are recorded here.

## Status

Google Play and Palm Store submission are waiting on the owner. Confirm the privacy/contact and account-deletion URLs, payment-policy approach, actual data declarations, store assets, and Palm Store file/fee requirements before creating a release.
