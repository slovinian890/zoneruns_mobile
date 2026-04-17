import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import AuthGuard from '@/components/auth-guard';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();

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
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AuthGuard>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="signin" options={{ presentation: 'fullScreenModal' }} />
          <Stack.Screen name="verify" options={{ presentation: 'fullScreenModal' }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
          <Stack.Screen name="user-profile" options={{ headerShown: false }} />
        </Stack>
        <StatusBar style="auto" />
      </AuthGuard>
    </ThemeProvider>
  );
}
