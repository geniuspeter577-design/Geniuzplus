import * as Updates from 'expo-updates';
import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '../theme';

export function UpdatePrompt() {
  const { isUpdatePending } = Updates.useUpdates();
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (__DEV__ || !Updates.isEnabled) {
      return undefined;
    }
    void (async () => {
      try {
        const check = await Updates.checkForUpdateAsync();
        if (check.isAvailable) {
          await Updates.fetchUpdateAsync();
        }
      } catch {
        // offline or server asleep: try again next time the app opens
      }
    })();
    return undefined;
  }, []);

  if (__DEV__ || !Updates.isEnabled || !isUpdatePending || dismissed) {
    return null;
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => setDismissed(true)}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>Update available</Text>
          <Text style={styles.body}>A new version of Geniuz+ is ready with improvements. Update now to get it.</Text>
          <Pressable accessibilityRole="button" onPress={() => void Updates.reloadAsync()} style={styles.primary}>
            <Text style={styles.primaryText}>Update now</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => setDismissed(true)} style={styles.secondary}>
            <Text style={styles.secondaryText}>Later</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.7)', flex: 1, justifyContent: 'center', padding: 24 },
  card: { backgroundColor: theme.surface, borderColor: theme.border, borderRadius: 16, borderWidth: 1, gap: 12, padding: 22, width: '100%' },
  title: { color: theme.text, fontSize: 20, fontWeight: '800' },
  body: { color: theme.secondaryText, fontSize: 14, lineHeight: 20 },
  primary: { alignItems: 'center', backgroundColor: theme.accent, borderRadius: 10, justifyContent: 'center', minHeight: 48 },
  primaryText: { color: theme.background, fontSize: 15, fontWeight: '900' },
  secondary: { alignItems: 'center', justifyContent: 'center', minHeight: 42 },
  secondaryText: { color: theme.secondaryText, fontSize: 14, fontWeight: '700' },
});
