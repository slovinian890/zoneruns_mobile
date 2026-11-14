import { Platform } from 'react-native';

// react-native-track-player doesn't support the New Architecture yet (per
// React Native Directory), and its JS entry touches the native module at
// *import time* on any non-Android platform (`new NativeEventEmitter(...)`),
// which crashed every iOS launch now that newArchEnabled is on — Android's
// equivalent path is a pure-JS DeviceEventEmitter, so it never hit this.
// The headless-task registration below is Android-only anyway (it's how
// Android revives this player after the app process dies while the run's
// foreground service is still alive; iOS has no equivalent), so `require`
// it lazily, only on Android, instead of importing it unconditionally.
if (Platform.OS === 'android') {
  const TrackPlayer = require('react-native-track-player').default;
  const { lockScreenPlaybackService } = require('./services/liveRunNotificationService');
  TrackPlayer.registerPlaybackService(() => lockScreenPlaybackService);
}

// eslint-disable-next-line import/first -- must stay after the Android-only guard above
import 'expo-router/entry';
