import { Ionicons } from '@expo/vector-icons';
import { VideoView, useVideoPlayer } from 'expo-video';
import { ReelEditsOverlay } from './ReelEditsOverlay';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as Linking from 'expo-linking';
import * as Clipboard from 'expo-clipboard';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Animated,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ListRenderItemInfo,
  type ViewToken,
} from 'react-native';

import type { ReelFeedItem } from '../models/reel';
import { VerifiedBadge } from './VerifiedBadge';
import {
  addReelComment,
  deleteReel,
  loadReelComments,
  recordReelWatch,
  reportReel,
  setReelInterest,
  toggleReelRelation,
  addToPlaylist,
  updateReel,
} from '../services/ReelsRepository';
import { theme } from '../theme';

type ShortsFeedProps = {
  items: ReelFeedItem[];
  height: number;
  onBack: () => void;
  initialReelId?: string;
};

function ShortVideo({ item, height, isActive, onHide, onFinished }: {
  onFinished?: () => void;
  item: ReelFeedItem;
  height: number;
  isActive: boolean;
  onHide: (id: string) => void;
}) {
  const player = useVideoPlayer(null, (videoPlayer) => {
    videoPlayer.timeUpdateEventInterval = 0.25;
    videoPlayer.loop = true;
  });
  const [error, setError] = useState<string>();
  const [progress, setProgress] = useState(0);
  const [currentItem, setCurrentItem] = useState(item);
  const [commentText, setCommentText] = useState('');
  const [commentOpen, setCommentOpen] = useState(false);
  const [comments, setComments] = useState<{ id: string; displayName: string; body: string }[]>([]);
  const [editingCaption, setEditingCaption] = useState(false);
  const [menuActions, setMenuActions] = useState<{ text: string; style?: string | undefined; onPress?: (() => void) | undefined }[] | null>(null);
  const [captionDraft, setCaptionDraft] = useState(item.caption);
  const [busy, setBusy] = useState(false);
  const lastReportedInterval = useRef(0);
  const lastTapRef = useRef(0);
  const finishedRef = useRef(onFinished);
  finishedRef.current = onFinished;
  useEffect(() => {
    if (!isActive) {
      return undefined;
    }
    let loops = 0;
    let last = 0;
    try {
      if (!player.timeUpdateEventInterval) {
        player.timeUpdateEventInterval = 0.25;
      }
    } catch { /* player already released */ }
    const loopSub = player.addListener('timeUpdate', ({ currentTime }) => {
      if (last - currentTime > 0.5) {
        loops += 1;
        if (loops >= 2) {
          loops = 0;
          finishedRef.current?.();
        }
      }
      last = currentTime;
    });
    return () => safeRemove(loopSub);
  }, [isActive, item.id, player]);
  const audioPlayer = useVideoPlayer(null, (audioInstance) => {
    audioInstance.loop = true;
  });
  const trimStart = item.edits?.trim?.start ?? 0;
  const trimEnd = item.edits?.trim?.end ?? 0;
  useEffect(() => {
    if (!trimStart && !trimEnd) {
      return undefined;
    }
    const trimSub = player.addListener('timeUpdate', ({ currentTime }) => {
      if (currentTime < trimStart - 0.4 || (trimEnd > 0 && currentTime >= trimEnd)) {
        player.currentTime = trimStart;
      }
    });
    return () => safeRemove(trimSub);
  }, [player, trimStart, trimEnd]);
  const reelAudioUrl = item.audioUrl;
  useEffect(() => {
    if (!reelAudioUrl) {
      return undefined;
    }
    player.muted = true;
    return () => { safeUnmute(player); };
  }, [reelAudioUrl, player]);
  useEffect(() => {
    if (!reelAudioUrl || !isActive) {
      safePause(audioPlayer);
      return undefined;
    }
    let live = true;
    void audioPlayer.replaceAsync(reelAudioUrl).then(() => { if (live) { safePlay(audioPlayer); } }).catch(() => undefined);
    return () => { live = false; safePause(audioPlayer); };
  }, [reelAudioUrl, isActive, audioPlayer]);
  const insets = useSafeAreaInsets();
  const heartScale = useRef(new Animated.Value(0)).current;
  const heartOpacity = useRef(new Animated.Value(0)).current;
  const showHeart = () => {
    heartScale.setValue(0.4);
    heartOpacity.setValue(1);
    Animated.parallel([
      Animated.spring(heartScale, { toValue: 1.2, friction: 4, useNativeDriver: true }),
      Animated.sequence([
        Animated.delay(450),
        Animated.timing(heartOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]),
    ]).start();
  };
  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => {
    if (tapTimerRef.current) {
      clearTimeout(tapTimerRef.current);
    }
  }, []);
  const isLegacy = item.id.startsWith('catalog:');

  useEffect(() => {
    if (!isActive) {
      safePause(player);
      return undefined;
    }
    let active = true;
    void player.replaceAsync(item.videoUrl).then(() => {
      if (active) {
        setError(undefined);
        safePlay(player);
      }
    }).catch(() => active && setError('This Reel could not be played. Retry to try again.'));
    return () => {
      active = false;
      safePause(player);
    };
  }, [isActive, item.id, item.videoUrl, player]);

  useEffect(() => {
    const timeSubscription = player.addListener('timeUpdate', ({ currentTime }) => {
      const duration = player.duration;
      if (duration > 0) {
        setProgress(Math.min(100, currentTime / duration * 100));
      }
      const watchedInterval = Math.floor(currentTime / 20);
      if (isActive && !isLegacy && watchedInterval > lastReportedInterval.current) {
        lastReportedInterval.current = watchedInterval;
        void recordReelWatch(item.id, 20).catch(() => undefined);
      }
    });
    return () => timeSubscription.remove();
  }, [isActive, isLegacy, item.id, player]);

  const runAction = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await action();
    } catch (actionError) {
      Alert.alert('Reels', actionError instanceof Error ? actionError.message : 'This action could not be completed.');
    } finally {
      setBusy(false);
    }
  };

  const toggleLike = () => isLegacy
    ? Alert.alert('Like', 'Coming soon')
    : void runAction(async () => {
        const next = !currentItem.isLiked;
        await toggleReelRelation('reel_likes', item.id, next);
        setCurrentItem((value) => ({ ...value, isLiked: next, likeCount: value.likeCount + (next ? 1 : -1) }));
      });

  const toggleSave = () => isLegacy
    ? Alert.alert('Save Reel', 'Coming soon')
    : void runAction(async () => {
        const next = !currentItem.isSaved;
        await toggleReelRelation('reel_saves', item.id, next);
        setCurrentItem((value) => ({ ...value, isSaved: next }));
      });

  const addPlaylist = () => isLegacy
    ? Alert.alert('Playlist', 'Coming soon')
    : void runAction(async () => {
        await addToPlaylist(item.id);
        Alert.alert('Playlist', 'Added to your playlist.');
      });

  const toggleFollow = () => isLegacy
    ? Alert.alert('Follow creator', 'Coming soon')
    : void runAction(async () => {
        const next = !currentItem.isFollowing;
        await toggleReelRelation('reel_follows', item.userId, next);
        setCurrentItem((value) => ({ ...value, isFollowing: next }));
      });

  const openComments = () => {
    if (isLegacy) {
      Alert.alert('Comments', 'Coming soon');
      return;
    }
    setCommentOpen(true);
    void loadReelComments(item.id).then(setComments).catch((loadError: unknown) => {
      Alert.alert('Comments', loadError instanceof Error ? loadError.message : 'Comments could not be loaded.');
    });
  };

  const submitComment = () => void runAction(async () => {
    await addReelComment(item.id, commentText);
    setComments((current) => [...current, { id: `${Date.now()}`, displayName: 'You', body: commentText.trim() }]);
    setCurrentItem((value) => ({ ...value, commentCount: value.commentCount + 1 }));
    setCommentText('');
  });

  const openMore = () => {
    const actions = [
      { text: 'Interested', onPress: () => void runAction(() => setReelInterest(item.id, true)) },
      { text: 'Not interested', onPress: () => { void runAction(() => setReelInterest(item.id, false)); onHide(item.id); } },
      { text: currentItem.isSaved ? 'Remove saved Reel' : 'Save Reel', onPress: toggleSave },
      { text: 'Copy link', onPress: () => void Clipboard.setStringAsync(Linking.createURL('shorts', { queryParams: { reelId: item.id } })).then(() => Alert.alert('Reels', 'Link copied.')) },
      ...(!isLegacy ? [{ text: 'Report', onPress: () => void runAction(() => reportReel(item.id, 'Reported by user')) }] : []),
      ...(currentItem.isOwner ? [
        { text: 'Edit caption', onPress: () => { setCaptionDraft(currentItem.caption); setEditingCaption(true); } },
        { text: currentItem.allowComments ? 'Turn comments off' : 'Turn comments on', onPress: () => void runAction(async () => { await updateReel(item.id, { allow_comments: !currentItem.allowComments }); setCurrentItem((value) => ({ ...value, allowComments: !value.allowComments })); }) },
        { text: 'Delete Reel', style: 'destructive' as const, onPress: () => Alert.alert('Delete Reel?', 'This removes the video and its engagement data.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => void runAction(() => deleteReel(item.id)).then(() => onHide(item.id)) }]) },
      ] : []),
      { text: 'Cancel', style: 'cancel' as const },
    ];
    setMenuActions(actions.filter((action) => action.style !== 'cancel'));
  };

  const handleVideoTap = () => {
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      lastTapRef.current = 0;
      if (tapTimerRef.current) {
        clearTimeout(tapTimerRef.current);
      }
      showHeart();
      if (!currentItem.isLiked) {
        void toggleLike();
      }
      return;
    }
    lastTapRef.current = now;
    tapTimerRef.current = setTimeout(() => {
      if (player.playing) {
        safePause(player);
        safePause(audioPlayer);
      } else {
        safePlay(player);
        if (item.audioUrl) {
          safePlay(audioPlayer);
        }
      }
    }, 300);
  };

  return (
    <View style={[styles.videoPage, { height }]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Pause or play Reel" onPress={handleVideoTap} style={StyleSheet.absoluteFill}><VideoView accessibilityLabel={`Reel by ${currentItem.creatorName}`} player={player} style={StyleSheet.absoluteFill} contentFit="cover" surfaceType="textureView" nativeControls={false} allowsPictureInPicture={false} /></Pressable>
      <ReelEditsOverlay edits={currentItem.edits} />
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', opacity: heartOpacity, transform: [{ scale: heartScale }] }]}>
        <Ionicons name="heart" size={110} color="#FF3B5C" />
      </Animated.View>
      {!player.status || player.status === 'loading' ? <ActivityIndicator color={theme.accent} /> : null}
      {error ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable accessibilityRole="button" onPress={() => void player.replaceAsync(item.videoUrl).then(() => safePlay(player)).catch(() => undefined)} style={styles.retryButton}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : null}
      <View style={styles.actionColumn}>
        <Pressable accessibilityRole="button" accessibilityLabel="Like Reel" onPress={toggleLike} style={styles.action}>
          <Ionicons name={currentItem.isLiked ? 'heart' : 'heart-outline'} size={28} color={currentItem.isLiked ? '#FF5A77' : '#FFFFFF'} />
          <Text style={styles.actionCount}>{currentItem.likeCount}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Comment on Reel" onPress={openComments} style={styles.action}>
          <Ionicons name="chatbubble-ellipses-outline" size={26} color="#FFFFFF" />
          <Text style={styles.actionCount}>{currentItem.commentCount}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Share Reel" onPress={() => void Share.share({ message: `Watch ${currentItem.creatorName}'s Reel on Geniuzplus: ${Linking.createURL('shorts', { queryParams: { reelId: item.id } })}` })} style={styles.action}>
          <Ionicons name="paper-plane-outline" size={25} color="#FFFFFF" />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Save Reel" onPress={toggleSave} style={styles.action}>
          <Ionicons name={currentItem.isSaved ? 'bookmark' : 'bookmark-outline'} size={25} color="#FFFFFF" />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Add to playlist" onPress={addPlaylist} style={styles.action}>
          <Ionicons name="list" size={26} color="#FFFFFF" />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="More Reel options" onPress={openMore} style={styles.action}>
          <Ionicons name="ellipsis-horizontal" size={27} color="#FFFFFF" />
        </Pressable>
      </View>
      <View style={styles.caption}>
        <View style={styles.creatorRow}>
          <Pressable accessibilityRole="button" onPress={() => currentItem.userId && router.push({ pathname: '/reels/profile/[id]', params: { id: currentItem.userId } })} style={styles.creatorLink}>
            <View style={styles.creatorAvatar}>{currentItem.avatarUrl ? <Image source={{ uri: currentItem.avatarUrl }} style={styles.creatorAvatarImage} /> : <Text style={styles.avatarInitial}>{currentItem.creatorName.slice(0, 1).toUpperCase()}</Text>}</View>
            <View style={styles.creatorTextBlock}>
              <View style={styles.creatorNameRow}>
                <Text style={styles.creatorName} numberOfLines={1}>{currentItem.creatorName}</Text>
                <View style={{ opacity: currentItem.isMember ? 1 : 0.35 }}><VerifiedBadge /></View>
              </View>
              <Text style={styles.creatorHandle} numberOfLines={1}>@{currentItem.creatorUsername}</Text>
            </View>
          </Pressable>
          {!currentItem.isFollowing && !currentItem.isOwner ? <Pressable accessibilityRole="button" onPress={toggleFollow} style={styles.followButton}><Text style={styles.followText}>Follow</Text></Pressable> : null}
        </View>
        <Text style={styles.title} numberOfLines={3}>{currentItem.caption || currentItem.creatorName}</Text>
        {currentItem.hashtags.length ? <Text style={styles.description} numberOfLines={1}>{currentItem.hashtags.map((tag) => `#${tag}`).join(' ')}</Text> : null}
        {currentItem.isOwner && !currentItem.isMember ? (
          <Pressable accessibilityRole="button" onPress={() => router.push('/membership')} style={styles.membershipCta}>
            <Text style={styles.membershipCtaText}>Become a member to start earning</Text>
          </Pressable>
        ) : null}
      </View>
      <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${progress}%` }]} /></View>
      <Modal visible={menuActions !== null} transparent animationType="fade" onRequestClose={() => setMenuActions(null)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }} onPress={() => setMenuActions(null)}>
          <View style={{ backgroundColor: theme.surface, borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '70%', paddingBottom: 16 }}>
            <ScrollView>
              {(menuActions ?? []).map((action) => (
                <Pressable
                  key={action.text}
                  accessibilityRole="button"
                  onPress={() => { setMenuActions(null); action.onPress?.(); }}
                  style={{ paddingHorizontal: 20, paddingVertical: 14 }}
                >
                  <Text style={{ color: action.style === 'destructive' ? '#FF5C5C' : theme.text, fontSize: 16, fontWeight: '600' }}>{action.text}</Text>
                </Pressable>
              ))}
              <Pressable accessibilityRole="button" onPress={() => setMenuActions(null)} style={{ paddingHorizontal: 20, paddingVertical: 14 }}>
                <Text style={{ color: theme.text, fontSize: 16, fontWeight: '600' }}>Cancel</Text>
              </Pressable>
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
      <Modal visible={commentOpen || editingCaption} transparent animationType="slide" onRequestClose={() => { setCommentOpen(false); setEditingCaption(false); }}>
        <KeyboardAvoidingView behavior="padding" style={styles.modalShade}>
          <View style={[styles.modalSheet, { paddingBottom: Math.max(insets.bottom, 12) + 12 }]}>
            <View style={styles.modalHeading}><Text style={styles.modalTitle}>{editingCaption ? 'Edit caption' : 'Comments'}</Text><Pressable onPress={() => { setCommentOpen(false); setEditingCaption(false); }}><Ionicons name="close" size={22} color={theme.text} /></Pressable></View>
            {editingCaption ? <TextInput multiline value={captionDraft} onChangeText={setCaptionDraft} style={styles.commentInput} placeholder="Write a caption" placeholderTextColor={theme.secondaryText} /> : <FlatList data={comments} keyExtractor={(entry) => entry.id} renderItem={({ item: entry }) => <Text style={styles.commentLine}><Text style={styles.commentAuthor}>{entry.displayName} </Text>{entry.body}</Text>} ListEmptyComponent={<Text style={styles.modalEmpty}>No comments yet.</Text>} style={styles.commentList} />}
            <View style={styles.commentComposer}><TextInput value={editingCaption ? captionDraft : commentText} onChangeText={editingCaption ? setCaptionDraft : setCommentText} style={styles.commentInput} placeholder={editingCaption ? 'Write a caption' : 'Add a comment'} placeholderTextColor={theme.secondaryText} /><Pressable disabled={busy || (!editingCaption && !commentText.trim())} onPress={() => editingCaption ? void runAction(async () => { await updateReel(item.id, { caption: captionDraft.trim() }); setCurrentItem((value) => ({ ...value, caption: captionDraft.trim() })); setEditingCaption(false); }) : submitComment()}><Text style={styles.postComment}>{editingCaption ? 'Save' : 'Post'}</Text></Pressable></View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

export function ShortsFeed({ items, height, onBack, initialReelId }: ShortsFeedProps) {
  const [hiddenIds, setHiddenIds] = useState<string[]>([]);
  const [activeIndex, setActiveIndex] = useState(() => Math.max(0, items.findIndex((item) => item.id === initialReelId)));
  const visibleItems = useMemo(() => items.filter((item) => !hiddenIds.includes(item.id)), [hiddenIds, items]);
  const onViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const visible = viewableItems.find((token) => token.isViewable);
    if (typeof visible?.index === 'number') {
      setActiveIndex(visible.index);
    }
  }, []);
  const viewabilityConfig = useMemo(() => ({ itemVisiblePercentThreshold: 80 }), []);
  const listRef = useRef<FlatList>(null);
  const goNext = () => {
    // loop back to the first reel
    if (activeIndex + 1 >= visibleItems.length) {
      setActiveIndex(0);
      listRef.current?.scrollToOffset({ offset: 0, animated: false });
      return;
    }
    listRef.current?.scrollToOffset({ offset: (activeIndex + 1) * height, animated: true });
  };
  const renderItem = useCallback(({ item, index }: ListRenderItemInfo<ReelFeedItem>) => (
    <ShortVideo item={item} height={height} isActive={index === activeIndex} onFinished={goNext} onHide={(id) => setHiddenIds((current) => [...current, id])} />
  ), [activeIndex, height]);

  return (
    <View style={styles.container}>
      <FlatList
        data={visibleItems}
        initialScrollIndex={Math.min(activeIndex, Math.max(0, visibleItems.length - 1))}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        pagingEnabled
        ref={listRef}
        snapToInterval={height}
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        getItemLayout={(_data, index) => ({ length: height, offset: height * index, index })}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        windowSize={3}
        initialNumToRender={1}
        maxToRenderPerBatch={2}
        removeClippedSubviews
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back from Reels"
        onPress={onBack}
        style={styles.backButton}
      >
        <Ionicons name="arrow-back" size={22} color={theme.text} />
      </Pressable>
      <Text style={styles.counter}>{visibleItems.length ? `${activeIndex + 1} / ${visibleItems.length}` : ''}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },
  videoPage: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#000000' },
  backButton: {
    position: 'absolute',
    top: 12,
    left: 14,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1A1D23CC',
  },
  counter: { position: 'absolute', top: 25, right: 18, color: theme.text, fontSize: 13, fontWeight: '700' },
  actionColumn: { position: 'absolute', right: 14, bottom: 112, alignItems: 'center', gap: 17 },
  action: { alignItems: 'center', gap: 3, minWidth: 42 },
  actionCount: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
  caption: { position: 'absolute', bottom: 30, left: 18, right: 78, gap: 8 },
  creatorRow: { alignItems: 'center', flexDirection: 'row', gap: 9 },
  creatorLink: { alignItems: 'center', flexDirection: 'row', flex: 1, gap: 7 },
  creatorAvatar: { overflow: 'hidden', alignItems: 'center', backgroundColor: theme.accent, borderRadius: 18, height: 34, justifyContent: 'center', width: 34 },
  avatarInitial: { color: theme.background, fontSize: 14, fontWeight: '900' },
  creatorAvatarImage: { borderRadius: 17, height: '100%', width: '100%' },
  creatorTextBlock: { flexShrink: 1, justifyContent: 'center' },
  creatorNameRow: { alignItems: 'center', flexDirection: 'row', gap: 4 },
  creatorHandle: { color: '#FFFFFF', fontSize: 11, fontWeight: '600', marginTop: 1, opacity: 0.7 },
  creatorName: { color: '#FFFFFF', flexShrink: 1, fontSize: 13, fontWeight: '800' },
  followButton: { borderColor: '#FFFFFF', borderRadius: 6, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 5 },
  followText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
  title: { color: '#FFFFFF', fontSize: 20, fontWeight: '800' },
  description: { color: '#FFFFFF', fontSize: 14, lineHeight: 20 },
  membershipCta: { alignSelf: 'flex-start', backgroundColor: theme.accent, borderRadius: 8, paddingHorizontal: 11, paddingVertical: 8 },
  membershipCtaText: { color: theme.background, fontSize: 12, fontWeight: '900' },
  progressTrack: { position: 'absolute', bottom: 0, height: 2, left: 0, right: 0, backgroundColor: '#FFFFFF55' },
  progressFill: { height: '100%', backgroundColor: theme.accent },
  createButton: { position: 'absolute', top: 12, right: 14, width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.accent },
  modalShade: { backgroundColor: '#00000088', flex: 1, justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: theme.surface, borderTopLeftRadius: 16, borderTopRightRadius: 16, height: '62%', padding: 16 },
  modalHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 },
  modalTitle: { color: theme.text, fontSize: 17, fontWeight: '800' },
  commentList: { flex: 1 },
  commentLine: { color: theme.text, fontSize: 13, lineHeight: 20, paddingVertical: 7 },
  commentAuthor: { fontWeight: '800' },
  modalEmpty: { color: theme.secondaryText, paddingVertical: 20 },
  commentComposer: { alignItems: 'center', borderTopColor: theme.border, borderTopWidth: 1, flexDirection: 'row', gap: 10, paddingTop: 10 },
  commentInput: { backgroundColor: theme.background, borderColor: theme.border, borderRadius: 10, borderWidth: 1, color: theme.text, flex: 1, maxHeight: 110, minHeight: 42, paddingHorizontal: 12, paddingVertical: 9 },
  postComment: { color: theme.accent, fontWeight: '800', paddingHorizontal: 6 },
  errorCard: { alignItems: 'center', gap: 14, padding: 24, maxWidth: 320 },
  errorText: { color: theme.text, fontSize: 15, textAlign: 'center' },
  retryButton: { minHeight: 42, justifyContent: 'center', paddingHorizontal: 18, borderRadius: 8, backgroundColor: theme.accent },
  retryText: { color: theme.background, fontWeight: '800' },
});

function safePause(p: { pause: () => void }) { try { p.pause(); } catch { /* player already released */ } }
function safePlay(p: { play: () => void }) { try { p.play(); } catch { /* player already released */ } }
function safeRemove(sub: { remove: () => void }) { try { sub.remove(); } catch { /* already released */ } }
function safeUnmute(p: { muted: boolean }) { try { p.muted = false; } catch { /* already released */ } }
