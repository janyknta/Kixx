// src/components/AuthScreen.tsx

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { AuthService } from '../services/AuthService';
import { COLORS, VAULT_CONFIG } from '../utils/constants';
import NumberPad from './NumberPad';
import CalculatorScreen from './CalculatorScreen';
import LoadingOverlay from './LoadingOverlay';
import { useTheme } from '../contexts/ThemeContext';
import { useCustomAlert } from '../hooks/useCustomAlert';
import { useNotification } from '../contexts/NotificationContext';

interface AuthScreenProps {
  onAuthenticated: () => void;
}

type AuthMode = 'setup' | 'login';
type SetupStep = 'enter' | 'confirm';

const AuthScreen: React.FC<AuthScreenProps> = ({ onAuthenticated }) => {
  const { colors } = useTheme();
  const { showAlert, AlertComponent } = useCustomAlert();
  const { showError } = useNotification();
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
      showError('Failed to initialize authentication');
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
        showError(result.error || 'Failed to setup PIN');
      }
    } catch (error) {
      console.error('PIN setup failed:', error);
      showError('Failed to setup PIN');
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
        showError(result.error || 'Invalid PIN');
        setPin(''); // Clear PIN on failure
      }
    } catch (error) {
      console.error('PIN authentication failed:', error);
      showError('Authentication failed');
    } finally {
      setIsLoading(false);
    }
  };



  const renderSetupMode = () => {
    if (setupStep === 'confirm') {
      return (
        <View style={[styles.container, { backgroundColor: colors.vaultBackground }]}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.vaultText }]}>Confirm Your PIN</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
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
                { backgroundColor: colors.vaultAccent },
                confirmPin.length !== VAULT_CONFIG.PIN_LENGTH && { backgroundColor: colors.textSecondary, opacity: 0.5 }
              ]}
              onPress={handleSetupPin}
              disabled={confirmPin.length !== VAULT_CONFIG.PIN_LENGTH}
            >
              <Text style={[
                { fontSize: 16, fontWeight: '600', color: colors.surface },
                confirmPin.length !== VAULT_CONFIG.PIN_LENGTH && { opacity: 0.7 }
              ]}>
                {isLoading ? (
                  <ActivityIndicator color={colors.surface} size="small" />
                ) : (
                  'Create Vault'
                )}
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.button, { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.vaultAccent }]}
              onPress={() => {
                setSetupStep('enter');
                setPin('');
                setConfirmPin('');
              }}
            >
              <Text style={[{ fontSize: 16, fontWeight: '600', color: colors.vaultAccent }]}>Start Over</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    return (
      <View style={[styles.container, { backgroundColor: colors.vaultBackground }]}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.vaultText }]}>Setup Your Vault</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
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
              { backgroundColor: colors.vaultAccent },
              pin.length !== VAULT_CONFIG.PIN_LENGTH && { backgroundColor: colors.textSecondary, opacity: 0.5 }
            ]}
            onPress={() => {
              if (pin.length === VAULT_CONFIG.PIN_LENGTH) {
                setSetupStep('confirm');
              }
            }}
            disabled={pin.length !== VAULT_CONFIG.PIN_LENGTH}
          >
            <Text style={[
              { fontSize: 16, fontWeight: '600', color: colors.surface },
              pin.length !== VAULT_CONFIG.PIN_LENGTH && { opacity: 0.7 }
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
      <StatusBar backgroundColor={colors.vaultBackground} barStyle={colors.statusBarStyle} />
      <View style={[styles.screen, { backgroundColor: colors.vaultBackground }]}>
        {authMode === 'setup' && renderSetupMode()}
        {authMode === 'login' && renderLoginMode()}
        
        <LoadingOverlay
          visible={isLoading}
          message={getLoadingMessage()}
          icon={getLoadingIcon()}
        />
        
        {/* Custom Alert Dialog */}
        {AlertComponent}
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