export type LegalDocumentSection = {
  heading: string;
  paragraphs: string[];
};

export const REFUND_POLICY_TEXT =
  'TODO: Confirm refund eligibility, timing, and cancellation terms with the configured payment provider and applicable law. Until confirmed, refunds are subject to applicable law and the terms displayed at checkout.';
export const SUPPORT_EMAIL = 'TODO: provide the official support email address';

export const LEGAL_DOCUMENTS = {
  terms: {
    title: 'Terms of Use',
    sections: [
      {
        heading: 'Using Geniuzplus',
        paragraphs: [
          'Geniuzplus provides movies, series, Reels, profiles, playlists, downloads, membership features, creator tools, and notifications. These terms apply when you use the app or website.',
          'Use Geniuzplus only when you are legally able to agree to these terms. The app asks for your date of birth during account setup; do not enter a false date.',
        ],
      },
      {
        heading: 'Your account',
        paragraphs: [
          'Keep your account details accurate and your sign-in credentials private. You are responsible for activity under your account. Contact ' + SUPPORT_EMAIL + ' if you believe someone else has accessed it.',
        ],
      },
      {
        heading: 'Service content and acceptable use',
        paragraphs: [
          'Geniuzplus and its licensors retain their rights in the app, brand, and licensed catalog. Your access is personal and limited to the features made available through the service. Do not copy, redistribute, publicly perform, reverse engineer, or bypass access controls for service content except where applicable law permits.',
          'Do not use the service to violate law or another person’s rights, interfere with service operation, evade safety or access controls, or distribute malware, spam, or deceptive material. Do not use another person’s account or payment method without authorization.',
          'Report content or conduct that appears to violate these terms through the reporting features where available. We may investigate reports and remove content or restrict accounts when reasonably necessary to protect users, rights holders, or the service.',
        ],
      },
      {
        heading: 'Membership and payments',
        paragraphs: [
          'Available plans, prices, and membership periods are shown before checkout. Flutterwave processes Member payments where it is the configured payment provider; otherwise, the payment provider shown at checkout processes the payment. Membership is activated after payment confirmation.',
          'Membership does not automatically charge your card again. To continue after a plan ends, choose and pay for another plan. Payment providers handle payment credentials under their own terms. ' + REFUND_POLICY_TEXT + ' For billing questions, contact ' + SUPPORT_EMAIL + '.',
        ],
      },
      {
        heading: 'Reels and other content',
        paragraphs: [
          'You are responsible for content you post, including Reels, captions, audio, and comments. Only upload or share material you own or have permission to use, and respect other people\'s privacy and rights.',
          'You keep ownership of your content. You give Geniuzplus permission to store, process, display, and deliver it as needed to run the service and according to the visibility settings you choose. Content marked public may be seen by other users; follower-only content is shown according to its selected audience.',
          'Do not post unlawful, infringing, threatening, harassing, deceptive, or otherwise abusive material. Users can report content. Geniuzplus may review, restrict, or remove content and may limit accounts that violate these terms or put users or the service at risk.',
        ],
      },
      {
        heading: 'Downloads',
        paragraphs: [
          'Downloads are available only for titles that allow them and may depend on membership, device, format, and other limits shown in the app. A downloaded copy is for your personal use in Geniuzplus. Do not copy, redistribute, or make it available to others. You can remove a local download from the Downloads area.',
        ],
      },
      {
        heading: 'Creator rewards',
        paragraphs: [
          'Creator rewards and earnings are available only when the program is enabled and you meet its eligibility rules. Recorded amounts may be reviewed or corrected for errors, refunds, abuse, or ineligible activity. Views, membership, or participation do not guarantee earnings or a payout. Any available payout request is subject to verification and the program rules shown in the app.',
        ],
      },
      {
        heading: 'Third-party services',
        paragraphs: [
          'Some features depend on third-party services, including account, storage, hosting, payment, and push-notification providers. Their availability and terms may affect the service. Geniuzplus is not responsible for third-party services it does not operate.',
        ],
      },
      {
        heading: 'Changes and availability',
        paragraphs: [
          'Features and content may change or be temporarily unavailable. Geniuzplus may update these terms and will give notice when required. We may suspend or close access when needed to address violations, safety concerns, or service changes.',
        ],
      },
      {
        heading: 'Contact',
        paragraphs: ['Questions about these terms: [CONTACT EMAIL].'],
      },
    ],
  },
  privacy: {
    title: 'Privacy Policy',
    sections: [
      {
        heading: 'Information we use',
        paragraphs: [
          'Account information includes your email address, display name, username and date of birth, plus account identifiers used to sign you in and associate your profile with your activity.',
          'Service activity can include searches, titles you view, playback progress, watchlist and playlist entries, download records, and Reels you post or interact with, such as likes, comments, follows, saves, and reports.',
          'Membership and creator records can include the plan selected, payment reference, amount, currency, payment status and dates, reward eligibility, recorded earnings, and payout requests. Flutterwave or the payment provider shown at checkout handles your payment details. Geniuzplus receives the information needed to confirm and manage the transaction; we do not receive your full card credentials through the hosted checkout.',
          'If you provide payout details, we store the country, bank name, account name, and account number needed to process a manually reviewed creator payout. Authorized administrators can view these details for that purpose.',
          'If you allow push notifications, we store a device push token and use it to deliver service notifications. You can turn off push permission in your device settings.',
        ],
      },
      {
        heading: 'How we use information',
        paragraphs: [
          'We use information to create and secure accounts, provide playback and downloads, remember library and watch progress, operate Reels and creator features, confirm membership payments, calculate and review creator rewards, send notifications, respond to requests, prevent abuse, and maintain the service.',
        ],
      },
      {
        heading: 'Service providers and sharing',
        paragraphs: [
          'Geniuzplus uses Supabase for account authentication and application data, Render to host backend services, Backblaze B2 for some video files, Flutterwave or the payment provider shown at checkout, and Expo push services for device notifications. These providers process information to provide their services.',
          'Your profile details and content may be visible to other users according to your profile and Reel visibility settings. We do not sell personal information. We may disclose information when required by law or when reasonably needed to protect users, investigate abuse, or secure the service.',
        ],
      },
      {
        heading: 'Downloads and device storage',
        paragraphs: [
          'When you download a title, the media file is saved in local device or browser storage for playback in Geniuzplus, where supported. Download records may also be kept with your app data so the Downloads area can list and manage them. The website may cache app resources and title images so the catalog can load more quickly and previously viewed items may remain available offline. Remove downloads from the Downloads area to delete the local media copy.',
        ],
      },
      {
        heading: 'Your choices and security',
        paragraphs: [
          'You can edit available profile information, manage push permission in device settings, remove local downloads, and submit an account deletion request in the app. We use access controls and service providers to protect information, but no online service can guarantee absolute security.',
        ],
      },
      {
        heading: 'Retention and account requests',
        paragraphs: [
          'We keep information for as long as needed to provide the service, maintain payment and creator records, meet legal obligations, resolve disputes, and protect the service. You can submit an account deletion request in the app. Some payment, security, or transaction records may be retained when required for these purposes.',
        ],
      },
      {
        heading: 'Contact and updates',
        paragraphs: [
          'For a privacy question or request, contact ' + SUPPORT_EMAIL + '. We may update this policy and will publish the current version on this page.',
        ],
      },
    ],
  },
} satisfies Record<'terms' | 'privacy', { title: string; sections: LegalDocumentSection[] }>;
