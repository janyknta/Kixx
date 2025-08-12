// src/components/CustomAlert.tsx

import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Animated,
  Dimensions,
  StatusBar,
} from 'react-native';
import { BlurView } from '@react-native-community/blur';
import Icon from "@react-native-vector-icons/material-icons";
import { useTheme } from '../contexts/ThemeContext';

export interface AlertButton {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
}

interface CustomAlertProps {
  visible: boolean;
  title: string;
  message: string;
  buttons: AlertButton[];
  icon?: string;
  iconColor?: string;
  onRequestClose?: () => void;
}

const CustomAlert: React.FC<CustomAlertProps> = ({
  visible,
  title,
  message,
  buttons,
  icon,
  iconColor,
  onRequestClose,
}) => {
  console.log('CustomAlert props:', { visible, title, message, buttonsLength: buttons.length });
  const { colors, theme } = useTheme();
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;

  useEffect(() => {
    if (visible) {
      // Show animation
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          damping: 15,
          stiffness: 150,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.spring(slideAnim, {
          toValue: 0,
          damping: 20,
          stiffness: 100,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      // Hide animation
      Animated.parallel([
        Animated.timing(scaleAnim, {
          toValue: 0.8,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 50,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]);

  const handleButtonPress = async (button: AlertButton) => {
    console.log('CustomAlert: Button pressed', button.text);
    
    // Close the modal first
    if (onRequestClose) {
      console.log('CustomAlert: Closing alert');
      onRequestClose();
    }
    
    // Then execute the button action (which might be async)
    if (button.onPress) {
      console.log('CustomAlert: Calling button onPress');
      try {
        await button.onPress();
      } catch (error) {
        console.error('CustomAlert: Error in button onPress:', error);
      }
    }
  };

  const getButtonStyle = (buttonStyle: AlertButton['style']) => {
    switch (buttonStyle) {
      case 'cancel':
        return {
          backgroundColor: 'transparent',
          borderColor: colors.border,
          borderWidth: 1,
        };
      case 'destructive':
        return {
          backgroundColor: colors.danger,
        };
      default:
        return {
          backgroundColor: colors.vaultAccent,
        };
    }
  };

  const getButtonTextStyle = (buttonStyle: AlertButton['style']) => {
    switch (buttonStyle) {
      case 'cancel':
        return {
          color: colors.textSecondary,
        };
      case 'destructive':
        return {
          color: colors.surface,
        };
      default:
        return {
          color: colors.surface,
        };
    }
  };

  if (!visible) {
    return null;
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onRequestClose}
      statusBarTranslucent
    >
      <StatusBar backgroundColor="rgba(0,0,0,0.5)" barStyle="light-content" />
      
      <Animated.View 
        style={[
          styles.overlay,
          {
            opacity: opacityAnim,
          }
        ]}
      >
        <BlurView
          style={styles.blurContainer}
          blurType={theme === 'dark' ? 'dark' : 'light'}
          blurAmount={20}
        >
          <Animated.View
            style={[
              styles.alertContainer,
              {
                backgroundColor: colors.vaultSurface,
                transform: [
                  { scale: scaleAnim },
                  { translateY: slideAnim }
                ],
              },
            ]}
          >
            {/* Header with Icon */}
            {icon && (
              <View style={[styles.iconContainer, { backgroundColor: `${iconColor || colors.vaultAccent}15` }]}>
                <Icon 
                  name={icon} 
                  size={32} 
                  color={iconColor || colors.vaultAccent} 
                />
              </View>
            )}

            {/* Title */}
            <Text style={[styles.title, { color: colors.vaultText }]}>
              {title}
            </Text>

            {/* Message */}
            <Text style={[styles.message, { color: colors.textSecondary }]}>
              {message}
            </Text>

            {/* Buttons */}
            <View style={styles.buttonContainer}>
              {buttons.map((button, index) => (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.button,
                    getButtonStyle(button.style),
                    index === 0 && buttons.length > 1 ? styles.firstButton : {},
                  ]}
                  onPress={() => {
                    handleButtonPress(button).catch(error => {
                      console.error('Error handling button press:', error);
                    });
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.buttonText, getButtonTextStyle(button.style)]}>
                    {button.text}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </Animated.View>
        </BlurView>
      </Animated.View>
    </Modal>
  );
};

const { width } = Dimensions.get('window');

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  blurContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  alertContainer: {
    width: Math.min(width - 64, 320),
    borderRadius: 24,
    paddingTop: 32,
    paddingHorizontal: 24,
    paddingBottom: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 24,
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 12,
    lineHeight: 24,
  },
  message: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
    paddingHorizontal: 8,
  },
  buttonContainer: {
    flexDirection: 'row',
    width: '100%',
    gap: 12,
  },
  button: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  firstButton: {
    marginRight: 0,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
});

export default CustomAlert;