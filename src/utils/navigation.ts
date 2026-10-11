import { router, type Href, useNavigation, usePathname } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';
import { BackHandler, Platform, ToastAndroid } from 'react-native';

export function backOrReplace(fallback: Href = '/') {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace(fallback);
  }
}

export function useGlobalAndroidBackNavigation() {
  const pathname = usePathname();
  const navigation = useNavigation();
  const lastBackAtRef = useRef<number>(0);
  const navigatingHomeRef = useRef(false);
  const isHomeRoute = pathname === '/' || pathname === '/(tabs)' || pathname === '/(tabs)/index';
  const isModalLikeRoute = [
    '/content/',
    '/watch/',
    '/membership',
    '/settings',
    '/edit-profile',
    '/admin',
    '/auth/',
    '/shorts',
    '/reels',
    '/transfer-history',
    '/notifications',
  ].some((prefix) => pathname === prefix || pathname.startsWith(prefix));

  useEffect(() => {
    lastBackAtRef.current = 0;
    navigatingHomeRef.current = false;
  }, [pathname]);

  const handleBackPress = useCallback(() => {
    if (Platform.OS !== 'android') {
      return false;
    }

    if (isHomeRoute) {
      const now = Date.now();
      if (now - lastBackAtRef.current <= 2000) {
        BackHandler.exitApp();
        return true;
      }
      lastBackAtRef.current = now;
      ToastAndroid.show('Press back again to exit', ToastAndroid.SHORT);
      return true;
    }

    if (isModalLikeRoute) {
      return false;
    }

    navigatingHomeRef.current = true;
    router.replace('/(tabs)');
    return true;
  }, [isHomeRoute, isModalLikeRoute]);

  useEffect(() => {
    if (Platform.OS !== 'android') {
      return;
    }
    const subscription = BackHandler.addEventListener('hardwareBackPress', handleBackPress);
    return () => subscription.remove();
  }, [handleBackPress]);

  useEffect(() => {
    if (!navigation || Platform.OS !== 'android') {
      return;
    }

    const unsubscribe = navigation.addListener?.('beforeRemove', (event) => {
      const actionType = event.data?.action?.type;
      if (
        isHomeRoute ||
        isModalLikeRoute ||
        navigatingHomeRef.current ||
        (actionType !== 'GO_BACK' && actionType !== 'POP')
      ) {
        return;
      }

      event.preventDefault();
      navigatingHomeRef.current = true;
      router.replace('/(tabs)');
    });

    return () => unsubscribe?.();
  }, [isHomeRoute, isModalLikeRoute, navigation]);
}
