import { useBackToPrevious } from '../src/hooks/useBackToPrevious';
import { Stack, router as ebRouter, type ErrorBoundaryProps, usePathname } from 'expo-router';
import { Pressable as EBPressable, ScrollView as EBScroll, Text as EBText, View as EBView } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppState, Platform, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { OfflineBanner } from '../src/components/OfflineBanner';
import { UpdatePrompt } from '../src/components/UpdatePrompt';
import { FirstOpenPrompt } from '../src/components/FirstOpenPrompt';
import { StudyModeProvider } from '../src/state/StudyModeContext';
import { FootballScorePin } from '../src/components/FootballScorePin';
import { HideInStudyMode } from '../src/components/HideInStudyMode';
import { AuthProvider } from '../src/state/AuthContext';
import { prewarmContentApi } from '../src/services/createContentService';
import { theme } from '../src/theme';
import { DownloadsProvider } from '../src/state/DownloadsContext';
import { LibraryProvider } from '../src/state/LibraryContext';
import { NetworkProvider } from '../src/state/NetworkContext';
import { FootballMatchesProvider } from '../src/state/FootballMatchesContext';
import { useGlobalAndroidBackNavigation } from '../src/utils/navigation';

export default function RootLayout() {
  useBackToPrevious();
  const pathname = usePathname();
  const isWideRoute = pathname.startsWith('/watch');
  // useGlobalAndroidBackNavigation();

  useEffect(() => {
    prewarmContentApi();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        prewarmContentApi();
      }
    });
    return () => subscription.remove();
  }, []);

  return (
    <View style={{ flex: 1, alignItems: 'center', backgroundColor: '#000000' }}><View style={{ flex: 1, width: '100%', maxWidth: Platform.OS === 'web' && !isWideRoute ? 480 : undefined, backgroundColor: theme.background }}><SafeAreaProvider>
      <AuthProvider>
        <NetworkProvider>
        <StudyModeProvider>
          <LibraryProvider>
            <DownloadsProvider>
              <FootballMatchesProvider>
                  <StatusBar style="light" />
                  <UpdatePrompt />
                  <FirstOpenPrompt />
                  <OfflineBanner />
                  <Stack
                    screenOptions={{
                      headerShown: false,
                      orientation: 'portrait',
                      contentStyle: {
                        backgroundColor: theme.background,
                      },
                    }}
                  >
                    <Stack.Screen name="(tabs)" />
                    <Stack.Screen name="content/[id]" options={{ presentation: 'modal' }} />
                    <Stack.Screen name="admin" options={{ presentation: 'modal' }} />
                    <Stack.Screen name="admin-status" options={{ presentation: 'modal' }} />
                    <Stack.Screen name="settings" options={{ presentation: 'modal' }} />
                    <Stack.Screen name="membership" options={{ presentation: 'fullScreenModal' }} />
                    <Stack.Screen name="watch/[id]" options={{ presentation: 'fullScreenModal' }} />
                    <Stack.Screen name="edit-profile" options={{ presentation: 'modal' }} />
                    <Stack.Screen name="shorts" options={{ presentation: 'fullScreenModal' }} />
                    <Stack.Screen name="+not-found" />
                  </Stack>
                  <HideInStudyMode><FootballScorePin /></HideInStudyMode>
              </FootballMatchesProvider>
            </DownloadsProvider>
          </LibraryProvider>
        </StudyModeProvider>
        </NetworkProvider>
      </AuthProvider>
    </SafeAreaProvider></View></View>
  );
}

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <EBView style={{ backgroundColor: '#0E1014', flex: 1, gap: 14, justifyContent: 'center', padding: 24 }}>
      <EBText style={{ color: '#FFFFFF', fontSize: 20, fontWeight: '800' }}>Something went wrong</EBText>
      <EBScroll style={{ maxHeight: 220 }}>
        <EBText style={{ color: '#9AA3AF', fontSize: 13, lineHeight: 19 }}>{String(error.message)}</EBText>
      </EBScroll>
      <EBPressable
        accessibilityRole="button"
        onPress={() => { void retry(); ebRouter.replace('/'); }}
        style={{ alignItems: 'center', backgroundColor: '#72F06A', borderRadius: 10, justifyContent: 'center', minHeight: 50 }}
      >
        <EBText style={{ color: '#0E1014', fontSize: 15, fontWeight: '900' }}>Go Home</EBText>
      </EBPressable>
    </EBView>
  );
}
