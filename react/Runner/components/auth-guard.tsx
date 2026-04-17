import { useEffect, useState, useCallback } from 'react';
import { useRouter, useSegments } from 'expo-router';
import { ActivityIndicator, StyleSheet } from 'react-native';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { supabase, Session } from '@/services/supabase';

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const segments = useSegments();
  const router = useRouter();
  const [isReady, setIsReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const checkSession = useCallback(async () => {
    try {
      // Add timeout to prevent hanging
      const timeoutPromise = new Promise<null>((_, reject) => 
        setTimeout(() => reject(new Error('Session check timeout')), 5000)
      );
      
      const sessionPromise = supabase.auth.getSession().then(({ data }) => data.session);
      
      const currentSession = await Promise.race([sessionPromise, timeoutPromise]);
      setSession(currentSession);
    } catch (error) {
      console.error('Session check error:', error);
      setSession(null);
    } finally {
      setIsReady(true);
    }
  }, []);

  useEffect(() => {
    // Check initial session
    checkSession();

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, newSession) => {
      console.log('Auth state changed:', event);
      setSession(newSession);
      
      if (!isReady) {
        setIsReady(true);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [checkSession]);

  useEffect(() => {
    if (!isReady) return;

    const route = segments[0];
    const isAuthRoute = route === 'signin' || route === 'verify';

    if (!session && !isAuthRoute) {
      // User not logged in and not on auth page
      router.replace('/signin');
    } else if (session && isAuthRoute) {
      // User logged in but on auth page
      router.replace('/(tabs)');
    }
  }, [session, segments, isReady, router]);

  if (!isReady) {
    return (
      <ThemedView style={styles.container}>
        <ActivityIndicator size="large" color={colors.primary} />
        <ThemedText style={styles.loadingText}>Loading...</ThemedText>
      </ThemedView>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  loadingText: {
    fontSize: 16,
    opacity: 0.7,
  },
});
