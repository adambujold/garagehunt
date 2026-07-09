import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MockSale } from '@/components/garagehunt/sale-card';
import { Colors, Fonts } from '@/constants/brand';
import { useAuthSession } from '@/hooks/use-auth-session';
import { useCurrentLocation } from '@/hooks/use-current-location';
import { claimClusterSuggestion, ClusterSuggestion, fetchClusterSuggestionById } from '@/utils/cluster-suggestions';
import { getErrorMessage } from '@/utils/get-error-message';
import { goBack } from '@/utils/navigation';
import { fetchListingsByIds } from '@/utils/sale-listings';

export default function ClusterClaimScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuthSession();
  const { coords } = useCurrentLocation();
  const [cluster, setCluster] = useState<ClusterSuggestion | null | undefined>(undefined);
  const [otherListings, setOtherListings] = useState<MockSale[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [eventName, setEventName] = useState('');
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!session) return;
      let cancelled = false;
      setLoadError(null);

      fetchClusterSuggestionById(id)
        .then((result) => {
          if (cancelled) return;
          setCluster(result);
          if (result) {
            return fetchListingsByIds(result.listingIds, coords).then((listings) => {
              if (!cancelled) setOtherListings(listings.filter((listing) => listing.sellerId !== session.user.id));
            });
          }
        })
        .catch((err) => {
          if (!cancelled) {
            setLoadError(err instanceof Error ? err.message : 'Failed to load this suggestion.');
            setCluster(null);
          }
        });

      return () => {
        cancelled = true;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id, session, coords?.latitude, coords?.longitude])
  );

  const handleClaim = async () => {
    if (!session || !cluster) return;
    if (!eventName.trim()) {
      setClaimError('Give your event a name first.');
      return;
    }
    setClaimError(null);
    setClaiming(true);
    try {
      const eventId = await claimClusterSuggestion({ clusterId: cluster.id, eventName: eventName.trim() });
      // replace, not push — this claim screen is a dead end once claimed
      // (the suggestion is no longer 'suggested', so revisiting it would
      // just fail), and organizer-event's own back button now safely falls
      // back to a default route if there's nothing behind it in history.
      router.replace({ pathname: '/organizer-event/[id]', params: { id: eventId } });
    } catch (err) {
      console.error('Failed to claim cluster suggestion', err);
      setClaimError(getErrorMessage(err, 'Something went wrong claiming this event.'));
      setClaiming(false);
    }
  };

  const header = (
    <View style={styles.headerRow}>
      <Pressable style={styles.iconButton} onPress={() => goBack()}>
        <Ionicons name="chevron-back" size={18} color={Colors.ink} />
      </Pressable>
      <Text style={styles.title}>Team up nearby</Text>
    </View>
  );

  if (cluster === undefined) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        {header}
        <View style={styles.stateBox}>
          <ActivityIndicator color={Colors.coral} />
        </View>
      </SafeAreaView>
    );
  }

  if (!cluster) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        {header}
        <Text style={styles.notFound}>{loadError ?? 'This suggestion is no longer available.'}</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      {header}
      <KeyboardAvoidingView style={styles.flexFill} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <ScrollView
            style={styles.flexFill}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled">
            <Text style={styles.intro}>
              {otherListings.length} other {otherListings.length === 1 ? 'sale is' : 'sales are'} happening
              near you around the same time. Become the organizer to group them into one shareable
              event — more sales together means more buyer traffic for everyone.
            </Text>

            <Text style={styles.sectionTitle}>Nearby sales</Text>
            {otherListings.map((sale) => (
              <View key={sale.id} style={styles.listingRow}>
                <Ionicons name="home-outline" size={14} color={Colors.muted} />
                <Text style={styles.listingTitle} numberOfLines={1}>
                  {sale.title}
                </Text>
                <Text style={styles.listingDistance}>{sale.distanceKm}km</Text>
              </View>
            ))}

            <Text style={styles.fieldLabel}>Event name</Text>
            <View style={styles.field}>
              <Ionicons name="megaphone-outline" size={14} color={Colors.muted} />
              <TextInput
                value={eventName}
                onChangeText={setEventName}
                placeholder="e.g. Riverdale Community Garage Sale"
                placeholderTextColor={Colors.mutedLight}
                style={styles.fieldInput}
              />
            </View>

            {claimError && (
              <View style={styles.warningBanner}>
                <Ionicons name="warning-outline" size={13} color={Colors.amberText} />
                <Text style={styles.warningBannerText}>{claimError}</Text>
              </View>
            )}

            <Pressable style={styles.claimButton} onPress={handleClaim} disabled={claiming}>
              {claiming ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.claimButtonLabel}>Become the organizer</Text>
              )}
            </Pressable>
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.lavender,
  },
  flexFill: {
    flex: 1,
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
  stateBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notFound: {
    fontFamily: Fonts.body,
    color: Colors.muted,
    textAlign: 'center',
    marginTop: 40,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 220,
  },
  intro: {
    fontFamily: Fonts.body,
    fontSize: 12,
    color: Colors.mutedDark,
    lineHeight: 18,
    marginBottom: 18,
  },
  sectionTitle: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: Colors.mutedDark,
    marginBottom: 10,
  },
  listingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: Colors.tan,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  listingTitle: {
    flex: 1,
    fontFamily: Fonts.displaySemiBold,
    fontSize: 12,
    color: Colors.ink,
  },
  listingDistance: {
    fontFamily: Fonts.body,
    fontSize: 11,
    color: Colors.muted,
  },
  fieldLabel: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 12,
    color: Colors.mutedDark,
    marginTop: 10,
    marginBottom: 6,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: Colors.tan,
    borderRadius: 12,
    height: 44,
    paddingHorizontal: 12,
    marginBottom: 14,
  },
  fieldInput: {
    flex: 1,
    fontFamily: Fonts.body,
    fontSize: 13,
    color: Colors.ink,
  },
  warningBanner: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: Colors.amberBg,
    borderRadius: 10,
    padding: 10,
    marginBottom: 14,
  },
  warningBannerText: {
    flex: 1,
    fontFamily: Fonts.body,
    fontSize: 11,
    color: Colors.amberText,
    lineHeight: 16,
  },
  claimButton: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.violet,
    borderRadius: 12,
    paddingVertical: 14,
  },
  claimButtonLabel: {
    fontFamily: Fonts.displaySemiBold,
    fontSize: 13,
    color: '#fff',
  },
});
