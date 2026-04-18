Runner

Runner is a React Native mobile app built with Expo (SDK 54). It focuses on running: GPS routes, maps, social features, and a Supabase-backed backend.

Repository layout







Path



Purpose





react/Runner/



Expo app (Expo Router, TypeScript)





supabase/



SQL migrations and schema helpers for the backend

Prerequisites





Node.js (current LTS recommended)



Git



A physical phone is best for GPS, camera, and haptics (simulators are limited for some features)

Run the app with Expo Go

Expo Go is the free Expo client from the App Store or Google Play. It lets you open this project on a real device without building a native binary yourself.

1. Install Expo Go on your phone





iOS: Expo Go on the App Store



Android: Expo Go on Google Play

2. Clone the repository and install dependencies

git clone <your-repo-url>
cd APP/react/Runner
npm install

3. Configure environment variables

The app expects Supabase credentials at runtime. In react/Runner, create a file named .env (this file should stay local; do not commit secrets):

EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

Restart the dev server after changing .env.

4. Start the Expo dev server

npm start

This runs expo start and opens the Expo developer tools in the terminal and/or browser.

5. Open the project in Expo Go

Same Wi‑Fi as your computer (typical for development)





When the dev server is running, you will see a QR code in the terminal or in the browser UI.



iOS: Open the Camera app and scan the QR code, then tap the banner to open in Expo Go.

Android: Open Expo Go and use Scan QR code.

Different network or QR code does not work

Use a tunnel so your phone can reach your machine:

npx expo start --tunnel

Scan the new QR code in Expo Go. Tunnel mode can be slower but works across networks and some corporate firewalls.

Sharing the app with someone else via Expo Go

Anyone who should try the app in Expo Go needs either:





Your dev session: They install Expo Go, you run npm start (or npx expo start --tunnel), and you send them the QR code or the exp:// link shown in the terminal or Expo Dev Tools. Your computer must stay on and connected while they use it.



A published update (advanced): For wider testing without your laptop, you would use EAS Build and/or EAS Update so installs are not tied to your local server. That flow is separate from “open in Expo Go from my machine.”



Note: This repo includes expo-dev-client for optional custom native builds. Day‑to‑day development in Expo Go still works for many features; if something requires native code not included in Expo Go, Expo will tell you to use a development build instead.

Other useful commands

From react/Runner:







Command



Description





npm start



Start Metro and Expo dev tools





npm run android



Run on a connected Android device/emulator (native build flow)





npm run ios



Run on iOS simulator / device (macOS, Xcode)





npm run web



Run in the browser





npm run lint



Run ESLint

Backend (Supabase)

Schema and migration examples live under supabase/. Point your Supabase project at the same instance configured in .env so auth and data match the app.
