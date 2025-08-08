// App.tsx

import 'react-native-get-random-values';
import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  StatusBar,
  Alert,
  AppState,
  AppStateStatus,
} from 'react-native';

import VaultScreen from './src/screens/VaultScreen';
import { AuthService } from './src/services/AuthService';
import { MediaService } from './src/services/MediaService';
import { CryptoService } from './src/services/CryptoService';
import { PermissionsUtil } from './src/utils/permissions';
import { COLORS } from './src/utils/constants';
import AuthScreen from './src/components/AuthScreen';

const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [authService] = useState(() => AuthService.getInstance());
  const [mediaService] = useState(() => MediaService.getInstance());

  useEffect(() => {
    initializeApp();
    setupAppStateListener();

    return () => {
      // Cleanup on unmount
      const cryptoService = CryptoService.getInstance();
      cryptoService.secureCleanup();
    };
  }, []);

  const initializeApp = async () => {
    try {
      setIsInitializing(true);

      // Initialize services
      await authService.initialize();
      await mediaService.initialize();

      // Check if user is already authenticated and session is valid
      const authState = authService.getAuthState();
      if (authState.isAuthenticated && authService.isSessionValid()) {
        setIsAuthenticated(true);
      }

      // Initialize permissions - only request once at startup
      const permissionResult = await PermissionsUtil.initializePermissions();
      if (!permissionResult.success && permissionResult.missingPermissions.length > 0) {
        // Only log missing permissions, don't show annoying popups
        console.log('Missing permissions:', permissionResult.missingPermissions);
        // App will still function with limited capabilities
      }

    } catch (error) {
      console.error('App initialization failed:', error);
      Alert.alert(
        'Initialization Error',
        'Failed to initialize the app. Please restart.',
        [{ text: 'OK' }]
      );
    } finally {
      setIsInitializing(false);
    }
  };

  const setupAppStateListener = () => {
    const handleAppStateChange = async (nextAppState: AppStateStatus) => {
      if (nextAppState === 'background' || nextAppState === 'inactive') {
        // App is going to background - lock the vault
        await handleAppBackground();
      } else if (nextAppState === 'active') {
        // App is becoming active - check session validity
        await handleAppForeground();
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription?.remove();
  };

  const handleAppBackground = async () => {
    try {
      // Clear sensitive data from memory
      const cryptoService = CryptoService.getInstance();
      cryptoService.clearMasterKey();

      // Update last active time
      await authService.updateActivity();
    } catch (error) {
      console.error('Failed to handle app background:', error);
    }
  };

  const handleAppForeground = async () => {
    try {
      // Check if session is still valid
      if (isAuthenticated && !authService.isSessionValid()) {
        // Session expired - require re-authentication
        setIsAuthenticated(false);
        await authService.logout();
      }
    } catch (error) {
      console.error('Failed to handle app foreground:', error);
    }
  };

  const handleAuthenticated = async () => {
    try {
      // Update activity timestamp
      await authService.updateActivity();
      
      // Clean up old trash items
      await mediaService.cleanupTrash();
      
      setIsAuthenticated(true);
    } catch (error) {
      console.error('Post-authentication setup failed:', error);
      // Continue anyway - this is not critical
      setIsAuthenticated(true);
    }
  };

  const handleLogout = async () => {
    try {
      await authService.logout();
      setIsAuthenticated(false);
    } catch (error) {
      console.error('Logout failed:', error);
      // Force logout anyway
      setIsAuthenticated(false);
    }
  };

  if (isInitializing) {
    // Show loading screen while initializing
    return (
      <View style={styles.initializingContainer}>
        <StatusBar backgroundColor={COLORS.vaultBackground} barStyle="light-content" />
        {/* You can add a loading spinner or splash screen here */}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar backgroundColor={COLORS.vaultBackground} barStyle="light-content" />
      {isAuthenticated ? (
        <VaultScreen onLogout={handleLogout} />
      ) : (
        <AuthScreen onAuthenticated={handleAuthenticated} />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.vaultBackground,
  },
  initializingContainer: {
    flex: 1,
    backgroundColor: COLORS.vaultBackground,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default App;