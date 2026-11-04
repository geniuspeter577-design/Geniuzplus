import { supabase } from './supabase';

export type MemberPlanId = 'monthly' | 'quarterly' | 'yearly';

export type MemberPlan = {
  id: MemberPlanId;
  name: 'Premium';
  label: 'Monthly' | 'Quarterly' | 'Yearly';
  currency: 'NGN';
  priceNgn: number;
  amountKobo: number;
  intervalMonths: 1 | 3 | 12;
};

export type MembershipStatus = {
  status: 'visitor' | 'active' | 'grace' | 'expired' | 'refunded';
  currentPeriodEnd?: string;
  graceUntil?: string;
  pendingPayment?: { reference: string; createdAt: string };
};

function getApiBaseUrl() {
  const value = process.env.EXPO_PUBLIC_GENIUZ_API_URL?.trim().replace(/\/+$/, '');
  if (!value) {
    throw new Error('Membership service is not configured.');
  }
  const url = new URL(value);
  if (
    (url.protocol !== 'https:' && url.protocol !== 'http:') ||
    url.username ||
    url.password
  ) {
    throw new Error('Membership service URL must use HTTP or HTTPS and cannot contain credentials.');
  }
  return value;
}

async function request<T>(path: string, options: { method?: 'GET' | 'POST'; authenticated?: boolean; body?: Record<string, unknown> } = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.method === 'POST') {
    headers['Content-Type'] = 'application/json';
  }
  if (options.authenticated) {
    if (!supabase) {
      throw new Error('Sign in to continue.');
    }
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session?.access_token) {
      throw new Error('Your sign-in session could not be verified. Sign in again.');
    }
    headers.Authorization = `Bearer ${data.session.access_token}`;
  }

  let response: Response;
  try {
    response = await fetch(`${getApiBaseUrl()}${path}`, {
      method: options.method ?? 'GET',
      headers,
      ...(options.method === 'POST' ? { body: JSON.stringify(options.body ?? {}) } : {}),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new Error('Could not reach the membership service. Check your connection and retry.');
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error('The membership service returned an invalid response.');
  }
  if (!response.ok) {
    const message = typeof payload === 'object' && payload !== null && 'error' in payload &&
      typeof payload.error === 'object' && payload.error !== null && 'message' in payload.error
      ? String(payload.error.message)
      : 'Membership request failed. Please retry.';
    throw new Error(message);
  }
  return payload as T;
}

function isMemberPlan(value: unknown): value is MemberPlan {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  if (!('id' in value) || !('label' in value) || !('name' in value) || !('currency' in value) ||
      !('priceNgn' in value) || !('amountKobo' in value) || !('intervalMonths' in value)) {
    return false;
  }
  const expected = {
    monthly: { label: 'Monthly', intervalMonths: 1 },
    quarterly: { label: 'Quarterly', intervalMonths: 3 },
    yearly: { label: 'Yearly', intervalMonths: 12 },
  } as const;
  let planDetails: (typeof expected)[keyof typeof expected];
  switch (value.id) {
    case 'monthly':
      planDetails = expected.monthly;
      break;
    case 'quarterly':
      planDetails = expected.quarterly;
      break;
    case 'yearly':
      planDetails = expected.yearly;
      break;
    default:
      return false;
  }
  return value.name === 'Premium' &&
    value.label === planDetails.label &&
    value.currency === 'NGN' &&
    typeof value.priceNgn === 'number' &&
    Number.isInteger(value.priceNgn) &&
    value.priceNgn > 0 &&
    typeof value.amountKobo === 'number' &&
    value.amountKobo === value.priceNgn * 100 &&
    value.intervalMonths === planDetails.intervalMonths;
}

export async function loadMemberPlans(): Promise<MemberPlan[]> {
  const response = await request<{ plans?: unknown[] }>('/api/membership/plan');
  const plans = (response.plans ?? []).filter(isMemberPlan);
  const planIds = plans.map((plan) => plan.id);
  const requiredPlanIds: MemberPlanId[] = ['monthly', 'quarterly', 'yearly'];
  if (
    plans.length !== requiredPlanIds.length ||
    !requiredPlanIds.every((id) => planIds.includes(id))
  ) {
    throw new Error('Membership plans are unavailable. Please retry later.');
  }
  return plans;
}

export async function loadMemberPlan(): Promise<MemberPlan> {
  const plans = await loadMemberPlans();
  const plan = plans.find(({ id }) => id === 'monthly');
  if (!plan) {
    throw new Error('Monthly membership pricing is unavailable. Please retry later.');
  }
  return plan;
}

export function loadMembershipStatus() {
  return request<MembershipStatus>('/api/membership/status', { authenticated: true });
}

export function createMemberCheckout(plan: string = 'member') {
  return request<{
    authorizationUrl: string;
    accessCode: string;
    reference: string;
    amountKobo: number;
    currency: 'NGN';
  }>('/api/membership/create-checkout', { method: 'POST', authenticated: true, body: { plan } });
}

export function createBoostCheckout(reelId: string, days: number) {
  return request<{
    authorizationUrl: string;
    accessCode: string;
    reference: string;
    amountKobo: number;
    currency: 'NGN';
  }>('/api/reels/boost-checkout', { method: 'POST', authenticated: true, body: { reelId, days } });
}
