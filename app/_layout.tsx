import { Caveat_600SemiBold } from '@expo-google-fonts/caveat';
import { Fredoka_500Medium, Fredoka_600SemiBold } from '@expo-google-fonts/fredoka';
import { Kalam_400Regular, Kalam_700Bold } from '@expo-google-fonts/kalam';
import { WorkSans_400Regular, WorkSans_500Medium, WorkSans_600SemiBold } from '@expo-google-fonts/work-sans';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import 'react-native-reanimated';

import { LaunchSplash } from '@/components/garagehunt/launch-splash';
import { LoginScreen } from '@/components/garagehunt/login-screen';
import { SignUpScreen } from '@/components/garagehunt/signup-screen';
import { useAuthSession } from '@/hooks/use-auth-session';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useMatchNotificationDeepLink } from '@/hooks/use-match-notification-deep-link';
import { registerForPushNotificationsAsync } from '@/utils/push-notifications';
import { syncPurchasesUser } from '@/utils/purchases';

export const unstable_settings = {
  anchor: '(tabs)',
};

SplashScreen.preventAutoHideAsync();

type AuthView = 'login' | 'signup';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [showSplash, setShowSplash] = useState(true);
  const [authView, setAuthView] = useState<AuthView>('login');
  const { session, loading: sessionLoading } = useAuthSession();
  const [fontsLoaded, fontError] = useFonts({
    Fredoka_500Medium,
    Fredoka_600SemiBold,
    WorkSans_400Regular,
    WorkSans_500Medium,
    WorkSans_600SemiBold,
    Caveat_600SemiBold,
    Kalam_400Regular,
    Kalam_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  // "On login/app open" per the push notifications design — re-registering
  // on every session (not just the first sign-in ever) is intentional and
  // cheap: it's an upsert (see push-notifications.ts), so it just keeps
  // this device's token fresh rather than accumulating anything.
  useEffect(() => {
    if (!session) return;
    registerForPushNotificationsAsync(session.user.id).catch((err) =>
      console.error('Failed to register for push notifications', err)
    );
  }, [session]);

  // "On login/app open", same reasoning as push registration above —
  // syncPurchasesUser is a cheap no-op on Android/web (see utils/purchases.ts).
  useEffect(() => {
    if (!session) return;
    syncPurchasesUser(session.user.id);
  }, [session]);

  useMatchNotificationDeepLink();

  if (!fontsLoaded && !fontError) {
    return null;
  }

  // Keep the splash beat up until both its own timer AND the Supabase
  // session check have finished, so there's no blank flash in between.
  if (showSplash || sessionLoading) {
    return (
      <>
        <LaunchSplash onFinish={() => setShowSplash(false)} />
        <StatusBar style="light" />
      </>
    );
  }

  if (!session) {
    return (
      <>
        {authView === 'login' ? (
          <LoginScreen onNavigateToSignUp={() => setAuthView('signup')} />
        ) : (
          <SignUpScreen onNavigateToLogin={() => setAuthView('login')} />
        )}
        <StatusBar style="dark" />
      </>
    );
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="sale/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="route-planner" options={{ headerShown: false }} />
        <Stack.Screen name="my-listings" options={{ headerShown: false }} />
        <Stack.Screen name="edit-listing/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="listing-buyers/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="matches-for-you" options={{ headerShown: false }} />
        <Stack.Screen name="settings" options={{ headerShown: false }} />
        <Stack.Screen name="cluster-claim/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="create-event" options={{ headerShown: false }} />
        <Stack.Screen name="event/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="organizer-application" options={{ headerShown: false }} />
        <Stack.Screen name="organizer-dashboard" options={{ headerShown: false }} />
        <Stack.Screen name="organizer-event/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
