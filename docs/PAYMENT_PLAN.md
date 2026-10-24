# Geniuzplus payment plan

## ORIGINAL RULES (switch back to these when the promo ends)
- Visitors: free. Stream, download, offline and receive transfers. No sharing, no posting Reels, no earning.
- Membership: N900 per month, with a badge. Unlocks sharing to other devices, posting Reels to earn in dollars, and no ads.
- Earning: $0.02 per 1,000 views.
- A Reel must be at least 10 seconds long to earn.
- To earn and withdraw: at least 1,000 followers and at least 5 active Reels or videos.
- Member must be over 18. Any country allowed. No ID check (no KYC).
- Minimum withdrawal: $5. Payouts on the 28th of every month.
- Payments go through Flutterwave.

## LAUNCH PROMO RULES (active now)
- Rate: $0.50 per 1,000 views, credited as $0.01 for every 20 counted views. No daily limit.
- Counted view: another account, watched 10 seconds or more, one per person per Reel.
- To withdraw: 500 counted views in total (replaces the 1,000 followers and 5 Reels rule).
- Still the same: members only, $5 minimum withdrawal, payouts on the 28th.

## HOW TO SWITCH BACK TO THE ORIGINAL PLAN
1. In the Supabase SQL Editor run: update public.launch_rate_settings set enabled = false where id = 1;
   This stops the $0.01 per 20 views credit and makes withdrawals need 1,000 followers and 5 Reels.
2. In src/config/creatorEarnings.ts change PROMO_ACTIVE to false, then build and deploy.
3. The original per-1,000-views rate ($0.02) is then applied by the normal earnings job.
