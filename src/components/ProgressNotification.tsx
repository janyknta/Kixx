// src/components/ProgressNotification.tsx

import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Dimensions,
  Platform,
  TouchableOpacity,
} from 'react-native';
import { BlurView } from '@react-native-community/blur';
import Icon from "@react-native-vector-icons/material-icons";
import { useTheme } from '../contexts/ThemeContext';
import { NotificationData } from '../contexts/NotificationContext';

interface ProgressNotificationProps {
  notification: NotificationData;
  visible: boolean;
  onHide: () => void;
}

const ProgressNotification: React.FC<ProgressNotificationProps> = ({
  notification,
  visible,
  onHide,
}) => {
  const { colors, theme } = useTheme();
  const slideAnim = useRef(new Animated.Value(100)).current; // Start from bottom
  const opacityAnim = useRef(new Animated.Value(0)).current;

  const progress = Math.max(0, Math.min(100, notification.progress || 0));
  const progressText = notification.progressText || '';

  useEffect(() => {
    if (visible) {
      // Show animation from bottom
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
      ]).start();
    } else {
      hideNotification();
    }
  }, [visible]);

  const hideNotification = () => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: 100, // Hide to bottom
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onHide();
    });
  };

  const handleCancel = () => {
    if (notification.onCancel) {
      notification.onCancel();
    }
    hideNotification();
  };

  if (!visible && slideAnim._value === 100) {
    return null;
  }

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [{ translateY: slideAnim }],
          opacity: opacityAnim,
        },
      ]}
    >
      <BlurView
        style={styles.blurContainer}
        blurType={theme === 'dark' ? 'dark' : 'light'}
        blurAmount={15}
      >
        <View
          style={[
            styles.notification,
            {
              backgroundColor: Platform.OS === 'ios' ? 
                `${colors.vaultSurface}95` : colors.vaultSurface,
            },
          ]}
        >
          {/* Icon */}
          <View style={[styles.iconContainer, { backgroundColor: `${colors.vaultAccent}20` }]}>
            <Icon 
              name="cloud-upload" 
              size={24} 
              color={colors.vaultAccent} 
            />
          </View>

          {/* Content */}
          <View style={styles.content}>
            <Text 
              style={[styles.message, { color: colors.vaultText }]}
              numberOfLines={1}
            >
              {notification.message}
            </Text>
            
            {/* Progress Bar */}
            <View style={styles.progressContainer}>
              <View
                style={[
                  styles.progressBackground,
                  { backgroundColor: `${colors.vaultText}20` },
                ]}
              >
                <Animated.View
                  style={[
                    styles.progressFill,
                    {
                      backgroundColor: colors.vaultAccent,
                      width: `${progress}%`,
                    },
                  ]}
                />
              </View>
            </View>
            
            {/* Progress Text */}
            <Text 
              style={[styles.progressText, { color: colors.textSecondary }]}
              numberOfLines={1}
            >
              {progressText || `${Math.round(progress)}% uploaded`}
            </Text>
          </View>

          {/* Cancel Button */}
          {notification.onCancel && (
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={handleCancel}
              activeOpacity={0.7}
            >
              <Icon 
                name="close" 
                size={20} 
                color={colors.textSecondary} 
              />
            </TouchableOpacity>
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
    bottom: Platform.OS === 'ios' ? 100 : 80, // Above bottom navigation/safe area
    left: 16,
    right: 16,
    zIndex: 99999,
    elevation: 50,
  },
  blurContainer: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  notification: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 50,
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
  },
  message: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  progressContainer: {
    marginBottom: 4,
  },
  progressBackground: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
    minWidth: 6, // Minimum width to show some progress
  },
  progressText: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 4,
  },
  cancelButton: {
    padding: 8,
    marginLeft: 8,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default ProgressNotification;