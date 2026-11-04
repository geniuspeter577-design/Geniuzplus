import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { Config } from '../config/config';

export const BADGE_REMINDER_INTERVAL_MS = 24 * 60 * 60 * 1_000;

export type BadgeReminderServiceOptions = {
  adminClient?: SupabaseClient;
};

export class BadgeReminderService {
  private readonly client: SupabaseClient;
  private timer: NodeJS.Timeout | undefined;
  private running = false;

  constructor(config: Config, options: BadgeReminderServiceOptions = {}) {
    if (!config.supabaseUrl || !config.supabaseServiceRoleKey) {
      throw new Error('Membership reminders require Supabase URL and service-role credentials.');
    }
    this.client = options.adminClient ?? createClient(
      config.supabaseUrl,
      config.supabaseServiceRoleKey,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
  }

  start() {
    if (this.timer) {
      return;
    }
    this.runScheduled();
    this.timer = setInterval(() => this.runScheduled(), BADGE_REMINDER_INTERVAL_MS);
    this.timer.unref();
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  async runOnce(): Promise<number> {
    if (this.running) {
      return 0;
    }
    this.running = true;
    try {
      const { data, error } = await this.client.rpc('create_membership_badge_reminders');
      if (error) {
        throw error;
      }
      if (typeof data !== 'number') {
        throw new Error('Membership reminder RPC returned an invalid recipient count.');
      }
      return data;
    } finally {
      this.running = false;
    }
  }

  private runScheduled() {
    void this.runOnce().then((created) => {
      if (created > 0) {
        console.info(`[Membership reminders] Created ${created} reminder notifications.`);
      }
    }).catch((error: unknown) => {
      console.error('[Membership reminders] Scheduled run failed.', {
        code: error instanceof Error ? error.name : 'UNKNOWN',
      });
    });
  }
}
