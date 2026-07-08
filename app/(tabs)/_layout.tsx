import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import React from 'react';

import { HapticTab } from '@/components/haptic-tab';
import { Colors, Fonts } from '@/constants/brand';

export default function TabLayout() {
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
          height: 66,
          paddingTop: 8,
          paddingBottom: 10,
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
          tabBarIcon: ({ color, size }) => <Ionicons name="map" size={size - 4} color={color} />,
        }}
      />
      <Tabs.Screen
        name="looking-for"
        options={{
          title: 'Looking for',
          tabBarIcon: ({ color, size }) => <Ionicons name="locate" size={size - 4} color={color} />,
        }}
      />
      <Tabs.Screen
        name="list-sale"
        options={{
          title: 'List sale',
          tabBarIcon: ({ color, size }) => <Ionicons name="add-circle" size={size - 4} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => <Ionicons name="person" size={size - 4} color={color} />,
        }}
      />
    </Tabs>
  );
}
