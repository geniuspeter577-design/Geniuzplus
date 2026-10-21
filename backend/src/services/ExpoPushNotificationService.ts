import { createClient } from '@supabase/supabase-js';

import type { Config } from '../config/config';

type PushQueueRow = {
  id: number;
  user_id: string | null;
  expo_push_token: string | null;
  title: string;
  body: string;
  content_id: string | null;
  image_url: string | null;
  attempts: number;
};

type PushTokenRow = { expo_push_token: string };
type ExpoTicket = { status: 'ok' | 'error'; message?: string; details?: { error?: string } };

export class ExpoPushNotificationService {
  private readonly client;
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(config: Config) {
    if (!config.supabaseUrl || !config.supabaseServiceRoleKey) {
      throw new Error('Push dispatch requires Supabase URL and service role key.');
    }
    this.client = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }

  start() {
    void this.dispatchPending();
    this.timer = setInterval(() => void this.dispatchPending(), 15_000);
    this.timer.unref();
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  private async dispatchPending() {
    if (this.running) {
      return;
    }
    this.running = true;
    try {
      const staleClaim = new Date(Date.now() - 5 * 60_000).toISOString();
      const { data, error } = await this.client
        .from('notification_push_queue')
        .select('id,user_id,expo_push_token,title,body,content_id,image_url,attempts')
        .is('sent_at', null)
        .lt('attempts', 5)
        .or(`claimed_at.is.null,claimed_at.lt.${staleClaim}`)
        .order('created_at', { ascending: true })
        .limit(50);
      if (error) {
        throw error;
      }

      for (const row of (data ?? []) as PushQueueRow[]) {
        await this.dispatchOne(row);
      }
    } catch (error) {
      console.error('[Push] Could not process the notification queue.', error instanceof Error ? error.message : 'unknown');
    } finally {
      this.running = false;
    }
  }

  private async dispatchOne(row: PushQueueRow) {
    const claimedAt = new Date().toISOString();
    const { data: claim, error: claimError } = await this.client
      .from('notification_push_queue')
      .update({ claimed_at: claimedAt })
      .eq('id', row.id)
      .is('sent_at', null)
      .or(`claimed_at.is.null,claimed_at.lt.${new Date(Date.now() - 5 * 60_000).toISOString()}`)
      .select('id')
      .maybeSingle();
    if (claimError || !claim) {
      return;
    }

    try {
      let tokens: PushTokenRow[] = [];
      if (row.expo_push_token) {
        tokens = [{ expo_push_token: row.expo_push_token }];
      } else if (row.user_id) {
        const { data: tokenRows, error: tokenError } = await this.client
          .from('device_push_tokens')
          .select('expo_push_token')
          .eq('user_id', row.user_id);
        if (tokenError) {
          throw tokenError;
        }
        tokens = (tokenRows ?? []) as PushTokenRow[];
      }
      if (tokens.length === 0) {
        await this.client.from('notification_push_queue')
          .update({ sent_at: new Date().toISOString(), claimed_at: null })
          .eq('id', row.id);
        return;
      }

      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(tokens.map(({ expo_push_token }) => ({
          to: expo_push_token,
          sound: 'default', priority: 'high',
          title: row.title,
          body: row.body,
          ...(row.image_url ? { richContent: { image: row.image_url } } : {}),
          data: row.content_id ? { contentId: row.content_id } : {},
        }))),
        signal: AbortSignal.timeout(12_000),
      });
      const result = await response.json() as { data?: ExpoTicket[] };
      if (!response.ok || !Array.isArray(result.data) || result.data.length !== tokens.length) {
        throw new Error('Expo push returned an incomplete response.');
      }

      const invalidTokens = result.data.flatMap((ticket, index) =>
        ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered'
          ? [tokens[index].expo_push_token]
          : [],
      );
      if (invalidTokens.length) {
        await this.client.from('device_push_tokens').delete().in('expo_push_token', invalidTokens);
        await this.client.from('guest_push_tokens').delete().in('expo_push_token', invalidTokens);
      }
      const failed = result.data.filter((ticket) => ticket.status === 'error' && ticket.details?.error !== 'DeviceNotRegistered');
      await this.client.from('notification_push_queue').update({
        sent_at: failed.length ? null : new Date().toISOString(),
        claimed_at: null,
        attempts: row.attempts + 1,
        last_error: failed.length ? failed[0].message ?? 'Expo push was rejected.' : null,
      }).eq('id', row.id);
    } catch (error) {
      await this.client.from('notification_push_queue').update({
        claimed_at: null,
        attempts: row.attempts + 1,
        last_error: error instanceof Error ? error.message.slice(0, 500) : 'Push delivery failed.',
      }).eq('id', row.id);
    }
  }
}