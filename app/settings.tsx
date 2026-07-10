import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors, Fonts } from '@/constants/brand';
import { useAuthSession } from '@/hooks/use-auth-session';
import { goBack } from '@/utils/navigation';
import { getNotificationsEnabled, setNotificationsEnabled } from '@/utils/notification-prefs';
import { supabase } from '@/utils/supabase';

export default function SettingsScreen() {
  const { session } = useAuthSession();
  const [notificationsEnabled, setNotificationsEnabledState] = useState(true);

  useEffect(() => {
    if (!session) return;
    getNotificationsEnabled(session.user.id)
      .then(setNotificationsEnabledState)
      .catch((err) => console.error('Failed to load notification preference', err));
  }, [session]);

  const handleToggleNotifications = async (value: boolean) => {
    if (!session) return;
    setNotificationsEnabledState(value);
    try {
      await setNotificationsEnabled(session.user.id, value);
    } catch (err) {
      console.error('Failed to save notification preference', err);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <View style={styles.headerRow}>
        <Pressable style={styles.iconButton} onPress={() => goBack()}>
          <Ionicons name="chevron-back" size={18} color={Colors.ink} />
        </Pressable>
        <Text style={styles.title}>Settings</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionTitle}>Account</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Email</Text>
            <Text style={styles.rowValue}>{session?.user.email ?? '—'}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Notifications</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={styles.rowTextBlock}>
              <Text style={styles.rowLabel}>Push notifications</Text>
              <Text style={styles.rowSubtext}>Get notified when a new sale matches your search.</Text>
            </View>
            <Switch
              value={notificationsEnabled}
              onValueChange={handleToggleNotifications}
              trackColor={{ true: Colors.coral, false: Colors.tanBorder }}
              thumbColor="#fff"
            />
          </View>
        </View>

        <Pressable style={styles.signOutButton} onPress={() => supabase.auth.signOut()}>
          <Ionicons name="log-out-outline" size={16} color={Colors.coral} />
          <Text style={styles.signOutLabel}>Sign out</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.lavender,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 10,
  },
  iconButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: Fonts.displaySemiBold,
    fontSize: 16,
    color: Colors.ink,
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  sectionTitle: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: Colors.mutedDark,
    marginBottom: 10,
  },
  card: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: Colors.tan,
    borderRadius: 14,
    marginBottom: 20,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  rowTextBlock: {
    flex: 1,
  },
  rowLabel: {
    fontFamily: Fonts.displaySemiBold,
    fontSize: 13,
    color: Colors.ink,
  },
  rowValue: {
    fontFamily: Fonts.body,
    fontSize: 13,
    color: Colors.muted,
  },
  rowSubtext: {
    fontFamily: Fonts.body,
    fontSize: 11,
    color: Colors.muted,
    marginTop: 2,
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: Colors.tan,
    borderRadius: 12,
    paddingVertical: 12,
  },
  signOutLabel: {
    fontFamily: Fonts.displaySemiBold,
    fontSize: 13,
    color: Colors.coral,
  },
});
