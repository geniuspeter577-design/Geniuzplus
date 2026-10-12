import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

import { getUnreadNotificationCount, loadNotifications } from '../services/NotificationsStore';
import { theme } from '../theme';

const SWING_MS = 110;
const PAUSE_MS = 2500;

export function NotificationBell() {
  const [count, setCount] = useState(0);
  const [swing] = useState(() => new Animated.Value(0));

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const refresh = () => {
        loadNotifications()
          .then((items) => {
            if (active) {
              setCount(getUnreadNotificationCount(items));
            }
          })
          .catch(() => undefined);
      };
      refresh();
      const timer = setInterval(refresh, 20000);
      return () => {
        active = false;
        clearInterval(timer);
      };
    }, []),
  );

  useEffect(() => {
    if (count <= 0) {
      swing.setValue(0);
      return undefined;
    }
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
  }, [count, swing]);

  const rotate = swing.interpolate({ inputRange: [-1, 1], outputRange: ['-22deg', '22deg'] });

  return (
    <View>
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
  badge: {
    position: 'absolute',
    top: -7,
    right: -9,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: '#FF3B5C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
});
