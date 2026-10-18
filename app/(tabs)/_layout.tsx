import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { theme } from '../../src/theme';
import { useStudyMode } from '../../src/state/StudyModeContext';

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const study = useStudyMode();
  return (
    <Tabs backBehavior="history"
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#12161D',
          borderTopColor: '#1A1D23',
          borderTopWidth: 1,
          height: 68 + insets.bottom,
          paddingBottom: Math.max(10, insets.bottom),
          paddingTop: 8,
        },
        tabBarActiveTintColor: theme.accent,
        tabBarInactiveTintColor: '#7F8A92',
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '700',
          marginTop: 2,
        },
        tabBarIcon: ({ color, size, focused }) => {
          let iconName: keyof typeof Ionicons.glyphMap = 'home';

          switch (route.name) {
            case 'index':
              iconName = focused ? 'home' : 'home-outline';
              break;
            case 'search':
              iconName = focused ? 'search' : 'search-outline';
              break;
            case 'library':
              iconName = focused ? 'library' : 'library-outline';
              break;
            case 'downloads':
              iconName = focused ? 'download' : 'download-outline';
              break;
            case 'profile':
              iconName = focused ? 'person' : 'person-outline';
              break;
            default:
              break;
          }

          return <Ionicons name={iconName} size={size} color={color} />;
        },
      })}
    >
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="search" options={{ title: 'Search', href: study.enabled ? null : undefined }} />
      <Tabs.Screen name="library" options={{ title: 'Library', href: study.enabled ? null : undefined }} />
      <Tabs.Screen name="downloads" options={{ title: 'Downloads' }} />
      <Tabs.Screen name="profile" options={{ title: 'Me' }} />
    </Tabs>
  );
}
