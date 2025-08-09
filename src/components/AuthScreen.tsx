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
import LoadingOverlay from './LoadingOverlay';

interface AuthScreenProps {
  onAuthenticated: () => void;
}

type AuthMode = 'setup' | 'login';
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
    
    if (pin.length !== VAULT_CONFIG.PIN_LENGTH || 
        confirmPin.length !== VAULT_CONFIG.PIN_LENGTH || 
        pin !== confirmPin) {
      return;
    }

    setIsLoading(true);
    try {
      const result = await authService.setupPin(pin);
      if (result.success) {
        onAuthenticated();
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


  const getLoadingMessage = () => {
    if (authMode === 'setup' && setupStep === 'confirm') {
      return 'Creating your secure vault...';
    } else if (authMode === 'login') {
      return 'Unlocking vault...';
    }
    return 'Setting up vault...';
  };

  const getLoadingIcon = () => {
    if (authMode === 'setup') {
      return 'security';
    } else if (authMode === 'login') {
      return 'lock-open';
    }
    return 'security';
  };

  return (
    <>
      <StatusBar backgroundColor={COLORS.vaultBackground} barStyle="light-content" />
      <View style={styles.screen}>
        {authMode === 'setup' && renderSetupMode()}
        {authMode === 'login' && renderLoginMode()}
        
        <LoadingOverlay
          visible={isLoading}
          message={getLoadingMessage()}
          icon={getLoadingIcon()}
        />
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
});

export default AuthScreen;