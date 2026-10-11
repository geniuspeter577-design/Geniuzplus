import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { loadTransferHistory, type TransferHistoryEntry } from '../src/services/TransferHistoryStore';
import { formatFileSize } from '../src/utils/formatFileSize.cjs';
import { backOrReplace } from '../src/utils/navigation';
import { theme } from '../src/theme';

export default function TransferHistoryScreen() {
  const [entries, setEntries] = useState<TransferHistoryEntry[]>([]);
  const [error, setError] = useState<string>();

  useFocusEffect(useCallback(() => {
    let active = true;
    void loadTransferHistory().then((items) => {
      if (active) {
        setEntries(items);
        setError(undefined);
      }
    }).catch(() => {
      if (active) {
        setError('Transfer history could not be loaded.');
      }
    });
    return () => {
      active = false;
    };
  }, []));

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={() => backOrReplace('/(tabs)/downloads')} style={styles.back}>
          <Ionicons name="arrow-back" size={21} color={theme.text} />
        </Pressable>
        <Text style={styles.title}>Transfer history</Text>
      </View>
      <ScrollView contentContainerStyle={styles.list}>
        {error ? <Text style={styles.empty}>{error}</Text> : null}
        {!error && entries.length === 0 ? <Text style={styles.empty}>Completed transfers will appear here.</Text> : null}
        {entries.map((entry) => (
          <View key={entry.id} style={styles.row}>
            <View style={styles.icon}>
              <Ionicons name={entry.direction === 'sent' ? 'arrow-up-outline' : 'arrow-down-outline'} size={20} color={theme.accent} />
            </View>
            <View style={styles.copy}>
              <Text style={styles.name} numberOfLines={2}>{entry.title}</Text>
              <Text style={styles.meta}>{entry.direction === 'sent' ? 'Sent' : 'Received'} · {formatFileSize(entry.size)}</Text>
            </View>
            <Text style={styles.date}>{new Date(entry.date).toLocaleDateString()}</Text>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: theme.background, flex: 1 },
  header: { alignItems: 'center', flexDirection: 'row', gap: 14, padding: 18 },
  back: { alignItems: 'center', backgroundColor: theme.surface, borderColor: theme.border, borderRadius: 20, borderWidth: 1, height: 40, justifyContent: 'center', width: 40 },
  title: { color: theme.text, fontSize: 24, fontWeight: '800' },
  list: { paddingHorizontal: 18, paddingBottom: 28 },
  empty: { color: theme.secondaryText, fontSize: 14, lineHeight: 20, paddingVertical: 20 },
  row: { alignItems: 'center', backgroundColor: theme.surface, borderColor: theme.border, borderRadius: 12, borderWidth: 1, flexDirection: 'row', gap: 12, marginBottom: 9, padding: 12 },
  icon: { alignItems: 'center', backgroundColor: theme.background, borderRadius: 20, height: 38, justifyContent: 'center', width: 38 },
  copy: { flex: 1, minWidth: 0 },
  name: { color: theme.text, fontSize: 14, fontWeight: '700' },
  meta: { color: theme.secondaryText, fontSize: 11, marginTop: 4 },
  date: { color: theme.secondaryText, fontSize: 10 },
});
