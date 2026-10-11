import { useEffect, useRef } from 'react';
import { BackHandler, Platform, ToastAndroid } from 'react-native';
import { router, usePathname } from 'expo-router';

// Tab screens other than Home. Check these paths match your tab files.
const TAB_ROOTS = ['/downloads', '/library', '/profile', '/search'];

export function useAndroidBackToHome() {
  const pathname = usePathname();
  const lastPress = useRef(0);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      try {
        if (TAB_ROOTS.includes(pathname)) {
          router.navigate('/');
          return true;
        }
        if (pathname === '/' || pathname === '/index') {
          const now = Date.now();
          if (now - lastPress.current < 2000) {
            BackHandler.exitApp();
            return true;
          }
          lastPress.current = now;
          ToastAndroid.show('Press back again to exit', ToastAndroid.SHORT);
          return true;
        }
      } catch {
        // fall through to default behaviour
      }
      return false; // modals, video player and stack screens close normally
    });
    return () => sub.remove();
  }, [pathname]);
}
