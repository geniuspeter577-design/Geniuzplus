import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { theme } from '../theme';

export function OfflineBadge({ compact = false }: { compact?: boolean }) {
  return (
    <View style={[styles.badge, compact && styles.compact]} accessibilityLabel="Available from saved catalog while offline">
      <Ionicons name="cloud-offline-outline" size={12} color={theme.text} />
      <Text style={styles.text}>Offline</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(14, 16, 20, 0.88)',
    borderColor: 'rgba(255,255,255,0.22)',
    borderRadius: 6,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  compact: { paddingHorizontal: 6, paddingVertical: 3 },
  text: { color: theme.text, fontSize: 10, fontWeight: '700' },
});