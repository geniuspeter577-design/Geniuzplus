import { useEffect, useRef, useState } from 'react';

import type { FootballMatch } from '../models/football';
import type { GoalBallCounts } from '../utils/footballPin';

export type GoalSignal = GoalBallCounts & { createdAt?: number; event?: 'goal' | 'result' };

export type Celebration = {
  matchId: string;
  team: 'home' | 'away';
  count: number;
  token: number;
  minute: string;
  phase: 'goal' | 'scorer' | 'result';
};

function pad(value: number) {
  return value < 10 ? `0${value}` : String(value);
}

function estimateClock(startsAt: string, nowMs: number): string {
  const elapsed = Math.floor((nowMs - new Date(startsAt).getTime()) / 1000);
  if (!Number.isFinite(elapsed) || elapsed < 1) {
    return '00:00';
  }
  if (elapsed <= 45 * 60) {
    return `${pad(Math.floor(elapsed / 60))}:${pad(elapsed % 60)}`;
  }
  if (elapsed <= 60 * 60) {
    return 'HT';
  }
  const second = elapsed - 15 * 60;
  if (second > 90 * 60) {
    return '90+';
  }
  return `${pad(Math.floor(second / 60))}:${pad(second % 60)}`;
}

export function goalMinuteLabel(match: FootballMatch, nowMs: number): string {
  if (match.minute !== null) {
    return `${match.minute}′`;
  }
  const minutes = parseInt(estimateClock(match.startsAt, nowMs), 10);
  return Number.isFinite(minutes) ? `${minutes}′` : '';
}

export function useFootballGoalCelebration(
  matches: FootballMatch[],
  goalSignals: Record<string, GoalSignal>,
): Celebration | null {
  const [celebration, setCelebration] = useState<Celebration | null>(null);
  const handledTokens = useRef<Record<string, number>>({});
  const primedMatchIds = useRef(new Set<string>());

  useEffect(() => {
    const timer = setTimeout(() => {
      for (const match of matches) {
        const token = goalSignals[match.id]?.createdAt;
        if (!primedMatchIds.current.has(match.id)) {
          primedMatchIds.current.add(match.id);
          if (typeof token === 'number') {
            handledTokens.current[match.id] = token;
          }
          continue;
        }

        const signal = goalSignals[match.id];
        const isResult = signal?.event === 'result' && match.status === 'finished';
        const isGoal = signal?.event !== 'result' && match.status === 'live';
        if ((!isResult && !isGoal) || !signal || typeof token !== 'number' || handledTokens.current[match.id] === token) {
          continue;
        }

        handledTokens.current[match.id] = token;
        const homeGoals = signal.home ?? 0;
        const awayGoals = signal.away ?? 0;
        if (!isResult && homeGoals <= 0 && awayGoals <= 0) {
          continue;
        }

        const team = homeGoals >= awayGoals ? 'home' : 'away';
        setCelebration({
          matchId: match.id,
          team,
          count: team === 'home' ? homeGoals : awayGoals,
          token,
          minute: isResult ? 'FT' : goalMinuteLabel(match, Date.now()),
          phase: isResult ? 'result' : 'goal',
        });
        break;
      }
    }, 0);

    return () => clearTimeout(timer);
  }, [goalSignals, matches]);

  const celebrationKey = celebration ? `${celebration.matchId}-${celebration.token}` : null;
  useEffect(() => {
    if (!celebrationKey) {
      return;
    }
    const toScorer = setTimeout(
      () => setCelebration((current) => current?.phase === 'goal' ? { ...current, phase: 'scorer' } : current),
      5000,
    );
    const done = setTimeout(() => setCelebration(null), 10000);
    return () => {
      clearTimeout(toScorer);
      clearTimeout(done);
    };
  }, [celebrationKey]);

  return celebration;
}