// App.tsx

import 'react-native-get-random-values';
import React, { useState, useEffect, useRef } from 'react';
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
import { FileService } from './src/services/FileService';
import { PermissionsUtil } from './src/utils/permissions';
import { SecurityManager } from './src/utils/SecurityManager';
import { logDebug, logInfo, logWarn, logError } from './src/services/Logger';
import { COLORS } from './src/utils/constants';
import AuthScreen from './src/components/AuthScreen';
import { ThemeProvider, useTheme } from './src/contexts/ThemeContext';

const AppContent: React.FC = () => {
  const { colors } = useTheme();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [authService] = useState(() => AuthService.getInstance());
  const [mediaService] = useState(() => MediaService.getInstance());
  const appStateRef = useRef(AppState.currentState);
  const lastActiveTimeRef = useRef(Date.now());

  useEffect(() => {
    // Initialize last active time
    lastActiveTimeRef.current = Date.now();
    
    initializeApp();
    const cleanup = setupAppStateListener();

    return () => {
      // Cleanup on unmount
      cleanup();
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
      logDebug('App', 'Initialization auth state', authState);
      logDebug('App', 'Session valid', { valid: authService.isSessionValid() });
      
      if (authState.isAuthenticated && authService.isSessionValid()) {
        logInfo('App', 'Attempting to restore master key for valid session');
        // Restore the master key for the valid session
        const restoreResult = await authService.restoreMasterKey();
        logDebug('App', 'Master key restore result', restoreResult);
        
        if (restoreResult.success) {
          logInfo('App', 'Master key restored successfully');
          setIsAuthenticated(true);
        } else {
          logError('App', 'Failed to restore master key', restoreResult.error);
          // Force re-authentication if master key can't be restored
          await authService.logout();
          setIsAuthenticated(false);
        }
      } else {
        logInfo('App', 'No valid session found');
        setIsAuthenticated(false);
      }

      // Initialize permissions - only request once at startup
      const permissionResult = await PermissionsUtil.initializePermissions();
      if (!permissionResult.success && permissionResult.missingPermissions.length > 0) {
        // Only log missing permissions, don't show annoying popups
        logWarn('App', 'Missing permissions', { permissions: permissionResult.missingPermissions });
        // App will still function with limited capabilities
      }

    } catch (error) {
      logError('App', 'App initialization failed', error);
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
      logDebug('App', 'App state changed', { from: appStateRef.current, to: nextAppState });
      
      if (appStateRef.current.match(/inactive|background/) && nextAppState === 'active') {
        // App is coming back to foreground from background
        const timeInBackground = Date.now() - lastActiveTimeRef.current;
        const maxAllowedInBackground = 10000; // 10 seconds - allows for image picker, etc.
        
        logInfo('App', 'App returning from background', { timeInBackground });
        
        // Only require re-authentication if app was in background for more than 10 seconds
        // This prevents image picker and other brief native interactions from forcing logout
        if (timeInBackground > maxAllowedInBackground) {
          logInfo('App', 'App was in background too long - requiring PIN');
          setIsAuthenticated(false);
          
          // Clear master key
          const cryptoService = CryptoService.getInstance();
          cryptoService.clearMasterKey();
        } else {
          logInfo('App', 'App was only briefly inactive - maintaining session');
        }
      } else if (nextAppState.match(/inactive|background/)) {
        // App is going to background - record the time
        lastActiveTimeRef.current = Date.now();
        logInfo('App', 'App going to background/inactive');
        await handleAppBackground();
      }
      
      appStateRef.current = nextAppState;
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription?.remove();
  };

  const handleAppBackground = async () => {
    try {
      logInfo('App', 'App going to background - performing background tasks');
      
      // Apply security measures (remove from recents on Android)
      SecurityManager.handleAppBackground();
      
      // Clean up temporary files (thumbnails, temp media)
      const fileService = FileService.getInstance();
      await fileService.cleanupOldTempFiles(5); // Clean files older than 5 minutes
      
      // Don't clear master key or force logout immediately - let the foreground handler decide
      // based on how long the app was in background
      
      // Update last active time
      await authService.updateActivity();
    } catch (error) {
      logError('App', 'Failed to handle app background', error);
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
      logError('App', 'Post-authentication setup failed', error);
      // Continue anyway - this is not critical
      setIsAuthenticated(true);
    }
  };

  const handleLogout = async () => {
    try {
      await authService.logout();
      setIsAuthenticated(false);
    } catch (error) {
      logError('App', 'Logout failed', error);
      // Force logout anyway
      setIsAuthenticated(false);
    }
  };

  if (isInitializing) {
    // Show loading screen while initializing
    return (
      <View style={[styles.initializingContainer, { backgroundColor: colors.vaultBackground }]}>
        <StatusBar backgroundColor={colors.vaultBackground} barStyle={colors.statusBarStyle} />
        {/* You can add a loading spinner or splash screen here */}
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.vaultBackground }]}>
      <StatusBar backgroundColor={colors.vaultBackground} barStyle={colors.statusBarStyle} />
      {isAuthenticated ? (
        <VaultScreen onLogout={handleLogout} />
      ) : (
        <AuthScreen onAuthenticated={handleAuthenticated} />
      )}
    </View>
  );
};

const App: React.FC = () => {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
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