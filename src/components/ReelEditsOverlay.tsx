import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { ReelEdits } from '../models/reel';

export const REEL_FILTERS = [
  { id: 'none', label: 'None', color: '' },
  { id: 'warm', label: 'Warm', color: 'rgba(255,150,40,0.20)' },
  { id: 'cool', label: 'Cool', color: 'rgba(40,140,255,0.20)' },
  { id: 'fade', label: 'Fade', color: 'rgba(255,255,255,0.18)' },
  { id: 'night', label: 'Night', color: 'rgba(0,0,40,0.35)' },
  { id: 'rose', label: 'Rose', color: 'rgba(255,60,120,0.18)' },
];

export function ReelEditsOverlay({ edits }: { edits?: ReelEdits | undefined }) {
  if (!edits) {
    return null;
  }
  const tint = REEL_FILTERS.find((entry) => entry.id === edits.filter)?.color ?? '';
  const chips: string[] = [];
  if (edits.location) {
    chips.push(`📍 ${edits.location}`);
  }
  if (edits.tags) {
    chips.push(`with ${edits.tags}`);
  }
  if (edits.aiLabel) {
    chips.push('AI-generated');
  }
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {tint ? <View style={[StyleSheet.absoluteFill, { backgroundColor: tint }]} /> : null}
      {(edits.items ?? []).map((item) => (
        <Text
          key={item.id}
          style={{
            position: 'absolute',
            left: `${item.x * 100}%` as `${number}%`,
            top: `${item.y * 100}%` as `${number}%`,
            color: item.color ?? '#FFFFFF',
            fontSize: item.kind === 'sticker' ? 56 : 26,
            fontWeight: '800',
            textShadowColor: 'rgba(0,0,0,0.6)',
            textShadowRadius: 4,
          }}
        >
          {item.value}
        </Text>
      ))}
      {chips.length ? (
        <View style={styles.chips}>
          {chips.map((chip) => (
            <Text key={chip} style={styles.chip} numberOfLines={1}>{chip}</Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { gap: 4, left: 14, position: 'absolute', top: 76 },
  chip: { color: '#FFFFFF', fontSize: 12, fontWeight: '700', textShadowColor: 'rgba(0,0,0,0.7)', textShadowRadius: 3 },
});
