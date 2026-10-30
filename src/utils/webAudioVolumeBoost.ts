export const MIN_WEB_VOLUME_BOOST = 100;
export const MAX_WEB_VOLUME_BOOST = 200;

export function clampWebVolumeBoost(value: number): number {
  return Math.max(MIN_WEB_VOLUME_BOOST, Math.min(MAX_WEB_VOLUME_BOOST, Number.isFinite(value) ? value : MIN_WEB_VOLUME_BOOST));
}

export function connectWebAudioVolumeBoost(video: HTMLVideoElement, context: AudioContext) {
  const gain = context.createGain();
  const compressor = context.createDynamicsCompressor();
  compressor.threshold.value = -3;
  compressor.knee.value = 0;
  compressor.ratio.value = 20;
  compressor.attack.value = 0.003;
  compressor.release.value = 0.25;

  const source = context.createMediaElementSource(video);
  source.connect(gain);
  gain.connect(compressor);
  compressor.connect(context.destination);

  return {
    gain,
    disconnect() {
      source.disconnect();
      gain.disconnect();
      compressor.disconnect();
    },
  };
}