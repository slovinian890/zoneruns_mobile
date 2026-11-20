import { StyleSheet, View, TextInput, TouchableOpacity, Alert, KeyboardAvoidingView, Platform, Animated } from 'react-native';
import { useState, useRef, useEffect } from 'react';
import { router } from 'expo-router';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, BorderRadius, AuroraColors } from '@/constants/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { sendPasswordReset } from '@/services/authService';

export default function ForgotPasswordScreen() {
  const barvnaShema = useColorScheme();
  const barve = Colors[barvnaShema ?? 'light'];
  const [eposta, setEposta] = useState('');
  const [nalaganje, setNalaganje] = useState(false);
  const [epostaPoslana, setEpostaPoslana] = useState(false);
  
  // Breathing animation for the icon
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

  const ponastaviGeslo = async () => {
    if (!eposta.trim()) {
      Alert.alert('Error', 'Please enter your email address');
      return;
    }

    if (!preveriEposto(eposta)) {
      Alert.alert('Error', 'Please enter a valid email address');
      return;
    }

    setNalaganje(true);
    const rezultat = await sendPasswordReset(eposta.trim());
    setNalaganje(false);

    if (rezultat.success) {
      setEpostaPoslana(true);
    } else {
      Alert.alert('Error', rezultat.error || 'Failed to send reset email. Please try again.');
    }
  };

  if (epostaPoslana) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.content}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
            activeOpacity={0.7}>
            <IconSymbol name="chevron.left" size={24} color={barve.text} />
          </TouchableOpacity>

          <View style={styles.header}>
            <View style={styles.iconContainer}>
              <Animated.View 
                style={[
                  styles.breathingRing,
                  {
                    backgroundColor: AuroraColors.surface,
                    transform: [{ scale: dihalniPulz }],
                  }
                ]} 
              />
              <View style={[styles.iconWrapper, { backgroundColor: AuroraColors.primary + '26' }]}>
                <IconSymbol name="checkmark.circle.fill" size={48} color={AuroraColors.primary} />
              </View>
            </View>
            
            <ThemedText type="h2" style={styles.title}>Check your email</ThemedText>
            <ThemedText type="body" variant="secondary" style={styles.subtitle}>
              We&apos;ve sent a password reset link to
            </ThemedText>
            <ThemedText type="bodyBold" style={[styles.email, { color: barve.primary }]}>
              {eposta}
            </ThemedText>
            <ThemedText type="body" variant="muted" style={styles.instructions}>
              Click the link in the email to reset your password. If you don&apos;t see it, check your spam folder.
            </ThemedText>
          </View>

          <View style={styles.form}>
            <TouchableOpacity
              style={[styles.button, { backgroundColor: barve.primary }]}
              onPress={() => router.replace('/signin')}
              activeOpacity={0.7}>
              <ThemedText type="bodyBold" lightColor={AuroraColors.onPrimary} darkColor={AuroraColors.onPrimary}>
                Back to sign in
              </ThemedText>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.secondaryButton, { borderColor: barve.border }]}
              onPress={() => {
                setEpostaPoslana(false);
                setEposta('');
              }}
              activeOpacity={0.7}>
              <ThemedText type="bodyBold" variant="secondary">
                Try a different email address
              </ThemedText>
            </TouchableOpacity>
          </View>
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}>
        <View style={styles.content}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
            activeOpacity={0.7}>
            <IconSymbol name="chevron.left" size={24} color={barve.text} />
          </TouchableOpacity>

          <View style={styles.header}>
            <View style={styles.iconContainer}>
              <Animated.View 
                style={[
                  styles.breathingRing,
                  {
                    backgroundColor: AuroraColors.surface,
                    transform: [{ scale: dihalniPulz }],
                  }
                ]} 
              />
              <View style={styles.iconWrapper}>
                <IconSymbol name="key.fill" size={48} color={barve.primary} />
              </View>
            </View>
            
            <ThemedText type="h2" style={styles.title}>Reset password</ThemedText>
            <ThemedText type="body" variant="secondary" style={styles.subtitle}>
              Enter your email address and we&apos;ll send you a password reset link
            </ThemedText>
          </View>

          <View style={styles.form}>
            <View style={styles.inputContainer}>
              <ThemedText type="bodyBold" style={styles.label}>Email address</ThemedText>
              <View style={[
                styles.inputWrapper,
                {
                  borderColor: barve.border,
                  backgroundColor: barvnaShema === 'dark' ? barve.card : barve.background,
                }
              ]}>
                <IconSymbol name="envelope.fill" size={18} color={barve.icon} style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, { color: barve.text }]}
                  value={eposta}
                  onChangeText={setEposta}
                  placeholder="you@email.com"
                  placeholderTextColor={barve.textMuted}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!nalaganje}
                  autoFocus
                />
              </View>
            </View>

            <TouchableOpacity
              style={[
                styles.button,
                { backgroundColor: barve.primary },
                nalaganje && { opacity: 0.6 },
              ]}
              onPress={ponastaviGeslo}
              disabled={nalaganje}
              activeOpacity={0.7}>
              <ThemedText type="bodyBold" lightColor={AuroraColors.onPrimary} darkColor={AuroraColors.onPrimary}>
                {nalaganje ? 'Sending...' : 'Send reset link'}
              </ThemedText>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.backToSignIn}
              onPress={() => router.back()}
              activeOpacity={0.7}>
              <ThemedText type="body" variant="secondary">
                Remember your password?{' '}
                <ThemedText type="bodyBold" style={{ color: barve.primary }}>
                  Sign in
                </ThemedText>
              </ThemedText>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
  backButton: {
    position: 'absolute',
    top: 60,
    left: Spacing.md,
    zIndex: 1,
  },
  header: {
    alignItems: 'center',
    marginBottom: Spacing.xl,
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
    opacity: 0.2,
  },
  iconWrapper: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: AuroraColors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    marginBottom: Spacing.xs,
    textAlign: 'center',
  },
  subtitle: {
    textAlign: 'center',
    paddingHorizontal: Spacing.lg,
  },
  email: {
    marginTop: Spacing.sm,
    textAlign: 'center',
  },
  instructions: {
    textAlign: 'center',
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.lg,
    lineHeight: 22,
  },
  form: {
    width: '100%',
  },
  inputContainer: {
    marginBottom: Spacing.lg,
  },
  label: {
    marginBottom: Spacing.sm,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: BorderRadius.card,
    paddingHorizontal: Spacing.md,
  },
  inputIcon: {
    marginRight: Spacing.sm,
  },
  input: {
    flex: 1,
    fontSize: 16,
    paddingVertical: Spacing.md,
    fontFamily: Platform.select({
      ios: 'SF Pro Text',
      android: 'sans-serif',
      default: 'sans-serif',
    }),
  },
  button: {
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.card,
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  secondaryButton: {
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.card,
    alignItems: 'center',
    borderWidth: 1,
  },
  backToSignIn: {
    alignItems: 'center',
    paddingVertical: Spacing.md,
  },
});
