import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text } from 'react-native';

export function useGoalCelebration(home?: number | null, away?: number | null, live = true) {
  const prev = useRef<{ h: number; a: number } | null>(null);
  const [token, setToken] = useState(0);
  useEffect(() => {
    if (home == null || away == null) return;
    const p = prev.current;
    if (p && live && (home > p.h || away > p.a)) setToken((t) => t + 1);
    prev.current = { h: home, a: away };
  }, [home, away, live]);
  return token;
}

export function GoalCelebration({ token }: { token: number }) {
  const scale = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (token === 0) return;
    scale.setValue(0.4);
    opacity.setValue(1);
    Animated.sequence([
      Animated.spring(scale, { toValue: 1.1, useNativeDriver: true }),
      Animated.delay(900),
      Animated.timing(opacity, { toValue: 0, duration: 400, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]).start();
  }, [token, scale, opacity]);

  if (token === 0) return null;
  return (
    <Animated.View pointerEvents="none" style={[styles.overlay, { opacity, transform: [{ scale }] }]}>
      <Text style={styles.text}>⚽ GOAL!</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  text: { fontSize: 28, fontWeight: '900', color: '#B6FF3B', textShadowColor: '#000', textShadowRadius: 8 },
});
