import { StyleSheet, View, TextInput, TouchableOpacity, Alert, KeyboardAvoidingView, Platform, Animated } from 'react-native';
import { useState, useRef, useEffect } from 'react';
import { router } from 'expo-router';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, BorderRadius, CleanPaceColors } from '@/constants/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { signIn, signUp } from '@/services/authService';

type NacinAvtentikacije = 'signin' | 'signup';

export default function SignInScreen() {
  const barvnaShema = useColorScheme();
  const barve = Colors[barvnaShema ?? 'light'];
  const [nacin, setNacin] = useState<NacinAvtentikacije>('signin');
  const [eposta, setEposta] = useState('');
  const [geslo, setGeslo] = useState('');
  const [uporabniskoIme, setUporabniskoIme] = useState('');
  const [nalaganje, setNalaganje] = useState(false);
  const [prikaziGeslo, setPrikaziGeslo] = useState(false);
  
  // Animacija za ikono
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
      Alert.alert('Napaka', 'Prosimo, vnesite vaš e-poštni naslov');
      return;
    }

    if (!preveriEposto(eposta)) {
      Alert.alert('Napaka', 'Prosimo, vnesite veljaven e-poštni naslov');
      return;
    }

    if (!geslo) {
      Alert.alert('Napaka', 'Prosimo, vnesite vaše geslo');
      return;
    }

    setNalaganje(true);
    const rezultat = await signIn({ email: eposta.trim(), password: geslo });
    setNalaganje(false);

    if (rezultat.success) {
      router.replace('/(tabs)');
    } else {
      Alert.alert('Prijava neuspešna', rezultat.error || 'Neveljavni podatki');
    }
  };

  const obdelajRegistracijo = async () => {
    if (!eposta.trim()) {
      Alert.alert('Napaka', 'Prosimo, vnesite vaš e-poštni naslov');
      return;
    }

    if (!preveriEposto(eposta)) {
      Alert.alert('Napaka', 'Prosimo, vnesite veljaven e-poštni naslov');
      return;
    }

    if (!uporabniskoIme.trim()) {
      Alert.alert('Napaka', 'Prosimo, vnesite uporabniško ime');
      return;
    }

    if (uporabniskoIme.trim().length < 3) {
      Alert.alert('Napaka', 'Uporabniško ime mora imeti vsaj 3 znake');
      return;
    }

    if (!preveriGeslo(geslo)) {
      Alert.alert('Napaka', 'Geslo mora imeti vsaj 6 znakov');
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
      // Preveri, ali je potrebna potrditev e-pošte
      if (rezultat.user && !rezultat.session) {
        Alert.alert(
          'Preverite e-pošto',
          'Poslali smo vam potrditveno povezavo. Preverite e-pošto za potrditev računa.',
          [{ text: 'V redu' }]
        );
      } else {
        router.replace('/(tabs)');
      }
    } else {
      Alert.alert('Registracija neuspešna', rezultat.error || 'Računa ni mogoče ustvariti');
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
                    backgroundColor: CleanPaceColors.frostBlue,
                    transform: [{ scale: dihalniPulz }],
                  }
                ]} 
              />
              <View style={styles.iconWrapper}>
                <IconSymbol name="figure.run" size={48} color={barve.primary} />
              </View>
            </View>
            
            <ThemedText type="h1" style={styles.title}>Run Tracker</ThemedText>
            <ThemedText type="body" variant="secondary" style={styles.subtitle}>
              {nacin === 'signin' ? 'Dobrodošli nazaj!' : 'Ustvarite svoj račun'}
            </ThemedText>
          </View>

          <View style={styles.form}>
            {nacin === 'signup' && (
              <View style={styles.inputContainer}>
                <ThemedText type="bodyBold" style={styles.label}>Uporabniško ime</ThemedText>
                <View style={[
                  styles.inputWrapper, 
                  { 
                    borderColor: barve.border,
                    backgroundColor: barvnaShema === 'dark' ? barve.card : barve.background,
                  }
                ]}>
                  <IconSymbol name="person.fill" size={18} color={barve.icon} style={styles.inputIcon} />
                  <TextInput
                    style={[styles.input, { color: barve.text }]}
                    value={uporabniskoIme}
                    onChangeText={setUporabniskoIme}
                    placeholder="Izberite uporabniško ime"
                    placeholderTextColor={barve.textMuted}
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!nalaganje}
                  />
                </View>
              </View>
            )}

            <View style={styles.inputContainer}>
              <ThemedText type="bodyBold" style={styles.label}>E-poštni naslov</ThemedText>
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
                  placeholder="vas@email.com"
                  placeholderTextColor={barve.textMuted}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!nalaganje}
                />
              </View>
            </View>

            <View style={styles.inputContainer}>
              <ThemedText type="bodyBold" style={styles.label}>Geslo</ThemedText>
              <View style={[
                styles.inputWrapper, 
                { 
                  borderColor: barve.border,
                  backgroundColor: barvnaShema === 'dark' ? barve.card : barve.background,
                }
              ]}>
                <IconSymbol name="lock.fill" size={18} color={barve.icon} style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, { color: barve.text }]}
                  value={geslo}
                  onChangeText={setGeslo}
                  placeholder={nacin === 'signin' ? 'Vnesite geslo' : 'Ustvarite geslo'}
                  placeholderTextColor={barve.textMuted}
                  secureTextEntry={!prikaziGeslo}
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!nalaganje}
                />
                <TouchableOpacity onPress={() => setPrikaziGeslo(!prikaziGeslo)} style={styles.eyeIcon}>
                  <IconSymbol 
                    name={prikaziGeslo ? 'eye.slash.fill' : 'eye.fill'} 
                    size={18} 
                    color={barve.icon} 
                  />
                </TouchableOpacity>
              </View>
              {nacin === 'signup' && (
                <ThemedText type="caption" variant="muted" style={styles.passwordHint}>
                  Mora vsebovati vsaj 6 znakov
                </ThemedText>
              )}
            </View>

            {nacin === 'signin' && (
              <TouchableOpacity
                style={styles.forgotPassword}
                onPress={() => router.push('/verify')}
                activeOpacity={0.7}>
                <ThemedText type="bodySmall" variant="secondary">
                  Pozabljeno geslo?
                </ThemedText>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[
                styles.button,
                { backgroundColor: barve.primary },
                nalaganje && { opacity: 0.6 },
              ]}
              onPress={obdelajOddajo}
              disabled={nalaganje}
              activeOpacity={0.7}>
              <ThemedText type="bodyBold" lightColor={CleanPaceColors.offWhite} darkColor={CleanPaceColors.offWhite}>
                {nalaganje 
                  ? (nacin === 'signin' ? 'Prijavljanje...' : 'Ustvarjanje računa...') 
                  : (nacin === 'signin' ? 'Prijava' : 'Ustvari račun')
                }
              </ThemedText>
            </TouchableOpacity>

            <View style={styles.toggleContainer}>
              <ThemedText type="body" variant="secondary">
                {nacin === 'signin' ? 'Nimate računa? ' : 'Že imate račun? '}
              </ThemedText>
              <TouchableOpacity onPress={preklopiNacin} disabled={nalaganje}>
                <ThemedText type="bodyBold" style={{ color: barve.primary }}>
                  {nacin === 'signin' ? 'Registracija' : 'Prijava'}
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
    opacity: 0.2,
  },
  iconWrapper: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: CleanPaceColors.frostBlue,
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
  eyeIcon: {
    padding: Spacing.xs,
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
  passwordHint: {
    marginTop: Spacing.xs,
  },
  forgotPassword: {
    alignSelf: 'flex-end',
    marginBottom: Spacing.md,
  },
  button: {
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.card,
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  toggleContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
});
