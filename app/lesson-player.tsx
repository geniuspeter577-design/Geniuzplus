import { Ionicons } from '@expo/vector-icons';
import * as ScreenOrientation from 'expo-screen-orientation';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useVideoPlayer } from 'expo-video';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PlayerHeader } from '../src/components/detail/PlayerHeader';
import { TitleImage } from '../src/components/TitleImage';
import { supabaseMovieRepository } from '../src/repositories/SupabaseMovieRepository';
import { supabase } from '../src/services/supabase';
import { useStudyMode } from '../src/state/StudyModeContext';
import { recordStudyProgress } from '../src/state/studyHistory';
import { backOrReplace } from '../src/utils/navigation';
import {
  getNextPlayerFit,
  PLAYER_CONTROLS_AUTO_HIDE_MS,
  setPlayerCurrentTime,
  setPlayerTimeUpdateInterval,
  shouldAutoHidePlayerControls,
  type PlayerFitMode,
} from '../src/utils/playerControls';

type LessonRow = { id: string; lesson_number: number; title: string; duration_seconds: number | null; poster_url: string | null; file_size_bytes: number | null };

const C = {
  bg: '#111317',
  card: '#1E2024',
  highest: '#333539',
  text: '#E2E2E8',
  muted: '#BDCBB6',
  green: '#72F06A',
};

function formatDuration(seconds: number | null) {
  if (!seconds || seconds <= 0) {
    return '';
  }
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatSize(bytes: number | null) {
  if (!bytes || bytes <= 0) {
    return '';
  }
  return bytes >= 1024 * 1024 * 1024
    ? `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
    : `${Math.max(1, Math.round(bytes / (1024 * 1024)))} MB`;
}

export default function LessonPlayerScreen() {
  const { id: routeId, title: routeTitle } = useLocalSearchParams<{ id?: string; title?: string }>();
  const id = typeof routeId === 'string' ? routeId : '';
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;

  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [retryAttempt, setRetryAttempt] = useState(0);
  const player = useVideoPlayer(url, (videoPlayer) => {
    videoPlayer.play();
  });

  const [playerStatus, setPlayerStatus] = useState<string>('idle');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [bufferedPosition, setBufferedPosition] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const [isSeeking, setIsSeeking] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [speedMenuOpen, setSpeedMenuOpen] = useState(false);
  const [fitMode, setFitMode] = useState<PlayerFitMode>('contain');
  const [isPlayerLocked, setIsPlayerLocked] = useState(false);
  const [isRotateLocked, setIsRotateLocked] = useState(false);

  const [courseId, setCourseId] = useState<string | null>(null);
  const [courseTitle, setCourseTitle] = useState('');
  const [lessons, setLessons] = useState<LessonRow[]>([]);

  useEffect(() => {
    void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT);
    return () => {
      void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setUrl(null);
    setError(undefined);
    setCurrentTime(0);
    setDuration(0);
    setBufferedPosition(0);
    setShowControls(true);
    setSpeedMenuOpen(false);
    if (!id || !supabaseMovieRepository) {
      setError('This lesson could not be opened.');
      return () => {
        cancelled = true;
      };
    }
    supabaseMovieRepository
      .getLessonPlaybackUrl(id)
      .then((playUrl) => {
        if (!cancelled) {
          setUrl(playUrl);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Could not load this lesson. Tap Retry.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [id, retryAttempt]);

  useEffect(() => {
    try {
      setPlayerTimeUpdateInterval(player, 0.25);
    } catch {
      // player was already released
    }
    const timeSubscription = player.addListener('timeUpdate', ({ currentTime: time, bufferedPosition: buffered }) => {
      setCurrentTime(time);
      setBufferedPosition(buffered);
    });
    const playingSubscription = player.addListener('playingChange', ({ isPlaying: playing }) => {
      setIsPlaying(playing);
    });
    const statusSubscription = player.addListener('statusChange', ({ status }) => {
      setPlayerStatus(status);
      if (status === 'readyToPlay') {
        try {
          if (player.duration > 0) {
            setDuration(player.duration);
          }
        } catch {
          // player was already released
        }
      } else if (status === 'error') {
        setShowControls(true);
        setError('This lesson video could not be played. Tap Retry.');
      }
    });
    return () => {
      timeSubscription.remove();
      playingSubscription.remove();
      statusSubscription.remove();
    };
  }, [player]);

  useEffect(() => {
    try {
      player.playbackRate = playbackSpeed;
    } catch {
      // player was already released
    }
  }, [player, playbackSpeed]);

  useEffect(() => {
    if (isPlayerLocked || !showControls || !shouldAutoHidePlayerControls(isPlaying, isSeeking)) {
      return;
    }
    const timeout = setTimeout(() => setShowControls(false), PLAYER_CONTROLS_AUTO_HIDE_MS);
    return () => clearTimeout(timeout);
  }, [isPlaying, isPlayerLocked, isSeeking, showControls]);

  useEffect(() => {
    let cancelled = false;
    if (!id || !supabase) {
      return;
    }
    void (async () => {
      const { data } = await supabase.from('education_lessons').select('course_id').eq('id', id).maybeSingle();
      const found = (data as { course_id?: string } | null)?.course_id;
      if (!cancelled && found) {
        setCourseId(found);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    if (!courseId || !supabase) {
      return;
    }
    void (async () => {
      const lessonResult = await supabase
        .from('education_lessons')
        .select('id,lesson_number,title,duration_seconds,poster_url,file_size_bytes')
        .eq('course_id', courseId)
        .eq('published', true)
        .order('lesson_number', { ascending: true });
      const courseResult = await supabase.from('education_courses').select('title').eq('id', courseId).maybeSingle();
      if (cancelled) {
        return;
      }
      setLessons((lessonResult.data ?? []) as LessonRow[]);
      setCourseTitle((courseResult.data as { title?: string } | null)?.title ?? '');
    })();
    return () => {
      cancelled = true;
    };
  }, [courseId]);

  const current = lessons.find((lesson) => lesson.id === id);
  const nextLessons = useMemo(
    () => lessons.filter((lesson) => (current ? lesson.lesson_number > current.lesson_number : lesson.id !== id)),
    [current, id, lessons],
  );
  const lessonTitle = (typeof routeTitle === 'string' && routeTitle) || current?.title || 'Lesson';

  const study = useStudyMode();
  const lastSavedRef = useRef(0);
  useEffect(() => {
    if (!study.enabled || !id || duration <= 0) {
      return;
    }
    const now = Date.now();
    if (now - lastSavedRef.current < 5000 && currentTime < duration - 1) {
      return;
    }
    lastSavedRef.current = now;
    void recordStudyProgress({
      id,
      title: lessonTitle,
      posterUrl: current?.poster_url ?? null,
      progress: Math.min(100, Math.round((currentTime / duration) * 100)),
      updatedAt: new Date().toISOString(),
    });
  }, [current?.poster_url, currentTime, duration, id, lessonTitle, study.enabled]);

  useEffect(() => {
    const subscription = player.addListener('playToEnd', () => {
      const next = nextLessons[0];
      if (next) {
        router.setParams({ id: next.id, title: next.title });
      }
    });
    return () => subscription.remove();
  }, [nextLessons, player]);

  const togglePlayback = useCallback(() => {
    try {
      if (isPlaying) {
        player.pause();
      } else {
        player.play();
      }
    } catch {
      // player was already released
    }
  }, [isPlaying, player]);

  const seekTo = useCallback(
    (seconds: number) => {
      const max = duration > 0 ? duration : Number.MAX_SAFE_INTEGER;
      const target = Math.max(0, Math.min(max, seconds));
      try {
        setPlayerCurrentTime(player, target);
        setCurrentTime(target);
      } catch {
        // player was already released
      }
    },
    [duration, player],
  );

  const seekBy = useCallback(
    (seconds: number) => {
      seekTo(currentTime + seconds);
    },
    [currentTime, seekTo],
  );

  const toggleLock = useCallback(() => {
    setIsPlayerLocked((locked) => {
      const nextLocked = !locked;
      setShowControls(!nextLocked);
      return nextLocked;
    });
    setSpeedMenuOpen(false);
  }, []);

  const toggleSpeedMenu = useCallback(() => {
    if (isPlayerLocked) {
      return;
    }
    setSpeedMenuOpen((open) => !open);
  }, [isPlayerLocked]);

  const cycleFitMode = useCallback(() => {
    setFitMode((currentFit) => getNextPlayerFit(currentFit));
  }, []);

  const toggleRotateLock = useCallback(async () => {
    const nextLocked = !isRotateLocked;
    await ScreenOrientation.lockAsync(
      nextLocked ? ScreenOrientation.OrientationLock.LANDSCAPE : ScreenOrientation.OrientationLock.PORTRAIT,
    );
    setIsRotateLocked(nextLocked);
    setShowControls(true);
  }, [isRotateLocked]);

  const playLesson = (lesson: LessonRow) => {
    router.setParams({ id: lesson.id, title: lesson.title });
  };

  const isLoading = !url && !error;
  const isBuffering = Boolean(url) && playerStatus === 'loading';

  return (
    <SafeAreaView style={[styles.root, isLandscape && styles.rootLandscape]} edges={isLandscape ? [] : ['top']}>
      <Stack.Screen options={{ orientation: 'all', statusBarHidden: isLandscape, navigationBarHidden: isLandscape }} />
      <PlayerHeader
        player={player}
        playbackUrl={url ?? undefined}
        title={lessonTitle}
        isLoading={isLoading}
        isBuffering={isBuffering}
        isPlaying={isPlaying}
        currentTime={currentTime}
        duration={duration}
        bufferedPosition={bufferedPosition}
        error={error}
        showControls={showControls}
        isLandscape={isLandscape}
        isLocked={isPlayerLocked}
        playbackSpeed={playbackSpeed}
        speedMenuOpen={speedMenuOpen}
        fitMode={fitMode}
        isRotateLocked={isRotateLocked}
        subtitleText={undefined}
        subtitlesEnabled={false}
        onBack={() => backOrReplace('/education')}
        onToggleControls={() => setShowControls((visible) => !visible)}
        onToggleLock={toggleLock}
        onToggleSpeedMenu={toggleSpeedMenu}
        onSelectSpeed={(speed) => {
          setPlaybackSpeed(speed);
          setSpeedMenuOpen(false);
        }}
        onCycleFit={cycleFitMode}
        onToggleRotate={toggleRotateLock}
        onOpenSubtitles={() => undefined}
        onPlayPause={togglePlayback}
        onSeekBy={seekBy}
        onSeekTo={seekTo}
        onSeekingChange={setIsSeeking}
        onRetry={() => setRetryAttempt((attempt) => attempt + 1)}
      />
      {!isLandscape ? (
        <ScrollView contentContainerStyle={styles.details}>
          <View style={styles.chipRow}>
            {courseTitle ? <Text style={styles.chip} numberOfLines={1}>{courseTitle}</Text> : null}
          </View>
          <Text style={styles.lessonTitle}>
            {current ? `Lesson ${current.lesson_number} · ${lessonTitle}` : lessonTitle}
          </Text>
          {nextLessons.length > 0 ? (
            <>
              <View style={styles.nextHeader}>
                <Text style={styles.nextTitle}>Next Lessons</Text>
                <Text style={styles.nextCount}>{nextLessons.length} Left</Text>
              </View>
              <View style={styles.list}>
                {nextLessons.map((lesson, index) => (
                  <Pressable key={lesson.id} accessibilityRole="button" onPress={() => playLesson(lesson)} style={styles.row}>
                    {index === 0 ? <View style={styles.accent} /> : null}
                    <TitleImage uri={lesson.poster_url ?? undefined} style={styles.rowThumb} iconSize={24} />
                    <View style={styles.rowBody}>
                      {index === 0 ? <Text style={styles.upNext}>UP NEXT</Text> : null}
                      <Text style={styles.rowTitle} numberOfLines={2}>{lesson.title}</Text>
                      <Text style={styles.muted}>{[formatDuration(lesson.duration_seconds), formatSize(lesson.file_size_bytes)].filter(Boolean).join('  ·  ')}</Text>
                    </View>
                    <View style={styles.rowPlay}>
                      <Ionicons name="play" size={18} color={C.green} />
                    </View>
                  </Pressable>
                ))}
              </View>
            </>
          ) : null}
        </ScrollView>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: C.bg, flex: 1 },
  rootLandscape: { backgroundColor: '#000000' },
  details: { gap: 12, padding: 16, paddingBottom: 40 },
  chipRow: { flexDirection: 'row' },
  chip: { backgroundColor: C.card, borderRadius: 999, color: C.green, fontSize: 11, fontWeight: '700', letterSpacing: 0.4, overflow: 'hidden', paddingHorizontal: 12, paddingVertical: 4 },
  lessonTitle: { color: C.text, fontSize: 18, fontWeight: '700', lineHeight: 24 },
  nextHeader: { alignItems: 'center', flexDirection: 'row', gap: 8, marginTop: 8 },
  nextTitle: { color: C.text, fontSize: 16, fontWeight: '700' },
  nextCount: { backgroundColor: C.highest, borderRadius: 999, color: C.muted, fontSize: 11, fontWeight: '700', overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 2 },
  list: { gap: 8 },
  row: { alignItems: 'center', backgroundColor: C.card, borderRadius: 12, flexDirection: 'row', gap: 12, overflow: 'hidden', padding: 12 },
  accent: { backgroundColor: C.green, bottom: 0, left: 0, position: 'absolute', top: 0, width: 4 },
  numberBox: { alignItems: 'center', backgroundColor: C.bg, borderRadius: 8, height: 48, justifyContent: 'center', width: 64 },
  number: { color: C.green, fontSize: 18, fontWeight: '700' },
  rowThumb: { backgroundColor: C.highest, borderRadius: 8, height: 72, width: 52 },
  rowBody: { flex: 1, gap: 2 },
  upNext: { color: C.green, fontSize: 10, fontWeight: '700', letterSpacing: 0.8 },
  rowTitle: { color: C.text, fontSize: 14, fontWeight: '600' },
  rowPlay: { alignItems: 'center', backgroundColor: C.highest, borderRadius: 18, height: 36, justifyContent: 'center', width: 36 },
  muted: { color: C.muted, fontSize: 12 },
});
