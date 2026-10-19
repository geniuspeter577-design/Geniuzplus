import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { File } from 'expo-file-system';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ContentNotice } from '../../src/components/ContentNotice';
import { DeviceTransferPanel } from '../../src/components/downloads/DeviceTransferPanel';
import { formatBytes, type OfflineDownloadRecord } from '../../src/services/OfflineDownloadService';
import { useStudyMode } from '../../src/state/StudyModeContext';
import { useDownloads } from '../../src/state/DownloadsContext';
import { useLibrary } from '../../src/state/LibraryContext';
import { useNetwork } from '../../src/state/NetworkContext';
import { theme } from '../../src/theme';
import { getMeScreenData } from '../../src/utils/meScreen';
import { formatFileSize } from '../../src/utils/formatFileSize.cjs';

type DownloadTab = 'geniuz' | 'local' | 'received';
type LocalVideo = { id: string; uri: string; title: string; duration: number; size: number; thumbnail?: string };

function formatDuration(durationMs: number) {
  const totalSeconds = Math.floor(durationMs / 1000);
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')}`;
}

const tabs: { id: DownloadTab; title: string }[] = [
  { id: 'geniuz', title: 'Geniuzplus downloads' },
  { id: 'local', title: 'Local files' },
  { id: 'received', title: 'Received' },
];

function getWatchedLabel(record: OfflineDownloadRecord, watchHistory: ReturnType<typeof getMeScreenData>['watchHistory']) {
  const entry = watchHistory.find((candidate) => candidate.item.id === record.item.id);
  if (!entry) {
    return 'Not watched';
  }
  return `${entry.progress}% watched`;
}

function showDownloadDetails(record: OfflineDownloadRecord) {
  Alert.alert(
    record.item.title,
    [
      record.item.type === 'series' || record.item.parentSeriesId ? 'Series' : 'Movie',
      `File size: ${formatBytes(record.size)}`,
      `Exact bytes: ${record.size.toLocaleString()}`,
      `Status: ${record.status}`,
      `Downloaded: ${new Date(record.date).toLocaleString()}`,
    ].join('\n'),
  );
}

export default function DownloadsScreen() {
  const { tab } = useLocalSearchParams<{ tab?: DownloadTab }>();
  const { isOnline } = useNetwork();
  const library = useLibrary();
  const {
    records: allRecords,
    studyDownloadIds,
    availableSpaceBytes,
    isLoading,
    isRefreshing,
    error,
    download,
    cancel,
    pause,
    resume,
    remove,
    refresh,
  } = useDownloads();
  const [localVideos, setLocalVideos] = useState<LocalVideo[]>([]);
  const [localVideosLoading, setLocalVideosLoading] = useState(false);
  const [localVideosPermission, setLocalVideosPermission] = useState<'unknown' | 'granted' | 'denied'>('unknown');
  const [localVideosError, setLocalVideosError] = useState<string>();
  const selectedTab: DownloadTab = tab === 'local' || tab === 'received' ? tab : 'geniuz';
  const study = useStudyMode();
  const records = useMemo(
    () =>
      allRecords.filter((record) =>
        study.enabled
          ? studyDownloadIds.includes(record.item.id)
          : !studyDownloadIds.includes(record.item.id),
      ),
    [allRecords, study.enabled, studyDownloadIds],
  );
  const watchHistory = useMemo(
    () => getMeScreenData({ watchlist: [], continueWatching: library.continueWatching }, []).watchHistory,
    [library.continueWatching],
  );
  const storageUsed = records
    .filter((record) => record.status === 'downloaded')
    .reduce((total, record) => total + record.size, 0);

  const loadLocalVideos = useCallback(async () => {
    setLocalVideosLoading(true);
    setLocalVideosError(undefined);

    const isExpoGo = Constants.executionEnvironment === 'storeClient';
    if (isExpoGo) {
      setLocalVideosPermission('denied');
      setLocalVideos([]);
      setLocalVideosError('Needs the full Geniuzplus app to read videos on this phone');
      setLocalVideosLoading(false);
      return;
    }

    try {
      const mediaLibrary = await import('expo-media-library');
      const thumbnails = await import('expo-video-thumbnails');
      const permission = await mediaLibrary.requestPermissionsAsync(false, ['video']);
      if (!permission.granted) {
        setLocalVideosPermission('denied');
        setLocalVideos([]);
        return;
      }
      setLocalVideosPermission('granted');
      const assets = await new mediaLibrary.Query()
        .eq(mediaLibrary.AssetField.MEDIA_TYPE, mediaLibrary.MediaType.VIDEO)
        .orderBy(mediaLibrary.AssetField.CREATION_TIME)
        .limit(100)
        .exe();
      const videos = await Promise.all(assets.map(async (asset) => {
        const [filename, duration, uri] = await Promise.all([
          asset.getFilename(),
          asset.getDuration(),
          asset.getUri(),
        ]);
        let thumbnail: string | undefined;
        try {
          thumbnail = (await thumbnails.getThumbnailAsync(uri, { time: 0 })).uri;
        } catch {
          thumbnail = undefined;
        }
        const size = new File(uri).size;
        return {
          id: asset.id,
          uri,
          title: filename.replace(/\.[^.]+$/, ''),
          duration: duration ?? 0,
          size: Number.isFinite(size) ? size : 0,
          ...(thumbnail ? { thumbnail } : {}),
        };
      }));
      setLocalVideos(videos);
    } catch (loadError) {
      setLocalVideosError(loadError instanceof Error ? loadError.message : 'Device videos could not be loaded.');
    } finally {
      setLocalVideosLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedTab === 'local' && localVideosPermission === 'unknown') {
      const timer = setTimeout(() => void loadLocalVideos(), 0);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [loadLocalVideos, localVideosPermission, selectedTab]);

  const runAction = (action: () => Promise<void>, title: string, fallback: string) => {
    void action().catch((actionError: unknown) =>
      Alert.alert(
        title,
        actionError instanceof Error ? actionError.message : fallback,
      ),
    );
  };

  const confirmDelete = (record: OfflineDownloadRecord) => {
    Alert.alert(
      'Delete download?',
      `Remove ${record.item.title} from this device?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => runAction(() => remove(record.item.id), 'Download error', 'Could not delete this download.'),
        },
      ],
    );
  };

  const showMenu = (record: OfflineDownloadRecord) => {
    const buttons = [
      { text: 'Details', onPress: () => showDownloadDetails(record) },
      ...(record.status === 'downloading'
        ? [{ text: 'Pause', onPress: () => runAction(() => pause(record.item.id), 'Download error', 'Could not pause this download.') }]
        : []),
      ...(record.status === 'paused'
        ? [{
            text: 'Resume',
            onPress: () => runAction(() => resume(record.item.id), 'Download error', 'Could not resume this download.'),
          }]
        : []),
      ...(record.status !== 'downloaded' && record.status !== 'queued' && record.status !== 'downloading' && record.status !== 'paused' && isOnline
        ? [{
            text: 'Retry',
            onPress: () => runAction(() => download(record.item), 'Download error', 'The download failed. Please retry.'),
          }]
        : []),
      { text: 'Delete', style: 'destructive' as const, onPress: () => confirmDelete(record) },
    ];
    Alert.alert('Download options', record.item.title, buttons);
  };

  const visibleRecords = selectedTab === 'geniuz'
    ? records.filter((record) => record.origin !== 'received')
    : selectedTab === 'received'
      ? records.filter((record) => record.origin === 'received')
      : [];

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => void refresh()}
            tintColor={theme.accent}
            colors={[theme.accent]}
          />
        }
      >
        <Text style={styles.header}>Downloads</Text>
        <View style={styles.storageCard}>
          <View style={styles.storageStat}>
            <Text style={styles.storageLabel}>Storage used</Text>
            <Text style={styles.storageValue}>{formatBytes(storageUsed)}</Text>
          </View>
          <View style={styles.storageDivider} />
          <View style={styles.storageStat}>
            <Text style={styles.storageLabel}>Available</Text>
            <Text style={styles.storageValue}>
              {availableSpaceBytes === null ? 'Unavailable' : formatBytes(availableSpaceBytes)}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/transfer-history')}
            style={styles.historyLink}
          >
            <Ionicons name="time-outline" size={16} color={theme.accent} />
            <Text style={styles.historyLinkText}>Transfer history</Text>
          </Pressable>
        </View>

        <View style={styles.tabs} accessibilityRole="tablist">
          {tabs.map((tab) => (
            <Pressable
              key={tab.id}
              accessibilityRole="tab"
              accessibilityState={{ selected: selectedTab === tab.id }}
              onPress={() => router.setParams({ tab: tab.id })}
              style={[styles.tab, selectedTab === tab.id && styles.selectedTab]}
            >
              <Text style={[styles.tabText, selectedTab === tab.id && styles.selectedTabText]}>
                {tab.title}
              </Text>
            </Pressable>
          ))}
        </View>

        {error ? <ContentNotice message={error} tone="error" /> : null}
        {isLoading ? <ContentNotice message="Loading your downloads…" /> : null}

        {selectedTab === 'local' ? (
          <View>
            {localVideosLoading ? <ContentNotice message="Loading device videos…" /> : null}
            {localVideosError ? <ContentNotice message={localVideosError} tone="error" actionLabel="Retry" onAction={() => void loadLocalVideos()} /> : null}
            {localVideosPermission === 'denied' ? (
              <View style={styles.emptyState}>
                <Ionicons name="videocam-off-outline" size={34} color={theme.secondaryText} />
                <Text style={styles.emptyTitle}>Video access is off</Text>
                <Text style={styles.emptyText}>Allow Geniuzplus to access videos in your device settings, then try again.</Text>
                <Pressable accessibilityRole="button" onPress={() => void loadLocalVideos()} style={styles.permissionButton}>
                  <Text style={styles.permissionButtonText}>Request access</Text>
                </Pressable>
              </View>
            ) : null}
            {!localVideosLoading && localVideosPermission === 'granted' && localVideos.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="videocam-outline" size={34} color={theme.secondaryText} />
                <Text style={styles.emptyTitle}>No videos found</Text>
                <Text style={styles.emptyText}>Videos saved on this device will appear here.</Text>
              </View>
            ) : null}
            {localVideos.map((video) => (
              <Pressable key={video.id} accessibilityRole="button" accessibilityLabel={`Play ${video.title}`} onPress={() => router.push({ pathname: '/local-player', params: { uri: video.uri, title: video.title } } as never)} style={styles.downloadCard}>
                {video.thumbnail ? (
                  <Image source={{ uri: video.thumbnail }} style={styles.poster} resizeMode="cover" />
                ) : (
                  <View style={[styles.poster, styles.localPosterPlaceholder]}>
                    <Ionicons name="videocam-outline" size={24} color={theme.secondaryText} />
                  </View>
                )}
                <View style={styles.titleInfo}>
                  <Text style={styles.movieTitle} numberOfLines={2}>{video.title}</Text>
                  <Text style={styles.movieMeta}>{formatDuration(video.duration)} · {formatFileSize(video.size)}</Text>
                </View>
              </Pressable>
            ))}
          </View>
        ) : null}

        {selectedTab === 'received' ? <DeviceTransferPanel /> : null}

        {!isLoading && selectedTab !== 'local' && visibleRecords.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons
              name={selectedTab === 'received' ? 'swap-horizontal-outline' : 'cloud-download-outline'}
              size={36}
              color={theme.accent}
            />
            <Text style={styles.emptyTitle}>
              {selectedTab === 'received' ? 'No received files yet' : 'No downloads yet'}
            </Text>
            <Text style={styles.emptyText}>
              {selectedTab === 'received'
                ? 'Verified files received from another device will appear here.'
                : 'Titles you download will be ready to watch here, even when you’re offline.'}
            </Text>
          </View>
        ) : null}

        {visibleRecords.map((record) => {
          const isDownloaded = record.status === 'downloaded';
          const isActive = record.status === 'downloading' || record.status === 'paused';
          const typeLabel =
            record.item.type === 'series' || record.item.parentSeriesId ? 'Series' : 'Movie';
          const statusLabel = isDownloaded
            ? formatBytes(record.size)
            : record.status === 'downloading'
              ? `${formatBytes(record.size)} · Downloading ${record.progress}%`
              : record.status === 'paused'
                ? `${formatBytes(record.size)} · Paused at ${record.progress}%`
                : record.status === 'queued'
                  ? `${formatBytes(record.size)} · Queued`
                  : record.status === 'canceled'
                    ? 'Download canceled'
                    : 'Download failed';
          return (
            <View key={record.item.id} style={styles.downloadCard}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  isDownloaded ? `Play ${record.item.title} offline` : `${record.item.title} download status`
                }
                disabled={!isDownloaded}
                onPress={() =>
                  router.push({ pathname: '/watch/[id]', params: { id: record.item.id } })
                }
                style={styles.titleRow}
              >
                <Image
                  source={
                    record.item.posterUrl
                      ? { uri: record.item.posterUrl }
                      : require('../../assets/icon.png')
                  }
                  style={styles.poster}
                  resizeMode="cover"
                />
                <View style={styles.titleInfo}>
                  <View style={styles.titleHeading}>
                    <Text style={styles.movieTitle} numberOfLines={2}>
                      {record.item.title}
                    </Text>
                    <Text style={styles.typeBadge}>{typeLabel}</Text>
                  </View>
                  <Text style={styles.movieMeta}>{statusLabel}</Text>
                  {isDownloaded ? (
                    <Text style={styles.watchedLabel}>{getWatchedLabel(record, watchHistory)}</Text>
                  ) : null}
                  {record.status === 'downloading' || record.status === 'paused' ? (
                    <View
                      accessibilityRole="progressbar"
                      accessibilityValue={{ min: 0, max: 100, now: record.progress }}
                      style={styles.progressTrack}
                    >
                      <View style={[styles.progressFill, { width: `${record.progress}%` }]} />
                    </View>
                  ) : null}
                  {isDownloaded ? <Text style={styles.offlineCaption}>Tap to play offline</Text> : null}
                  {!isOnline && !isDownloaded ? (
                    <Text style={styles.offlineCaption}>Offline · reconnect to retry</Text>
                  ) : null}
                </View>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`More options for ${record.item.title}`}
                onPress={() => showMenu(record)}
                style={styles.actionButton}
              >
                <Ionicons name="ellipsis-vertical" size={20} color={theme.text} />
              </Pressable>
              {record.status === 'queued' || isActive ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Cancel ${record.item.title} download`}
                  onPress={() => runAction(() => cancel(record.item.id), 'Download error', 'Could not cancel this download.')}
                  style={styles.actionButton}
                >
                  <Ionicons name="close" size={19} color={theme.text} />
                </Pressable>
              ) : null}
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.background,
  },
  content: {
    paddingHorizontal: 18,
    paddingBottom: 30,
  },
  header: {
    color: theme.text,
    fontSize: 30,
    fontWeight: '800',
    marginTop: 18,
    marginBottom: 20,
    letterSpacing: -0.9,
  },
  storageCard: {
    backgroundColor: theme.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.border,
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 16,
    marginBottom: 14,
  },
  storageStat: {
    flex: 1,
  },
  storageDivider: {
    width: 1,
    backgroundColor: theme.border,
    marginHorizontal: 14,
  },
  storageLabel: {
    color: theme.secondaryText,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  storageValue: {
    color: theme.text,
    fontSize: 20,
    fontWeight: '800',
    marginTop: 5,
  },
  historyLink: { alignItems: 'center', flexDirection: 'row', gap: 7, marginTop: 14, width: '100%' },
  historyLinkText: { color: theme.accent, fontSize: 12, fontWeight: '700' },
  tabs: {
    backgroundColor: theme.surface,
    borderRadius: 13,
    flexDirection: 'row',
    gap: 4,
    marginBottom: 8,
    padding: 4,
  },
  tab: {
    alignItems: 'center',
    borderRadius: 10,
    flex: 1,
    justifyContent: 'center',
    minHeight: 40,
    paddingHorizontal: 4,
  },
  selectedTab: {
    backgroundColor: theme.surfaceSoft,
  },
  tabText: {
    color: theme.secondaryText,
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
  },
  selectedTabText: {
    color: theme.accent,
  },
  emptyState: {
    alignItems: 'center',
    backgroundColor: theme.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.border,
    marginTop: 10,
    padding: 24,
  },
  emptyTitle: {
    color: theme.text,
    fontSize: 18,
    fontWeight: '800',
    marginTop: 12,
  },
  emptyText: {
    color: theme.secondaryText,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 7,
    textAlign: 'center',
  },
  downloadCard: {
    alignItems: 'center',
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    marginTop: 10,
    padding: 12,
  },
  titleRow: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    minWidth: 0,
  },
  poster: {
    width: 66,
    height: 88,
    borderRadius: 10,
    backgroundColor: theme.surfaceSoft,
  },
  localPosterPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  permissionButton: { backgroundColor: theme.accent, borderRadius: 10, marginTop: 14, paddingHorizontal: 16, paddingVertical: 11 },
  permissionButtonText: { color: theme.background, fontSize: 13, fontWeight: '800' },
  titleInfo: {
    flex: 1,
    marginLeft: 12,
    minWidth: 0,
  },
  titleHeading: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 6,
  },
  movieTitle: {
    color: theme.text,
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
  },
  typeBadge: {
    color: theme.secondaryText,
    fontSize: 9,
    fontWeight: '700',
    overflow: 'hidden',
    paddingHorizontal: 6,
    paddingVertical: 3,
    backgroundColor: theme.surfaceSoft,
    borderRadius: 7,
  },
  movieMeta: {
    color: theme.secondaryText,
    fontSize: 12,
    marginTop: 6,
  },
  watchedLabel: {
    color: theme.text,
    fontSize: 11,
    marginTop: 5,
  },
  offlineCaption: {
    color: theme.accent,
    fontSize: 11,
    fontWeight: '700',
    marginTop: 7,
  },
  progressTrack: {
    backgroundColor: theme.surfaceSoft,
    borderRadius: 4,
    height: 5,
    marginTop: 8,
    overflow: 'hidden',
  },
  progressFill: {
    backgroundColor: theme.accent,
    height: '100%',
  },
  actionButton: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 36,
    height: 40,
  },
});
