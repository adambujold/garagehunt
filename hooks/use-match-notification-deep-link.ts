import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';

// Deep-links into Matches for You when a match push notification is tapped
// — handles both the app already running and being launched fresh from a
// killed state (useLastNotificationResponse covers both; see
// supabase/functions/send-match-notification for what sets data.type).
// Native only — see the .web.ts stub. expo-notifications' notification
// tap/response APIs throw UnavailabilityError on web synchronously (not a
// promise rejection), which would crash the whole app's render if called
// unconditionally from app/_layout.tsx.
export function useMatchNotificationDeepLink(): void {
  const lastNotificationResponse = Notifications.useLastNotificationResponse();
  useEffect(() => {
    const data = lastNotificationResponse?.notification.request.content.data;
    if (data?.type === 'match') {
      router.push('/matches-for-you');
      Notifications.clearLastNotificationResponse();
    }
  }, [lastNotificationResponse]);
}
