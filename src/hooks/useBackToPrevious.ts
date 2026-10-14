import { useEffect, useRef } from 'react';
import { Alert, BackHandler, Platform } from 'react-native';
import { router, usePathname } from 'expo-router';
import { runHomeBackHandler } from '../utils/homeBack';
import { runBackInterceptors } from '../utils/backInterceptors';

const HOME_PATHS = ['/', '/index', '/(tabs)', '/(tabs)/index'];

export function useBackToPrevious() {
  const pathname = usePathname();
  const askingExit = useRef(false);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      try {
        if (runBackInterceptors()) return true;
        const atHome = HOME_PATHS.includes(pathname);
        if (!atHome) {
          if (pathname === '/shorts') {
            if (router.canGoBack()) router.back();
            else router.replace('/');
            return true;
          }
          if (router.canGoBack()) router.back();
          else router.replace('/');
          return true;
        }
        // On Home: first let Home step back to Trending if it is on another category.
        if (runHomeBackHandler()) {
          return true;
        }
        if (askingExit.current) return true;
        askingExit.current = true;
        Alert.alert(
          'Exit app?',
          'Do you want to leave Geniuzplus?',
          [
            { text: 'Stay', style: 'cancel', onPress: () => { askingExit.current = false; } },
            { text: 'Exit', style: 'destructive', onPress: () => { askingExit.current = false; BackHandler.exitApp(); } },
          ],
          { cancelable: true, onDismiss: () => { askingExit.current = false; } },
        );
        return true;
      } catch {
        return false;
      }
    });
    return () => sub.remove();
  }, [pathname]);
}
