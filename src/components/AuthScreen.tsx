// src/screens/AuthScreen.tsx

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  StatusBar,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { AuthService } from '../services/AuthService';
import { COLORS, VAULT_CONFIG } from '../utils/constants';

interface AuthScreenProps {
  onAuthenticated: () => void;
}

type AuthMode = 'setup' | 'login' | 'biometric';

const AuthScreen: React.FC<AuthScreenProps> = ({ onAuthenticated }) => {
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [authService] = useState(() => AuthService.getInstance());
  const pinInputRefs = React.useRef<(TextInput | null)[]>([]);

  useEffect(() => {
    initializeAuth();
  }, []);

  const initializeAuth = async () => {
    setIsLoading(true);
    try {
      await authService.initialize();
      const authState = authService.getAuthState();
      
      if (!authState.isPinSet) {
        setAuthMode('setup');
      } else if (authState.biometricAvailable && authState.biometricEnabled) {
        setAuthMode('biometric');
        // Auto-trigger biometric authentication
        handleBiometricAuth();
      } else {
        setAuthMode('login');
      }
    } catch (error) {
      console.error('Failed to initialize auth:', error);
      Alert.alert('Error', 'Failed to initialize authentication');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSetupPin = async () => {
    if (pin.length !== VAULT_CONFIG.PIN_LENGTH) {
      Alert.alert('Invalid PIN', `PIN must be ${VAULT_CONFIG.PIN_LENGTH} digits`);
      return;
    }

    if (pin !== confirmPin) {
      Alert.alert('PIN Mismatch', 'PINs do not match');
      return;
    }

    setIsLoading(true);
    try {
      const result = await authService.setupPin(pin);
      if (result.success) {
        Alert.alert(
          'PIN Setup Complete',
          'Your vault is now secure. Would you like to enable biometric authentication?',
          [
            { text: 'Skip', onPress: onAuthenticated },
            { text: 'Enable', onPress: enableBiometric },
          ]
        );
      } else {
        Alert.alert('Setup Failed', result.error || 'Failed to setup PIN');
      }
    } catch (error) {
      console.error('PIN setup failed:', error);
      Alert.alert('Error', 'Failed to setup PIN');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = async () => {
    if (pin.length !== VAULT_CONFIG.PIN_LENGTH) {
      Alert.alert('Invalid PIN', `PIN must be ${VAULT_CONFIG.PIN_LENGTH} digits`);
      return;
    }

    setIsLoading(true);
    try {
      const result = await authService.authenticateWithPin(pin);
      if (result.success) {
        onAuthenticated();
      } else {
        Alert.alert('Authentication Failed', result.error || 'Invalid PIN');
        setPin(''); // Clear PIN on failure
      }
    } catch (error) {
      console.error('PIN authentication failed:', error);
      Alert.alert('Error', 'Authentication failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleBiometricAuth = async () => {
    setIsLoading(true);
    try {
      const result = await authService.authenticateWithBiometrics();
      if (result.success) {
        onAuthenticated();
      } else {
        // Fall back to PIN authentication
        setAuthMode('login');
      }
    } catch (error) {
      console.error('Biometric authentication failed:', error);
      setAuthMode('login');
    } finally {
      setIsLoading(false);
    }
  };

  const enableBiometric = async () => {
    try {
      const result = await authService.setBiometricEnabled(true);
      if (result.success) {
        onAuthenticated();
      } else {
        Alert.alert('Biometric Setup Failed', result.error || 'Failed to enable biometric');
        onAuthenticated(); // Continue without biometric
      }
    } catch (error) {
      console.error('Biometric setup failed:', error);
      onAuthenticated();
    }
  };

  const renderPinInput = (value: string, onChange: (text: string) => void, placeholder: string) => (
    <View style={styles.pinContainer}>
      <TouchableOpacity style={styles.pinInputWrapper} onPress={() => {
        // Focus the hidden input when dots are tapped
        const input = pinInputRefs.current[placeholder === 'Enter your PIN' ? 0 : 1];
        input?.focus();
      }}>
        <TextInput
          ref={(ref) => {
            if (placeholder === 'Enter your PIN') {
              if (!pinInputRefs.current) pinInputRefs.current = [];
              pinInputRefs.current[0] = ref;
            } else {
              if (!pinInputRefs.current) pinInputRefs.current = [];
              pinInputRefs.current[1] = ref;
            }
          }}
          style={styles.pinInput}
          value={value}
          onChangeText={onChange}
          keyboardType="numeric"
          maxLength={VAULT_CONFIG.PIN_LENGTH}
          secureTextEntry
          placeholder=""
          autoFocus={placeholder === 'Enter your PIN'}
        />
        <View style={styles.pinDots}>
          {Array.from({ length: VAULT_CONFIG.PIN_LENGTH }).map((_, index) => (
            <View
              key={index}
              style={[
                styles.pinDot,
                value.length > index && styles.pinDotFilled,
              ]}
            />
          ))}
        </View>
        {value.length === 0 && (
          <Text style={styles.pinPlaceholder}>{placeholder}</Text>
        )}
      </TouchableOpacity>
    </View>
  );

  const renderSetupMode = () => (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Setup Your Vault</Text>
        <Text style={styles.subtitle}>
          Create a {VAULT_CONFIG.PIN_LENGTH}-digit PIN to secure your vault
        </Text>
      </View>

      <View style={styles.form}>
        <Text style={styles.label}>Enter PIN</Text>
        {renderPinInput(pin, setPin, 'Enter your PIN')}

        <Text style={styles.label}>Confirm PIN</Text>
        {renderPinInput(confirmPin, setConfirmPin, 'Confirm your PIN')}

        <TouchableOpacity
          style={[styles.button, styles.primaryButton]}
          onPress={handleSetupPin}
          disabled={isLoading || pin.length !== VAULT_CONFIG.PIN_LENGTH || confirmPin.length !== VAULT_CONFIG.PIN_LENGTH}
        >
          {isLoading ? (
            <ActivityIndicator color={COLORS.surface} />
          ) : (
            <Text style={styles.buttonText}>Create Vault</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderLoginMode = () => (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Welcome Back</Text>
        <Text style={styles.subtitle}>Enter your PIN to access your vault</Text>
      </View>

      <View style={styles.form}>
        <Text style={styles.label}>Enter PIN</Text>
        {renderPinInput(pin, setPin, 'Enter your PIN')}

        <TouchableOpacity
          style={[styles.button, styles.primaryButton]}
          onPress={handleLogin}
          disabled={isLoading || pin.length !== VAULT_CONFIG.PIN_LENGTH}
        >
          {isLoading ? (
            <ActivityIndicator color={COLORS.surface} />
          ) : (
            <Text style={styles.buttonText}>Unlock Vault</Text>
          )}
        </TouchableOpacity>

        {authService.getAuthState().biometricAvailable && (
          <TouchableOpacity
            style={[styles.button, styles.secondaryButton]}
            onPress={handleBiometricAuth}
            disabled={isLoading}
          >
            <Text style={styles.secondaryButtonText}>Use Biometric</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  const renderBiometricMode = () => (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Biometric Authentication</Text>
        <Text style={styles.subtitle}>Use your fingerprint or face to unlock</Text>
      </View>

      <View style={styles.form}>
        <TouchableOpacity
          style={[styles.button, styles.primaryButton]}
          onPress={handleBiometricAuth}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color={COLORS.surface} />
          ) : (
            <Text style={styles.buttonText}>Authenticate</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.secondaryButton]}
          onPress={() => setAuthMode('login')}
          disabled={isLoading}
        >
          <Text style={styles.secondaryButtonText}>Use PIN Instead</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  if (isLoading && authMode === 'biometric') {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Initializing...</Text>
      </View>
    );
  }

  return (
    <>
      <StatusBar backgroundColor={COLORS.vaultBackground} barStyle="light-content" />
      <View style={styles.screen}>
        {authMode === 'setup' && renderSetupMode()}
        {authMode === 'login' && renderLoginMode()}
        {authMode === 'biometric' && renderBiometricMode()}
      </View>
    </>
  );
};

const { width, height } = Dimensions.get('window');

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.vaultBackground,
  },
  container: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
  },
  loadingContainer: {
    alignItems: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: COLORS.vaultText,
    marginBottom: 10,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  form: {
    alignItems: 'center',
  },
  label: {
    fontSize: 16,
    color: COLORS.vaultText,
    marginBottom: 10,
    alignSelf: 'flex-start',
    marginLeft: 20,
  },
  pinContainer: {
    alignItems: 'center',
    marginBottom: 30,
  },
  pinInputWrapper: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinInput: {
    position: 'absolute',
    opacity: 0,
    width: 1,
    height: 1,
    zIndex: -1,
  },
  pinDots: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: 200,
    paddingVertical: 20,
  },
  pinDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: COLORS.textSecondary,
    backgroundColor: 'transparent',
  },
  pinDotFilled: {
    backgroundColor: COLORS.vaultAccent,
    borderColor: COLORS.vaultAccent,
  },
  pinPlaceholder: {
    position: 'absolute',
    top: 60,
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  button: {
    width: width - 40,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 15,
  },
  primaryButton: {
    backgroundColor: COLORS.vaultAccent,
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: COLORS.vaultAccent,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.surface,
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.vaultAccent,
  },
  loadingText: {
    marginTop: 20,
    fontSize: 16,
    color: COLORS.textSecondary,
  },
});

export default AuthScreen;