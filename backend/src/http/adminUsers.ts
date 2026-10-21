import { createClient } from '@supabase/supabase-js';

import type { Config } from '../config/config';
import { HttpError } from './errors';

type MembershipRow = { user_id: string; status: string; current_period_end: string | null; grace_until: string | null };
type ProfileRow = { id: string; display_name: string | null; public_id: string | null };

export async function listAdminUsers(config: Config, search: string, membersOnly: boolean, page: number) {
  if (!config.supabaseUrl || !config.supabaseServiceRoleKey) {
    throw new HttpError(503, 'SERVICE_KEY_NOT_CONFIGURED', 'The user list is not configured on this server.');
  }
  const admin = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const authUsers: { id: string; email?: string; created_at: string; last_sign_in_at?: string }[] = [];
  for (let current = 1; current <= 5; current += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page: current, perPage: 200 });
    if (error) {
      throw new HttpError(502, 'USER_LIST_FAILED', 'Could not load users: ' + error.message);
    }
    authUsers.push(...data.users);
    if (data.users.length < 200) break;
  }

  const ids = authUsers.map((user) => user.id);
  const profiles = new Map<string, ProfileRow>();
  const memberships = new Map<string, MembershipRow>();
  for (let start = 0; start < ids.length; start += 50) {
    const chunk = ids.slice(start, start + 50);
    const [profileResult, membershipResult] = await Promise.all([
      admin.from('profiles').select('id,display_name,public_id').in('id', chunk),
      admin.from('memberships').select('user_id,status,current_period_end,grace_until').in('user_id', chunk),
    ]);
    if (profileResult.error) console.error('[adminUsers] profiles lookup failed:', profileResult.error.message);
    for (const row of (profileResult.data ?? []) as ProfileRow[]) profiles.set(row.id, row);
    for (const row of (membershipResult.data ?? []) as MembershipRow[]) memberships.set(row.user_id, row);
  }

  const now = Date.now();
  const needle = search.trim().toLowerCase();
  const all = authUsers
    .map((user) => {
      const profile = profiles.get(user.id);
      const membership = memberships.get(user.id);
      const status = membership?.status ?? 'none';
      const graceLeft = membership?.grace_until ? Date.parse(membership.grace_until) > now : false;
      return {
        id: user.id,
        email: user.email ?? null,
        displayName: profile?.display_name ?? null,
        publicId: profile?.public_id ?? null,
        joinedAt: user.created_at,
        lastSignInAt: user.last_sign_in_at ?? null,
        membershipStatus: status,
        membershipEnds: membership?.current_period_end ?? null,
        hasBadge: (status === 'active' || status === 'grace') && graceLeft,
      };
    })
    .filter((user) => (membersOnly ? user.hasBadge : true))
    .filter((user) =>
      !needle || [user.email, user.displayName, user.publicId].some((value) => value?.toLowerCase().includes(needle)),
    )
    .sort((a, b) => b.joinedAt.localeCompare(a.joinedAt));

  const pageSize = 50;
  const pageNumber = Math.max(page, 1);
  const start = (pageNumber - 1) * pageSize;
  const [deviceTokens, guestTokens] = await Promise.all([admin.from('device_push_tokens').select('expo_push_token'), admin.from('guest_push_tokens').select('expo_push_token')]); const signedInPhones = new Set((deviceTokens.data ?? []).map((row: { expo_push_token: string }) => row.expo_push_token)).size; const visitorPhones = new Set((guestTokens.data ?? []).map((row: { expo_push_token: string }) => row.expo_push_token)).size; return { total: all.length, appStats: { signedInAccounts: authUsers.length, signedInPhones, visitorPhones }, page: pageNumber, pageSize, users: all.slice(start, start + pageSize) };
}

export async function deleteAdminUser(config: Config, actingUserId: string, targetId: string, confirmPaid: boolean) {
  if (!config.supabaseUrl || !config.supabaseServiceRoleKey) {
    throw new HttpError(503, 'SERVICE_KEY_NOT_CONFIGURED', 'User deletion is not configured on this server.');
  }
  if (!/^[0-9a-f-]{36}$/i.test(targetId)) {
    throw new HttpError(400, 'INVALID_USER', 'A valid user id is required.');
  }
  if (targetId === actingUserId) {
    throw new HttpError(400, 'CANNOT_DELETE_SELF', 'You cannot delete your own account.');
  }
  const admin = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await admin.auth.admin.getUserById(targetId);
  if (error || !data.user) {
    throw new HttpError(404, 'USER_NOT_FOUND', 'That user was not found.');
  }
  if (data.user.app_metadata?.role === 'admin') {
    throw new HttpError(403, 'CANNOT_DELETE_ADMIN', 'Admin accounts cannot be deleted here.');
  }
  const { data: membership } = await admin.from('memberships').select('status').eq('user_id', targetId).maybeSingle();
  const paid = membership?.status === 'active' || membership?.status === 'grace';
  if (paid && !confirmPaid) {
    throw new HttpError(409, 'ACTIVE_MEMBERSHIP', 'This user has an active membership. Confirm to delete anyway.');
  }
  const { error: deleteError } = await admin.auth.admin.deleteUser(targetId);
  if (deleteError) {
    throw new HttpError(502, 'DELETE_FAILED', 'The user could not be deleted.');
  }
  return { deleted: true };
}

export async function changeAdminBadge(config: Config, actingUserId: string, targetId: string, action: string, days: number, confirmPaid: boolean) {
  if (!config.supabaseUrl || !config.supabaseServiceRoleKey) {
    throw new HttpError(503, 'SERVICE_KEY_NOT_CONFIGURED', 'Badge changes are not configured on this server.');
  }
  if (!/^[0-9a-f-]{36}$/i.test(targetId)) {
    throw new HttpError(400, 'INVALID_USER', 'A valid user id is required.');
  }
  if (action !== 'grant' && action !== 'remove') {
    throw new HttpError(400, 'INVALID_ACTION', 'Action must be grant or remove.');
  }
  const admin = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: m } = await admin.from('memberships').select('status,grace_until,source').eq('user_id', targetId).maybeSingle();
  const now = new Date();
  const hasBadge = !!m && (m.status === 'active' || m.status === 'grace') && Date.parse(m.grace_until) > now.getTime();
  const reference = 'admin-' + action + '-' + now.getTime();
  if (action === 'grant') {
    if (hasBadge) throw new HttpError(409, 'ALREADY_MEMBER', 'This user already has a badge.');
    if (![30, 90, 365].includes(days)) throw new HttpError(400, 'INVALID_DAYS', 'Days must be 30, 90 or 365.');
    const end = new Date(now.getTime() + days * 86400000).toISOString();
    const { error } = await admin.from('memberships').upsert({
      user_id: targetId, status: 'active', current_period_start: now.toISOString(),
      current_period_end: end, grace_until: end, source: 'admin', updated_at: now.toISOString(),
    });
    if (error) throw new HttpError(502, 'GRANT_FAILED', 'The badge could not be given.');
  } else {
    if (!hasBadge) throw new HttpError(409, 'NO_BADGE', 'This user has no badge to remove.');
    if (m?.source !== 'admin' && !confirmPaid) {
      throw new HttpError(409, 'PAID_BADGE', 'This badge was paid for. Confirm to remove it.');
    }
    const { error } = await admin.from('memberships').update({
      status: 'expired', current_period_end: now.toISOString(), grace_until: now.toISOString(), updated_at: now.toISOString(),
    }).eq('user_id', targetId);
    if (error) throw new HttpError(502, 'REMOVE_FAILED', 'The badge could not be removed.');
  }
  const { error: auditError } = await admin.from('membership_audit_log').insert({
    admin_user_id: actingUserId, user_id: targetId, action: 'admin_badge_' + action, reference,
    details: { days: action === 'grant' ? days : null, previousSource: m?.source ?? null },
  });
  if (auditError) throw new HttpError(503, 'AUDIT_FAILED', 'The change was applied but its audit record failed.');
  return { ok: true };
}
