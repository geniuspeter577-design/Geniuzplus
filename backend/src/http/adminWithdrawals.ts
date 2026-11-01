import { createClient } from '@supabase/supabase-js';

import type { Config } from '../config/config';
import { HttpError } from './errors';

function adminClient(config: Config) {
  if (!config.supabaseUrl || !config.supabaseServiceRoleKey) {
    throw new HttpError(503, 'SERVICE_KEY_NOT_CONFIGURED', 'Withdrawals are not configured on this server.');
  }
  return createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function listPendingWithdrawals(config: Config) {
  const admin = adminClient(config);
  const { data: rows, error } = await admin
    .from('creator_withdrawals')
    .select('id,user_id,amount_usd,status,created_at')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(200);
  if (error) {
    throw new HttpError(502, 'WITHDRAWALS_FAILED', 'The withdrawals could not be loaded.');
  }
  const list = rows ?? [];
  const ids = [...new Set(list.map((row) => row.user_id as string))];
  const banks = new Map<string, Record<string, string>>();
  if (ids.length) {
    const { data: details } = await admin
      .from('creator_bank_details')
      .select('user_id,country,bank_name,account_name,account_number')
      .in('user_id', ids);
    for (const item of details ?? []) banks.set(item.user_id as string, item as Record<string, string>);
  }
  return {
    withdrawals: list.map((row) => ({
      id: row.id as string,
      userId: row.user_id as string,
      amountUsd: Number(row.amount_usd),
      createdAt: row.created_at as string,
      bank: banks.get(row.user_id as string) ?? null,
    })),
  };
}

export async function markWithdrawalPaid(config: Config, actingUserId: string, id: string, reference: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    throw new HttpError(400, 'INVALID_WITHDRAWAL', 'A valid withdrawal id is required.');
  }
  const ref = reference.trim();
  if (ref.length < 3 || ref.length > 100) {
    throw new HttpError(400, 'INVALID_REFERENCE', 'Enter the Flutterwave payment reference.');
  }
  const admin = adminClient(config);
  const { error } = await admin.rpc('mark_manual_withdrawal_paid', {
    p_withdrawal_id: id,
    p_admin_user_id: actingUserId,
    p_provider_reference: ref,
  });
  if (error) {
    if (String(error.message ?? '').includes('NOT_PENDING')) {
      throw new HttpError(409, 'NOT_PENDING', 'This withdrawal is not pending. It may already be paid.');
    }
    if (String(error.message ?? '').includes('PAYOUT_DETAILS_REQUIRED')) {
      throw new HttpError(409, 'PAYOUT_DETAILS_REQUIRED', 'The creator must add payout details before payment.');
    }
    throw new HttpError(502, 'MARK_PAID_FAILED', 'The withdrawal could not be marked as paid.');
  }
  return { ok: true };
}
