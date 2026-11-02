import { MAX_REEL_FILE_SIZE_BYTES } from '../config/reels';

export function getReelFileSizeError(fileSize: number | null | undefined) {
  if (typeof fileSize !== 'number' || !Number.isFinite(fileSize) || fileSize < 0) {
    return "We couldn't check this video's size. Select it again and try.";
  }
  if (fileSize > MAX_REEL_FILE_SIZE_BYTES) {
    return 'This video is larger than 30 MB. Choose a smaller video.';
  }
  return null;
}
