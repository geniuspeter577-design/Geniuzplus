import { useEffect, useRef } from 'react';
import { BackHandler, Platform, ToastAndroid } from 'react-native';
import { router, usePathname } from 'expo-router';
import { runHomeBackHandler } from '../utils/homeBack';

const HOME_PATHS = ['/', '/index', '/(tabs)', '/(tabs)/index'];

export function useBackToPrevious() {
  const pathname = usePathname();
  const lastPress = useRef(0);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      try {
        const atHome = HOME_PATHS.includes(pathname);
        if (!atHome) {
          if (pathname === '/shorts') {
            router.replace('/(tabs)');
            return true;
          }
          if (router.canGoBack()) router.back();
          else router.replace('/');
          return true;
        }
        // On Home: first let Home step back to Trending if it is on another category.
        if (runHomeBackHandler()) {
          lastPress.current = 0;
          return true;
        }
        const now = Date.now();
        if (now - lastPress.current < 2000) {
          BackHandler.exitApp();
          return true;
        }
        lastPress.current = now;
        ToastAndroid.show('Press back again to exit', ToastAndroid.SHORT);
        return true;
      } catch {
        return false;
      }
    });
    return () => sub.remove();
  }, [pathname]);
}
