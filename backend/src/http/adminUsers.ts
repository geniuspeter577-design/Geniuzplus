import { createClient } from '@supabase/supabase-js';

import type { Config } from '../config/config';
import { HttpError } from './errors';

type AdminUserSort = 'newest' | 'oldest';
type AdminUser = {
  id: string;
  email: string | null;
  displayName: string | null;
  publicId: string | null;
  joinedAt: string;
  lastSignInAt: string | null;
  membershipStatus: string;
  membershipEnds: string | null;
  hasBadge: boolean;
};
type AdminUsersResponse = {
  total: number;
  appStats: { signedInAccounts: number; signedInPhones: number; visitorPhones: number };
  page: number;
  pageSize: number;
  users: AdminUser[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function parseAdminUsersResponse(value: unknown): AdminUsersResponse {
  if (!isRecord(value) || !isRecord(value.appStats) || !Array.isArray(value.users)) {
    throw new HttpError(502, 'USER_LIST_FAILED', 'The user list returned an invalid response.');
  }
  const { appStats } = value;
  const counts = [value.total, value.page, value.pageSize, appStats.signedInAccounts, appStats.signedInPhones, appStats.visitorPhones];
  if (!counts.every((count) => typeof count === 'number' && Number.isSafeInteger(count) && count >= 0)) {
    throw new HttpError(502, 'USER_LIST_FAILED', 'The user list returned invalid counts.');
  }

  const users: AdminUser[] = [];
  for (const candidate of value.users) {
    if (
      !isRecord(candidate)
      || typeof candidate.id !== 'string'
      || !isNullableString(candidate.email)
      || !isNullableString(candidate.displayName)
      || !isNullableString(candidate.publicId)
      || typeof candidate.joinedAt !== 'string'
      || !isNullableString(candidate.lastSignInAt)
      || typeof candidate.membershipStatus !== 'string'
      || !isNullableString(candidate.membershipEnds)
      || typeof candidate.hasBadge !== 'boolean'
    ) {
      throw new HttpError(502, 'USER_LIST_FAILED', 'The user list contains an invalid user record.');
    }
    users.push(candidate as AdminUser);
  }

  return {
    total: value.total as number,
    appStats: {
      signedInAccounts: appStats.signedInAccounts as number,
      signedInPhones: appStats.signedInPhones as number,
      visitorPhones: appStats.visitorPhones as number,
    },
    page: value.page as number,
    pageSize: value.pageSize as number,
    users,
  };
}

export async function listAdminUsers(
  config: Config,
  search: string,
  membersOnly: boolean,
  page: number,
  sort: AdminUserSort = 'newest',
) {
  if (!config.supabaseUrl || !config.supabaseServiceRoleKey) {
    throw new HttpError(503, 'SERVICE_KEY_NOT_CONFIGURED', 'The user list is not configured on this server.');
  }
  if (!Number.isSafeInteger(page) || page < 1 || page > 10_000) {
    throw new HttpError(400, 'INVALID_PAGE', 'The user page must be between 1 and 10000.');
  }
  if (sort !== 'newest' && sort !== 'oldest') {
    throw new HttpError(400, 'INVALID_SORT', 'Choose newest or oldest users.');
  }

  const admin = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await admin.rpc('admin_list_users', {
    p_search: search.trim().slice(0, 100),
    p_members_only: membersOnly,
    p_page: page,
    p_page_size: 50,
    p_sort: sort,
  });
  if (error) {
    throw new HttpError(502, 'USER_LIST_FAILED', 'Could not load the user list.');
  }
  return parseAdminUsersResponse(data);
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
  const { data: membership } = await admin.from('memberships').select('status,grace_until,source').eq('user_id', targetId).maybeSingle();
  const now = new Date();
  const hasBadge = !!membership && (membership.status === 'active' || membership.status === 'grace')
    && Date.parse(membership.grace_until) > now.getTime();
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
    if (membership?.source !== 'admin' && !confirmPaid) {
      throw new HttpError(409, 'PAID_BADGE', 'This badge was paid for. Confirm to remove it.');
    }
    const { error } = await admin.from('memberships').update({
      status: 'expired', current_period_end: now.toISOString(), grace_until: now.toISOString(), updated_at: now.toISOString(),
    }).eq('user_id', targetId);
    if (error) throw new HttpError(502, 'REMOVE_FAILED', 'The badge could not be removed.');
  }
  const { error: auditError } = await admin.from('membership_audit_log').insert({
    admin_user_id: actingUserId, user_id: targetId, action: 'admin_badge_' + action, reference,
    details: { days: action === 'grant' ? days : null, previousSource: membership?.source ?? null },
  });
  if (auditError) throw new HttpError(503, 'AUDIT_FAILED', 'The change was applied but its audit record failed.');
  return { ok: true };
}
