import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

import { theme } from '../theme';

const SWING_MS = 110;
const PAUSE_MS = 2500;

export function NotificationBell({ count = 0 }: { count?: number }) {
  const [swing] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const swings = Array.from({ length: 18 }, (_, i) => (i % 2 === 0 ? 1 : -1)).map((toValue) =>
      Animated.timing(swing, { toValue, duration: SWING_MS, useNativeDriver: true }),
    );
    const loop = Animated.loop(
      Animated.sequence([
        ...swings,
        Animated.timing(swing, { toValue: 0, duration: SWING_MS, useNativeDriver: true }),
        Animated.delay(PAUSE_MS),
      ]),
    );
    loop.start();
    return () => {
      loop.stop();
      swing.setValue(0);
    };
  }, [swing]);

  const rotate = swing.interpolate({ inputRange: [-1, 1], outputRange: ['-22deg', '22deg'] });

  return (
    <View style={styles.wrap}>
      <Animated.View style={{ transform: [{ rotate }] }}>
        <Ionicons name="notifications-outline" size={22} color={theme.text} />
      </Animated.View>
      {count > 0 ? (
        <View pointerEvents="none" style={styles.badge}>
          <Text style={styles.badgeText}>{count > 9 ? '9+' : String(count)}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute',
    top: 2,
    right: 2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: '#FF3B30',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    elevation: 6,
  },
  badgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
});
