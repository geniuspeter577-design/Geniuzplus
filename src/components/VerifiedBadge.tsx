import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { theme } from '../theme';

export function VerifiedBadge({ size = 16 }: { size?: number }) {
  return (
    <View accessibilityLabel="Verified member" accessibilityRole="image" style={styles.badge}>
      <Ionicons name="checkmark-circle" size={size} color={theme.accent} />
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { alignItems: 'center', justifyContent: 'center' },
});