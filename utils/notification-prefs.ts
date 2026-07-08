import AsyncStorage from '@react-native-async-storage/async-storage';

// Real push isn't wired up yet (no Apple Developer account), so this just
// persists the user's stated preference locally — the Settings toggle
// reflects a real, saved choice rather than a fake control that forgets
// itself on reload, ready to be read once push actually exists.
const STORAGE_KEY = 'garagehunt.notificationsEnabled';

export async function getNotificationsEnabled(): Promise<boolean> {
  const stored = await AsyncStorage.getItem(STORAGE_KEY);
  return stored === null ? true : stored === 'true';
}

export async function setNotificationsEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, String(enabled));
}
