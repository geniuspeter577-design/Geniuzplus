import AsyncStorage from '@react-native-async-storage/async-storage';
import { ensureBackgroundDownloadPermission } from '../utils/backgroundDownloadPermission';
import { useStudyMode } from './StudyModeContext';
import { getOfflineUrl, listOffline, removeFromOffline, saveToOffline } from '../utils/webOfflineStore';

const STUDY_DOWNLOADS_KEY = 'geniuz.study.downloads';
import { DownloadTask, File, Paths } from 'expo-file-system';
import { Alert, Linking, Platform } from 'react-native';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

import type { ContentItem } from '../models/content';
import { supabaseMovieRepository } from '../repositories/SupabaseMovieRepository';
import { getUserAppSettings } from '../services/TrailerAutoplayPreference';
import { useAuth } from './AuthContext';
import { useNetwork } from './NetworkContext';
import {
  OfflineDownloadService,
  type OfflineDownloadRecord,
} from '../services/OfflineDownloadService';
async function loadBrowserDownloadRecords(): Promise<OfflineDownloadRecord[]> {
  const saved = await listOffline();
  const restored = await Promise.all(saved.map(async (entry) => {
    if (!entry.item) {
      return null;
    }
    const filePath = await getOfflineUrl(entry.id);
    if (!filePath) {
      await removeFromOffline(entry.id);
      return null;
    }
    return {
      item: entry.item,
      filePath,
      origin: 'download' as const,
      size: entry.size,
      status: 'downloaded' as const,
      progress: 100,
      date: new Date(entry.savedAt).toISOString(),
    };
  }));
  return restored.flatMap((record) => record === null ? [] : [record]);
}

function showBackgroundDownloadPermissionPrompt() {
  return new Promise<boolean>((resolve) => {
    let resolved = false;
    const finish = (allowed: boolean) => {
      if (!resolved) {
        resolved = true;
        resolve(allowed);
      }
    };
    Alert.alert(
      'Allow background downloads',
      'Allow notifications so Geniuzplus can use alerts for background download activity. This permission does not keep the app running, and your phone may still pause downloads to save battery.',
      [
        { text: 'Not now', style: 'cancel', onPress: () => finish(false) },
        { text: 'Allow', onPress: () => finish(true) },
      ],
      { cancelable: true, onDismiss: () => finish(false) },
    );
  });
}

function showBackgroundDownloadSettingsPrompt() {
  return new Promise<void>((resolve) => {
    let resolved = false;
    const finish = () => {
      if (!resolved) {
        resolved = true;
        resolve();
      }
    };
    Alert.alert(
      'Notifications are blocked',
      'Allow notifications in your phone settings before starting a background download.',
      [
        { text: 'Not now', style: 'cancel', onPress: finish },
        {
          text: 'Open settings',
          onPress: () => {
            void Linking.openSettings().catch(() => undefined).finally(finish);
          },
        },
      ],
      { cancelable: true, onDismiss: finish },
    );
  });
}

async function requestBackgroundDownloadPermission() {
  if (Platform.OS === 'web') {
    return true;
  }
  const Notifications = await import('expo-notifications');
  const allowed = await ensureBackgroundDownloadPermission({
    getPermission: async () => {
      const permission = await Notifications.getPermissionsAsync();
      return { granted: permission.granted, canAskAgain: permission.canAskAgain };
    },
    requestPermission: async () => {
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'Geniuzplus updates',
          importance: Notifications.AndroidImportance.DEFAULT,
        });
      }
      const permission = await Notifications.requestPermissionsAsync();
      return { granted: permission.granted, canAskAgain: permission.canAskAgain };
    },
    showPermissionPrompt: showBackgroundDownloadPermissionPrompt,
    showSettingsPrompt: showBackgroundDownloadSettingsPrompt,
  });
  if (!allowed) {
    return false;
  }
  return true;
}

function getSafeFileName(item: ContentItem) {
  const sourceId = (item.sourceId ?? item.id).replace(/[^a-zA-Z0-9_-]/g, '_');
  const pathExtension = item.mediaPath?.match(/\.([^.\/]+)(?:$|\?)/)?.[1]?.toLowerCase();
  const extension = item.fileExtension ?? pathExtension;
  const normalizedExtension = extension?.replace(/^\./, '').toLowerCase();
  const safeExtension =
    normalizedExtension && /^[a-z0-9]+$/.test(normalizedExtension) ? `.${normalizedExtension}` : '';
  return `geniuz-${sourceId}${safeExtension}`;
}

const service = new OfflineDownloadService(
  AsyncStorage,
  {
    availableDiskSpace: () => Paths.availableDiskSpace,
    getFilePath: (item) => new File(Paths.document, getSafeFileName(item)).uri,
    createDownloadTask: (url, filePath, options) =>
      File.createDownloadTask(url, new File(filePath), { ...options, sessionType: 'background' }),
    restoreDownloadTask: (state, options) =>
      DownloadTask.fromSavable(state, { ...options, sessionType: 'background' }),
    fileExists: (filePath) => new File(filePath).exists,
    getFileSize: (filePath) => new File(filePath).size,
    deleteFile: (filePath) => {
      const file = new File(filePath);
      if (file.exists) {
        file.delete();
      }
    },
    getPosterFilePath: (item) => {
      const extension = item.posterUrl?.match(/\.(jpe?g|png|webp)(?:[?#]|$)/i)?.[1]?.toLowerCase() ?? 'jpg';
      return `${new File(Paths.document, getSafeFileName(item)).uri}.poster.${extension}`;
    },
    downloadPoster: async (url, filePath, signal) => {
      const task = File.createDownloadTask(url, new File(filePath), {
        signal,
        onProgress: () => undefined,
      });
      const result = await task.downloadAsync();
      if (!result) {
        throw new Error('The poster image download did not complete.');
      }
    },
  },
  async (item) => {
    if (!supabaseMovieRepository || !item.mediaPath) {
      throw new Error('Connect to the internet to prepare this download.');
    }
    return supabaseMovieRepository.getDownloadUrl(item);
  },
);

type DownloadsContextValue = {
  records: OfflineDownloadRecord[];
  studyDownloadIds: string[];
  availableSpaceBytes: number | null;
  isLoading: boolean;
  isRefreshing: boolean;
  error?: string;
  download: (item: ContentItem) => Promise<void>;
  downloadSequentially: (items: readonly ContentItem[]) => Promise<void>;
  registerReceived: (item: ContentItem, filePath: string, size: number) => Promise<void>;
  cancel: (itemId: string) => Promise<void>;
  pause: (itemId: string) => Promise<void>;
  resume: (itemId: string) => Promise<void>;
  remove: (itemId: string) => Promise<void>;
  refresh: () => Promise<void>;
  dismissError: () => void;
};

const DownloadsContext = createContext<DownloadsContextValue | null>(null);

export function DownloadsProvider({ children }: React.PropsWithChildren) {
  const auth = useAuth();
  const network = useNetwork();
  const [records, setRecords] = useState<OfflineDownloadRecord[]>([]);
  const browserControllersRef = useRef(new Map<string, AbortController>());
  const study = useStudyMode();
  const studyEnabledRef = useRef(study.enabled);
  studyEnabledRef.current = study.enabled;
  const [studyDownloadIds, setStudyDownloadIds] = useState<string[]>([]);
  const studyIdsRef = useRef<string[]>([]);
  studyIdsRef.current = studyDownloadIds;

  useEffect(() => {
    void AsyncStorage.getItem(STUDY_DOWNLOADS_KEY)
      .then((raw) => {
        const list = raw ? JSON.parse(raw) : [];
        if (Array.isArray(list)) {
          setStudyDownloadIds(list.filter((value): value is string => typeof value === 'string'));
        }
      })
      .catch(() => undefined);
  }, []);

  const saveStudyIds = useCallback((next: string[]) => {
    setStudyDownloadIds(next);
    void AsyncStorage.setItem(STUDY_DOWNLOADS_KEY, JSON.stringify(next)).catch(() => undefined);
  }, []);

  const markStudy = useCallback(
    (ids: readonly string[]) => {
      if (!studyEnabledRef.current) {
        return;
      }
      const next = Array.from(new Set([...studyIdsRef.current, ...ids]));
      saveStudyIds(next);
    },
    [saveStudyIds],
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string>();

  const enforceWifiPreference = useCallback(async () => {
    if (!auth.session) {
      return;
    }
    const settings = await getUserAppSettings(auth.session.user.id);
    if (settings.wifiOnlyDownloads && !network.isReady) {
      throw new Error('Checking network connection. Please retry the download shortly.');
    }
    if (settings.wifiOnlyDownloads && !network.isWifi) {
      throw new Error('Wi-Fi only downloads are enabled. Connect to Wi-Fi to download titles.');
    }
  }, [auth.session, network.isReady, network.isWifi]);

  useEffect(() => {
    const browserControllers = browserControllersRef.current;
    if (Platform.OS === 'web') {
      let active = true;
      void loadBrowserDownloadRecords()
        .then((browserRecords) => {
          if (active) setRecords(browserRecords);
        })
        .catch((loadError: unknown) => {
          console.error('[Downloads] Could not load browser downloads.', loadError);
          if (active) setError('Browser downloads could not be loaded from this site storage.');
        })
        .finally(() => {
          if (active) setIsLoading(false);
        });
      return () => {
        active = false;
        for (const controller of browserControllers.values()) controller.abort();
        browserControllers.clear();
      };
    }
    const unsubscribe = service.subscribe(setRecords);
    let active = true;
    void service
      .load()
      .catch((loadError: unknown) => {
        console.error('[Downloads] Could not load saved downloads.', loadError);
        if (active) {
          setError('Saved downloads could not be loaded. Check device storage and retry the app.');
        }
      })
      .finally(() => {
        if (active) {
          setIsLoading(false);
        }
      });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const pause = useCallback(async (itemId: string) => {
    setError(undefined);
    try {
      await service.pause(itemId);
    } catch (pauseError) {
      console.error('[Downloads] Could not pause this download.', pauseError);
      setError(pauseError instanceof Error ? pauseError.message : 'The download could not be paused.');
      throw pauseError;
    }
  }, []);

  const resume = useCallback(async (itemId: string) => {
    setError(undefined);
    try {
      await enforceWifiPreference();
      if (!(await requestBackgroundDownloadPermission())) {
        return;
      }
      await service.resume(itemId);
    } catch (resumeError) {
      console.error('[Downloads] Could not resume this download.', resumeError);
      setError(resumeError instanceof Error ? resumeError.message : 'The download could not be resumed.');
      throw resumeError;
    }
  }, [enforceWifiPreference]);

  const autoPausedRef = useRef<Set<string>>(new Set());
  const recordsRef = useRef<OfflineDownloadRecord[]>([]);
  recordsRef.current = records;

  useEffect(() => {
    if (Platform.OS === 'web') {
      return;
    }
    if (!network.isReady) {
      return;
    }
    if (!network.isOnline) {
      for (const record of recordsRef.current) {
        if (record.status === 'downloading') {
          autoPausedRef.current.add(record.item.id);
          void service.pause(record.item.id).catch(() => undefined);
        }
      }
      return;
    }
    const ids = Array.from(autoPausedRef.current);
    autoPausedRef.current.clear();
    for (const id of ids) {
      const record = recordsRef.current.find((candidate) => candidate.item.id === id);
      if (record?.status === 'paused') {
        void resume(id).catch(() => undefined);
      }
    }
  }, [network.isReady, network.isOnline, resume]);

  const download = useCallback(async (item: ContentItem) => {
    setError(undefined);
    try {
      await enforceWifiPreference();
      if (!(await requestBackgroundDownloadPermission())) {
        return;
      }
      markStudy([item.id]);
      if (Platform.OS === 'web') {
        const existing = recordsRef.current.find((record) => record.item.id === item.id);
        if (existing?.status === 'downloaded') return;
        if (browserControllersRef.current.has(item.id)) throw new Error('This title is already downloading.');
        const size = item.fileSizeBytes;
        if (!Number.isSafeInteger(size) || !size || size <= 0) {
          throw new Error('This title has no verified file size. Reopen it while online and retry.');
        }
        const controller = new AbortController();
        browserControllersRef.current.set(item.id, controller);
        const record: OfflineDownloadRecord = {
          item, filePath: '', size, status: 'downloading', progress: 0, date: new Date().toISOString(),
        };
        setRecords((current) => [record, ...current.filter((entry) => entry.item.id !== item.id)]);
        try {
          const estimate = await navigator.storage?.estimate?.();
          if (estimate?.quota && Number.isFinite(estimate.usage) && estimate.quota - (estimate.usage ?? 0) < size) {
            throw new Error('There may not be enough browser storage for this video. Clear site storage and retry.');
          }
          if (!supabaseMovieRepository) throw new Error('Downloads are not configured.');
          const url = await supabaseMovieRepository.getDownloadUrl(item);
          await saveToOffline(item, url, (progress) => {
            setRecords((current) => current.map((entry) =>
              entry.item.id === item.id && entry.status === 'downloading'
                ? { ...entry, progress: Math.min(99, progress) }
                : entry,
            ));
          }, controller.signal);
          const filePath = await getOfflineUrl(item.id);
          if (!filePath) throw new Error('The saved browser download could not be opened.');
          setRecords((current) => current.map((entry) => entry.item.id === item.id
            ? { ...entry, filePath, size, status: 'downloaded', progress: 100 }
            : entry));
        } catch (browserError) {
          setRecords((current) => current.map((entry) => entry.item.id === item.id
            ? { ...entry, filePath: '', status: controller.signal.aborted ? 'canceled' : 'failed', progress: 0 }
            : entry));
          if (!controller.signal.aborted) throw browserError;
        } finally {
          browserControllersRef.current.delete(item.id);
        }
        return;
      }
      await service.download(item);
    } catch (downloadError) {
      console.error('[Downloads] Could not download this title.', downloadError);
      setError(downloadError instanceof Error ? downloadError.message : 'The download failed. Please retry.');
      throw downloadError;
    }
  }, [enforceWifiPreference, markStudy]);

  const cancel = useCallback(async (itemId: string) => {
    setError(undefined);
    try {
      if (Platform.OS === 'web') {
        browserControllersRef.current.get(itemId)?.abort();
        await removeFromOffline(itemId);
        setRecords((current) => current.map((record) =>
          record.item.id === itemId && record.status !== 'downloaded'
            ? { ...record, filePath: '', status: 'canceled', progress: 0 }
            : record,
        ));
        return;
      }
      await service.cancel(itemId);
    } catch (cancelError) {
      console.error('[Downloads] Could not cancel this download.', cancelError);
      setError('The download could not be canceled. Please try again.');
      throw cancelError;
    }
  }, []);

  const downloadSequentially = useCallback(async (items: readonly ContentItem[]) => {
    setError(undefined);
    try {
      if (Platform.OS === 'web') {
        for (const entry of items) await download(entry);
        return;
      }
      await enforceWifiPreference();
      if (!(await requestBackgroundDownloadPermission())) {
        return;
      }
      markStudy(items.map((entry) => entry.id));
      await service.downloadSequentially(items);
    } catch (queueError) {
      console.error('[Downloads] Could not complete the queued downloads.');
      setError(
        queueError instanceof Error
          ? queueError.message
          : 'One or more queued downloads failed. Please retry.',
      );
      throw queueError;
    }
  }, [download, enforceWifiPreference, markStudy]);

  const registerReceived = useCallback(async (item: ContentItem, filePath: string, size: number) => {
    setError(undefined);
    try {
      await service.registerReceived(item, filePath, size);
    } catch (registerError) {
      console.error('[Downloads] Could not register a received file.', registerError);
      setError(
        registerError instanceof Error
          ? registerError.message
          : 'The received file could not be added to Downloads.',
      );
      throw registerError;
    }
  }, []);

  const remove = useCallback(async (itemId: string) => {
    setError(undefined);
    try {
      if (Platform.OS === 'web') {
        browserControllersRef.current.get(itemId)?.abort();
        await removeFromOffline(itemId);
        setRecords((current) => current.filter((record) => record.item.id !== itemId));
        saveStudyIds(studyIdsRef.current.filter((id) => id !== itemId));
        return;
      }
      await service.delete(itemId);
      saveStudyIds(studyIdsRef.current.filter((id) => id !== itemId));
    } catch (deleteError) {
      console.error('[Downloads] Could not delete this download.', deleteError);
      setError('The downloaded file could not be deleted. Please try again.');
      throw deleteError;
    }
  }, [saveStudyIds]);

  const dismissError = useCallback(() => setError(undefined), []);

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    setError(undefined);
    try {
      if (Platform.OS === 'web') {
        setRecords(await loadBrowserDownloadRecords());
      } else {
        await service.load();
      }
    } catch (loadError) {
      console.error('[Downloads] Could not refresh saved downloads.', loadError);
      setError('Saved downloads could not be refreshed. Check device storage and retry.');
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  return (
    <DownloadsContext.Provider
      value={{
        records,
        studyDownloadIds,
        availableSpaceBytes: Platform.OS !== 'web' && Number.isFinite(Paths.availableDiskSpace)
          ? Paths.availableDiskSpace
          : null,
        isLoading,
        isRefreshing,
        error,
        download,
        downloadSequentially,
        registerReceived,
        cancel,
        pause,
        resume,
        remove,
        refresh,
        dismissError,
      }}
    >
      {children}
    </DownloadsContext.Provider>
  );
}

export function useDownloads() {
  const context = useContext(DownloadsContext);
  if (!context) {
    throw new Error('useDownloads must be used within DownloadsProvider.');
  }
  return context;
}
