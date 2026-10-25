import { createClient } from '@supabase/supabase-js';

import type { Config } from '../config/config';
import { HttpError } from './errors';

export async function verifyPassword(config: Config, email: string | undefined, password: unknown) {
  if (!config.supabaseUrl || !config.supabasePublishableKey) {
    throw new HttpError(503, 'SUPABASE_NOT_CONFIGURED', 'Sign-in checks are not configured.');
  }
  if (!email || typeof password !== 'string' || password.length < 1 || password.length > 200) {
    throw new HttpError(400, 'PASSWORD_REQUIRED', 'Enter your password to continue.');
  }
  const client = createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) {
    throw new HttpError(401, 'WRONG_PASSWORD', 'That password is not correct.');
  }
}

export async function saveBankDetails(
  config: Config,
  userId: string,
  details: { country: unknown; bankName: unknown; accountName: unknown; accountNumber: unknown },
) {
  if (!config.supabaseUrl || !config.supabaseServiceRoleKey) {
    throw new HttpError(503, 'SERVICE_KEY_NOT_CONFIGURED', 'Payout details are not configured on this server.');
  }
  const text = (value: unknown, min: number, max: number) => {
    const clean = typeof value === 'string' ? value.trim() : '';
    if (clean.length < min || clean.length > max) {
      throw new HttpError(400, 'INVALID_DETAILS', 'Please fill in every field correctly.');
    }
    return clean;
  };
  const row = {
    user_id: userId,
    country: text(details.country, 2, 60),
    bank_name: text(details.bankName, 2, 80),
    account_name: text(details.accountName, 2, 120),
    account_number: text(typeof details.accountNumber === 'string' ? details.accountNumber.replace(/\s+/g, '') : '', 4, 40),
    updated_at: new Date().toISOString(),
  };
  const admin = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await admin.from('creator_bank_details').upsert(row, { onConflict: 'user_id' });
  if (error) {
    throw new HttpError(502, 'SAVE_FAILED', 'Your payout details could not be saved. Try again.');
  }
  return { ok: true };
}
