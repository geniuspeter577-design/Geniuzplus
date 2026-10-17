import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

import type { Config } from '../config/config';
import { HttpError } from '../http/errors';
import { PaystackService, PaystackServiceError } from './PaystackService';
import { FlutterwaveGateway } from './PaymentGateway';
import type { PaymentGateway } from './PaymentGateway';
import { FlutterwaveService } from './FlutterwaveService';

const BOOST_PRICES_NGN: Record<number, number> = { 1: 500, 3: 1000, 7: 2000 };

type MembershipStatusResponse = {
  status: 'visitor' | 'active' | 'grace' | 'expired' | 'refunded';
  currentPeriodEnd?: string;
  graceUntil?: string;
  pendingPayment?: { reference: string; createdAt: string };
};

export type PaystackEvent = {
  id: string;
  event: string;
  data: { reference: string };
};

export interface MembershipOperations {
  getPlan(): ReturnType<MembershipService['getPlan']>;
  getPlans(): ReturnType<MembershipService['getPlans']>;
  getStatus(client: SupabaseClient, userId: string): Promise<MembershipStatusResponse>;
  createCheckout(userId: string, email: string, planId?: string): Promise<{
    authorizationUrl: string;
    accessCode: string;
    reference: string;
    amountKobo: number;
    currency: string;
  }>;
  createBoostCheckout(userId: string, email: string, reelId: string, days: number): Promise<{
    authorizationUrl: string;
    accessCode: string;
    reference: string;
    amountKobo: number;
    currency: string;
  }>;
  processWebhook(event: PaystackEvent, payload: Record<string, unknown>, provider?: 'paystack' | 'flutterwave'): Promise<{ status: string }>;
  refund(adminUserId: string, reference: string, reason: string): Promise<{ status: string; reference: string }>;
  runDailyMaintenance(): Promise<{ checked: number; remindersCreated: number }>;
}

export type MembershipServiceOptions = {
  adminClient?: SupabaseClient;
  paystack?: PaymentGateway;
  now?: () => Date;
};

export function getMembershipAccessStatus(
  membership: { status: string; current_period_end: string; grace_until: string } | null,
  now = new Date(),
): MembershipStatusResponse['status'] {
  if (!membership) {
    return 'visitor';
  }
  if (membership.status === 'refunded') {
    return 'refunded';
  }
  if (new Date(membership.current_period_end).getTime() > now.getTime()) {
    return 'active';
  }
  if (new Date(membership.grace_until).getTime() > now.getTime()) {
    return 'grace';
  }
  return 'expired';
}

const PREMIUM_PLANS: Record<string, { label: string; priceNgn: number; intervalMonths: number }> = {
  monthly: { label: 'Monthly', priceNgn: 919, intervalMonths: 1 },
  quarterly: { label: 'Quarterly', priceNgn: 2298, intervalMonths: 3 },
  yearly: { label: 'Yearly', priceNgn: 6616, intervalMonths: 12 },
};

export class MembershipService implements MembershipOperations {
  private readonly paystack: PaymentGateway;
  private readonly now: () => Date;

  constructor(private readonly config: Config, private readonly options: MembershipServiceOptions = {}) {
    this.paystack = options.paystack ?? (config.paymentProvider === 'flutterwave'
      ? new FlutterwaveGateway(new FlutterwaveService(config.flutterwaveSecretKey, config.flutterwaveRedirectUrl))
      : new PaystackService(config.paystackSecretKey));
    this.now = options.now ?? (() => new Date());
  }

  getPlan() {
    return {
      id: 'member',
      name: 'Member',
      currency: 'NGN',
      priceNgn: PREMIUM_PLANS.monthly.priceNgn,
      amountKobo: PREMIUM_PLANS.monthly.priceNgn * 100,
      intervalMonths: 1,
    };
  }

  getPlans() {
    return Object.entries(PREMIUM_PLANS).map(([id, plan]) => ({
      id,
      name: 'Premium',
      label: plan.label,
      currency: 'NGN',
      priceNgn: plan.priceNgn,
      amountKobo: plan.priceNgn * 100,
      intervalMonths: plan.intervalMonths,
    }));
  }

  async getStatus(client: SupabaseClient, userId: string): Promise<MembershipStatusResponse> {
    const [membershipResult, paymentResult] = await Promise.all([
      client
        .from('memberships')
        .select('status,current_period_end,grace_until')
        .eq('user_id', userId)
        .maybeSingle(),
      client
        .from('payments')
        .select('reference,created_at')
        .eq('user_id', userId)
        .eq('status', 'pending')
        .eq('purpose', 'membership')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    if (membershipResult.error || paymentResult.error) {
      throw new HttpError(502, 'MEMBERSHIP_STATUS_UNAVAILABLE', 'Could not load membership status.');
    }

    const membership = membershipResult.data;
    const status = getMembershipAccessStatus(membership, this.now());

    return {
      status,
      ...(membership?.current_period_end ? { currentPeriodEnd: membership.current_period_end } : {}),
      ...(membership?.grace_until ? { graceUntil: membership.grace_until } : {}),
      ...(paymentResult.data ? {
        pendingPayment: {
          reference: paymentResult.data.reference,
          createdAt: paymentResult.data.created_at,
        },
      } : {}),
    };
  }

  async createCheckout(userId: string, email: string, planId: string = 'monthly') {
    const admin = this.getAdminClient();
    this.requireTestPaystack();
    if (!Object.prototype.hasOwnProperty.call(PREMIUM_PLANS, planId)) {
      throw new HttpError(400, 'INVALID_PLAN', 'Choose a valid Premium plan.');
    }
    const plan = PREMIUM_PLANS[planId];
    const amountKobo = plan.priceNgn * 100;
    const intervalMonths = plan.intervalMonths;
    const { data: existingPayment, error: lookupError } = await admin
      .from('payments')
      .select('reference,amount_kobo')
      .eq('user_id', userId)
      .eq('status', 'pending')
      .eq('purpose', 'membership')
      .eq('amount_kobo', amountKobo)
      .eq('interval_months', intervalMonths)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lookupError) {
      throw new HttpError(503, 'PAYMENT_RECORD_UNAVAILABLE', 'Could not check your pending payment. Please retry.');
    }

    let reference: string;
    if (existingPayment) {
      if (existingPayment.amount_kobo !== amountKobo) {
        throw new HttpError(409, 'PENDING_PAYMENT_AMOUNT_MISMATCH', 'Your pending payment needs support before you can retry.');
      }
      reference = existingPayment.reference;
    } else {
      reference = `geniuz_${this.now().getTime()}_${randomUUID()}`;
      const { error: insertError } = await admin.from('payments').insert({
        reference,
        user_id: userId,
        amount_kobo: amountKobo,
        interval_months: intervalMonths,
        status: 'pending',
      });
      if (insertError) {
        throw new HttpError(503, 'PAYMENT_RECORD_UNAVAILABLE', 'Could not start checkout. Please retry.');
      }
    }

    try {
      const checkout = await this.paystack.initializeTransaction({ email, amountKobo, reference });
      return { ...checkout, amountKobo, currency: 'NGN' };
    } catch (error) {
      await admin.from('payments').update({ status: 'failed', updated_at: this.now().toISOString() }).eq('reference', reference);
      throw this.mapPaystackError(error);
    }
  }

  async createBoostCheckout(userId: string, email: string, reelId: string, days: number) {
    const admin = this.getAdminClient();
    if (this.config.paymentProvider !== 'flutterwave') {
      throw new HttpError(503, 'BOOST_PROVIDER_NOT_READY', 'Boost payments are not available yet.');
    }
    this.requireTestPaystack();
    const priceNgn = BOOST_PRICES_NGN[days];
    if (!priceNgn) {
      throw new HttpError(400, 'INVALID_BOOST_PLAN', 'Choose a valid Boost plan.');
    }
    const amountKobo = priceNgn * 100;

    const { data: reel, error: reelError } = await admin
      .from('reels')
      .select('id,user_id,visibility,publish_at')
      .eq('id', reelId)
      .maybeSingle();
    if (reelError) {
      throw new HttpError(503, 'REEL_LOOKUP_UNAVAILABLE', 'Could not check this reel. Please retry.');
    }
    if (!reel || reel.user_id !== userId) {
      throw new HttpError(404, 'REEL_NOT_FOUND', 'You can only boost your own reels.');
    }
    if (reel.visibility !== 'public') {
      throw new HttpError(400, 'BOOST_NEEDS_PUBLIC_REEL', 'Only public reels can be boosted.');
    }
    if (reel.publish_at && new Date(reel.publish_at).getTime() > this.now().getTime()) {
      throw new HttpError(400, 'BOOST_REEL_NOT_LIVE', 'Boost this reel after it goes live.');
    }

    const reference = `geniuz_boost_${this.now().getTime()}_${randomUUID()}`;
    const { error: insertError } = await admin.from('payments').insert({
      reference,
      user_id: userId,
      amount_kobo: amountKobo,
      status: 'pending',
      purpose: 'boost',
      boost_days: days,
      reel_id: reelId,
    });
    if (insertError) {
      throw new HttpError(503, 'PAYMENT_RECORD_UNAVAILABLE', 'Could not start checkout. Please retry.');
    }

    try {
      const checkout = await this.paystack.initializeTransaction({ email, amountKobo, reference });
      return { ...checkout, amountKobo, currency: 'NGN' };
    } catch (error) {
      await admin.from('payments').update({ status: 'failed', updated_at: this.now().toISOString() }).eq('reference', reference);
      throw this.mapPaystackError(error);
    }
  }

  async processWebhook(event: PaystackEvent, payload: Record<string, unknown>, provider: 'paystack' | 'flutterwave' = 'paystack') {
    const admin = this.getAdminClient();
    if (provider !== this.config.paymentProvider) {
      throw new HttpError(400, 'PAYMENT_PROVIDER_MISMATCH', 'Webhook provider does not match the configured payment provider.');
    }
    this.requireTestPaystack();
    const { data: priorEvent, error: priorError } = await admin
      .from('webhook_events')
      .select('event_id')
      .eq('event_id', provider === 'flutterwave' ? `flutterwave:${event.id}` : event.id)
      .maybeSingle();
    if (priorError) {
      throw new HttpError(503, 'WEBHOOK_STORE_UNAVAILABLE', 'Could not process the payment event.');
    }
    if (priorEvent) {
      return { status: 'duplicate' };
    }

    let verifiedStatus = 'ignored';
    let amountKobo = 0;
    let currency = 'NGN';
    let channel: string | null = null;
    if (event.event === 'charge.success') {
      const verified = await this.paystack.verifyTransaction(event.data.reference).catch((error: unknown) => {
        throw this.mapPaystackError(error);
      });
      verifiedStatus = verified.status;
      amountKobo = verified.amount;
      currency = verified.currency;
      channel = verified.channel ?? null;
    }

    const { data, error } = await admin.rpc(provider === 'flutterwave' ? 'apply_flutterwave_event' : 'apply_paystack_event', {
      p_event_id: provider === 'flutterwave' ? `flutterwave:${event.id}` : event.id,
      p_event_type: event.event,
      p_reference: event.data.reference,
      p_verified_status: verifiedStatus,
      p_verified_amount_kobo: amountKobo,
      p_verified_currency: currency,
      p_channel: channel,
      p_payload: payload,
      p_grace_days: this.config.membershipGraceDays,
    });
    if (error) {
      throw new HttpError(503, 'PAYMENT_EVENT_UNAVAILABLE', 'Could not apply the verified payment event.');
    }
    return { status: String(data) };
  }

  async refund(adminUserId: string, reference: string, reason: string) {
    const admin = this.getAdminClient();
    this.requireTestPaystack();
    const { data: payment, error } = await admin
      .from('payments')
      .select('status')
      .eq('reference', reference)
      .maybeSingle();
    if (error) {
      throw new HttpError(503, 'REFUND_LOOKUP_FAILED', 'Could not load this payment.');
    }
    if (!payment || payment.status !== 'success') {
      throw new HttpError(409, 'PAYMENT_NOT_REFUNDABLE', 'Only a successful payment can be refunded.');
    }
    let providerReference: string;
    try {
      const result = await this.paystack.refundTransaction(reference);
      providerReference = this.getProviderReference(result, reference);
    } catch (error) {
      throw this.mapPaystackError(error);
    }
    const { data: result, error: refundError } = await admin.rpc('record_membership_refund', {
      p_reference: reference,
      p_admin_user_id: adminUserId,
      p_provider_reference: providerReference,
      p_reason: reason,
    });
    if (refundError || result !== 'refunded') {
      throw new HttpError(503, 'REFUND_AUDIT_FAILED', 'Paystack accepted the refund but its audit record could not be confirmed.');
    }
    return { status: 'refunded', reference };
  }

  async runDailyMaintenance() {
    const admin = this.getAdminClient();
    this.requireTestPaystack();
    const { data: pending, error } = await admin
      .from('payments')
      .select('reference')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(100);
    if (error) {
      throw new HttpError(503, 'PAYMENT_RECONCILIATION_UNAVAILABLE', 'Could not load pending payments.');
    }
    let checked = 0;
    for (const payment of pending ?? []) {
      try {
        const verified = await this.paystack.verifyTransaction(payment.reference);
        const eventId = `reconcile:${payment.reference}:${this.now().getTime()}:${randomUUID()}`;
        const { error: applyError } = await admin.rpc(this.config.paymentProvider === 'flutterwave' ? 'apply_flutterwave_event' : 'apply_paystack_event', {
          p_event_id: eventId,
          p_event_type: 'reconciliation',
          p_reference: payment.reference,
          p_verified_status: verified.status,
          p_verified_amount_kobo: verified.amount,
          p_verified_currency: verified.currency,
          p_channel: verified.channel ?? null,
          p_payload: { source: 'daily_reconciliation', reference: payment.reference },
          p_grace_days: this.config.membershipGraceDays,
        });
        if (applyError) {
          throw applyError;
        }
        checked += 1;
      } catch (error) {
        console.error('[Membership] A pending payment could not be reconciled.', {
          reference: payment.reference,
          code: error instanceof PaystackServiceError ? error.code : 'RECONCILIATION_FAILED',
        });
      }
    }
    const { data: reminders, error: reminderError } = await admin.rpc('create_membership_renewal_reminders', {
      p_days_before: 3,
    });
    if (reminderError) {
      throw new HttpError(503, 'MEMBERSHIP_REMINDERS_UNAVAILABLE', 'Could not create renewal reminders.');
    }
    return { checked, remindersCreated: Number(reminders ?? 0) };
  }

  private getAdminClient() {
    if (this.options.adminClient) {
      return this.options.adminClient;
    }
    if (!this.config.supabaseUrl || !this.config.supabaseServiceRoleKey) {
      throw new HttpError(503, 'MEMBERSHIP_BACKEND_NOT_CONFIGURED', 'Membership payments are not configured.');
    }
    return createClient(
      this.config.supabaseUrl,
      this.config.supabaseServiceRoleKey,
      { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } },
    );
  }

  private requireTestPaystack() {
    if (!this.paystack.isTestModeConfigured) {
      if (this.config.paymentProvider === 'flutterwave') {
        throw new HttpError(503, 'FLUTTERWAVE_TEST_NOT_CONFIGURED', 'Flutterwave TEST mode is not configured.');
      }
      throw new HttpError(503, 'PAYSTACK_TEST_NOT_CONFIGURED', 'Paystack TEST mode is not configured.');
    }
  }

  private mapPaystackError(error: unknown) {
    const flutterwave = this.config.paymentProvider === 'flutterwave';
    if (error instanceof PaystackServiceError && error.code === 'NOT_CONFIGURED') {
      return new HttpError(
        503,
        flutterwave ? 'FLUTTERWAVE_TEST_NOT_CONFIGURED' : 'PAYSTACK_TEST_NOT_CONFIGURED',
        flutterwave ? 'Flutterwave TEST mode is not configured.' : 'Paystack TEST mode is not configured.',
      );
    }
    return new HttpError(
      502,
      flutterwave ? 'FLUTTERWAVE_UNAVAILABLE' : 'PAYSTACK_UNAVAILABLE',
      flutterwave ? 'Flutterwave could not complete this request.' : 'Paystack could not complete this request.',
    );
  }

  private getProviderReference(value: unknown, fallback: string) {
    if (typeof value === 'object' && value !== null && 'reference' in value && typeof value.reference === 'string') {
      return value.reference;
    }
    if (typeof value === 'object' && value !== null && 'id' in value) {
      return String(value.id);
    }
    return fallback;
  }
}
