import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useNetwork } from '../state/NetworkContext';
import { theme } from '../theme';

export function OfflineBanner() {
  const { isOnline, isReady } = useNetwork();
  if (!isReady || isOnline) {
    return null;
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <Text style={styles.text}>Offline - Your saved catalog is available</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: '#252A31' },
  text: {
    color: theme.text,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
});
