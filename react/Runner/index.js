import TrackPlayer from 'react-native-track-player';
import { lockScreenPlaybackService } from './services/liveRunNotificationService';

// Must be registered at the top level so Android can cold-start this as a
// headless task if it ever needs to revive the live-run media session
// without the app's JS already running (see liveRunNotificationService.ts).
TrackPlayer.registerPlaybackService(() => lockScreenPlaybackService);

import 'expo-router/entry';
