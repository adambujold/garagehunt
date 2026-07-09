import { ExpoConfig } from 'expo/config';

// Converted from app.json to app.config.ts so the AdMob plugin below can
// read App IDs from .env (EXPO_PUBLIC_ADMOB_*) — plain app.json is static
// JSON with no way to reference process.env, and the whole point of storing
// these as env vars is that swapping in real production IDs later is a
// one-line .env change, not a code change. Everything else here is an exact
// carryover of the previous app.json.

const config: ExpoConfig = {
  name: 'garagehunt',
  slug: 'garagehunt',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'garagehunt',
  userInterfaceStyle: 'automatic',
  newArchEnabled: true,
  ios: {
    supportsTablet: true,
    // Required for eas build — the CLI can't write this into a dynamic
    // config for you (same reason as extra.eas.projectId below).
    bundleIdentifier: 'com.garagehunt.app',
  },
  android: {
    adaptiveIcon: {
      backgroundColor: '#E6F4FE',
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    edgeToEdgeEnabled: true,
    predictiveBackGestureEnabled: false,
    // Same reasoning as ios.bundleIdentifier above — set now so an Android
    // build doesn't hit the identical error later.
    package: 'com.garagehunt.app',
  },
  web: {
    output: 'static',
    favicon: './assets/images/favicon.png',
  },
  plugins: [
    'expo-router',
    [
      'expo-splash-screen',
      {
        image: './assets/images/splash-icon.png',
        imageWidth: 200,
        resizeMode: 'contain',
        backgroundColor: '#ffffff',
        dark: {
          backgroundColor: '#000000',
        },
      },
    ],
    [
      'expo-location',
      {
        locationWhenInUsePermission: 'Allow GarageHunt to use your location to center the map on nearby garage sales.',
      },
    ],
    [
      'expo-image-picker',
      {
        photosPermission: 'Allow GarageHunt to access your photos so you can add them to your sale listing.',
        cameraPermission: 'Allow GarageHunt to use your camera so you can take photos of items for your sale listing.',
        microphonePermission: false,
      },
    ],
    [
      'react-native-google-mobile-ads',
      {
        // Google's public test App IDs by default (see .env.example) — safe
        // to ship, never serve real ads/revenue. Swapping to the real
        // per-platform App IDs from the AdMob console later is just an
        // EXPO_PUBLIC_ADMOB_*_APP_ID change in .env, then a fresh native
        // build (these are baked in at build time, unlike the ad unit IDs
        // components/garagehunt/discover-ad-card.tsx reads at runtime).
        androidAppId: process.env.EXPO_PUBLIC_ADMOB_ANDROID_APP_ID,
        iosAppId: process.env.EXPO_PUBLIC_ADMOB_IOS_APP_ID,
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  // Links this project to its EAS project (created by `eas build:configure`)
  // — required for `eas build`/`eas update`. app.config.ts is a dynamic
  // config, so the CLI can't write this in for you the way it would for a
  // plain app.json; it has to be set here by hand.
  extra: {
    eas: {
      projectId: '4f872093-e02b-4006-b034-3b46ab6a8a3c',
    },
  },
};

export default { expo: config };
