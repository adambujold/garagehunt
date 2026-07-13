// expo-notifications' notification tap/response APIs throw
// UnavailabilityError on web (see the native version's header comment) —
// this is a no-op stub so app/_layout.tsx doesn't need its own Platform.OS
// branching around a hook call.
export function useNotificationDeepLink(): void {}
