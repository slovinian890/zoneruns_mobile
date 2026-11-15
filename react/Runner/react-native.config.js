// react-native-track-player doesn't support iOS under the New Architecture
// (newArchEnabled is on for this app) -- see the comment atop
// services/liveRunNotificationService.ts. The JS side already never
// `require`s it on iOS, but that alone doesn't stop autolinking from still
// linking its native pod and auto-registering the native module on iOS at
// app launch, before any JS runs -- which crashes the app immediately,
// every time, independent of the JS-side guard. Excluding the iOS platform
// here stops it from being linked at all. Android is untouched.
module.exports = {
  dependencies: {
    'react-native-track-player': {
      platforms: {
        ios: null,
      },
    },
  },
};
