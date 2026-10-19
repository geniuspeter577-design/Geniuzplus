import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { FootballMatch, FootballTeam } from '../models/football';
import { useFootballMatches } from '../state/FootballMatchesContext';
import { theme } from '../theme';
import { formatWestAfricaDate, formatWestAfricaKickoff, getWestAfricaDate } from '../utils/footballScores';
import type { GoalBallCounts } from '../utils/footballPin';
import { ContentNotice } from './ContentNotice';
import { FootballGoalBalls } from './FootballGoalBalls';
import { CelebrationLogo, LiveClock, goalMinuteLabel, type Celebration } from './FootballHomeCard';

function TeamMark({ team }: { team: FootballTeam }) {
  return team.logoUrl ? (
    <Image source={{ uri: team.logoUrl }} style={styles.teamLogo} resizeMode="contain" />
  ) : (
    <View style={styles.teamMarkFallback}>
      <Text style={styles.teamMarkInitial}>{team.name.slice(0, 1).toLocaleUpperCase()}</Text>
    </View>
  );
}

function getMatchStatus(match: FootballMatch) {
  if (match.status === 'live') {
    return match.minute === null ? 'LIVE' : `LIVE · ${match.minute}′`;
  }
  if (match.status === 'scheduled') {
    return formatWestAfricaKickoff(match.startsAt);
  }
  return match.status.charAt(0).toLocaleUpperCase() + match.status.slice(1);
}

function groupByCompetition(matches: FootballMatch[]) {
  const competitions = new Map<string, { name: string; logoUrl?: string; matches: FootballMatch[] }>();
  for (const match of matches) {
    const group = competitions.get(match.competition.id) ?? {
      name: match.competition.name,
      ...(match.competition.logoUrl ? { logoUrl: match.competition.logoUrl } : {}),
      matches: [],
    };
    group.matches.push(match);
    competitions.set(match.competition.id, group);
  }
  return [...competitions.values()];
}

function shiftDate(date: string, days: number) {
  const next = new Date(`${date}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

function dayLabel(date: string, today: string) {
  if (date === today) {
    return 'Today';
  }
  if (date === shiftDate(today, 1)) {
    return 'Tomorrow';
  }
  if (date === shiftDate(today, -1)) {
    return 'Yesterday';
  }
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' })
    .format(new Date(`${date}T00:00:00.000Z`));
}

function groupAll(matches: FootballMatch[]) {
  const sorted = matches.slice().sort((left, right) => {
    const rank = (match: FootballMatch) => (match.status === 'live' ? 0 : 1);
    return rank(left) - rank(right) || left.startsAt.localeCompare(right.startsAt);
  });
  return sorted.length ? [{ title: '', competitions: groupByCompetition(sorted) }] : [];
}

function groupByStatus(matches: FootballMatch[]) {
  const statuses = [
    { title: 'Live', matches: matches.filter((match) => match.status === 'live') },
    { title: 'Upcoming', matches: matches.filter((match) => match.status === 'scheduled') },
  ];
  return statuses
    .filter(({ matches: groupedMatches }) => groupedMatches.length > 0)
    .map(({ title, matches: groupedMatches }) => ({
      title,
      competitions: groupByCompetition(groupedMatches),
    }));
}

// Same goal celebration as the Home card, shown over a live match row.
function GoalOverlay({ match, goal }: { match: FootballMatch; goal?: GoalBallCounts & { createdAt?: number } }) {
  const [celebration, setCelebration] = useState<Celebration | null>(null);
  const handled = useRef<number | null>(null);
  const primed = useRef(false);
  const token = goal?.createdAt;
  const celebrationKey = celebration ? `${celebration.matchId}-${celebration.token}` : null;

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!primed.current) {
        primed.current = true;
        handled.current = typeof token === 'number' ? token : null;
        return;
      }
      if (!goal || typeof token !== 'number' || handled.current === token) {
        return;
      }
      handled.current = token;
      const homeGoals = goal.home ?? 0;
      const awayGoals = goal.away ?? 0;
      if (homeGoals <= 0 && awayGoals <= 0) {
        return;
      }
      const team = homeGoals >= awayGoals ? 'home' : 'away';
      setCelebration({
        matchId: match.id,
        team,
        count: team === 'home' ? homeGoals : awayGoals,
        token,
        minute: goalMinuteLabel(match, Date.now()),
        phase: 'goal',
      });
    }, 0);
    return () => clearTimeout(timer);
  }, [goal, match, token]);

  useEffect(() => {
    if (!celebrationKey) {
      return;
    }
    const toScorer = setTimeout(
      () => setCelebration((current) => (current ? { ...current, phase: 'scorer' } : current)),
      5000,
    );
    const done = setTimeout(() => setCelebration(null), 10000);
    return () => {
      clearTimeout(toScorer);
      clearTimeout(done);
    };
  }, [celebrationKey]);

  if (!celebration) {
    return null;
  }
  const scoringTeam = celebration.team === 'away' ? match.awayTeam : match.homeTeam;
  return (
    <View style={styles.celebration} pointerEvents="none">
      {celebration.phase === 'goal' ? (
        <View style={styles.celebrationRow}>
          <View style={styles.celebrationLogoWrap}>
            <CelebrationLogo logoUrl={scoringTeam.logoUrl} name={scoringTeam.name} />
            <FootballGoalBalls
              count={celebration.count}
              token={celebration.token}
              direction={celebration.team === 'away' ? 'down' : undefined}
            />
          </View>
          <Text style={styles.goalText}>GOAL!!!</Text>
        </View>
      ) : (
        <View style={styles.celebrationRow}>
          <Text style={styles.scorerTeam} numberOfLines={1}>{scoringTeam.name}</Text>
          <Text style={styles.scorerMinute}>{`Goal ${celebration.minute}`}</Text>
        </View>
      )}
    </View>
  );
}

export function FootballMatchesPanel({
  isOnline,
  onRetryConnection,
}: {
  isOnline: boolean;
  onRetryConnection: () => void;
}) {
  const football = useFootballMatches();
  const query: typeof football.upcoming = football.entries[football.selectedDate] ?? {
    matches: [],
    stale: false,
    isLoading: true,
  };
  const { selectDate, selectedDate } = football;
  useEffect(() => {
    selectDate(selectedDate);
  }, [selectDate, selectedDate]);
  const matchGroups = useMemo(() => {
    const groups: { title: string; competitions: ReturnType<typeof groupByCompetition> }[] = [];
    if (football.selectedDate !== football.today) {
      const liveNow = (football.entries[football.today]?.matches ?? []).filter((match) => match.status === 'live');
      if (liveNow.length) {
        groups.push({ title: 'Live', competitions: groupByCompetition(liveNow) });
      }
    }
    groups.push(...groupAll(query.matches));
    const shown = new Set(groups.flatMap((group) => group.competitions.flatMap((c) => c.matches.map((m) => m.id))));
    const upcoming = football.upcoming.matches
      .filter((match) => match.status === 'scheduled' && !shown.has(match.id))
      .sort((left, right) => left.startsAt.localeCompare(right.startsAt));
    if (upcoming.length) {
      groups.push({ title: 'Upcoming', competitions: groupByCompetition(upcoming) });
    }
    return groups;
  }, [query.matches, football.entries, football.selectedDate, football.today, football.upcoming.matches]);

  return (
    <View style={styles.section}>
      <View style={styles.dateBar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Previous day"
          onPress={() => football.selectDate(shiftDate(football.selectedDate, -1))}
          style={styles.dateArrow}
        >
          <Ionicons name="chevron-back" size={20} color={theme.text} />
        </Pressable>
        <Text style={styles.dateTitle}>{dayLabel(football.selectedDate, football.today)}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Next day"
          onPress={() => football.selectDate(shiftDate(football.selectedDate, 1))}
          style={styles.dateArrow}
        >
          <Ionicons name="chevron-forward" size={20} color={theme.text} />
        </Pressable>
      </View>
      <View style={styles.headingRow}>
        <View>
          <Text style={styles.heading}>Matches</Text>
        </View>
        {query.stale ? (
          <Ionicons accessibilityLabel="Showing cached scores" name="time-outline" size={18} color={theme.warning} />
        ) : null}
      </View>

      {!isOnline ? (
        <ContentNotice
          message="You’re offline. Football scores need an internet connection."
          actionLabel="Retry connection"
          onAction={onRetryConnection}
        />
      ) : null}
      {isOnline && query.isLoading ? <ContentNotice message="Loading football scores…" /> : null}
      {isOnline && query.error ? (
        <ContentNotice
          message="Football scores could not be loaded. Please retry."
          tone="error"
          actionLabel="Retry"
          onAction={() => football.retryDate()}
        />
      ) : null}
      {isOnline && query.stale ? (
        <Text style={styles.staleMessage}>Showing the last available scores.</Text>
      ) : null}
      {isOnline && !query.isLoading && !query.error && query.matches.length === 0 ? (
        <Text style={styles.emptyMessage}>No matches</Text>
      ) : null}

      {matchGroups.map((group) => (
        <View key={group.title} style={styles.matchGroup}>
          {group.title ? <Text style={styles.groupHeading}>{group.title}</Text> : null}
          {group.competitions.map((competition) => (
            <View key={`${group.title}:${competition.name}`} style={styles.competition}>
              <View style={styles.competitionHeading}>
                {competition.logoUrl ? (
                  <Image source={{ uri: competition.logoUrl }} style={styles.competitionLogo} resizeMode="contain" />
                ) : null}
                <Text style={styles.competitionName}>{competition.name}</Text>
              </View>
              {competition.matches.map((match) => (
                <View key={match.id} style={styles.matchRow}>
                  <View style={styles.timeCol}>
                    {match.status === 'live' ? (
                      <LiveClock key={`${match.id}-${match.minute ?? 'x'}`} match={match} />
                    ) : (
                      <Text style={styles.timeText}>
                        {match.status === 'scheduled'
                          ? getWestAfricaDate(new Date(match.startsAt)) === football.selectedDate
                            ? formatWestAfricaKickoff(match.startsAt)
                            : `${formatWestAfricaDate(match.startsAt)}\n${formatWestAfricaKickoff(match.startsAt)}`
                          : match.status === 'finished'
                            ? 'FT'
                            : getMatchStatus(match)}
                      </Text>
                    )}
                  </View>
                  <View style={styles.divider} />
                  <View style={styles.teamsCol}>
                    <Pressable onPress={() => router.push({ pathname: '/team', params: { name: match.homeTeam.name } } as any)} style={styles.teamLine}>
                      <TeamMark team={match.homeTeam} />
                      <Text style={styles.teamName} numberOfLines={1}>{match.homeTeam.name}</Text>
                      {match.status !== 'scheduled' ? <Text style={styles.score}>{match.homeScore ?? '–'}</Text> : null}
                    </Pressable>
                    <Pressable onPress={() => router.push({ pathname: '/team', params: { name: match.awayTeam.name } } as any)} style={styles.teamLine}>
                      <TeamMark team={match.awayTeam} />
                      <Text style={styles.teamName} numberOfLines={1}>{match.awayTeam.name}</Text>
                      {match.status !== 'scheduled' ? <Text style={styles.score}>{match.awayScore ?? '–'}</Text> : null}
                    </Pressable>
                  </View>
                  {match.status === 'live' ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Pin ${match.homeTeam.name} versus ${match.awayTeam.name} live score`}
                      onPress={() => football.pinMatch(match, football.selectedDate)}
                      style={styles.pinButton}
                    >
                      <Ionicons name="pin-outline" size={14} color={theme.accent} />
                    </Pressable>
                  ) : null}
                  {match.status === 'live' ? (
                    <GoalOverlay match={match} goal={football.goalSignals[match.id]} />
                  ) : null}
                </View>
              ))}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  dateBar: {
    alignItems: 'center',
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 6,
    paddingVertical: 6,
  },
  dateArrow: { alignItems: 'center', height: 40, justifyContent: 'center', width: 40 },
  dateTitle: { color: theme.text, fontSize: 15, fontWeight: '800' },
  timeCol: { alignItems: 'center', justifyContent: 'center', width: 56 },
  timeText: { color: theme.text, textAlign: 'center', fontSize: 13, fontWeight: '800', fontVariant: ['tabular-nums'] },
  divider: { alignSelf: 'stretch', backgroundColor: theme.border, marginHorizontal: 10, width: StyleSheet.hairlineWidth },
  teamsCol: { flex: 1, gap: 8, minWidth: 0 },
  teamLine: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  section: { gap: 12, marginBottom: 18 },
  headingRow: { alignItems: 'flex-start', flexDirection: 'row', justifyContent: 'space-between' },
  heading: { color: theme.text, fontSize: 19, fontWeight: '800' },
  daySelector: { gap: 8, paddingVertical: 2 },
  dayOption: {
    alignItems: 'center',
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 48,
    minWidth: 62,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  selectedDayOption: { backgroundColor: theme.accent, borderColor: theme.accent },
  dayLabel: { color: theme.secondaryText, fontSize: 11, fontWeight: '700' },
  dayDate: { color: theme.text, fontSize: 12, fontWeight: '700', marginTop: 2 },
  selectedDayText: { color: theme.background },
  staleMessage: { color: theme.warning, fontSize: 12 },
  emptyMessage: { color: theme.secondaryText, fontSize: 13, paddingVertical: 12 },
  matchGroup: { gap: 8 },
  groupHeading: { color: theme.text, fontSize: 15, fontWeight: '800', marginTop: 4 },
  competition: {
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  competitionHeading: {
    alignItems: 'center',
    borderBottomColor: theme.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 8,
    minHeight: 42,
    paddingHorizontal: 12,
  },
  competitionLogo: { height: 22, width: 22 },
  competitionName: { color: theme.text, flex: 1, fontSize: 13, fontWeight: '700' },
  matchRow: {
    alignItems: 'center',
    borderBottomColor: theme.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    minHeight: 70,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  team: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: 7, minWidth: 0 },
  awayTeam: { justifyContent: 'flex-end' },
  teamLogo: { height: 24, width: 24 },
  teamMarkFallback: {
    alignItems: 'center',
    backgroundColor: theme.surfaceAlt,
    borderRadius: 12,
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  teamMarkInitial: { color: theme.secondaryText, fontSize: 11, fontWeight: '700' },
  teamName: { color: theme.text, flex: 1, fontSize: 12, fontWeight: '600', minWidth: 0 },
  scoreBlock: { alignItems: 'center', minWidth: 64, paddingHorizontal: 4 },
  score: { color: theme.text, fontSize: 15, fontWeight: '800', fontVariant: ['tabular-nums'] },
  kickoff: { color: theme.text, fontSize: 14, fontWeight: '800', fontVariant: ['tabular-nums'], textAlign: 'center' },
  kickoffDate: { color: theme.secondaryText, fontSize: 11, fontWeight: '600' },
  scoreSeparator: { color: theme.secondaryText },
  matchStatus: { color: theme.secondaryText, fontSize: 10, marginTop: 2 },
  liveStatus: { color: theme.accent, fontWeight: '800' },
  pinButton: { alignItems: 'center', flexDirection: 'row', gap: 3, marginTop: 4, paddingVertical: 2 },
  pinText: { color: theme.accent, fontSize: 10, fontWeight: '800' },
  celebration: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    backgroundColor: theme.surface,
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  celebrationRow: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  celebrationLogoWrap: { alignItems: 'center', height: 50, justifyContent: 'center', width: 60 },
  goalText: { color: theme.accent, fontSize: 24, fontWeight: '900' },
  scorerTeam: { color: theme.text, flexShrink: 1, fontSize: 15, fontWeight: '800' },
  scorerMinute: { color: theme.accent, fontSize: 18, fontWeight: '900' },
});