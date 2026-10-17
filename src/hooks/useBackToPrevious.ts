import { useEffect, useRef } from 'react';
import { BackHandler, Platform, ToastAndroid } from 'react-native';
import { router, usePathname } from 'expo-router';
import { runHomeBackHandler } from '../utils/homeBack';
import { runBackInterceptors } from '../utils/backInterceptors';

const HOME_PATHS = ['/', '/index', '/(tabs)', '/(tabs)/index'];

// One back system for the whole app:
// - every screen goes back one page at a time
// - if there is no page to go back to, go Home (never leave the app from a inner page)
// - on Home: first step back to Trending, then "press back again to exit"
export function useBackToPrevious() {
  const pathname = usePathname();
  const lastBackAt = useRef(0);

  useEffect(() => {
    lastBackAt.current = 0;
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      try {
        if (runBackInterceptors()) return true;
        if (!HOME_PATHS.includes(pathname)) {
          if (router.canGoBack()) router.back();
          else router.replace('/');
          return true;
        }
        if (runHomeBackHandler()) {
          lastBackAt.current = 0;
          return true;
        }
        const now = Date.now();
        if (now - lastBackAt.current <= 2000) {
          BackHandler.exitApp();
          return true;
        }
        lastBackAt.current = now;
        ToastAndroid.show('Press back again to exit', ToastAndroid.SHORT);
        return true;
      } catch {
        try {
          router.replace('/');
        } catch {
          // ignore
        }
        return true;
      }
    });
    return () => sub.remove();
  }, [pathname]);
}
