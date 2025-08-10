// src/components/ToastNotification.tsx

import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Dimensions,
  Platform,
} from 'react-native';
import { BlurView } from '@react-native-community/blur';
import Icon from "@react-native-vector-icons/material-icons";
import { useTheme } from '../contexts/ThemeContext';

interface ToastNotificationProps {
  visible: boolean;
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
  duration?: number;
  onHide: () => void;
  action?: {
    label: string;
    onPress: () => void;
  };
}

const ToastNotification: React.FC<ToastNotificationProps> = ({
  visible,
  message,
  type,
  duration = 4000,
  onHide,
  action,
}) => {
  const { colors, theme } = useTheme();
  const slideAnim = useRef(new Animated.Value(-100)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const timeoutRef = useRef<NodeJS.Timeout>();

  const getToastConfig = () => {
    switch (type) {
      case 'success':
        return {
          icon: 'check-circle',
          backgroundColor: colors.success,
          iconColor: colors.surface,
          textColor: colors.surface,
        };
      case 'error':
        return {
          icon: 'error',
          backgroundColor: colors.danger,
          iconColor: colors.surface,
          textColor: colors.surface,
        };
      case 'warning':
        return {
          icon: 'warning',
          backgroundColor: colors.warning,
          iconColor: colors.surface,
          textColor: colors.surface,
        };
      case 'info':
      default:
        return {
          icon: 'info',
          backgroundColor: colors.info,
          iconColor: colors.surface,
          textColor: colors.surface,
        };
    }
  };

  const config = getToastConfig();

  useEffect(() => {
    if (visible) {
      // Show animation
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          damping: 15,
          stiffness: 150,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          damping: 12,
          stiffness: 100,
          useNativeDriver: true,
        }),
      ]).start();

      // Note: Vibration/haptic feedback removed to prevent permission issues

      // Auto hide
      timeoutRef.current = setTimeout(() => {
        hideToast();
      }, duration);
    } else {
      hideToast();
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [visible]);

  const hideToast = () => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: -100,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 0.8,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onHide();
    });
  };

  if (!visible && slideAnim._value === -100) {
    return null;
  }

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [
            { translateY: slideAnim },
            { scale: scaleAnim },
          ],
          opacity: opacityAnim,
        },
      ]}
    >
      <BlurView
        style={styles.blurContainer}
        blurType={theme === 'dark' ? 'dark' : 'light'}
        blurAmount={20}
      >
        <View
          style={[
            styles.toast,
            {
              backgroundColor: Platform.OS === 'ios' ? 
                `${config.backgroundColor}95` : config.backgroundColor,
            },
          ]}
        >
          {/* Icon */}
          <View style={[styles.iconContainer, { backgroundColor: `${config.backgroundColor}20` }]}>
            <Icon 
              name={config.icon} 
              size={24} 
              color={config.iconColor} 
            />
          </View>

          {/* Content */}
          <View style={styles.content}>
            <Text 
              style={[styles.message, { color: config.textColor }]}
              numberOfLines={2}
            >
              {message}
            </Text>
          </View>

          {/* Action Button */}
          {action && (
            <View style={styles.actionContainer}>
              <Text
                style={[styles.actionText, { color: config.textColor }]}
                onPress={action.onPress}
              >
                {action.label}
              </Text>
            </View>
          )}

          {/* Progress Bar */}
          <Animated.View
            style={[
              styles.progressBar,
              {
                backgroundColor: `${config.textColor}30`,
              },
            ]}
          >
            <Animated.View
              style={[
                styles.progressFill,
                {
                  backgroundColor: config.textColor,
                  width: `${100}%`, // Will be animated based on duration
                },
              ]}
            />
          </Animated.View>
        </View>
      </BlurView>
    </Animated.View>
  );
};

const { width } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 20,
    left: 16,
    right: 16,
    zIndex: 99999, // Very high z-index to appear above all overlays
    elevation: 50, // High elevation for Android
  },
  blurContainer: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
    minHeight: 64,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 50, // High elevation to appear above overlays
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
  },
  message: {
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 20,
  },
  actionContainer: {
    marginLeft: 8,
    paddingHorizontal: 8,
  },
  actionText: {
    fontSize: 14,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  progressBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
  },
  progressFill: {
    height: '100%',
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
  },
});

export default ToastNotification;