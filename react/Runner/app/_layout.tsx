import { DarkTheme, ThemeProvider, type Theme } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import 'react-native-reanimated';

import AuthGuard from '@/components/auth-guard';
import { AmbientBackgroundProvider } from '@/components/ambient-background';
import { AttackAlertProvider } from '@/components/attack-alert-provider';
import { AuroraColors } from '@/constants/theme';
// Registers the background-location task at module load, before any
// screen mounts — required so Android/iOS can wake it while backgrounded.
import '@/services/locationTask';

export const unstable_settings = {
  anchor: '(tabs)',
};

// React Navigation's own screen containers, back-gesture tint and any
// default separators all read from this — without it they'd stay on RN
// Navigation's stock near-black instead of the app's actual palette.
const AppNavigationTheme: Theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: 'transparent', // let <AmbientBackgroundProvider/> show through
    card: AuroraColors.bgElevated,
    border: AuroraColors.border,
    primary: AuroraColors.primary,
    text: AuroraColors.text,
    notification: AuroraColors.danger,
  },
};

export default function RootLayout() {
  useEffect(() => {
    // Initialize offline queue on app start (lazy load to prevent blocking)
    const initOfflineQueue = async () => {
      try {
        const { offlineQueue } = await import('@/services/offlineQueue');
        await offlineQueue.init();
      } catch (error) {
        console.error('Failed to initialize offline queue:', error);
      }
    };
    
    initOfflineQueue();

    // Cleanup on unmount
    return () => {
      import('@/services/offlineQueue').then(({ offlineQueue }) => {
        offlineQueue.cleanup();
      }).catch(() => {});
    };
  }, []);

  return (
    <SafeAreaProvider>
      <ThemeProvider value={AppNavigationTheme}>
        <AmbientBackgroundProvider>
          <AuthGuard>
            <AttackAlertProvider>
              <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: 'transparent' } }}>
                <Stack.Screen name="signin" options={{ presentation: 'fullScreenModal' }} />
                <Stack.Screen name="verify" options={{ presentation: 'fullScreenModal' }} />
                <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
                <Stack.Screen name="user-profile" options={{ headerShown: false }} />
                <Stack.Screen name="messages" options={{ headerShown: false }} />
                <Stack.Screen name="chat" options={{ headerShown: false }} />
                <Stack.Screen name="groups" options={{ headerShown: false }} />
                <Stack.Screen name="create-group" options={{ headerShown: false }} />
                <Stack.Screen name="group-detail" options={{ headerShown: false }} />
                <Stack.Screen name="group-chat" options={{ headerShown: false }} />
                <Stack.Screen name="analytics" options={{ headerShown: false }} />
              </Stack>
              <StatusBar style="light" />
            </AttackAlertProvider>
          </AuthGuard>
        </AmbientBackgroundProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
