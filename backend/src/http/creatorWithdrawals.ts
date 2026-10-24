import { createClient } from '@supabase/supabase-js';

import type { Config } from '../config/config';
import { HttpError } from './errors';

const FRIENDLY: [string, number, string, string][] = [
  ['BELOW_MINIMUM_5_USD', 400, 'BELOW_MINIMUM', 'The minimum withdrawal is $5.'],
  ['PROMO_MIN_VIEWS_NOT_MET', 403, 'NOT_ELIGIBLE', 'You need 500 counted views before you can withdraw.'],
  ['ORIGINAL_ELIGIBILITY_NOT_MET', 403, 'NOT_ELIGIBLE', 'You need 1,000 followers and 5 active Reels before you can withdraw.'],
  ['MEMBERSHIP_REQUIRED', 403, 'MEMBERS_ONLY', 'Only active members can withdraw.'],
  ['PAYOUT_DETAILS_REQUIRED', 409, 'PAYOUT_DETAILS_REQUIRED', 'Add your payout details first.'],
  ['INSUFFICIENT_EARNINGS', 409, 'INSUFFICIENT_EARNINGS', 'You do not have that much available.'],
  ['INVALID_WITHDRAWAL', 400, 'INVALID_AMOUNT', 'Enter a valid amount.'],
];

export async function requestCreatorWithdrawal(config: Config, userId: string, amountUsd: number) {
  if (!config.supabaseUrl || !config.supabaseServiceRoleKey) {
    throw new HttpError(503, 'SERVICE_KEY_NOT_CONFIGURED', 'Withdrawals are not configured on this server.');
  }
  const amount = Math.round(amountUsd * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0 || amount > 100000) {
    throw new HttpError(400, 'INVALID_AMOUNT', 'Enter a valid amount.');
  }
  const admin = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await admin.rpc('request_manual_withdrawal', {
    p_user_id: userId,
    p_amount_usd: amount,
  });
  if (error) {
    const text = String(error.message ?? '');
    const match = FRIENDLY.find(([code]) => text.includes(code));
    if (match) throw new HttpError(match[1], match[2], match[3]);
    throw new HttpError(502, 'WITHDRAWAL_FAILED', 'The withdrawal could not be requested. Try again.');
  }
  return {
    ok: true,
    id: data as string,
    message: 'Your withdrawal was received. Payment arrives within 48 hours.',
  };
}
