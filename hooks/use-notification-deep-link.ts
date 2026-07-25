import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';

// Deep-links to the right screen when a push notification is tapped —
// handles both the app already running and being launched fresh from a
// killed state (useLastNotificationResponse covers both). Branches on
// data.type, set by whichever Edge Function sent the notification: 'match'
// (supabase/functions/send-match-notification), 'hot_tier'
// (supabase/functions/send-hot-tier-notification), 'day_of_photos'
// (supabase/functions/send-day-of-photos-reminder), or 'organizer_approved'
// (supabase/functions/send-organizer-approval-notification). Native only —
// see the .web.ts stub. expo-notifications' notification tap/response APIs
// throw UnavailabilityError on web synchronously (not a promise rejection),
// which would crash the whole app's render if called unconditionally from
// app/_layout.tsx.
export function useNotificationDeepLink(): void {
  const lastNotificationResponse = Notifications.useLastNotificationResponse();
  useEffect(() => {
    const data = lastNotificationResponse?.notification.request.content.data;
    if (data?.type === 'match') {
      router.push('/matches-for-you');
      Notifications.clearLastNotificationResponse();
    } else if (data?.type === 'hot_tier' && typeof data.listingId === 'string') {
      router.push({ pathname: '/sale/[id]', params: { id: data.listingId } });
      Notifications.clearLastNotificationResponse();
    } else if (data?.type === 'day_of_photos' && typeof data.listingId === 'string') {
      router.push({ pathname: '/day-of-photos/[id]', params: { id: data.listingId } });
      Notifications.clearLastNotificationResponse();
    } else if (data?.type === 'organizer_approved') {
      router.push('/profile');
      Notifications.clearLastNotificationResponse();
    }
  }, [lastNotificationResponse]);
}
