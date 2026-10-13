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
      throw new HttpError(502, 'USER_LIST_FAILED', 'Could not load users.');
    }
    authUsers.push(...data.users);
    if (data.users.length < 200) break;
  }

  const ids = authUsers.map((user) => user.id);
  const profiles = new Map<string, ProfileRow>();
  const memberships = new Map<string, MembershipRow>();
  for (let start = 0; start < ids.length; start += 200) {
    const chunk = ids.slice(start, start + 200);
    const [profileResult, membershipResult] = await Promise.all([
      admin.from('profiles').select('id,display_name,public_id').in('id', chunk),
      admin.from('memberships').select('user_id,status,current_period_end,grace_until').in('user_id', chunk),
    ]);
    if (profileResult.error) throw new HttpError(502, 'PROFILE_LOOKUP_FAILED', 'Could not load user names.');
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
        hasBadge: status === 'active' || (status === 'grace' && graceLeft),
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
  return { total: all.length, page: pageNumber, pageSize, users: all.slice(start, start + pageSize) };
}
