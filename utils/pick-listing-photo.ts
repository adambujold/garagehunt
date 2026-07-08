import * as ImagePicker from 'expo-image-picker';

// Returns the picked/captured image's local URI, or null if the user
// cancelled. Two entry points (library vs camera) since each needs its own
// permission request — see components/garagehunt/photo-source-sheet.tsx for
// the UI that lets the user choose between them.
export async function pickListingPhoto(): Promise<string | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error('Photo library access is needed to add photos. You can enable it in your device settings.');
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.8,
  });

  if (result.canceled || result.assets.length === 0) return null;
  return result.assets[0].uri;
}

export async function takeListingPhoto(): Promise<string | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    throw new Error('Camera access is needed to take photos. You can enable it in your device settings.');
  }

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images'],
    quality: 0.8,
  });

  if (result.canceled || result.assets.length === 0) return null;
  return result.assets[0].uri;
}
