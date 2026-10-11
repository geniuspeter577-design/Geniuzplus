import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getUserAppSettings, setUserAppSettings } from '../services/TrailerAutoplayPreference';
import { useAuth } from '../state/AuthContext';
import { useFootballMatches } from '../state/FootballMatchesContext';
import { theme } from '../theme';
import { getFootballPinPosition, snapFootballPinCorner, type FootballPinCorner, type PinPoint } from '../utils/footballPin';
import { FootballGoalBalls } from './FootballGoalBalls';
import { CelebrationLogo, LiveClock, TeamBadge } from './FootballHomeCard';
import { useFootballGoalCelebration } from '../hooks/useFootballGoalCelebration';

const PIN_SIZE = { width: 170, height: 74 };
const DEFAULT_CORNER: FootballPinCorner = 'top-right';

export function FootballScorePin() {
  const auth = useAuth();
  const football = useFootballMatches();
  const insets = useSafeAreaInsets();
  const viewport = useWindowDimensions();
  const [layoutReady, setLayoutReady] = useState(false);
  const [pinTransform, setPinTransform] = useState({ x: 0, y: 0 });
  const position = useRef(new Animated.ValueXY({ x: 0, y: 0 }));
  const dragStart = useRef<PinPoint>({ x: 0, y: 0 });
  const positionRef = useRef<PinPoint>({ x: 0, y: 0 });
  const dimensionsRef = useRef({ viewport, insets });
  const userIdRef = useRef(auth.session?.user.id);
  useEffect(() => {
    const currentPosition = position.current;
    const listener = currentPosition.addListener(({ x, y }) => {
      setPinTransform({ x, y });
    });
    return () => currentPosition.removeListener(listener);
  }, []);
  useEffect(() => {
    dimensionsRef.current = { viewport, insets };
    userIdRef.current = auth.session?.user.id;
  }, [auth.session?.user.id, insets, viewport]);

  useEffect(() => {
    let active = true;
    const restore = async () => {
      let savedCorner = DEFAULT_CORNER;
      if (auth.session?.user.id) {
        try {
          savedCorner = (await getUserAppSettings(auth.session.user.id)).footballPinCorner ?? DEFAULT_CORNER;
        } catch (error) {
          console.warn('[FootballPin] Could not load the saved position.', error);
        }
      }
      if (!active) {
        return;
      }
      const target = getFootballPinPosition(savedCorner, viewport, PIN_SIZE, insets);
      positionRef.current = target;
      position.current.setValue(target);
      setPinTransform({ x: target.x, y: target.y });
      setLayoutReady(true);
    };
    void restore();
    return () => { active = false; };
  }, [auth.session?.user.id, insets, viewport]);

  /* eslint-disable react-hooks/refs */
  const panResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_event, gesture) => Math.abs(gesture.dx) > 3 || Math.abs(gesture.dy) > 3,
    onPanResponderGrant: () => {
      dragStart.current = positionRef.current;
    },
    onPanResponderMove: (_event, gesture) => {
      const next = { x: dragStart.current.x + gesture.dx, y: dragStart.current.y + gesture.dy };
      positionRef.current = next;
      position.current.setValue(next);
    },
    onPanResponderRelease: (_event, gesture) => {
      const current = { x: dragStart.current.x + gesture.dx, y: dragStart.current.y + gesture.dy };
      const dimensions = dimensionsRef.current;
      const target = snapFootballPinCorner(current, dimensions.viewport, PIN_SIZE, dimensions.insets);
      positionRef.current = { x: target.x, y: target.y };
      Animated.spring(position.current, { toValue: { x: target.x, y: target.y }, useNativeDriver: false, damping: 24, stiffness: 240 }).start();
      setPinTransform({ x: target.x, y: target.y });
      const currentUserId = userIdRef.current;
      if (currentUserId) {
        void getUserAppSettings(currentUserId)
          .then((settings) => setUserAppSettings(currentUserId, { ...settings, footballPinCorner: target.corner }))
          .catch((error: unknown) => console.warn('[FootballPin] Could not save the position.', error));
      }
    },
  }), []);
  /* eslint-enable react-hooks/refs */

  const match = football.pinnedMatch;
  const goal = match ? football.goalSignals[match.id] : undefined;
  const matches = useMemo(() => (match ? [match] : []), [match]);
  const goalSignals = useMemo(() => (match && goal ? { [match.id]: goal } : {}), [goal, match]);
  const celebration = useFootballGoalCelebration(matches, goalSignals);
  if (!football.pinned || !match || !layoutReady) {
    return null;
  }

  const openFootball = () => {
    football.selectDate(football.pinned!.date);
    router.navigate({ pathname: '/(tabs)', params: { category: 'Football' } });
  };

  const celebrating = celebration && celebration.matchId === match.id ? celebration : null;
  const scoringTeam = celebrating && celebrating.team === 'away' ? match.awayTeam : match.homeTeam;

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <Animated.View
        {...panResponder.panHandlers}
        pointerEvents="auto"
        style={[styles.pin, { width: PIN_SIZE.width, height: PIN_SIZE.height, transform: [{ translateX: pinTransform.x }, { translateY: pinTransform.y }] }]}
      >
        <View style={styles.topLine}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close pinned score" hitSlop={7} onPress={football.unpinMatch} style={styles.close}>
            <Ionicons name="close" size={11} color={theme.text} />
          </Pressable>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={`Open ${match.competition.name} in Football`} onPress={openFootball} style={styles.matchRow}>
          <View style={styles.team}>
            <View style={styles.badgeWrap}>
              <TeamBadge compact logoUrl={match.homeTeam.logoUrl} name={match.homeTeam.name} />
              <FootballGoalBalls count={goal?.home ?? 0} token={goal?.createdAt} />
            </View>
            <Text numberOfLines={1} style={styles.teamName}>{match.homeTeam.name}</Text>
          </View>
          <View style={styles.scoreColumn}>
            <Text style={styles.score}>{match.homeScore ?? '–'}–{match.awayScore ?? '–'}</Text>
            {match.status === 'live' ? (
              <LiveClock key={`${match.id}-${match.minute ?? 'x'}`} match={match} compact />
            ) : (
              <Text style={styles.minute}>{match.status === 'finished' ? 'FT' : match.status.toLocaleUpperCase()}</Text>
            )}
          </View>
          <View style={styles.team}>
            <View style={styles.badgeWrap}>
              <TeamBadge compact logoUrl={match.awayTeam.logoUrl} name={match.awayTeam.name} />
              <FootballGoalBalls count={goal?.away ?? 0} token={goal?.createdAt} direction="down" />
            </View>
            <Text numberOfLines={1} style={styles.teamName}>{match.awayTeam.name}</Text>
          </View>
        </Pressable>
        {celebrating ? (
          <View style={styles.celebration} pointerEvents="none">
            {celebrating.phase === 'goal' ? (
              <View style={styles.celebrationRow}>
                <View style={styles.celebrationLogoWrap}>
                  <CelebrationLogo logoUrl={scoringTeam.logoUrl} name={scoringTeam.name} size={24} />
                  <FootballGoalBalls
                    count={celebrating.count}
                    token={celebrating.token}
                    direction={celebrating.team === 'away' ? 'down' : undefined}
                  />
                </View>
                <Text style={styles.goalText}>GOAL!!!</Text>
              </View>
            ) : celebrating.phase === 'result' ? (
              <Text style={styles.goalText}>FULL TIME</Text>
            ) : (
              <>
                <Text style={styles.scorerTeam} numberOfLines={2}>{scoringTeam.name}</Text>
                <Text style={styles.scorerMinute}>{`Goal ${celebrating.minute}`}</Text>
              </>
            )}
          </View>
        ) : null}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  pin: {
    backgroundColor: theme.surface,
    borderColor: theme.accent,
    borderRadius: 8,
    borderWidth: 1,
    elevation: 20,
    left: 0,
    paddingHorizontal: 6,
    paddingTop: 4,
    position: 'absolute',
    shadowColor: theme.shadow,
    shadowOpacity: 0.36,
    shadowRadius: 12,
    zIndex: 9999,
  },
  topLine: { alignItems: 'center', flexDirection: 'row', gap: 3, height: 16, justifyContent: 'flex-end' },
  scoreColumn: { alignItems: 'center', justifyContent: 'center' },
  competition: { color: theme.text, flex: 1, fontSize: 7, fontWeight: '800' },
  minute: { color: theme.accent, fontSize: 10, fontWeight: '900' },
  close: { alignItems: 'center', height: 18, justifyContent: 'center', width: 18 },
  matchRow: { alignItems: 'center', flex: 1, flexDirection: 'row', justifyContent: 'space-around' },
  team: { alignItems: 'center', flex: 1, gap: 1, minWidth: 0 },
  badgeWrap: { alignItems: 'center', height: 26, justifyContent: 'center', position: 'relative', width: 32 },
  teamName: { color: theme.text, fontSize: 9, fontWeight: '700', maxWidth: '100%' },
  celebration: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    backgroundColor: theme.surface,
    borderRadius: 8,
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  celebrationRow: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  celebrationLogoWrap: { alignItems: 'center', height: 30, justifyContent: 'center', width: 34 },
  goalText: { color: theme.accent, fontSize: 13, fontWeight: '900' },
  scorerTeam: { color: theme.text, fontSize: 9, fontWeight: '800', textAlign: 'center' },
  scorerMinute: { color: theme.accent, fontSize: 10, fontWeight: '900', marginTop: 2 },
  score: { color: theme.text, fontSize: 16, fontWeight: '900', fontVariant: ['tabular-nums'], minWidth: 44, textAlign: 'center' },
});
