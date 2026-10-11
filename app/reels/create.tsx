import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { VideoView, useVideoPlayer } from 'expo-video';
import * as VideoThumbnails from 'expo-video-thumbnails';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Image, KeyboardAvoidingView, Linking, Modal, PanResponder, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { REEL_FILTERS } from '../../src/components/ReelEditsOverlay';
import { MAX_REEL_DURATION_SECONDS, MAX_REEL_FILE_SIZE_BYTES } from '../../src/config/reels';
import { useAuth } from '../../src/state/AuthContext';
import { theme } from '../../src/theme';
import { playlistOnUpload, searchUsers, uploadReel } from '../../src/services/ReelsRepository';
import type { ReelEdits, ReelVisibility } from '../../src/models/reel';
import { backOrReplace } from '../../src/utils/navigation';

type IconName = React.ComponentProps<typeof Ionicons>['name'];
type EditItem = { id: string; kind: 'text' | 'sticker'; value: string; color: string; x: number; y: number };
type Sheet = 'text' | 'stickers' | 'trim' | 'effects' | 'location' | 'tags' | null;
type AudioPick = { uri: string; name: string; mimeType: string };

const STICKERS = ['😀', '😂', '😍', '🔥', '👏', '💯', '🎉', '❤️', '😎', '🙏', '👍', '✨', '🎬', '🍿', '⭐', '😭', '🤣', '😮', '🥳', '💪', '🌍', '🎶', '👑', '🙌'];
const COLORS = ['#FFFFFF', '#72F06A', '#FFD34D', '#FF5C7A', '#4DA3FF', '#000000'];
const SOON_ROWS: { icon: IconName; title: string; reason: string }[] = [
  { icon: 'megaphone-outline', title: 'Boost reel', reason: 'It needs an advertising and payments system.' },
  { icon: 'time', title: 'Scheduling options', reason: 'It needs a scheduler on the backend.' },
];

const clamp = (value: number) => Math.max(0, Math.min(0.9, value));

function DragItem({ item, size, onMove, onRemove }: {
  item: EditItem;
  size: { w: number; h: number };
  onMove: (id: string, x: number, y: number) => void;
  onRemove: (id: string) => void;
}) {
  const latest = useRef({ item, size, onMove });
  latest.current = { item, size, onMove };
  const origin = useRef({ x: 0, y: 0 });
  const responder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => {
      origin.current = { x: latest.current.item.x, y: latest.current.item.y };
    },
    onPanResponderMove: (_event, gesture) => {
      const { size: box, item: current, onMove: move } = latest.current;
      if (box.w <= 0 || box.h <= 0) {
        return;
      }
      move(current.id, clamp(origin.current.x + gesture.dx / box.w), clamp(origin.current.y + gesture.dy / box.h));
    },
  })).current;
  return (
    <View {...responder.panHandlers} style={[styles.dragItem, { left: item.x * size.w, top: item.y * size.h }]}>
      <Text style={{ color: item.color, fontSize: item.kind === 'sticker' ? 56 : 26, fontWeight: '800', textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 4 }}>{item.value}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Remove" onPress={() => onRemove(item.id)} style={styles.dragRemove}>
        <Ionicons name="close" size={14} color="#FFFFFF" />
      </Pressable>
    </View>
  );
}

function SettingsRow({ icon, title, subtitle, onPress, right }: {
  icon: IconName;
  title: string;
  subtitle: string;
  onPress: () => void;
  right?: React.ReactNode;
}) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.settingsRow}>
      <View style={styles.settingsIcon}><Ionicons name={icon} size={22} color={theme.text} /></View>
      <View style={styles.settingsTextBlock}>
        <Text style={styles.settingsTitle}>{title}</Text>
        <Text style={styles.muted} numberOfLines={1}>{subtitle}</Text>
      </View>
      {right ?? <Ionicons name="chevron-forward" size={20} color={theme.secondaryText} />}
    </Pressable>
  );
}

export default function CreateReelScreen() {
  const auth = useAuth();
  const insets = useSafeAreaInsets();
  const [asset, setAsset] = useState<ImagePicker.ImagePickerAsset>();
  const [step, setStep] = useState<'edit' | 'settings'>('edit');
  const [menuOpen, setMenuOpen] = useState(false);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [thumb, setThumb] = useState<string>();
  const [position, setPosition] = useState(0);
  const [caption, setCaption] = useState('');
  const [visibility, setVisibility] = useState<ReelVisibility>('public');
  const [progress, setProgress] = useState<number>();
  const [error, setError] = useState<string>();
  const [retryUpload, setRetryUpload] = useState(false);
  const [items, setItems] = useState<EditItem[]>([]);
  const [filter, setFilter] = useState('none');
  const [trim, setTrim] = useState<{ start: number; end: number }>();
  const [audio, setAudio] = useState<AudioPick>();
  const [location, setLocation] = useState('');
  const [tags, setTags] = useState('');
  const [aiLabel] = useState(false);
  const [addToList, setAddToList] = useState(false);
  const [tagMatches, setTagMatches] = useState<Awaited<ReturnType<typeof searchUsers>>>([]);
  React.useEffect(() => {
    const token = tags.split(/\s+/).pop() ?? '';
    const q = token.replace(/^@/, '').replace(/[^\p{L}\p{N}_]/gu, '');
    if (!q) {
      setTagMatches([]);
      return undefined;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      searchUsers(q)
        .then((rows) => { if (!cancelled) setTagMatches(rows); })
        .catch(() => { if (!cancelled) setTagMatches([]); });
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [tags]);
  const pickTag = (username: string) => {
    const parts = tags.split(/\s+/).filter(Boolean);
    parts.pop();
    setTags(`${parts.length ? `${parts.join(' ')} ` : ''}@${username} `);
    setTagMatches([]);
  };
  React.useEffect(() => {
    playlistOnUpload.enabled = addToList;
    return () => { playlistOnUpload.enabled = false; };
  }, [addToList]);
  const [textDraft, setTextDraft] = useState('');
  const [textColor, setTextColor] = useState('#FFFFFF');
  const [box, setBox] = useState({ w: 0, h: 0 });
  const trimRef = useRef(trim);
  trimRef.current = trim;
  const durationSec = asset?.duration ? asset.duration / 1000 : 0;
  const totalSec = Math.floor(durationSec);
  const trimStart = trim?.start ?? 0;
  const trimEnd = trim?.end ?? totalSec;
  const tooLong = Boolean(asset?.duration && asset.duration > MAX_REEL_DURATION_SECONDS * 1000);
  const tint = REEL_FILTERS.find((entry) => entry.id === filter)?.color ?? '';

  const player = useVideoPlayer(asset?.uri ?? null, (videoPlayer) => {
    videoPlayer.loop = true;
    videoPlayer.timeUpdateEventInterval = 0.25;
    videoPlayer.play();
  });
  const audioPlayer = useVideoPlayer(audio?.uri ?? null, (audioInstance) => {
    audioInstance.loop = true;
  });

  useEffect(() => {
    if (step === 'edit' && asset) {
      player.play();
    } else {
      player.pause();
    }
  }, [step, asset, player]);

  useEffect(() => {
    player.muted = Boolean(audio);
    if (audio && step === 'edit' && asset) {
      audioPlayer.play();
    } else {
      audioPlayer.pause();
    }
  }, [audio, step, asset, player, audioPlayer]);

  useEffect(() => {
    const subscription = player.addListener('timeUpdate', ({ currentTime }) => {
      const range = trimRef.current;
      if (range && (currentTime < range.start - 0.4 || currentTime >= range.end)) {
        player.currentTime = range.start;
        return;
      }
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
        setTrim(undefined);
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

  const pickAudio = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: 'audio/*', copyToCacheDirectory: true, multiple: false });
      const picked = result.canceled ? undefined : result.assets[0];
      if (picked) {
        setAudio({ uri: picked.uri, name: picked.name, mimeType: picked.mimeType ?? 'audio/mpeg' });
      }
    } catch {
      Alert.alert('Audio', 'The audio picker could not be opened.');
    }
  };

  const audioTool = () => {
    if (!audio) {
      void pickAudio();
      return;
    }
    Alert.alert('Audio', audio.name, [
      { text: 'Change', onPress: () => void pickAudio() },
      { text: 'Remove', style: 'destructive', onPress: () => setAudio(undefined) },
      { text: 'Keep', style: 'cancel' },
    ]);
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
      const edits: ReelEdits = {};
      if (items.length) {
        edits.items = items.map((entry) => ({ id: entry.id, kind: entry.kind, value: entry.value, color: entry.color, x: entry.x, y: entry.y }));
      }
      if (filter !== 'none') {
        edits.filter = filter;
      }
      if (trim && (trim.start > 0 || trim.end < totalSec)) {
        edits.trim = trim;
      }
      if (location.trim()) {
        edits.location = location.trim();
      }
      if (tags.trim()) {
        edits.tags = tags.trim();
      }
      if (aiLabel) {
        edits.aiLabel = true;
      }
      await uploadReel(
        asset,
        { caption, hashtags, visibility, edits: Object.keys(edits).length ? edits : undefined, audio: audio ?? undefined },
        setProgress,
      );
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
      audioPlayer.pause();
    } else {
      player.play();
      if (audio) {
        audioPlayer.play();
      }
    }
  };

  const addItem = (kind: 'text' | 'sticker', value: string) => {
    setItems((current) => [...current, { id: `${Date.now()}-${current.length}`, kind, value, color: textColor, x: 0.3, y: 0.4 }]);
    setSheet(null);
  };
  const moveItem = (id: string, x: number, y: number) => {
    setItems((current) => current.map((entry) => (entry.id === id ? { ...entry, x, y } : entry)));
  };
  const removeItem = (id: string) => setItems((current) => current.filter((entry) => entry.id !== id));

  const changeTrim = (which: 'start' | 'end', delta: number) => {
    if (totalSec < 2) {
      return;
    }
    let start = trim?.start ?? 0;
    let end = trim?.end ?? totalSec;
    if (which === 'start') {
      start = Math.max(0, Math.min(end - 1, start + delta));
    } else {
      end = Math.min(totalSec, Math.max(start + 1, end + delta));
    }
    setTrim({ start, end });
  };

  const saveInfo = () => Alert.alert('Save', 'Your video is already on your phone. Your edits are applied inside Geniuzplus when people watch.');
  const notAvailable = (title: string, reason?: string) => Alert.alert(title, `Not available yet. ${reason ?? ''}`.trim());

  const menuActions: { icon: IconName; title: string; run: () => void }[] = [
    { icon: 'download-outline', title: 'Save', run: saveInfo },
    { icon: 'add-circle-outline', title: 'Upload audio description', run: () => notAvailable('Audio description') },
    { icon: 'add-circle-outline', title: 'Upload text transcript', run: () => notAvailable('Text transcript') },
    { icon: 'bug-outline', title: 'Report a problem', run: () => { void Linking.openURL('mailto:geniuzplus@gmail.com?subject=Geniuz%2B%20Reel%20problem').catch(() => undefined); } },
  ];

  const renderSheet = () => (
    <Modal visible={sheet !== null} transparent animationType="slide" onRequestClose={() => setSheet(null)}>
      <KeyboardAvoidingView behavior="padding" style={styles.sheetShade}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" style={styles.sheetBackdrop} onPress={() => setSheet(null)} />
        <View style={[styles.sheetCard, { paddingBottom: Math.max(insets.bottom, 12) + 14 }]}>
          {sheet === 'text' ? (
            <>
              <Text style={styles.sheetTitle}>Add text</Text>
              <TextInput value={textDraft} onChangeText={setTextDraft} placeholder="Type your text" placeholderTextColor="#9AA3AF" style={styles.sheetInput} maxLength={80} autoFocus />
              <View style={styles.colorRow}>
                {COLORS.map((color) => (
                  <Pressable key={color} accessibilityRole="button" accessibilityLabel={`Colour ${color}`} onPress={() => setTextColor(color)} style={[styles.colorDot, { backgroundColor: color }, textColor === color && styles.colorDotOn]} />
                ))}
              </View>
              <Pressable accessibilityRole="button" disabled={!textDraft.trim()} onPress={() => { addItem('text', textDraft.trim()); setTextDraft(''); }} style={[styles.sheetButton, !textDraft.trim() && styles.disabled]}>
                <Text style={styles.sheetButtonText}>Add</Text>
              </Pressable>
            </>
          ) : null}
          {sheet === 'stickers' ? (
            <>
              <Text style={styles.sheetTitle}>Stickers</Text>
              <View style={styles.stickerGrid}>
                {STICKERS.map((sticker) => (
                  <Pressable key={sticker} accessibilityRole="button" onPress={() => addItem('sticker', sticker)} style={styles.stickerCell}>
                    <Text style={styles.stickerText}>{sticker}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          ) : null}
          {sheet === 'trim' ? (
            <>
              <Text style={styles.sheetTitle}>Trim</Text>
              <Text style={styles.sheetHint}>{totalSec < 2 ? 'This video is too short to trim.' : `Video length ${totalSec} seconds. People will only see the part you keep.`}</Text>
              {(['start', 'end'] as const).map((which) => (
                <View key={which} style={styles.stepRow}>
                  <Text style={styles.stepLabel}>{which === 'start' ? 'Start' : 'End'}: {which === 'start' ? trimStart : trimEnd}s</Text>
                  <Pressable accessibilityRole="button" accessibilityLabel={`Less ${which}`} onPress={() => changeTrim(which, -1)} style={styles.stepBtn}><Ionicons name="remove" size={22} color="#FFFFFF" /></Pressable>
                  <Pressable accessibilityRole="button" accessibilityLabel={`More ${which}`} onPress={() => changeTrim(which, 1)} style={styles.stepBtn}><Ionicons name="add" size={22} color="#FFFFFF" /></Pressable>
                </View>
              ))}
              <View style={styles.stepRow}>
                <Pressable accessibilityRole="button" onPress={() => setTrim(undefined)} style={[styles.sheetButton, styles.sheetButtonGhost]}><Text style={styles.sheetButtonText}>Reset</Text></Pressable>
                <Pressable accessibilityRole="button" onPress={() => setSheet(null)} style={styles.sheetButton}><Text style={styles.sheetButtonText}>Done</Text></Pressable>
              </View>
            </>
          ) : null}
          {sheet === 'effects' ? (
            <>
              <Text style={styles.sheetTitle}>Effects</Text>
              <View style={styles.chipRow}>
                {REEL_FILTERS.map((entry) => (
                  <Pressable key={entry.id} accessibilityRole="button" onPress={() => { setFilter(entry.id); setSheet(null); }} style={[styles.chip, filter === entry.id && styles.chipOn]}>
                    <Text style={[styles.chipText, filter === entry.id && styles.chipTextOn]}>{entry.label}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          ) : null}
          {sheet === 'location' ? (
            <>
              <Text style={styles.sheetTitle}>Location</Text>
              <TextInput value={location} onChangeText={setLocation} placeholder="Type a place name" placeholderTextColor="#9AA3AF" style={styles.sheetInput} maxLength={60} autoFocus />
              <Pressable accessibilityRole="button" onPress={() => setSheet(null)} style={styles.sheetButton}><Text style={styles.sheetButtonText}>Done</Text></Pressable>
            </>
          ) : null}
          {sheet === 'tags' ? (
            <>
              <Text style={styles.sheetTitle}>Tag people</Text>
              <TextInput value={tags} onChangeText={setTags} placeholder="@username @another" placeholderTextColor="#9AA3AF" style={styles.sheetInput} maxLength={80} autoCapitalize="none" autoFocus />
              {tagMatches.length ? (
                <View style={{ maxHeight: 220 }}>
                  <ScrollView keyboardShouldPersistTaps="handled">
                    {tagMatches.map((user) => (
                      <Pressable key={user.id} accessibilityRole="button" onPress={() => pickTag(user.username)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 }}>
                        <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: '#2A2F38', alignItems: 'center', justifyContent: 'center' }}>
                          <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>{(user.display_name || user.username).charAt(0).toUpperCase()}</Text>
                        </View>
                        <View>
                          <Text style={{ color: '#FFFFFF', fontWeight: '600' }}>{user.display_name}</Text>
                          <Text style={{ color: '#9AA3AF' }}>@{user.username}</Text>
                        </View>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              ) : null}
              <Pressable accessibilityRole="button" onPress={() => setSheet(null)} style={styles.sheetButton}><Text style={styles.sheetButtonText}>Done</Text></Pressable>
            </>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );

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
    const tools: { icon?: IconName; label: string; text?: string; run: () => void }[] = [
      { icon: 'musical-notes', label: 'Audio', run: audioTool },
      { icon: 'cut-outline', label: 'Edit', run: () => setSheet('trim') },
      { icon: 'color-wand-outline', label: 'Effects', run: () => setSheet('effects') },
      { text: 'Aa', label: 'Text', run: () => setSheet('text') },
      { icon: 'happy-outline', label: 'Stickers', run: () => setSheet('stickers') },
    ];
    return (
      <SafeAreaView style={styles.editRoot}>
        <View style={styles.editTop}>
          <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={() => setAsset(undefined)} style={styles.iconButton}>
            <Ionicons name="chevron-back" size={26} color="#FFFFFF" />
          </Pressable>
          <Pressable accessibilityRole="button" onPress={audioTool} style={styles.audioPill}>
            <View style={styles.audioPillIcon}><Ionicons name="musical-notes" size={20} color="#FFFFFF" /></View>
            <View style={styles.audioPillText}>
              <Text style={styles.audioPillTitle}>{audio ? 'Audio added' : 'Add audio'}</Text>
              <Text style={styles.audioPillSub} numberOfLines={1}>{audio ? audio.name : 'Pick a song from your phone'}</Text>
            </View>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="More options" onPress={() => setMenuOpen(true)} style={styles.iconButton}>
            <Ionicons name="ellipsis-horizontal" size={24} color="#FFFFFF" />
          </Pressable>
        </View>
        <View style={styles.previewWrap} onLayout={(event) => setBox({ w: event.nativeEvent.layout.width, h: event.nativeEvent.layout.height })}>
          <Pressable accessibilityRole="button" accessibilityLabel="Pause or play preview" onPress={togglePlay} style={StyleSheet.absoluteFill}>
            <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls={false} allowsPictureInPicture={false} />
          </Pressable>
          {tint ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: tint }]} /> : null}
          {items.map((entry) => (
            <DragItem key={entry.id} item={entry} size={box} onMove={moveItem} onRemove={removeItem} />
          ))}
        </View>
        <View style={styles.editTrack}><View style={[styles.editFill, { width: `${Math.round(position * 100)}%` }]} /></View>
        {tooLong ? <Text style={[styles.error, styles.editError]}>This video is longer than {MAX_REEL_DURATION_SECONDS} seconds. Go back and choose a shorter one.</Text> : null}
        <View style={styles.toolsRow}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.toolsScroll} contentContainerStyle={styles.toolsContent}>
            {tools.map((tool) => (
              <Pressable key={tool.label} accessibilityRole="button" onPress={tool.run} style={styles.tool}>
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
              {menuActions.map((item, index) => (
                <Pressable key={item.title} accessibilityRole="button" onPress={() => { setMenuOpen(false); item.run(); }} style={[styles.menuItem, index > 0 && styles.menuItemBorder]}>
                  <Ionicons name={item.icon} size={24} color="#FFFFFF" />
                  <Text style={styles.menuText}>{item.title}</Text>
                </Pressable>
              ))}
            </View>
          </Pressable>
        </Modal>
        {renderSheet()}
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
        <SettingsRow icon="location" title="Location" subtitle={location || 'Add a place name'} onPress={() => setSheet('location')} />
        <SettingsRow icon="pricetag" title="Tag people" subtitle={tags || 'Add @usernames'} onPress={() => setSheet('tags')} />
        <SettingsRow icon={addToList ? 'checkmark-circle' : 'list'} title="Add to playlist" subtitle={addToList ? 'On: this reel will be saved to your playlist' : 'Off'} onPress={() => setAddToList(!addToList)} />
        {SOON_ROWS.map((row) => (
          <SettingsRow key={row.title} icon={row.icon} title={row.title} subtitle="Not available yet" onPress={() => notAvailable(row.title, row.reason)} />
        ))}
        <SettingsRow icon="globe-outline" title="Who can see this?" subtitle={visibility === 'public' ? 'Public' : 'Followers'} onPress={chooseVisibility} />
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
          <Pressable accessibilityRole="button" accessibilityLabel="Save" onPress={saveInfo} style={styles.saveButton}>
            <Ionicons name="download-outline" size={22} color={theme.text} />
          </Pressable>
          <Pressable accessibilityRole="button" disabled={tooLong || typeof progress === 'number'} onPress={() => void shareNow()} style={[styles.shareButton, (tooLong || typeof progress === 'number') && styles.disabled]}>
            <Text style={styles.shareText}>{!auth.session ? 'Sign in to share' : 'Share now'}</Text>
          </Pressable>
        </View>
      </View>
      {renderSheet()}
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
  audioPillText: { flex: 1 },
  audioPillTitle: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  audioPillSub: { color: '#C9CDD2', fontSize: 12 },
  previewWrap: { backgroundColor: '#000000', flex: 1, overflow: 'hidden' },
  dragItem: { alignItems: 'flex-start', flexDirection: 'row', position: 'absolute' },
  dragRemove: { alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: 10, height: 20, justifyContent: 'center', width: 20 },
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
  sheetShade: { flex: 1, justifyContent: 'flex-end' },
  sheetBackdrop: { backgroundColor: 'rgba(0,0,0,0.45)', flex: 1 },
  sheetCard: { backgroundColor: '#1A1D23', borderTopLeftRadius: 20, borderTopRightRadius: 20, gap: 14, padding: 18 },
  sheetTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '800' },
  sheetHint: { color: '#9AA3AF', fontSize: 13, lineHeight: 18 },
  sheetInput: { backgroundColor: '#0E1014', borderColor: '#2A2D33', borderRadius: 10, borderWidth: 1, color: '#FFFFFF', fontSize: 16, minHeight: 48, paddingHorizontal: 12 },
  sheetButton: { alignItems: 'center', backgroundColor: theme.accent, borderRadius: 10, flex: 1, justifyContent: 'center', minHeight: 48 },
  sheetButtonGhost: { backgroundColor: '#2A2D33' },
  sheetButtonText: { color: '#0E1014', fontSize: 15, fontWeight: '900' },
  colorRow: { flexDirection: 'row', gap: 12 },
  colorDot: { borderColor: '#555555', borderRadius: 16, borderWidth: 2, height: 32, width: 32 },
  colorDotOn: { borderColor: '#FFFFFF', borderWidth: 3 },
  stickerGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  stickerCell: { alignItems: 'center', height: 52, justifyContent: 'center', width: 52 },
  stickerText: { fontSize: 32 },
  stepRow: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  stepLabel: { color: '#FFFFFF', flex: 1, fontSize: 16, fontWeight: '700' },
  stepBtn: { alignItems: 'center', backgroundColor: '#2A2D33', borderRadius: 22, height: 44, justifyContent: 'center', width: 44 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  chip: { backgroundColor: '#2A2D33', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10 },
  chipOn: { backgroundColor: theme.accent },
  chipText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  chipTextOn: { color: '#0E1014' },
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
