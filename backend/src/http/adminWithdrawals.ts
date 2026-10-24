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
  const { data, error } = await admin
    .from('creator_withdrawals')
    .update({ status: 'paid', provider_reference: ref, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('status', 'pending')
    .select('id,user_id,amount_usd')
    .maybeSingle();
  if (error) {
    throw new HttpError(502, 'MARK_PAID_FAILED', 'The withdrawal could not be marked as paid.');
  }
  if (!data) {
    throw new HttpError(409, 'NOT_PENDING', 'This withdrawal is not pending. It may already be paid.');
  }
  const { error: auditError } = await admin.from('creator_monetisation_audit').insert({
    user_id: data.user_id,
    action: 'withdrawal_paid',
    reference_id: data.id,
    amount_usd: data.amount_usd,
    details: { adminUserId: actingUserId, reference: ref },
  });
  if (auditError) {
    throw new HttpError(503, 'AUDIT_FAILED', 'Marked as paid, but the audit record failed.');
  }
  return { ok: true };
}
