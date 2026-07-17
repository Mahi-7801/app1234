import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { NavigationContainer, NavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import SplashScreen from './src/screens/SplashScreen';
import LoginScreen from './src/screens/LoginScreen';
import SignupScreen from './src/screens/SignupScreen';
import HomeScreen from './src/screens/HomeScreen';
import PINEntryScreen from './src/screens/PINEntryScreen';
import DocumentSelectScreen from './src/screens/DocumentSelectScreen';
import SignConfirmationScreen from './src/screens/SignConfirmationScreen';
import SecureDocumentScreen from './src/screens/SecureDocumentScreen';
import HistoryScreen from './src/screens/HistoryScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import SessionManager from './src/services/SessionManager';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const TabIcon = ({ name, focused }: { name: string; focused: boolean }) => {
  const icons: Record<string, string> = {
    Home: '🏠',
    History: '📋',
    Settings: '⚙️',
  };
  return (
    <View style={styles.tabIconContainer}>
      <Text style={[styles.tabIcon, focused && styles.tabIconFocused]}>
        {icons[name] || '•'}
      </Text>
      <Text style={[styles.tabLabel, focused && styles.tabLabelFocused]}>
        {name}
      </Text>
    </View>
  );
};

function HomeTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: '#007AFF',
        tabBarInactiveTintColor: '#999',
        tabBarLabel: () => null,
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarIcon: ({ focused }) => <TabIcon name="Home" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="History"
        component={HistoryScreen}
        options={{
          tabBarIcon: ({ focused }) => <TabIcon name="History" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          tabBarIcon: ({ focused }) => <TabIcon name="Settings" focused={focused} />,
        }}
      />
    </Tab.Navigator>
  );
}

const App = () => {
  const [showSplash, setShowSplash] = useState(true);
  const navigationRef = useRef<NavigationContainerRef<any>>(null);

  // Handle session invalidation - navigate to PIN entry
  const handleSessionInvalidated = useCallback(() => {
    if (navigationRef.current) {
      const currentRoute = navigationRef.current.getCurrentRoute();
      
      // Only navigate if user is in a protected screen (not Login/Signup)
      if (currentRoute && 
          currentRoute.name !== 'Login' && 
          currentRoute.name !== 'Signup' &&
          currentRoute.name !== 'PINEntry') {
        
        // Navigate to PINEntry to re-verify
        navigationRef.current.reset({
          index: 0,
          routes: [{ name: 'PINEntry' }],
        });
      }
    }
  }, []);

  useEffect(() => {
    // Start session monitoring when app is ready
    if (!showSplash) {
      SessionManager.startMonitoring(handleSessionInvalidated);
    }

    return () => {
      SessionManager.stopMonitoring();
    };
  }, [showSplash, handleSessionInvalidated]);

  if (showSplash) {
    return (
      <SplashScreen onAnimationEnd={() => setShowSplash(false)} />
    );
  }

  return (
    <NavigationContainer ref={navigationRef}>
      <Stack.Navigator
        initialRouteName="Login"
        screenOptions={{
          headerStyle: { backgroundColor: '#0066FF' },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: '600' },
        }}
      >
        <Stack.Screen
          name="Login"
          component={LoginScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="Signup"
          component={SignupScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="MainTabs"
          component={HomeTabs}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="PINEntry"
          component={PINEntryScreen}
          options={{ title: 'Enter PIN' }}
        />
        <Stack.Screen
          name="DocumentSelect"
          component={DocumentSelectScreen}
          options={{ title: 'Select Document' }}
        />
        <Stack.Screen
          name="SignConfirmation"
          component={SignConfirmationScreen}
          options={{ title: 'Confirm Signature' }}
        />
        <Stack.Screen
          name="SecureDocument"
          component={SecureDocumentScreen}
          options={{ title: 'Access Document' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
};

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    paddingBottom: Platform.OS === 'ios' ? 20 : 8,
    paddingTop: 8,
    height: Platform.OS === 'ios' ? 85 : 65,
  },
  tabIconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabIcon: {
    fontSize: 22,
  },
  tabIconFocused: {
    transform: [{ scale: 1.1 }],
  },
  tabLabel: {
    fontSize: 11,
    color: '#999',
    marginTop: 4,
  },
  tabLabelFocused: {
    color: '#007AFF',
    fontWeight: '600',
  },
});

export default App;
