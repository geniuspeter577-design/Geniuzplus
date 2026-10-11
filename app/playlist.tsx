import { Stack, router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { ShortsFeed } from '../src/components/ShortsFeed';
import type { ReelFeedItem } from '../src/models/reel';
import { loadPlaylistReels } from '../src/services/ReelsRepository';
import { theme } from '../src/theme';

function leave() {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace('/');
  }
}

export default function PlaylistScreen() {
  const insets = useSafeAreaInsets();
  const dimensions = useWindowDimensions();
  const [items, setItems] = useState<ReelFeedItem[]>();
  const [error, setError] = useState<string>();
  const height = Math.max(1, dimensions.height - insets.top - insets.bottom);

  useEffect(() => {
    loadPlaylistReels()
      .then(setItems)
      .catch((loadError: unknown) => setError(loadError instanceof Error ? loadError.message : 'Could not load your playlist.'));
  }, []);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />
      {error ? (
        <View style={styles.center}>
          <Text style={styles.text}>{error}</Text>
          <Pressable onPress={leave} style={styles.button}><Text style={styles.buttonText}>Go back</Text></Pressable>
        </View>
      ) : !items ? (
        <View style={styles.center}><ActivityIndicator color={theme.accent} /></View>
      ) : items.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.text}>Your playlist is empty. Add reels to it and they will show here.</Text>
          <Pressable onPress={leave} style={styles.button}><Text style={styles.buttonText}>Go back</Text></Pressable>
        </View>
      ) : (
        <ShortsFeed items={items} height={height} onBack={leave} />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 },
  text: { color: theme.text, textAlign: 'center', fontSize: 15 },
  button: { backgroundColor: theme.accent, borderRadius: 8, paddingHorizontal: 18, paddingVertical: 10 },
  buttonText: { color: theme.background, fontWeight: '700' },
});
