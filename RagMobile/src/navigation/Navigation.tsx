import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, View } from 'react-native';

import { useAuthStore } from '../store/useAuthStore';
import { COLORS } from '../constants/theme';

// Screens
import LoginScreen from '../screens/LoginScreen';
import KnowledgeBaseScreen from '../screens/KnowledgeBaseScreen';
import KnowledgeDetailScreen from '../screens/KnowledgeDetailScreen';
import ChatScreen from '../screens/ChatScreen';
import AgentScreen from '../screens/AgentScreen';
import SettingsScreen from '../screens/SettingsScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          const icons: Record<string, { focused: string; outline: string }> = {
            KbTab: { focused: 'library', outline: 'library-outline' },
            ChatTab: { focused: 'chatbubbles', outline: 'chatbubbles-outline' },
            AgentTab: { focused: 'flash', outline: 'flash-outline' },
            SettingsTab: { focused: 'settings', outline: 'settings-outline' },
          };
          const icon = icons[route.name];
          return (
            <Ionicons
              name={(focused ? icon?.focused : icon?.outline) as any ?? 'help-outline'}
              size={size}
              color={color}
            />
          );
        },
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.textMuted,
        tabBarStyle: {
          borderTopColor: COLORS.border,
          backgroundColor: 'white',
          paddingBottom: 4,
        },
        headerStyle: { backgroundColor: 'white' },
        headerShadowVisible: false,
        headerTintColor: COLORS.text,
        headerTitleStyle: { fontWeight: '700', fontSize: 17 },
      })}
    >
      <Tab.Screen name="KbTab" component={KnowledgeBaseScreen} options={{ title: '知识库' }} />
      <Tab.Screen name="ChatTab" component={ChatScreen} options={{ title: '对话' }} />
      <Tab.Screen name="AgentTab" component={AgentScreen} options={{ title: 'Agent' }} />
      <Tab.Screen name="SettingsTab" component={SettingsScreen} options={{ title: '设置' }} />
    </Tab.Navigator>
  );
}

export default function Navigation() {
  const { token, loadToken } = useAuthStore();
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    loadToken().finally(() => setBooting(false));
  }, []);

  if (booting) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {token ? (
          <>
            <Stack.Screen name="Main" component={MainTabs} />
            <Stack.Screen
              name="KnowledgeDetail"
              component={KnowledgeDetailScreen}
              options={{
                headerShown: true,
                headerStyle: { backgroundColor: 'white' },
                headerShadowVisible: false,
                headerTintColor: COLORS.primary,
                headerBackTitle: '',
                headerTitleStyle: { fontWeight: '700', color: COLORS.text },
              }}
            />
            <Stack.Screen
              name="Chat"
              component={ChatScreen}
              options={{
                headerShown: true,
                headerStyle: { backgroundColor: 'white' },
                headerShadowVisible: false,
                headerTintColor: COLORS.primary,
                headerBackTitle: '',
                headerTitleStyle: { fontWeight: '700', color: COLORS.text },
                title: '智能对话',
              }}
            />
          </>
        ) : (
          <Stack.Screen name="Login" component={LoginScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
