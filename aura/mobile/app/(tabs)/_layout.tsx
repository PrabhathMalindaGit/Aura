import React, { useMemo } from 'react';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Tabs } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { useTokens } from '@/src/theme/tokens';

type TabIconName =
  | 'home-variant'
  | 'clipboard-text'
  | 'chat-processing'
  | 'chart-box'
  | 'cog';

function resolveTabIconName(name: TabIconName, focused: boolean) {
  if (name === 'home-variant') {
    return focused ? 'home-variant' : 'home-variant-outline';
  }
  if (name === 'clipboard-text') {
    return focused ? 'clipboard-text' : 'clipboard-text-outline';
  }
  if (name === 'chat-processing') {
    return focused ? 'chat-processing' : 'chat-processing-outline';
  }
  if (name === 'chart-box') {
    return focused ? 'chart-box' : 'chart-box-outline';
  }
  return focused ? 'cog' : 'cog-outline';
}

function TabBarIcon({
  name,
  color,
  focused,
}: {
  name: TabIconName;
  color: string;
  focused: boolean;
}) {
  const tokens = useTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);

  return (
    <View style={[styles.iconWrap, focused ? styles.iconWrapFocused : null]}>
      <MaterialCommunityIcons
        name={resolveTabIconName(name, focused)}
        size={22}
        color={color}
      />
    </View>
  );
}

export default function TabLayout() {
  const tokens = useTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: tokens.colors.background },
        tabBarActiveTintColor: tokens.colors.primary,
        tabBarInactiveTintColor: tokens.colors.textMuted,
        tabBarHideOnKeyboard: true,
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.tabLabel,
        tabBarItemStyle: styles.tabItem,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Today',
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon name="home-variant" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="checkin"
        options={{
          title: "Check-in",
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon name="clipboard-text" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: "Messages",
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon name="chat-processing" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="progress"
        options={{
          title: "Progress",
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon name="chart-box" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon name="cog" color={color} focused={focused} />
          ),
        }}
      />
    </Tabs>
  );
}

function createStyles(tokens: ReturnType<typeof useTokens>) {
  return StyleSheet.create({
    tabBar: {
      height: 82,
      paddingTop: 8,
      paddingBottom: 12,
      paddingHorizontal: 10,
      borderTopWidth: 1,
      borderTopColor: tokens.colors.border,
      backgroundColor: "rgba(255, 255, 255, 0.96)",
      ...tokens.elevation.card,
    },
    tabItem: {
      paddingTop: 4,
      borderRadius: tokens.radius.lg,
    },
    tabLabel: {
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
      marginTop: 2,
    },
    iconWrap: {
      minWidth: 38,
      minHeight: 34,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'transparent',
    },
    iconWrapFocused: {
      backgroundColor: tokens.colors.accentTextOn,
      borderWidth: 1,
      borderColor: tokens.colors.border,
    },
  });
}
