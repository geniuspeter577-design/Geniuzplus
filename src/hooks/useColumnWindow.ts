import { Platform, useWindowDimensions as useRNWindowDimensions } from 'react-native';

export const WEB_COLUMN_MAX_WIDTH = 480;

export function useWindowDimensions() {
  const dimensions = useRNWindowDimensions();
  if (Platform.OS === 'web') {
    return { ...dimensions, width: Math.min(dimensions.width, WEB_COLUMN_MAX_WIDTH) };
  }
  return dimensions;
}
