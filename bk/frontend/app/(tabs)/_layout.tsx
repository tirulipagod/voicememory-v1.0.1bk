import React, { useRef } from 'react';
import { Tabs, usePathname, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  View,
  StyleSheet,
  Platform
} from 'react-native';

export default function TabsLayout() {
  return (
    <View style={styles.container}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: styles.tabBar,
          tabBarActiveTintColor: '#8b5cf6',
          tabBarInactiveTintColor: '#6b7280',
          tabBarLabelStyle: styles.tabBarLabel,
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Gravar',
            tabBarIcon: ({ color, size, focused }) => (
              <Ionicons name={focused ? 'mic' : 'mic-outline'} size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="connections"
          options={{
            title: 'Conexões',
            tabBarIcon: ({ color, size, focused }) => (
              <Ionicons name={focused ? 'people' : 'people-outline'} size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="copilot"
          options={{
            title: 'Copiloto',
            tabBarIcon: ({ color, size, focused }) => (
              <Ionicons name={focused ? 'chatbubbles' : 'chatbubbles-outline'} size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="explore"
          options={{
            title: 'Explorar',
            tabBarIcon: ({ color, size, focused }) => (
              <Ionicons name={focused ? 'compass' : 'compass-outline'} size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Perfil',
            tabBarIcon: ({ color, size, focused }) => (
              <Ionicons name={focused ? 'person' : 'person-outline'} size={size} color={color} />
            ),
          }}
        />
      </Tabs>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  tabBar: {
    backgroundColor: '#12121a',
    borderTopColor: '#2d2d3a',
    borderTopWidth: 1,
    paddingTop: 8,
    paddingBottom: Platform.OS === 'ios' ? 24 : 8,
    height: Platform.OS === 'ios' ? 88 : 64,
  },
  tabBarLabel: {
    fontSize: 11,
    fontWeight: '500',
  },
});
