import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HapticTab } from '@/components/haptic-tab';
import { Colors, Fonts } from '@/constants/brand';
import { useSpotlightTarget } from '@/hooks/use-spotlight-target';

// Wraps each tab icon in a fixed-size, spotlight-measurable box — a real
// component (not an inline function passed straight to tabBarIcon) because
// useSpotlightTarget is a hook, and tabBarIcon's render callback isn't
// guaranteed to be called in the stable, consistent order React's rules of
// hooks require.
function SpotlightTabIcon({
  spotlightId,
  name,
  size,
  color,
}: {
  spotlightId: string;
  name: React.ComponentProps<typeof Ionicons>['name'];
  size: number;
  color: string;
}) {
  const { ref, onLayout } = useSpotlightTarget(spotlightId);
  return (
    <View ref={ref} onLayout={onLayout} style={tabIconStyles.wrap}>
      <Ionicons name={name} size={size - 4} color={color} />
    </View>
  );
}

const tabIconStyles = StyleSheet.create({
  wrap: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

function TabLayoutContent() {
  // Overriding tabBarStyle.height (below) opts out of React Navigation's own
  // safe-area-aware sizing, so it has to be added back manually here.
  // Without it, the bar renders with just a small fixed paddingBottom (10),
  // which is nowhere near tall enough to clear Android's classic 3-button
  // navigation strip — on that layout the strip is an opaque system overlay
  // that owns all touches within its bounds, so tab icons rendered under it
  // silently stop receiving taps and the OS handles them as Home/Back
  // instead. iOS's equivalent inset (the home indicator) doesn't have this
  // problem since a tap there still reaches the app, which is why this only
  // ever showed up in Android testing.
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarActiveTintColor: Colors.coral,
        tabBarInactiveTintColor: Colors.mutedLight,
        tabBarStyle: {
          backgroundColor: Colors.paper,
          borderTopWidth: 2,
          borderTopColor: Colors.tan,
          height: 66 + insets.bottom,
          paddingTop: 8,
          paddingBottom: 10 + insets.bottom,
        },
        tabBarLabelStyle: {
          fontFamily: Fonts.displayMedium,
          fontSize: 10,
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Discover',
          tabBarIcon: ({ color, size }) => (
            <SpotlightTabIcon spotlightId="tab-discover" name="map" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="looking-for"
        options={{
          title: 'Looking for',
          tabBarIcon: ({ color, size }) => (
            <SpotlightTabIcon spotlightId="tab-looking-for" name="locate" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="list-sale"
        options={{
          title: 'List sale',
          tabBarIcon: ({ color, size }) => (
            <SpotlightTabIcon spotlightId="tab-list-sale" name="add-circle" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => (
            <SpotlightTabIcon spotlightId="tab-profile" name="person" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

export default function TabLayout() {
  return <TabLayoutContent />;
}
