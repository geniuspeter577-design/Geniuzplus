import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MAX_REEL_DURATION_SECONDS, MAX_REEL_FILE_SIZE_BYTES } from '../../src/config/reels';
import { useAuth } from '../../src/state/AuthContext';
import { theme } from '../../src/theme';
import { uploadReel } from '../../src/services/ReelsRepository';
import type { ReelVisibility } from '../../src/models/reel';
import { backOrReplace } from '../../src/utils/navigation';

export default function CreateReelScreen() {
  const auth = useAuth();
  const [asset, setAsset] = useState<ImagePicker.ImagePickerAsset>();
  const [caption, setCaption] = useState('');
  const [visibility, setVisibility] = useState<ReelVisibility>('public');
  const [progress, setProgress] = useState<number>();
  const [error, setError] = useState<string>();
  const tooLong = Boolean(asset?.duration && asset.duration > MAX_REEL_DURATION_SECONDS * 1000);

  const pickVideo = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['videos'],
      allowsMultipleSelection: false,
      videoMaxDuration: MAX_REEL_DURATION_SECONDS,
      quality: 1,
    });
    if (!result.canceled) {
      setAsset(result.assets[0]);
      setError(undefined);
    }
  };

  const shareNow = async () => {
    if (!auth.session) {
      auth.openSignInSheet('sign-in');
      return;
    }
    if (!asset || tooLong) {
      setError(tooLong ? `This video is longer than ${MAX_REEL_DURATION_SECONDS} seconds. Trim it in your gallery and select it again.` : 'Choose a video to share.');
      return;
    }
    if ((asset.fileSize ?? 0) > MAX_REEL_FILE_SIZE_BYTES) {
      setError('This video exceeds the 200 MB upload limit.');
      return;
    }
    setError(undefined);
    setProgress(0);
    try {
      const hashtags = [...caption.matchAll(/#([\p{L}\p{N}_]+)/gu)].map((match) => match[1]);
      await uploadReel(asset, { caption, hashtags, visibility }, setProgress);
      router.replace('/shorts');
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'The Reel could not be shared.');
      setProgress(undefined);
    }
  };

  const setPrivacy = (value: ReelVisibility) => setVisibility(value);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={() => backOrReplace('/shorts')} style={styles.iconButton}>
          <Ionicons name="arrow-back" size={20} color={theme.text} />
        </Pressable>
        <Text style={styles.title}>Create Reel</Text>
        <View style={styles.iconButton} />
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Pressable accessibilityRole="button" onPress={() => void pickVideo()} style={styles.picker}>
          <Ionicons name={asset ? 'checkmark-circle-outline' : 'videocam-outline'} size={30} color={theme.accent} />
          <Text style={styles.pickerTitle}>{asset?.fileName ?? 'Choose a video'}</Text>
          <Text style={styles.muted}>Maximum {MAX_REEL_DURATION_SECONDS} seconds · 200 MB</Text>
          {asset?.duration ? <Text style={styles.muted}>{Math.ceil(asset.duration / 1000)} seconds</Text> : null}
        </Pressable>
        {tooLong ? <Text style={styles.error}>Trim the clip in your gallery to {MAX_REEL_DURATION_SECONDS} seconds or less, then select it again. In-app trimming is Coming soon.</Text> : null}
        <TextInput
          accessibilityLabel="Reel caption and hashtags"
          multiline
          maxLength={2200}
          onChangeText={setCaption}
          placeholder="Write a caption and add hashtags"
          placeholderTextColor={theme.secondaryText}
          style={styles.captionInput}
          value={caption}
        />
        <Text style={styles.sectionTitle}>Who can see this Reel?</Text>
        <View style={styles.segment}>
          {(['public', 'followers'] as const).map((option) => (
            <Pressable key={option} accessibilityRole="radio" accessibilityState={{ selected: visibility === option }} onPress={() => setPrivacy(option)} style={[styles.segmentItem, visibility === option && styles.selectedSegment]}>
              <Text style={[styles.segmentText, visibility === option && styles.selectedSegmentText]}>{option === 'public' ? 'Public' : 'Followers'}</Text>
            </Pressable>
          ))}
        </View>
        <Pressable accessibilityRole="button" onPress={() => Alert.alert('Audio', 'Adding audio is Coming soon.')} style={styles.optionRow}>
          <Ionicons name="musical-notes-outline" size={20} color={theme.accent} />
          <Text style={styles.optionText}>Add audio</Text>
          <Text style={styles.muted}>Coming soon</Text>
        </Pressable>
        {typeof progress === 'number' ? (
          <View style={styles.uploadProgress}>
            <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${progress}%` }]} /></View>
            <Text style={styles.muted}>{progress === 100 ? 'Shared' : `Uploading ${progress}%`}</Text>
          </View>
        ) : null}
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      </ScrollView>
      <View style={styles.footer}>
        <Pressable accessibilityRole="button" disabled={!asset || tooLong || typeof progress === 'number'} onPress={() => void shareNow()} style={[styles.shareButton, (!asset || tooLong || typeof progress === 'number') && styles.disabled]}>
          <Text style={styles.shareText}>{!auth.session ? 'Sign in to share' : 'Share now'}</Text>
        </Pressable>
        <Text style={styles.muted}>Anyone signed in can post. Membership is required to earn from eligible Reels.</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: theme.background, flex: 1 },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', padding: 16 },
  iconButton: { alignItems: 'center', height: 42, justifyContent: 'center', width: 42 },
  title: { color: theme.text, fontSize: 19, fontWeight: '800' },
  content: { gap: 16, padding: 18, paddingBottom: 26 },
  picker: { alignItems: 'center', backgroundColor: theme.surface, borderColor: theme.border, borderRadius: 14, borderWidth: 1, gap: 9, justifyContent: 'center', minHeight: 200, padding: 18 },
  pickerTitle: { color: theme.text, fontSize: 15, fontWeight: '800', maxWidth: '100%', textAlign: 'center' },
  muted: { color: theme.secondaryText, fontSize: 12, lineHeight: 17 },
  captionInput: { backgroundColor: theme.surface, borderColor: theme.border, borderRadius: 12, borderWidth: 1, color: theme.text, minHeight: 112, padding: 13, textAlignVertical: 'top' },
  sectionTitle: { color: theme.text, fontSize: 14, fontWeight: '800' },
  segment: { backgroundColor: theme.surface, borderRadius: 10, flexDirection: 'row', gap: 4, padding: 4 },
  segmentItem: { alignItems: 'center', borderRadius: 8, flex: 1, justifyContent: 'center', minHeight: 42 },
  selectedSegment: { backgroundColor: theme.accent },
  segmentText: { color: theme.secondaryText, fontWeight: '700' },
  selectedSegmentText: { color: theme.background },
  optionRow: { alignItems: 'center', backgroundColor: theme.surface, borderRadius: 10, flexDirection: 'row', gap: 12, padding: 13 },
  optionText: { color: theme.text, flex: 1, fontWeight: '700' },
  uploadProgress: { gap: 7 },
  progressTrack: { backgroundColor: theme.surfaceSoft, borderRadius: 4, height: 6, overflow: 'hidden' },
  progressFill: { backgroundColor: theme.accent, height: '100%' },
  error: { color: theme.error, fontSize: 13, lineHeight: 19 },
  footer: { backgroundColor: theme.background, borderTopColor: theme.border, borderTopWidth: 1, gap: 10, padding: 16 },
  shareButton: { alignItems: 'center', backgroundColor: theme.accent, borderRadius: 10, justifyContent: 'center', minHeight: 50 },
  shareText: { color: theme.background, fontSize: 15, fontWeight: '900' },
  disabled: { opacity: 0.4 },
});