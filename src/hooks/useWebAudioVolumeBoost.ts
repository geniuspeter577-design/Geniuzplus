import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import type { VideoPlayer } from 'expo-video';

const WEB_AUDIO_BOOST_ENABLED = false;

import {
  clampWebVolumeBoost,
  connectWebAudioVolumeBoost,
  MIN_WEB_VOLUME_BOOST,
} from '../utils/webAudioVolumeBoost';

type WebVideoPlayer = VideoPlayer & { _mountedVideos?: Iterable<HTMLVideoElement> };

export function useWebAudioVolumeBoost(player: VideoPlayer) {
  const contextRef = useRef<AudioContext | null>(null);
  const graphRef = useRef<ReturnType<typeof connectWebAudioVolumeBoost> | null>(null);
  const volumeBoostRef = useRef(MIN_WEB_VOLUME_BOOST);
  const fallbackAttemptedRef = useRef(false);
  const [volumeBoost, setVolumeBoost] = useState(MIN_WEB_VOLUME_BOOST);
  const [corsEnabled, setCorsEnabled] = useState(Platform.OS === 'web');
  const [boostAvailable, setBoostAvailable] = useState(Platform.OS === 'web');

  const closeAudioContext = useCallback(() => {
    graphRef.current?.disconnect();
    graphRef.current = null;
    const context = contextRef.current;
    contextRef.current = null;
    if (context && context.state !== 'closed') {
      void context.close().catch(() => undefined);
    }
  }, []);

  const fallbackToPlainAudio = useCallback(() => {
    if (fallbackAttemptedRef.current) {
      return;
    }
    fallbackAttemptedRef.current = true;
    volumeBoostRef.current = MIN_WEB_VOLUME_BOOST;
    setVolumeBoost(MIN_WEB_VOLUME_BOOST);
    setBoostAvailable(false);
    closeAudioContext();
    setCorsEnabled(false);
  }, [closeAudioContext]);

  const activateFromUserGesture = () => {
    if (!WEB_AUDIO_BOOST_ENABLED || Platform.OS !== 'web' || typeof window === 'undefined') {
      return;
    }
    const video = [...((player as WebVideoPlayer)._mountedVideos ?? [])][0];
    if (!(video instanceof HTMLVideoElement)) {
      return;
    }

    let context = contextRef.current;
    if (!context) {
      try {
        context = new window.AudioContext();
        contextRef.current = context;
      } catch {
        setBoostAvailable(false);
        return;
      }
    }

    void context.resume().then(() => {
      if (contextRef.current !== context || graphRef.current || !video.isConnected) {
        return;
      }
      try {
        const graph = connectWebAudioVolumeBoost(video, context);
        graph.gain.gain.value = volumeBoostRef.current / 100;
        graphRef.current = graph;
      } catch {
        closeAudioContext();
        setBoostAvailable(false);
        fallbackToPlainAudio();
      }
    }).catch(() => {
      closeAudioContext();
      setBoostAvailable(false);
    });
  };

  const setVolumeBoostPercent = (value: number) => {
    const nextValue = clampWebVolumeBoost(value);
    volumeBoostRef.current = nextValue;
    setVolumeBoost(nextValue);
    const context = contextRef.current;
    const gain = graphRef.current?.gain.gain;
    if (gain && context) {
      gain.setTargetAtTime(nextValue / 100, context.currentTime, 0.025);
    }
    activateFromUserGesture();
  };

  useEffect(() => {
    if (!WEB_AUDIO_BOOST_ENABLED || Platform.OS !== 'web') {
      return undefined;
    }
    const subscription = player.addListener('statusChange', ({ status }) => {
      if (status !== 'error' || fallbackAttemptedRef.current) {
        return;
      }
      fallbackToPlainAudio();
    });
    return () => subscription.remove();
  }, [fallbackToPlainAudio, player]);

  useEffect(() => () => closeAudioContext(), [closeAudioContext]);

  return {
    viewKey: undefined,
    crossOrigin: undefined,
    boostAvailable: false,
    volumeBoost,
    activateFromUserGesture,
    setVolumeBoostPercent,
  };
}