// PROMO_ACTIVE = true uses the launch promo rules. Set it to false to use the original plan.
// The full rules are written in docs/PAYMENT_PLAN.md.
export const PROMO_ACTIVE = true;

const ORIGINAL_ELIGIBILITY = { minimumFollowers: 1000, minimumActiveReels: 5, minimumViews: 0, minimumWatchSeconds: 0 };
const PROMO_ELIGIBILITY = { minimumFollowers: 0, minimumActiveReels: 0, minimumViews: 500, minimumWatchSeconds: 0 };

export const CREATOR_ELIGIBILITY = PROMO_ACTIVE ? PROMO_ELIGIBILITY : ORIGINAL_ELIGIBILITY;
