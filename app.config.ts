import { ExpoConfig } from 'expo/config';

// Converted from app.json to app.config.ts so the AdMob plugin below can
// read App IDs from .env (EXPO_PUBLIC_ADMOB_*) — plain app.json is static
// JSON with no way to reference process.env, and the whole point of storing
// these as env vars is that swapping in real production IDs later is a
// one-line .env change, not a code change. Everything else here is an exact
// carryover of the previous app.json.

const config: ExpoConfig = {
  name: 'GarageHunt',
  slug: 'garagehunt',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/images/garagehunt-icon-ios-1024.png',
  scheme: 'garagehunt',
  userInterfaceStyle: 'automatic',
  newArchEnabled: true,
  // EAS Update (expo-updates). Added because there was previously NO way to
  // get a JS-only fix onto an installed build — every change, however small,
  // needed a full native build, which costs real money and is why fixes sat
  // queued. With this, JS/asset changes ship via `eas update` instead.
  //
  // The URL is this project's EAS endpoint; the id matches extra.eas.projectId
  // below.
  updates: {
    url: 'https://u.expo.dev/4f872093-e02b-4006-b034-3b46ab6a8a3c',
  },
  // 'fingerprint', not 'appVersion': the fingerprint is computed from the
  // project's native dependencies, so an update is only ever served to a
  // binary whose native code actually matches it. That makes the dangerous
  // case impossible by construction — pushing JS that expects a native module
  // the installed build doesn't have. The tradeoff is that adding or removing
  // any native dependency changes the fingerprint and requires a new build,
  // which is the correct outcome rather than an inconvenience.
  runtimeVersion: {
    policy: 'fingerprint',
  },
  ios: {
    supportsTablet: true,
    // Required for eas build — the CLI can't write this into a dynamic
    // config for you (same reason as extra.eas.projectId below).
    bundleIdentifier: 'com.garagehunt.app',
    // Answers App Store Connect's export-compliance question at build time
    // instead of prompting for it on every submission — this app only uses
    // standard HTTPS/TLS (Supabase, AdMob, Google Sign-In), no proprietary
    // encryption, which qualifies for the exemption.
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
    },
    // EAS Build reads this and enables the Sign In with Apple capability on
    // the App ID automatically at build time — no manual step in the Apple
    // Developer portal needed.
    usesAppleSignIn: true,
  },
  android: {
    adaptiveIcon: {
      // backgroundColor is only a fallback for when backgroundImage is
      // absent — kept matching Colors.ink (constants/brand.ts) rather than
      // left as a stale mismatched color, in case backgroundImage is ever
      // removed.
      backgroundColor: '#2B1B4D',
      foregroundImage: './assets/images/garagehunt-icon-android-foreground-1024.png',
      backgroundImage: './assets/images/garagehunt-icon-android-background-1024.png',
      monochromeImage: './assets/images/garagehunt-icon-android-monochrome-1024.png',
    },
    edgeToEdgeEnabled: true,
    predictiveBackGestureEnabled: false,
    // Same reasoning as ios.bundleIdentifier above — set now so an Android
    // build doesn't hit the identical error later.
    package: 'com.garagehunt.app',
    // Required for FCM V1 push delivery on Android (the token itself comes
    // from Firebase, not just Expo's push service) — safe to commit, see
    // this file's header comment for why. The service account private key
    // FCM V1 also needs is never stored in this repo; it's uploaded once via
    // `eas credentials`, kept entirely on EAS's servers.
    googleServicesFile: './google-services.json',
    // react-native-maps has no non-Google provider on Android (unlike iOS,
    // which defaults to Apple Maps and needs no key at all) — without this,
    // the Discover map screen crashes on launch with
    // "IllegalStateException: API key not found". Restricted in Google
    // Cloud Console to this package name + the release keystore's SHA-1.
    config: {
      googleMaps: {
        apiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY,
      },
    },
  },
  web: {
    output: 'static',
    favicon: './assets/images/favicon.png',
  },
  plugins: [
    'expo-router',
    '@react-native-community/datetimepicker',
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
        //
        // Pinned to 16.0.0 (not latest) deliberately — newer releases pull
        // in Google Play Services Ads 25.x, whose Kotlin metadata (built
        // with Kotlin 2.2/2.3) is newer than what this RN version's default
        // Kotlin compiler (2.1.20) can read, failing :compileReleaseKotlin
        // with "Module was compiled with an incompatible version of
        // Kotlin." Overriding the project's Kotlin version to work around
        // that turned out not to reliably propagate to this module's own
        // independent buildscript block. play-services-ads 24.6.0 (what
        // 16.0.0 pins) was confirmed by directly inspecting its
        // .kotlin_module binary metadata to be built with Kotlin metadata
        // version 2.1.0 — an exact match for this project's default, no
        // override needed at all.
        androidAppId: process.env.EXPO_PUBLIC_ADMOB_ANDROID_APP_ID,
        iosAppId: process.env.EXPO_PUBLIC_ADMOB_IOS_APP_ID,
      },
    ],
    [
      'expo-notifications',
      {
        // No dedicated notification icon asset yet — falls back to the app
        // icon. color tints the small Android status-bar icon only (iOS
        // ignores it); matches the brand's coral accent used everywhere
        // else (constants/brand.ts Colors.coral).
        color: '#FF6B4A',
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
