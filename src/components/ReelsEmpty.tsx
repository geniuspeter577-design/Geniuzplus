import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

const ACCENT = '#72F06A'; // change to your theme's lime green if different

export function EmptyReelsPage({ onBack }: { onBack: () => void }) {
  return (
    <View style={styles.page}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onBack} style={styles.back}>
        <Ionicons name="chevron-back" size={26} color="#fff" />
      </Pressable>
      <View style={styles.center}>
        <Ionicons name="videocam-outline" size={64} color={ACCENT} />
        <Text style={styles.title}>No Reels yet</Text>
        <Text style={styles.body}>Be the first to post a Reel on Geniuzplus.</Text>
        <Text style={styles.small}>
          Members can earn from their Reels once they meet the eligibility requirements. Payouts are coming soon.
        </Text>
        <Pressable style={styles.primary} onPress={() => router.push('/reels/create')}>
          <Ionicons name="add" size={20} color="#0E1014" />
          <Text style={styles.primaryText}>Post a Reel</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function PostReelButton() {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Post a Reel"
      onPress={() => router.push('/reels/create')}
      style={styles.fab}
    >
      <Ionicons name="add" size={26} color="#0E1014" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#000' },
  back: { position: 'absolute', top: 48, left: 12, padding: 8, zIndex: 5 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  title: { color: '#fff', fontSize: 24, fontWeight: '800', marginTop: 16 },
  body: { color: '#E6E9EE', fontSize: 16, marginTop: 8, textAlign: 'center' },
  small: { color: '#9AA3AF', fontSize: 13, lineHeight: 19, marginTop: 10, textAlign: 'center' },
  primary: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: ACCENT, borderRadius: 999, paddingVertical: 14, paddingHorizontal: 28, marginTop: 26 },
  primaryText: { color: '#0E1014', fontSize: 16, fontWeight: '800' },
  fab: { position: 'absolute', top: 52, right: 16, width: 44, height: 44, borderRadius: 22, backgroundColor: ACCENT, alignItems: 'center', justifyContent: 'center', zIndex: 20 },
});
