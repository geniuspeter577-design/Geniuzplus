import { Stack, router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect } from 'react';
import { ActivityIndicator, BackHandler, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { ContentNotice } from '../src/components/ContentNotice';
import { ShortsFeed } from '../src/components/ShortsFeed';
import { EmptyReelsPage, PostReelButton } from '../src/components/ReelsEmpty';
import { supabaseMovieRepository } from '../src/repositories/SupabaseMovieRepository';
import { useNetwork } from '../src/state/NetworkContext';
import { theme } from '../src/theme';
import { useContentQuery } from '../src/hooks/useContentQuery';
import { loadReelsFeed } from '../src/services/ReelsRepository';

function goHome() {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace('/');
  }
}

export default function ShortsScreen() {
  const { reelId } = useLocalSearchParams<{ reelId?: string }>();
  const { isOnline } = useNetwork();
  const insets = useSafeAreaInsets();
  const dimensions = useWindowDimensions();
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      goHome();
      return true;
    });
    return () => sub.remove();
  }, []);
  const loadShorts = useCallback(async () => {
    if (!supabaseMovieRepository) {
      throw new Error('Reels are not configured.');
    }
    const shorts = await supabaseMovieRepository.getPublishedShorts();
    return { data: await loadReelsFeed(shorts), source: 'supabase' as const };
  }, []);
  const query = useContentQuery('shorts-feed', loadShorts, isOnline);
  const height = Math.max(1, dimensions.height - insets.top - insets.bottom);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <Stack.Screen options={{ orientation: 'portrait', statusBarHidden: false, navigationBarHidden: false }} />
      {!isOnline ? (
        <View style={styles.messageState}>
          <ContentNotice message="Connect to the internet to watch Reels." tone="warning" />
          <Pressable accessibilityRole="button" onPress={() => goHome()} style={styles.button}>
            <Text style={styles.buttonText}>Back</Text>
          </Pressable>
        </View>
      ) : query.isLoading ? (
        <View style={styles.messageState}>
          <ActivityIndicator color={theme.accent} />
          <Text style={styles.loadingText}>Loading Reels…</Text>
        </View>
      ) : query.error ? (
        <View style={styles.messageState}>
          <ContentNotice message={query.error} tone="error" actionLabel="Retry" onAction={query.retry} />
          <Pressable accessibilityRole="button" onPress={() => goHome()} style={styles.button}>
            <Text style={styles.buttonText}>Back</Text>
          </Pressable>
        </View>
      ) : query.data?.length ? (
        <>
          <ShortsFeed items={query.data} height={height} onBack={() => goHome()} initialReelId={reelId} />
          <PostReelButton />
        </>
      ) : (
        <EmptyReelsPage onBack={() => goHome()} />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#000000' },
  messageState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 },
  loadingText: { color: theme.text, fontSize: 14 },
  button: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 18, borderRadius: 8, backgroundColor: theme.accent },
  buttonText: { color: theme.background, fontWeight: '800' },
});
