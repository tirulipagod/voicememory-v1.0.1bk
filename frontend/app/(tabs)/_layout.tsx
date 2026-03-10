import React, { useState, useRef } from 'react';
import { Tabs, usePathname, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  View,
  StyleSheet,
  Platform,
  Animated,
  PanResponder,
  Dimensions
} from 'react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SWIPE_THRESHOLD = 50;

// Ordem das tabs para navegação por swipe
const TAB_ORDER = ['/', '/connections', '/copilot', '/explore', '/profile'];

export default function TabsLayout() {
  const pathname = usePathname();
  const translateX = useRef(new Animated.Value(0)).current;

  // Determinar o índice atual baseado no pathname
  const getCurrentIndex = () => {
    const normalized = pathname === '/index' ? '/' : pathname;
    const index = TAB_ORDER.findIndex(tab => tab === normalized || tab === pathname);
    return index >= 0 ? index : 0;
  };

  const currentIndex = getCurrentIndex();

  // PanResponder para detectar swipe
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Ativar apenas para gestos horizontais significativos
        return Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 2 && Math.abs(gestureState.dx) > 10;
      },
      onPanResponderMove: (_, gestureState) => {
        translateX.setValue(gestureState.dx);
      },
      onPanResponderRelease: (_, gestureState) => {
        const currentIdx = getCurrentIndex();

        if (gestureState.dx < -SWIPE_THRESHOLD && currentIdx < TAB_ORDER.length - 1) {
          // Swipe para esquerda - próxima aba
          Animated.timing(translateX, {
            toValue: -SCREEN_WIDTH,
            duration: 200,
            useNativeDriver: true,
          }).start(() => {
            translateX.setValue(0);
            router.push(TAB_ORDER[currentIdx + 1] as any);
          });
        } else if (gestureState.dx > SWIPE_THRESHOLD && currentIdx > 0) {
          // Swipe para direita - aba anterior
          Animated.timing(translateX, {
            toValue: SCREEN_WIDTH,
            duration: 200,
            useNativeDriver: true,
          }).start(() => {
            translateX.setValue(0);
            router.push(TAB_ORDER[currentIdx - 1] as any);
          });
        } else {
          // Voltar para posição original
          Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
            tension: 50,
            friction: 7,
          }).start();
        }
      },
    })
  ).current;

  return (
    <View style={styles.container} {...panResponder.panHandlers}>
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
              <View style={[styles.iconContainer, focused && styles.iconContainerActive]}>
                <Ionicons name={focused ? 'mic' : 'mic-outline'} size={size} color={color} />
              </View>
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
              <View style={[styles.iconContainer, focused && styles.copilotIconActive]}>
                <Ionicons name={focused ? 'chatbubbles' : 'chatbubbles-outline'} size={size} color={color} />
              </View>
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

      {/* Indicador visual de swipe */}
      <View style={styles.swipeIndicator}>
        {TAB_ORDER.map((_, index) => (
          <View
            key={index}
            style={[
              styles.swipeDot,
              index === currentIndex && styles.swipeDotActive
            ]}
          />
        ))}
      </View>
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
  iconContainer: {
    padding: 4,
  },
  iconContainerActive: {
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
    borderRadius: 12,
    padding: 8,
  },
  copilotIconActive: {
    backgroundColor: 'rgba(139, 92, 246, 0.2)',
    borderRadius: 12,
    padding: 8,
  },
  swipeIndicator: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 95 : 70,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    pointerEvents: 'none',
  },
  swipeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(107, 114, 128, 0.3)',
  },
  swipeDotActive: {
    width: 20,
    backgroundColor: '#8b5cf6',
  },
});
