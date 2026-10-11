import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { VideoView, useVideoPlayer } from 'expo-video';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { theme } from '../src/theme';

export default function LocalPlayerScreen() {
  const { uri, title } = useLocalSearchParams<{ uri?: string; title?: string }>();
  const player = useVideoPlayer(uri ? String(uri) : null, (videoPlayer) => {
    videoPlayer.play();
  });

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  };

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.top}>
        <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={goBack} style={styles.back}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>{title ?? 'Video'}</Text>
      </View>
      {uri ? (
        <VideoView player={player} style={styles.video} contentFit="contain" nativeControls allowsPictureInPicture={false} />
      ) : (
        <View style={styles.empty}><Text style={styles.emptyText}>This video could not be opened.</Text></View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: '#000000', flex: 1 },
  top: { alignItems: 'center', flexDirection: 'row', gap: 6, paddingHorizontal: 8, paddingVertical: 8 },
  back: { alignItems: 'center', height: 42, justifyContent: 'center', width: 42 },
  title: { color: '#FFFFFF', flex: 1, fontSize: 16, fontWeight: '700' },
  video: { flex: 1 },
  empty: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  emptyText: { color: theme.secondaryText, fontSize: 14 },
});
