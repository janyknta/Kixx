// src/components/LoadingOverlay.tsx

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { BlurView } from '@react-native-community/blur';
import Icon from "@react-native-vector-icons/material-icons";

import { COLORS } from '../utils/constants';
import { useTheme } from '../contexts/ThemeContext';

interface LoadingOverlayProps {
  visible: boolean;
  message?: string;
  progress?: {
    current: number;
    total: number;
    filename?: string;
  };
  type?: 'spinner' | 'progress';
  icon?: string;
  onRequestClose?: () => void;
}

const LoadingOverlay: React.FC<LoadingOverlayProps> = ({
  visible,
  message = 'Loading...',
  progress,
  type = 'spinner',
  icon,
  onRequestClose,
}) => {
  const { colors, theme } = useTheme();
  const fadeAnim = React.useRef(new Animated.Value(0)).current;
  const scaleAnim = React.useRef(new Animated.Value(0.8)).current;

  React.useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          damping: 15,
          stiffness: 150,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 0.8,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]);

  if (!visible) {
    return null;
  }

  const getLoadingMessage = () => {
    if (progress) {
      if (progress.current >= progress.total) {
        return 'Finalizing...';
      }
      return message;
    }
    return message;
  };

  const getProgressPercentage = () => {
    if (!progress) return 0;
    return Math.round((progress.current / progress.total) * 100);
  };

  return (
    <Animated.View 
      style={[
        styles.overlay,
        {
          opacity: fadeAnim,
        },
      ]}
    >
      <BlurView style={styles.blurView} blurType={theme === 'dark' ? 'dark' : 'light'} blurAmount={10}>
        <Animated.View 
          style={[
            styles.container,
            {
              backgroundColor: colors.vaultSurface,
              transform: [{ scale: scaleAnim }],
            },
          ]}
        >
          {/* Icon or Spinner */}
          <View style={styles.iconContainer}>
            {icon ? (
              <View style={[styles.customIconContainer, { backgroundColor: `${colors.vaultAccent}20` }]}>
                <Icon name={icon} size={32} color={colors.vaultAccent} />
              </View>
            ) : (
              <ActivityIndicator size="large" color={colors.vaultAccent} />
            )}
          </View>

          {/* Message */}
          <Text style={[styles.message, { color: colors.vaultText }]}>{getLoadingMessage()}</Text>

          {/* Progress Information */}
          {progress && (
            <View style={styles.progressInfo}>
              <Text style={[styles.progressText, { color: colors.textSecondary }]}>
                {progress.current} of {progress.total}
              </Text>
              
              {progress.filename && (
                <Text style={[styles.filename, { color: colors.textSecondary }]} numberOfLines={1}>
                  {progress.filename}
                </Text>
              )}

              {/* Progress Bar */}
              {type === 'progress' && (
                <View style={styles.progressBarContainer}>
                  <View style={[styles.progressBar, { backgroundColor: colors.border }]}>
                    <Animated.View
                      style={[
                        styles.progressBarFill,
                        { 
                          width: `${getProgressPercentage()}%`,
                          backgroundColor: colors.vaultAccent 
                        },
                      ]}
                    />
                  </View>
                  <Text style={[styles.percentageText, { color: colors.textSecondary }]}>
                    {getProgressPercentage()}%
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* Subtle pulse animation for spinner */}
          {!progress && (
            <View style={styles.pulseContainer}>
              <View style={[styles.pulse, styles.pulse1, { backgroundColor: `${colors.vaultAccent}30` }]} />
              <View style={[styles.pulse, styles.pulse2, { backgroundColor: `${colors.vaultAccent}30` }]} />
              <View style={[styles.pulse, styles.pulse3, { backgroundColor: `${colors.vaultAccent}30` }]} />
            </View>
          )}
        </Animated.View>
      </BlurView>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000,
  },
  blurView: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    backgroundColor: COLORS.vaultSurface,
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    minWidth: 280,
    maxWidth: 320,
    elevation: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
  },
  iconContainer: {
    marginBottom: 16,
    position: 'relative',
  },
  customIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: `${COLORS.vaultAccent}20`,
    justifyContent: 'center',
    alignItems: 'center',
  },
  message: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.vaultText,
    textAlign: 'center',
    marginBottom: 8,
  },
  progressInfo: {
    width: '100%',
    alignItems: 'center',
    marginTop: 16,
  },
  progressText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: 8,
  },
  filename: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 16,
    maxWidth: 200,
    textAlign: 'center',
  },
  progressBarContainer: {
    width: '100%',
    alignItems: 'center',
  },
  progressBar: {
    width: '100%',
    height: 6,
    backgroundColor: COLORS.border,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: COLORS.vaultAccent,
    borderRadius: 3,
  },
  percentageText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  pulseContainer: {
    position: 'absolute',
    top: 32,
    left: '50%',
    marginLeft: -32,
    width: 64,
    height: 64,
  },
  pulse: {
    position: 'absolute',
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: `${COLORS.vaultAccent}30`,
  },
  pulse1: {
    opacity: 0.6,
  },
  pulse2: {
    opacity: 0.4,
  },
  pulse3: {
    opacity: 0.2,
  },
});

export default LoadingOverlay;