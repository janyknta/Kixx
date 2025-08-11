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
          iconColor: '#00C851',
        };
      case 'error':
        return {
          icon: 'error',
          iconColor: '#FF4444',
        };
      case 'warning':
        return {
          icon: 'warning',
          iconColor: '#FFBB33',
        };
      case 'info':
      default:
        return {
          icon: 'info',
          iconColor: '#33B5E5',
        };
    }
  };

  const config = getToastConfig();

  useEffect(() => {
    if (visible) {
      // Show animation (iOS-style)
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          damping: 18,
          stiffness: 200,
          mass: 0.8,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          damping: 15,
          stiffness: 180,
          mass: 0.8,
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
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 0.8,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onHide();
    });
  };

  if (!visible) {
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
        reducedTransparencyFallbackColor="rgba(0, 0, 0, 0.8)"
      >
        <View
          style={[
            styles.toast,
            {
              backgroundColor: Platform.OS === 'ios' ? 
                'rgba(0, 0, 0, 0.8)' : 'rgba(0, 0, 0, 0.85)',
            },
          ]}
        >
          {/* Icon */}
          <View style={[styles.iconContainer, { backgroundColor: `${config.iconColor}20` }]}>
            <Icon 
              name={config.icon} 
              size={18} 
              color={config.iconColor} 
            />
          </View>

          {/* Content */}
          <View style={styles.content}>
            <Text 
              style={[styles.message, { color: 'white' }]}
              numberOfLines={2}
            >
              {message}
            </Text>
          </View>

          {/* Action Button */}
          {action && (
            <View style={styles.actionContainer}>
              <Text
                style={[styles.actionText, { color: 'rgba(255, 255, 255, 0.8)' }]}
                onPress={action.onPress}
              >
                {action.label}
              </Text>
            </View>
          )}
        </View>
      </BlurView>
    </Animated.View>
  );
};

const { width } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 30,
    left: 16,
    right: 16,
    zIndex: 99999,
    elevation: 50,
  },
  blurContainer: {
    borderRadius: 25,
    overflow: 'hidden',
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 25,
    minHeight: 44,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.12,
    shadowRadius: 2,
    elevation: 6,
  },
  iconContainer: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
  },
  message: {
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 16,
  },
  actionContainer: {
    marginLeft: 6,
    paddingHorizontal: 6,
  },
  actionText: {
    fontSize: 12,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
});

export default ToastNotification;