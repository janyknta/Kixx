// src/components/PinReentryModal.tsx

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { BlurView } from '@react-native-community/blur';
import Icon from "@react-native-vector-icons/material-icons";

import { AuthService } from '../services/AuthService';
import { VAULT_CONFIG } from '../utils/constants';
import NumberPad from './NumberPad';
import { useTheme } from '../contexts/ThemeContext';

interface PinReentryModalProps {
  visible: boolean;
  onSuccess: () => void;
  onCancel: () => void;
  title?: string;
  message?: string;
}

const PinReentryModal: React.FC<PinReentryModalProps> = ({
  visible,
  onSuccess,
  onCancel,
  title = 'Session Expired',
  message = 'Please enter your PIN to continue accessing the vault',
}) => {
  const { colors, theme } = useTheme();
  const [pin, setPin] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [authService] = useState(() => AuthService.getInstance());

  // Reset PIN when modal becomes visible
  useEffect(() => {
    if (visible) {
      setPin('');
      setIsVerifying(false);
    }
  }, [visible]);

  const handlePinComplete = async (enteredPin: string) => {
    if (enteredPin.length !== VAULT_CONFIG.PIN_LENGTH) {
      return;
    }

    setIsVerifying(true);
    try {
      const result = await authService.authenticateWithPin(enteredPin);
      if (result.success) {
        // Success - close modal and notify parent
        setPin('');
        onSuccess();
      } else {
        // Failed authentication
        Alert.alert(
          'Incorrect PIN', 
          'The PIN you entered is incorrect. Please try again.',
          [{ text: 'OK' }]
        );
        setPin(''); // Clear the PIN for retry
      }
    } catch (error) {
      console.error('PIN verification failed:', error);
      Alert.alert(
        'Authentication Error',
        'Failed to verify PIN. Please try again.',
        [{ text: 'OK' }]
      );
      setPin('');
    } finally {
      setIsVerifying(false);
    }
  };

  const handlePinChange = (newPin: string) => {
    setPin(newPin);
    
    // Auto-submit when PIN is complete
    if (newPin.length === VAULT_CONFIG.PIN_LENGTH && !isVerifying) {
      handlePinComplete(newPin);
    }
  };

  if (!visible) {
    return null;
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <BlurView 
        style={styles.modalOverlay} 
        blurType={theme === 'dark' ? 'dark' : 'light'} 
        blurAmount={15}
      >
        <View style={[styles.modalContainer, { backgroundColor: colors.vaultSurface }]}>
          {/* Header */}
          <View style={styles.header}>
            <View style={[styles.iconContainer, { backgroundColor: `${colors.warning}20` }]}>
              <Icon name="lock" size={32} color={colors.warning} />
            </View>
            
            <Text style={[styles.title, { color: colors.vaultText }]}>{title}</Text>
            <Text style={[styles.message, { color: colors.textSecondary }]}>{message}</Text>
          </View>

          {/* PIN Input */}
          <View style={styles.pinSection}>
            <NumberPad
              value={pin}
              onChange={handlePinChange}
              maxLength={VAULT_CONFIG.PIN_LENGTH}
              showDots={true}
            />
          </View>

          {/* Loading Indicator */}
          {isVerifying && (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color={colors.vaultAccent} />
              <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
                Verifying PIN...
              </Text>
            </View>
          )}

          {/* Footer */}
          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.cancelButton, { borderColor: colors.border }]}
              onPress={onCancel}
              disabled={isVerifying}
            >
              <Text style={[styles.cancelButtonText, { color: colors.textSecondary }]}>
                Cancel
              </Text>
            </TouchableOpacity>
          </View>

          {/* Security Notice */}
          <View style={styles.securityNotice}>
            <Icon name="info" size={16} color={colors.textSecondary} />
            <Text style={[styles.securityNoticeText, { color: colors.textSecondary }]}>
              Your session has expired for security. PIN is required to continue.
            </Text>
          </View>
        </View>
      </BlurView>
    </Modal>
  );
};

const { width } = Dimensions.get('window');

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContainer: {
    width: Math.min(width - 40, 400),
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    elevation: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  message: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 22,
  },
  pinSection: {
    alignItems: 'center',
    marginBottom: 24,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  loadingText: {
    fontSize: 14,
    marginLeft: 8,
  },
  footer: {
    width: '100%',
    marginBottom: 16,
  },
  cancelButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderWidth: 1,
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '500',
  },
  securityNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 12,
  },
  securityNoticeText: {
    fontSize: 12,
    lineHeight: 16,
    marginLeft: 6,
    flex: 1,
    textAlign: 'center',
  },
});

export default PinReentryModal;