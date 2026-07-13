import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { supabase } from '@/utils/supabase';

// Mirrors push_tokens from supabase/migrations/0018_push_notifications.sql.
// See that migration's header comment for the send flow (a Database Webhook
// on `matches` insert calling supabase/functions/send-match-notification).

// Without this, expo-notifications' default behavior is to suppress a
// notification entirely while the app is in the foreground — this makes one
// still show as a banner if a match notification arrives while the app is
// already open.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

// Called on login/app open (see app/_layout.tsx) — requests notification
// permission, gets this device's Expo push token, and upserts it into
// push_tokens. An upsert, not a plain insert: relaunching the app on the
// same device every day shouldn't accumulate duplicate rows, hence
// migration 0018's unique (user_id, expo_push_token) constraint this relies
// on for the upsert's conflict target.
export async function registerForPushNotificationsAsync(userId: string): Promise<void> {
  // Push tokens don't exist on simulators/emulators — Device.isDevice is
  // false there, and calling getExpoPushTokenAsync would just throw.
  if (!Device.isDevice) return;

  if (Platform.OS === 'android') {
    // Named "match-alerts", not "default": once a channel ID is created on
    // a device, Android locks its importance permanently — the app can
    // never raise it later, only the user can via system settings. An
    // earlier version of this called the channel "default" at
    // AndroidImportance.DEFAULT, which only shows in the notification shade
    // (no heads-up popup, no lock screen alert) — confirmed by real-device
    // testing. Any device that already registered that old channel would
    // stay stuck silent even after this fix, so this uses a fresh channel
    // ID instead of trying to raise the old one's importance in place.
    // send-match-notification's Edge Function sets channelId to match this
    // exactly — without that, Android falls back to its own default
    // channel instead of this one.
    await Notifications.setNotificationChannelAsync('match-alerts', {
      name: 'Match alerts',
      importance: Notifications.AndroidImportance.HIGH,
    });
    // A separate channel from "match-alerts" — same "channel importance is
    // locked forever once created" reasoning above means reusing the Match
    // alerts channel for a semantically different notification type (a
    // seller-facing Hot Listing milestone, not a buyer-facing match) would
    // mislabel it in the user's system settings permanently.
    // send-hot-tier-notification's Edge Function sets channelId to match
    // this exactly.
    await Notifications.setNotificationChannelAsync('hot-tier-alerts', {
      name: 'Hot Listing alerts',
      importance: Notifications.AndroidImportance.HIGH,
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  // Declined or restricted (e.g. parental controls on iOS) — nothing to
  // register; the Settings toggle still works, it'll just have no token to
  // gate the send-side of once permission is granted some other time.
  if (finalStatus !== 'granted') return;

  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  const pushToken = await Notifications.getExpoPushTokenAsync({ projectId });

  const { error } = await supabase.from('push_tokens').upsert(
    {
      user_id: userId,
      expo_push_token: pushToken.data,
      device_type: Platform.OS === 'ios' ? 'ios' : 'android',
    },
    { onConflict: 'user_id,expo_push_token' }
  );
  if (error) throw error;
}
