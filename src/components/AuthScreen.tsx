// src/components/AuthScreen.tsx

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  StatusBar,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { AuthService } from '../services/AuthService';
import { COLORS, VAULT_CONFIG } from '../utils/constants';
import NumberPad from './NumberPad';
import CalculatorScreen from './CalculatorScreen';

interface AuthScreenProps {
  onAuthenticated: () => void;
}

type AuthMode = 'setup' | 'login' | 'biometric';
type SetupStep = 'enter' | 'confirm';

const AuthScreen: React.FC<AuthScreenProps> = ({ onAuthenticated }) => {
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [setupStep, setSetupStep] = useState<SetupStep>('enter');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [authService] = useState(() => AuthService.getInstance());

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
    console.log('Setup PIN - pin:', pin, 'confirmPin:', confirmPin);
    console.log('Setup PIN - pin length:', pin.length, 'confirmPin length:', confirmPin.length);
    console.log('Setup PIN - pins match:', pin === confirmPin);
    
    if (pin.length !== VAULT_CONFIG.PIN_LENGTH) {
      Alert.alert('Invalid PIN', `PIN must be ${VAULT_CONFIG.PIN_LENGTH} digits`);
      return;
    }

    if (confirmPin.length !== VAULT_CONFIG.PIN_LENGTH) {
      Alert.alert('Invalid PIN', `Confirmation PIN must be ${VAULT_CONFIG.PIN_LENGTH} digits`);
      return;
    }

    if (pin !== confirmPin) {
      Alert.alert('PIN Mismatch', `PINs do not match. Original: "${pin}" vs Confirm: "${confirmPin}"`);
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


  const renderSetupMode = () => {
    if (setupStep === 'confirm') {
      return (
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>Confirm Your PIN</Text>
            <Text style={styles.subtitle}>
              Please enter your PIN again to confirm
            </Text>
          </View>

          <View style={styles.form}>
            <NumberPad
              value={confirmPin}
              onChange={setConfirmPin}
              maxLength={VAULT_CONFIG.PIN_LENGTH}
            />
            
            <TouchableOpacity
              style={[
                styles.button, 
                styles.primaryButton,
                confirmPin.length !== VAULT_CONFIG.PIN_LENGTH && styles.disabledButton
              ]}
              onPress={handleSetupPin}
              disabled={confirmPin.length !== VAULT_CONFIG.PIN_LENGTH}
            >
              <Text style={[
                styles.buttonText,
                confirmPin.length !== VAULT_CONFIG.PIN_LENGTH && styles.disabledButtonText
              ]}>
                {isLoading ? (
                  <ActivityIndicator color={COLORS.surface} size="small" />
                ) : (
                  'Create Vault'
                )}
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.button, styles.secondaryButton]}
              onPress={() => {
                setSetupStep('enter');
                setPin('');
                setConfirmPin('');
              }}
            >
              <Text style={styles.secondaryButtonText}>Start Over</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Setup Your Vault</Text>
          <Text style={styles.subtitle}>
            Create a {VAULT_CONFIG.PIN_LENGTH}-digit PIN to secure your vault
          </Text>
        </View>

        <View style={styles.form}>
          <NumberPad
            value={pin}
            onChange={setPin}
            maxLength={VAULT_CONFIG.PIN_LENGTH}
          />
          
          <TouchableOpacity
            style={[
              styles.button, 
              styles.primaryButton,
              pin.length !== VAULT_CONFIG.PIN_LENGTH && styles.disabledButton
            ]}
            onPress={() => {
              if (pin.length === VAULT_CONFIG.PIN_LENGTH) {
                setSetupStep('confirm');
              }
            }}
            disabled={pin.length !== VAULT_CONFIG.PIN_LENGTH}
          >
            <Text style={[
              styles.buttonText,
              pin.length !== VAULT_CONFIG.PIN_LENGTH && styles.disabledButtonText
            ]}>
              Continue
            </Text>
          </TouchableOpacity>
          
          {isLoading && (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator color={COLORS.vaultAccent} size="large" />
              <Text style={styles.loadingText}>Creating vault...</Text>
            </View>
          )}
        </View>
      </View>
    );
  };

  const renderLoginMode = () => {
    const handleCalculatorPin = async (enteredPin: string) => {
      setPin(enteredPin);
      const result = await authService.authenticateWithPin(enteredPin);
      if (result.success) {
        onAuthenticated();
      }
      // Don't show error - calculator should remain looking like calculator
      return result.success;
    };
    
    return (
      <CalculatorScreen
        onPinEntered={handleCalculatorPin}
      />
    );
  };

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
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
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
  disabledButton: {
    backgroundColor: COLORS.textSecondary,
    opacity: 0.5,
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
  disabledButtonText: {
    color: COLORS.surface,
    opacity: 0.7,
  },
  loadingText: {
    marginTop: 20,
    fontSize: 16,
    color: COLORS.textSecondary,
  },
});

export default AuthScreen;