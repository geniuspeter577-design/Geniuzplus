import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import React, { useEffect, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '../theme';

const PROMPTED_KEY = 'geniuz.notifications.prompted';

async function loadNotifications() {
  try {
    return await import('expo-notifications');
  } catch {
    return null;
  }
}

export function FirstOpenPrompt() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (Constants.executionEnvironment === 'storeClient') {
      return undefined;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    (async () => {
      try {
        if ((await SecureStore.getItemAsync(PROMPTED_KEY)) === '1') {
          return;
        }
        const Notifications = await loadNotifications();
        if (Notifications === null) {
          return;
        }
        const current = await Notifications.getPermissionsAsync();
        if (current.granted) {
          await SecureStore.setItemAsync(PROMPTED_KEY, '1');
          return;
        }
        timer = setTimeout(() => {
          if (cancelled === false) {
            setVisible(true);
          }
        }, 1500);
      } catch {
        // never block the app because of this question
      }
    })();
    return () => {
      cancelled = true;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, []);

  const remember = async () => {
    try {
      await SecureStore.setItemAsync(PROMPTED_KEY, '1');
    } catch {
      // ignore
    }
  };

  const notNow = () => {
    setVisible(false);
    void remember();
  };

  const allow = async () => {
    setVisible(false);
    await remember();
    try {
      const Notifications = await loadNotifications();
      if (Notifications === null) {
        return;
      }
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'Geniuzplus updates',
          importance: Notifications.AndroidImportance.DEFAULT,
        });
      }
      await Notifications.requestPermissionsAsync();
    } catch {
      // ignore
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={notNow}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.iconWrap}>
            <Ionicons name="notifications" size={30} color={theme.accent} />
          </View>
          <Text style={styles.title}>Stay in the loop</Text>
          <Text style={styles.body}>
            Allow notifications so we can tell you when new movies and updates arrive. You can change this any time in your phone settings.
          </Text>
          <Pressable accessibilityRole="button" onPress={() => void allow()} style={styles.primary}>
            <Text style={styles.primaryText}>Allow notifications</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={notNow} style={styles.secondary}>
            <Text style={styles.secondaryText}>Not now</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.72)', flex: 1, justifyContent: 'center', padding: 24 },
  card: { alignItems: 'center', backgroundColor: theme.surface, borderColor: theme.border, borderRadius: 24, borderWidth: 1, gap: 12, maxWidth: 420, padding: 24, width: '100%' },
  iconWrap: { alignItems: 'center', backgroundColor: theme.surfaceAlt, borderRadius: 32, height: 64, justifyContent: 'center', width: 64 },
  title: { color: theme.text, fontSize: 22, fontWeight: '800' },
  body: { color: theme.secondaryText, fontSize: 14, lineHeight: 21, textAlign: 'center' },
  primary: { alignItems: 'center', backgroundColor: theme.accent, borderRadius: 26, justifyContent: 'center', marginTop: 6, minHeight: 52, width: '100%' },
  primaryText: { color: theme.background, fontSize: 15, fontWeight: '900' },
  secondary: { alignItems: 'center', justifyContent: 'center', minHeight: 44, width: '100%' },
  secondaryText: { color: theme.secondaryText, fontSize: 14, fontWeight: '700' },
});
