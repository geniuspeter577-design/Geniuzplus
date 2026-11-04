import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { Config } from '../config/config';
import { FootballDataProvider } from '../providers/FootballDataProvider';
import type { SportsProvider } from '../providers/SportsProvider';

export const FOOTBALL_SCORE_POLL_INTERVAL_MS = 5 * 60 * 1_000;

const DAY_MS = 24 * 60 * 60 * 1_000;

export class FootballScoreNotificationService {
  private readonly client: SupabaseClient;
  private timer: NodeJS.Timeout | undefined;
  private pollInProgress = false;

  constructor(
    config: Config,
    private readonly provider: SportsProvider = new FootballDataProvider(config.footballDataApiKey),
    private readonly now: () => number = Date.now,
  ) {
    if (!config.supabaseUrl || !config.supabaseServiceRoleKey) {
      throw new Error('Football notifications require Supabase URL and service-role credentials.');
    }
    this.client = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }

  start() {
    if (this.timer) {
      return;
    }
    void this.runOnce();
    this.timer = setInterval(() => {
      void this.runOnce();
    }, FOOTBALL_SCORE_POLL_INTERVAL_MS);
    this.timer.unref();
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  async runOnce() {
    if (this.pollInProgress) {
      return;
    }
    this.pollInProgress = true;
    try {
      if (!this.provider.getMatchesRange) {
        throw new Error('The configured football provider does not support match-range requests.');
      }
      const currentTime = this.now();
      const dateFrom = new Date(currentTime - DAY_MS).toISOString().slice(0, 10);
      const dateTo = new Date(currentTime + DAY_MS).toISOString().slice(0, 10);
      const matches = await this.provider.getMatchesRange(dateFrom, dateTo);
      const { error } = await this.client.rpc('process_football_score_notifications', {
        p_matches: matches,
      });
      if (error) {
        throw error;
      }
    } catch (error) {
      console.error('[Football notifications] Poll failed.', error);
    } finally {
      this.pollInProgress = false;
    }
  }
}
