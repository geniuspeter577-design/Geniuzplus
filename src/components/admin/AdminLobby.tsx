import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '../../theme';

export type AdminRoom = 'upload' | 'series' | 'subtitles' | 'catalog' | 'users' | 'cleanup' | 'replace' | null;
type RoomKey = Exclude<AdminRoom, null>;

const TILES: { key: RoomKey; icon: string; title: string; hint: string }[] = [
  { key: 'upload', icon: '🎬', title: 'Upload', hint: 'Add a movie or reel' },
  { key: 'series', icon: '📺', title: 'Series', hint: 'Series, seasons, episodes' },
  { key: 'subtitles', icon: '💬', title: 'Subtitles', hint: 'Add subtitle files' },
  { key: 'catalog', icon: '🗂️', title: 'Catalog', hint: 'Edit and remove titles' },
  { key: 'users', icon: '👥', title: 'Users', hint: 'Search people and badges' },
  { key: 'cleanup', icon: '🧹', title: 'Cleanup', hint: 'Free unused storage' },
  { key: 'replace', icon: '🔁', title: 'Replace videos', hint: 'Swap a season’s videos' },
];

export function AdminLobby({ onOpen, catalogCount }: { onOpen: (room: RoomKey) => void; catalogCount: number }) {
  return (
    <View style={styles.grid}>
      {TILES.map((tile) => (
        <Pressable
          key={tile.key}
          accessibilityRole="button"
          accessibilityLabel={tile.title}
          onPress={() => onOpen(tile.key)}
          style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}
        >
          <View style={styles.iconCircle}>
            <Text style={styles.icon}>{tile.icon}</Text>
          </View>
          <Text style={styles.title}>{tile.title}</Text>
          <Text style={styles.hint}>{tile.hint}</Text>
          {tile.key === 'catalog' ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{catalogCount}</Text>
            </View>
          ) : null}
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12 },
  tile: {
    width: '48%',
    minHeight: 150,
    backgroundColor: theme.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 16,
    gap: 6,
  },
  tilePressed: { backgroundColor: theme.surfaceAlt, borderColor: theme.accent },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(114, 240, 106, 0.14)',
    marginBottom: 6,
  },
  icon: { fontSize: 24 },
  title: { color: theme.text, fontSize: 17, fontWeight: '700' },
  hint: { color: theme.secondaryText, fontSize: 13 },
  badge: {
    position: 'absolute',
    top: 14,
    right: 14,
    minWidth: 28,
    height: 28,
    paddingHorizontal: 8,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.accent,
  },
  badgeText: { color: theme.background, fontSize: 13, fontWeight: '800' },
});
