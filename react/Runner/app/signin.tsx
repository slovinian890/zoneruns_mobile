import { StyleSheet, View, TouchableOpacity, Alert, KeyboardAvoidingView, Platform, Animated } from 'react-native';
import { useState, useRef, useEffect } from 'react';
import { router } from 'expo-router';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { useAmbientVariant } from '@/components/ambient-background';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spacing, AuroraColors } from '@/constants/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { signIn, signUp } from '@/services/authService';

type NacinAvtentikacije = 'signin' | 'signup';

export default function SignInScreen() {
  useAmbientVariant('default');
  const [nacin, setNacin] = useState<NacinAvtentikacije>('signin');
  const [eposta, setEposta] = useState('');
  const [geslo, setGeslo] = useState('');
  const [uporabniskoIme, setUporabniskoIme] = useState('');
  const [nalaganje, setNalaganje] = useState(false);
  const [prikaziGeslo, setPrikaziGeslo] = useState(false);

  // Icon animation
  const dihalniPulz = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(dihalniPulz, {
          toValue: 1.08,
          duration: 2000,
          useNativeDriver: true,
        }),
        Animated.timing(dihalniPulz, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  const preveriEposto = (ep: string): boolean => {
    const regexEposte = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regexEposte.test(ep.trim());
  };

  const preveriGeslo = (g: string): boolean => {
    return g.length >= 6;
  };

  const obdelajPrijavo = async () => {
    if (!eposta.trim()) {
      Alert.alert('Error', 'Please enter your email address');
      return;
    }

    if (!preveriEposto(eposta)) {
      Alert.alert('Error', 'Please enter a valid email address');
      return;
    }

    if (!geslo) {
      Alert.alert('Error', 'Please enter your password');
      return;
    }

    setNalaganje(true);
    const rezultat = await signIn({ email: eposta.trim(), password: geslo });
    setNalaganje(false);

    if (rezultat.success) {
      router.replace('/(tabs)');
    } else {
      Alert.alert('Sign in failed', rezultat.error || 'Invalid credentials');
    }
  };

  const obdelajRegistracijo = async () => {
    if (!eposta.trim()) {
      Alert.alert('Error', 'Please enter your email address');
      return;
    }

    if (!preveriEposto(eposta)) {
      Alert.alert('Error', 'Please enter a valid email address');
      return;
    }

    if (!uporabniskoIme.trim()) {
      Alert.alert('Error', 'Please enter a username');
      return;
    }

    if (uporabniskoIme.trim().length < 3) {
      Alert.alert('Error', 'Username must be at least 3 characters');
      return;
    }

    if (!preveriGeslo(geslo)) {
      Alert.alert('Error', 'Password must be at least 6 characters');
      return;
    }

    setNalaganje(true);
    const rezultat = await signUp({
      email: eposta.trim(),
      password: geslo,
      username: uporabniskoIme.trim(),
    });
    setNalaganje(false);

    if (rezultat.success) {
      // Check whether email confirmation is required
      if (rezultat.user && !rezultat.session) {
        Alert.alert(
          'Check your email',
          "We've sent you a confirmation link. Check your email to confirm your account.",
          [{ text: 'OK' }]
        );
      } else {
        router.replace('/(tabs)');
      }
    } else {
      Alert.alert('Sign up failed', rezultat.error || 'Could not create account');
    }
  };

  const obdelajOddajo = () => {
    if (nacin === 'signin') {
      obdelajPrijavo();
    } else {
      obdelajRegistracijo();
    }
  };

  const preklopiNacin = () => {
    setNacin(nacin === 'signin' ? 'signup' : 'signin');
    setGeslo('');
    setUporabniskoIme('');
  };

  return (
    <ThemedView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}>
        <View style={styles.content}>
          <View style={styles.header}>
            <View style={styles.iconContainer}>
              <Animated.View
                style={[
                  styles.breathingRing,
                  {
                    backgroundColor: AuroraColors.primarySoft,
                    transform: [{ scale: dihalniPulz }],
                  }
                ]}
              />
              <View style={styles.iconWrapper}>
                <IconSymbol name="figure.run" size={48} color={AuroraColors.primary} />
              </View>
            </View>

            <ThemedText type="h1" style={styles.title}>Run Tracker</ThemedText>
            <ThemedText type="body" variant="secondary" style={styles.subtitle}>
              {nacin === 'signin' ? 'Welcome back!' : 'Create your account'}
            </ThemedText>
          </View>

          <View style={styles.form}>
            {nacin === 'signup' && (
              <View style={styles.inputContainer}>
                <ThemedText type="bodyBold" style={styles.label}>Username</ThemedText>
                <Input
                  icon="person.fill"
                  value={uporabniskoIme}
                  onChangeText={setUporabniskoIme}
                  placeholder="Choose a username"
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!nalaganje}
                />
              </View>
            )}

            <View style={styles.inputContainer}>
              <ThemedText type="bodyBold" style={styles.label}>Email address</ThemedText>
              <Input
                icon="envelope.fill"
                value={eposta}
                onChangeText={setEposta}
                placeholder="you@email.com"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!nalaganje}
              />
            </View>

            <View style={styles.inputContainer}>
              <ThemedText type="bodyBold" style={styles.label}>Password</ThemedText>
              <Input
                icon="lock.fill"
                value={geslo}
                onChangeText={setGeslo}
                placeholder={nacin === 'signin' ? 'Enter password' : 'Create password'}
                secureTextEntry={!prikaziGeslo}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!nalaganje}
                rightElement={
                  <TouchableOpacity onPress={() => setPrikaziGeslo(!prikaziGeslo)} style={styles.eyeIcon} hitSlop={8}>
                    <IconSymbol
                      name={prikaziGeslo ? 'eye.slash.fill' : 'eye.fill'}
                      size={18}
                      color={AuroraColors.textMuted}
                    />
                  </TouchableOpacity>
                }
              />
              {nacin === 'signup' && (
                <ThemedText type="caption" variant="muted" style={styles.passwordHint}>
                  Must be at least 6 characters
                </ThemedText>
              )}
            </View>

            {nacin === 'signin' && (
              <TouchableOpacity
                style={styles.forgotPassword}
                onPress={() => router.push('/verify')}
                activeOpacity={0.7}>
                <ThemedText type="bodySmall" variant="secondary">
                  Forgot password?
                </ThemedText>
              </TouchableOpacity>
            )}

            <Button
              label={
                nalaganje
                  ? (nacin === 'signin' ? 'Signing in...' : 'Creating account...')
                  : (nacin === 'signin' ? 'Sign in' : 'Create account')
              }
              onPress={obdelajOddajo}
              disabled={nalaganje}
              loading={nalaganje}
              style={styles.submitButton}
            />

            <View style={styles.toggleContainer}>
              <ThemedText type="body" variant="secondary">
                {nacin === 'signin' ? "Don't have an account? " : 'Already have an account? '}
              </ThemedText>
              <TouchableOpacity onPress={preklopiNacin} disabled={nalaganje}>
                <ThemedText type="bodyBold" variant="primary">
                  {nacin === 'signin' ? 'Sign up' : 'Sign in'}
                </ThemedText>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  keyboardView: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.md,
    maxWidth: 440,
    width: '100%',
    alignSelf: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: Spacing.xxl,
  },
  iconContainer: {
    position: 'relative',
    width: 100,
    height: 100,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  breathingRing: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  iconWrapper: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: AuroraColors.surfaceSolid,
    borderWidth: 1,
    borderColor: AuroraColors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    marginBottom: Spacing.xs,
  },
  subtitle: {
  },
  form: {
    width: '100%',
  },
  inputContainer: {
    marginBottom: Spacing.md,
  },
  label: {
    marginBottom: Spacing.sm,
  },
  eyeIcon: {
    padding: Spacing.xs,
    marginRight: Spacing.xs,
  },
  passwordHint: {
    marginTop: Spacing.xs,
  },
  forgotPassword: {
    alignSelf: 'flex-end',
    marginBottom: Spacing.md,
  },
  submitButton: {
    width: '100%',
    marginBottom: Spacing.md,
  },
  toggleContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
});
