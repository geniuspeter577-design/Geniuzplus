import * as ScreenOrientation from 'expo-screen-orientation';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useVideoPlayer } from 'expo-video';
import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PlayerHeader } from '../src/components/detail/PlayerHeader';
import { backOrReplace } from '../src/utils/navigation';
import {
  getNextPlayerFit,
  PLAYER_CONTROLS_AUTO_HIDE_MS,
  setPlayerCurrentTime,
  setPlayerTimeUpdateInterval,
  shouldAutoHidePlayerControls,
  type PlayerFitMode,
} from '../src/utils/playerControls';

export default function LocalPlayerScreen() {
  const { uri, title } = useLocalSearchParams<{ uri?: string; title?: string }>();
  const url = typeof uri === 'string' && uri ? uri : null;
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const player = useVideoPlayer(url, (videoPlayer) => {
    videoPlayer.play();
  });

  const [error, setError] = useState<string | undefined>(url ? undefined : 'This video could not be opened.');
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
  const [retryAttempt, setRetryAttempt] = useState(0);

  useEffect(() => {
    void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT);
    return () => {
      void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT);
    };
  }, []);

  useEffect(() => {
    try {
      setPlayerTimeUpdateInterval(player, 0.25);
    } catch {
      // player already released
    }
    const timeSub = player.addListener('timeUpdate', ({ currentTime: t, bufferedPosition: b }) => {
      setCurrentTime(t);
      setBufferedPosition(b);
    });
    const playingSub = player.addListener('playingChange', ({ isPlaying: p }) => setIsPlaying(p));
    const statusSub = player.addListener('statusChange', ({ status }) => {
      setPlayerStatus(status);
      if (status === 'readyToPlay') {
        try {
          if (player.duration > 0) {
            setDuration(player.duration);
          }
        } catch {
          // player already released
        }
      } else if (status === 'error') {
        setShowControls(true);
        setError('This video could not be played.');
      }
    });
    return () => {
      timeSub.remove();
      playingSub.remove();
      statusSub.remove();
    };
  }, [player]);

  useEffect(() => {
    try {
      player.playbackRate = playbackSpeed;
    } catch {
      // player already released
    }
  }, [player, playbackSpeed]);

  useEffect(() => {
    if (isPlayerLocked || !showControls || !shouldAutoHidePlayerControls(isPlaying, isSeeking)) {
      return;
    }
    const timeout = setTimeout(() => setShowControls(false), PLAYER_CONTROLS_AUTO_HIDE_MS);
    return () => clearTimeout(timeout);
  }, [isPlaying, isPlayerLocked, isSeeking, showControls]);

  const togglePlayback = useCallback(() => {
    try {
      if (isPlaying) {
        player.pause();
      } else {
        player.play();
      }
    } catch {
      // player already released
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
        // player already released
      }
    },
    [duration, player],
  );

  const seekBy = useCallback((seconds: number) => seekTo(currentTime + seconds), [currentTime, seekTo]);

  const toggleLock = useCallback(() => {
    setIsPlayerLocked((locked) => {
      const next = !locked;
      setShowControls(!next);
      return next;
    });
    setSpeedMenuOpen(false);
  }, []);

  const toggleRotateLock = useCallback(async () => {
    const next = !isRotateLocked;
    await ScreenOrientation.lockAsync(
      next ? ScreenOrientation.OrientationLock.LANDSCAPE : ScreenOrientation.OrientationLock.PORTRAIT,
    );
    setIsRotateLocked(next);
    setShowControls(true);
  }, [isRotateLocked]);

  const isLoading = Boolean(url) && !error && playerStatus === 'idle';
  const isBuffering = Boolean(url) && playerStatus === 'loading';

  return (
    <SafeAreaView style={[styles.root, isLandscape && styles.rootLandscape]} edges={isLandscape ? [] : ['top']}>
      <Stack.Screen options={{ orientation: 'all', statusBarHidden: isLandscape, navigationBarHidden: isLandscape }} />
      <PlayerHeader
        player={player}
        playbackUrl={url ?? undefined}
        title={typeof title === 'string' && title ? title : 'Video'}
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
        onBack={() => backOrReplace('/')}
        onToggleControls={() => setShowControls((visible) => !visible)}
        onToggleLock={toggleLock}
        onToggleSpeedMenu={() => {
          if (!isPlayerLocked) {
            setSpeedMenuOpen((open) => !open);
          }
        }}
        onSelectSpeed={(speed) => {
          setPlaybackSpeed(speed);
          setSpeedMenuOpen(false);
        }}
        onCycleFit={() => setFitMode((current) => getNextPlayerFit(current))}
        onToggleRotate={toggleRotateLock}
        onOpenSubtitles={() => undefined}
        onPlayPause={togglePlayback}
        onSeekBy={seekBy}
        onSeekTo={seekTo}
        onSeekingChange={setIsSeeking}
        onRetry={() => {
          setError(undefined);
          setRetryAttempt((attempt) => attempt + 1);
          try {
            player.replay();
          } catch {
            // player already released
          }
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: '#111317', flex: 1 },
  rootLandscape: { backgroundColor: '#000000' },
});
