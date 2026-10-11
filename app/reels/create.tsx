import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { VideoView, useVideoPlayer } from 'expo-video';
import * as VideoThumbnails from 'expo-video-thumbnails';
import React, { useEffect, useState } from 'react';
import { Alert, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MAX_REEL_DURATION_SECONDS, MAX_REEL_FILE_SIZE_BYTES } from '../../src/config/reels';
import { useAuth } from '../../src/state/AuthContext';
import { theme } from '../../src/theme';
import { uploadReel } from '../../src/services/ReelsRepository';
import type { ReelVisibility } from '../../src/models/reel';
import { backOrReplace } from '../../src/utils/navigation';

type IconName = React.ComponentProps<typeof Ionicons>['name'];
type RowInfo = { icon: IconName; title: string };

const ROWS_TOP: RowInfo[] = [
  { icon: 'location', title: 'Location' },
  { icon: 'arrow-redo', title: 'Share to groups' },
  { icon: 'list', title: 'Add to playlist' },
  { icon: 'pricetag', title: 'Tag people' },
  { icon: 'book-outline', title: 'Share to your story' },
  { icon: 'logo-instagram', title: 'Instagram' },
  { icon: 'bag-handle-outline', title: 'Add product' },
  { icon: 'flask-outline', title: 'A/B tests' },
  { icon: 'add', title: 'Add AI Label' },
  { icon: 'megaphone-outline', title: 'Boost reel' },
];
const ROWS_BOTTOM: RowInfo[] = [
  { icon: 'time', title: 'Scheduling options' },
  { icon: 'chatbox-ellipses-outline', title: 'Closed captions' },
];
const MENU_ITEMS: RowInfo[] = [
  { icon: 'download-outline', title: 'Save' },
  { icon: 'add-circle-outline', title: 'Upload audio description' },
  { icon: 'add-circle-outline', title: 'Upload text transcript' },
  { icon: 'add-circle-outline', title: 'Add AI Label' },
  { icon: 'bug-outline', title: 'Report a problem' },
];

const soon = (name: string) => Alert.alert(name, 'Coming soon.');

function SettingsRow({ icon, title, subtitle, onPress }: { icon: IconName; title: string; subtitle: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.settingsRow}>
      <View style={styles.settingsIcon}><Ionicons name={icon} size={22} color={theme.text} /></View>
      <View style={styles.settingsTextBlock}>
        <Text style={styles.settingsTitle}>{title}</Text>
        <Text style={styles.muted}>{subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={theme.secondaryText} />
    </Pressable>
  );
}

export default function CreateReelScreen() {
  const auth = useAuth();
  const [asset, setAsset] = useState<ImagePicker.ImagePickerAsset>();
  const [step, setStep] = useState<'edit' | 'settings'>('edit');
  const [menuOpen, setMenuOpen] = useState(false);
  const [thumb, setThumb] = useState<string>();
  const [position, setPosition] = useState(0);
  const [caption, setCaption] = useState('');
  const [visibility, setVisibility] = useState<ReelVisibility>('public');
  const [progress, setProgress] = useState<number>();
  const [error, setError] = useState<string>();
  const [retryUpload, setRetryUpload] = useState(false);
  const tooLong = Boolean(asset?.duration && asset.duration > MAX_REEL_DURATION_SECONDS * 1000);

  const player = useVideoPlayer(asset?.uri ?? null, (videoPlayer) => {
    videoPlayer.loop = true;
    videoPlayer.timeUpdateEventInterval = 0.25;
    videoPlayer.play();
  });

  useEffect(() => {
    if (step === 'edit' && asset) {
      player.play();
    } else {
      player.pause();
    }
  }, [step, asset, player]);

  useEffect(() => {
    const subscription = player.addListener('timeUpdate', ({ currentTime }) => {
      const total = player.duration;
      setPosition(total > 0 ? Math.min(1, currentTime / total) : 0);
    });
    return () => subscription.remove();
  }, [player]);

  useEffect(() => {
    if (!asset) {
      return undefined;
    }
    let active = true;
    VideoThumbnails.getThumbnailAsync(asset.uri, { time: 0 })
      .then((result) => { if (active) { setThumb(result.uri); } })
      .catch(() => undefined);
    return () => { active = false; };
  }, [asset]);

  const pickVideo = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['videos'],
        allowsMultipleSelection: false,
        videoMaxDuration: MAX_REEL_DURATION_SECONDS,
        quality: 1,
      });
      if (!result.canceled && result.assets[0]) {
        setAsset(result.assets[0]);
        setThumb(undefined);
        setStep('edit');
        setError(undefined);
        setRetryUpload(false);
      }
    } catch (pickerError) {
      const message = pickerError instanceof Error ? pickerError.message : 'The video picker could not be opened.';
      setError(`Upload failed: ${message}`);
      setRetryUpload(false);
    }
  };

  const shareNow = async () => {
    if (!auth.session) {
      auth.openSignInSheet('sign-in');
      return;
    }
    if (!asset || tooLong) {
      setError(`Upload failed: ${tooLong ? `This video is longer than ${MAX_REEL_DURATION_SECONDS} seconds. Choose a shorter video.` : 'Choose a video first.'}`);
      setRetryUpload(false);
      return;
    }
    if ((asset.fileSize ?? 0) > MAX_REEL_FILE_SIZE_BYTES) {
      setError('Upload failed: This video is larger than 50 MB. Choose a shorter or smaller video.');
      setRetryUpload(false);
      return;
    }
    setError(undefined);
    setRetryUpload(false);
    setProgress(0);
    try {
      const hashtags = [...caption.matchAll(/#([\p{L}\p{N}_]+)/gu)].map((match) => match[1]);
      await uploadReel(asset, { caption, hashtags, visibility }, setProgress);
      router.replace('/shorts');
    } catch (uploadError) {
      const message = uploadError instanceof Error ? uploadError.message : 'The Reel could not be shared.';
      setError(`Upload failed: ${message}`);
      setRetryUpload(true);
      setProgress(undefined);
    }
  };

  const chooseVisibility = () => {
    Alert.alert('Who can see this?', undefined, [
      { text: 'Public', onPress: () => setVisibility('public') },
      { text: 'Followers', onPress: () => setVisibility('followers') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const togglePlay = () => {
    if (player.playing) {
      player.pause();
    } else {
      player.play();
    }
  };

  if (!asset) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={() => backOrReplace('/shorts')} style={styles.iconButton}>
            <Ionicons name="arrow-back" size={20} color={theme.text} />
          </Pressable>
          <Text style={styles.title}>Create Reel</Text>
          <View style={styles.iconButton} />
        </View>
        <View style={styles.pickCenter}>
          <Pressable accessibilityRole="button" onPress={() => void pickVideo()} style={styles.picker}>
            <Ionicons name="videocam-outline" size={34} color={theme.accent} />
            <Text style={styles.pickerTitle}>Choose a video</Text>
            <Text style={styles.muted}>Maximum {MAX_REEL_DURATION_SECONDS} seconds · 50 MB</Text>
          </Pressable>
          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        </View>
      </SafeAreaView>
    );
  }

  if (step === 'edit') {
    const tools: { icon?: IconName; label: string; text?: string }[] = [
      { icon: 'musical-notes', label: 'Audio' },
      { icon: 'cut-outline', label: 'Edit' },
      { icon: 'color-wand-outline', label: 'Effects' },
      { text: 'Aa', label: 'Text' },
      { icon: 'happy-outline', label: 'Stickers' },
    ];
    return (
      <SafeAreaView style={styles.editRoot}>
        <View style={styles.editTop}>
          <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={() => setAsset(undefined)} style={styles.iconButton}>
            <Ionicons name="chevron-back" size={26} color="#FFFFFF" />
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => soon('Add audio')} style={styles.audioPill}>
            <View style={styles.audioPillIcon}><Ionicons name="musical-notes" size={20} color="#FFFFFF" /></View>
            <View>
              <Text style={styles.audioPillTitle}>Add audio</Text>
              <Text style={styles.audioPillSub}>Discover suggestions</Text>
            </View>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="More options" onPress={() => setMenuOpen(true)} style={styles.iconButton}>
            <Ionicons name="ellipsis-horizontal" size={24} color="#FFFFFF" />
          </Pressable>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Pause or play preview" onPress={togglePlay} style={styles.previewWrap}>
          <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls={false} allowsPictureInPicture={false} />
        </Pressable>
        <View style={styles.editTrack}><View style={[styles.editFill, { width: `${Math.round(position * 100)}%` }]} /></View>
        {tooLong ? <Text style={[styles.error, styles.editError]}>This video is longer than {MAX_REEL_DURATION_SECONDS} seconds. Go back and choose a shorter one.</Text> : null}
        <View style={styles.toolsRow}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.toolsScroll} contentContainerStyle={styles.toolsContent}>
            {tools.map((tool) => (
              <Pressable key={tool.label} accessibilityRole="button" onPress={() => soon(tool.label)} style={styles.tool}>
                <View style={styles.toolCircle}>
                  {tool.icon ? <Ionicons name={tool.icon} size={28} color="#FFFFFF" /> : <Text style={styles.toolAa}>{tool.text}</Text>}
                </View>
                <Text style={styles.toolLabel}>{tool.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <Pressable accessibilityRole="button" accessibilityLabel="Next" disabled={tooLong} onPress={() => setStep('settings')} style={[styles.tool, tooLong && styles.disabled]}>
            <View style={[styles.toolCircle, styles.nextCircle]}><Ionicons name="arrow-forward" size={28} color={theme.background} /></View>
            <Text style={styles.toolLabel}>Next</Text>
          </Pressable>
        </View>
        <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
          <Pressable style={styles.menuOverlay} onPress={() => setMenuOpen(false)}>
            <View style={styles.menuCard}>
              {MENU_ITEMS.map((item, index) => (
                <Pressable key={item.title} accessibilityRole="button" onPress={() => { setMenuOpen(false); soon(item.title); }} style={[styles.menuItem, index > 0 && styles.menuItemBorder]}>
                  <Ionicons name={item.icon} size={24} color="#FFFFFF" />
                  <Text style={styles.menuText}>{item.title}</Text>
                </Pressable>
              ))}
            </View>
          </Pressable>
        </Modal>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back to editor" onPress={() => setStep('edit')} style={styles.iconButton}>
          <Ionicons name="arrow-back" size={20} color={theme.text} />
        </Pressable>
        <Text style={styles.title}>Reel Settings</Text>
        <View style={styles.iconButton} />
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.captionRow}>
          <View style={styles.thumbBox}>{thumb ? <Image source={{ uri: thumb }} style={styles.thumbImage} resizeMode="cover" /> : null}</View>
          <TextInput
            accessibilityLabel="Reel caption and hashtags"
            multiline
            maxLength={2200}
            onChangeText={setCaption}
            placeholder="Describe your reel. You can also add hashtags here."
            placeholderTextColor={theme.secondaryText}
            style={styles.captionInput}
            value={caption}
          />
        </View>
        {ROWS_TOP.map((row) => (
          <SettingsRow key={row.title} icon={row.icon} title={row.title} subtitle="Coming soon" onPress={() => soon(row.title)} />
        ))}
        <SettingsRow icon="globe-outline" title="Who can see this?" subtitle={visibility === 'public' ? 'Public' : 'Followers'} onPress={chooseVisibility} />
        {ROWS_BOTTOM.map((row) => (
          <SettingsRow key={row.title} icon={row.icon} title={row.title} subtitle="Coming soon" onPress={() => soon(row.title)} />
        ))}
      </ScrollView>
      <View style={styles.footer}>
        {typeof progress === 'number' ? (
          <View style={styles.uploadProgress}>
            <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${progress}%` }]} /></View>
            <Text style={styles.muted}>{progress === 100 ? 'Shared' : `Uploading ${progress}%`}</Text>
          </View>
        ) : null}
        {error ? (
          <View style={styles.errorGroup}>
            <Text accessibilityRole="alert" style={styles.error}>{error}</Text>
            <Pressable accessibilityRole="button" onPress={() => retryUpload ? void shareNow() : void pickVideo()} style={styles.retryButton}>
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        ) : null}
        <View style={styles.footerRow}>
          <Pressable accessibilityRole="button" accessibilityLabel="Save" onPress={() => soon('Save')} style={styles.saveButton}>
            <Ionicons name="download-outline" size={22} color={theme.text} />
          </Pressable>
          <Pressable accessibilityRole="button" disabled={tooLong || typeof progress === 'number'} onPress={() => void shareNow()} style={[styles.shareButton, (tooLong || typeof progress === 'number') && styles.disabled]}>
            <Text style={styles.shareText}>{!auth.session ? 'Sign in to share' : 'Share now'}</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: theme.background, flex: 1 },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', padding: 16 },
  iconButton: { alignItems: 'center', height: 42, justifyContent: 'center', width: 42 },
  title: { color: theme.text, fontSize: 19, fontWeight: '800' },
  content: { gap: 6, padding: 16, paddingBottom: 26 },
  pickCenter: { alignItems: 'center', flex: 1, gap: 14, justifyContent: 'center', padding: 24 },
  picker: { alignItems: 'center', backgroundColor: theme.surface, borderColor: theme.border, borderRadius: 14, borderWidth: 1, gap: 9, justifyContent: 'center', minHeight: 170, paddingHorizontal: 30, width: '100%' },
  pickerTitle: { color: theme.text, fontSize: 15, fontWeight: '800', textAlign: 'center' },
  muted: { color: theme.secondaryText, fontSize: 12, lineHeight: 17 },
  editRoot: { backgroundColor: '#000000', flex: 1 },
  editTop: { alignItems: 'center', flexDirection: 'row', gap: 8, justifyContent: 'space-between', paddingHorizontal: 10, paddingVertical: 10 },
  audioPill: { alignItems: 'center', backgroundColor: '#222222', borderRadius: 30, flex: 1, flexDirection: 'row', gap: 10, minHeight: 52, paddingHorizontal: 8 },
  audioPillIcon: { alignItems: 'center', backgroundColor: '#3A3A3A', borderRadius: 18, height: 36, justifyContent: 'center', width: 36 },
  audioPillTitle: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  audioPillSub: { color: '#C9CDD2', fontSize: 12 },
  previewWrap: { backgroundColor: '#000000', flex: 1 },
  editTrack: { backgroundColor: '#3A3A3A', height: 2 },
  editFill: { backgroundColor: '#FFFFFF', height: '100%' },
  editError: { padding: 10, textAlign: 'center' },
  toolsRow: { alignItems: 'center', backgroundColor: '#0E1014', flexDirection: 'row', paddingBottom: 10, paddingRight: 8, paddingTop: 14 },
  toolsScroll: { flex: 1 },
  toolsContent: { gap: 6, paddingHorizontal: 8 },
  tool: { alignItems: 'center', gap: 6, width: 70 },
  toolCircle: { alignItems: 'center', backgroundColor: '#2A2D33', borderRadius: 30, height: 56, justifyContent: 'center', width: 56 },
  toolAa: { color: '#FFFFFF', fontSize: 24, fontWeight: '600' },
  toolLabel: { color: '#FFFFFF', fontSize: 12 },
  nextCircle: { backgroundColor: theme.accent },
  menuOverlay: { flex: 1, paddingHorizontal: 20, paddingTop: 100 },
  menuCard: { alignSelf: 'flex-end', backgroundColor: '#2A2D33', borderRadius: 18, overflow: 'hidden', width: '82%' },
  menuItem: { alignItems: 'center', flexDirection: 'row', gap: 16, minHeight: 56, paddingHorizontal: 18 },
  menuItemBorder: { borderTopColor: '#44484F', borderTopWidth: 1 },
  menuText: { color: '#FFFFFF', flex: 1, fontSize: 16 },
  captionRow: { alignItems: 'flex-start', flexDirection: 'row', gap: 14, paddingBottom: 14 },
  thumbBox: { backgroundColor: '#000000', borderRadius: 8, height: 118, overflow: 'hidden', width: 84 },
  thumbImage: { height: '100%', width: '100%' },
  captionInput: { color: theme.text, flex: 1, fontSize: 16, minHeight: 118, paddingTop: 4, textAlignVertical: 'top' },
  settingsRow: { alignItems: 'center', flexDirection: 'row', gap: 14, minHeight: 62, paddingVertical: 6 },
  settingsIcon: { alignItems: 'center', backgroundColor: theme.surface, borderRadius: 24, height: 48, justifyContent: 'center', width: 48 },
  settingsTextBlock: { flex: 1 },
  settingsTitle: { color: theme.text, fontSize: 16, fontWeight: '700' },
  uploadProgress: { gap: 7 },
  progressTrack: { backgroundColor: theme.surfaceSoft, borderRadius: 4, height: 6, overflow: 'hidden' },
  progressFill: { backgroundColor: theme.accent, height: '100%' },
  errorGroup: { alignItems: 'center', gap: 8 },
  error: { color: theme.error, fontSize: 13, lineHeight: 19 },
  retryButton: { alignItems: 'center', backgroundColor: theme.surface, borderColor: theme.border, borderRadius: 8, borderWidth: 1, justifyContent: 'center', minHeight: 40, paddingHorizontal: 18 },
  retryText: { color: theme.text, fontWeight: '800' },
  footer: { backgroundColor: theme.background, borderTopColor: theme.border, borderTopWidth: 1, gap: 10, padding: 14 },
  footerRow: { flexDirection: 'row', gap: 12 },
  saveButton: { alignItems: 'center', backgroundColor: theme.surface, borderRadius: 10, height: 50, justifyContent: 'center', width: 56 },
  shareButton: { alignItems: 'center', backgroundColor: theme.accent, borderRadius: 10, flex: 1, justifyContent: 'center', minHeight: 50 },
  shareText: { color: theme.background, fontSize: 15, fontWeight: '900' },
  disabled: { opacity: 0.4 },
});
