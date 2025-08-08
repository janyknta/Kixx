// src/components/MediaViewer.tsx

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Text,
  Image,
  Dimensions,
  StatusBar,
  ActivityIndicator,
  Alert,
  PanResponder,
  Animated,
  Share,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { BlurView } from '@react-native-community/blur';

import { VaultItem } from '../types';
import { COLORS } from '../utils/constants';
import { MediaService } from '../services/MediaService';

interface MediaViewerProps {
  item: VaultItem;
  onClose: () => void;
  mediaService: MediaService;
}

const MediaViewer: React.FC<MediaViewerProps> = ({ item, onClose, mediaService }) => {
  const [decryptedPath, setDecryptedPath] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isControlsVisible, setIsControlsVisible] = useState(true);
  
  // Animation values
  const [fadeAnim] = useState(new Animated.Value(1));
  const [scaleAnim] = useState(new Animated.Value(1));
  const [translateX] = useState(new Animated.Value(0));
  const [translateY] = useState(new Animated.Value(0));

  const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

  useEffect(() => {
    loadMedia();
    
    // Auto-hide controls after 3 seconds
    const hideTimer = setTimeout(() => {
      hideControls();
    }, 3000);

    return () => {
      clearTimeout(hideTimer);
      cleanupTempFile();
    };
  }, [item]);

  const loadMedia = async () => {
    setIsLoading(true);
    try {
      const result = await mediaService.getMediaForViewing(item);
      if (result.success && result.path) {
        setDecryptedPath(result.path);
      } else {
        Alert.alert('Error', result.error || 'Failed to load media');
        onClose();
      }
    } catch (error) {
      console.error('Failed to load media:', error);
      Alert.alert('Error', 'Failed to load media');
      onClose();
    } finally {
      setIsLoading(false);
    }
  };

  const cleanupTempFile = async () => {
    if (decryptedPath) {
      try {
        // Clean up temporary decrypted file
        // This would be handled by the FileService cleanup
      } catch (error) {
        console.error('Failed to cleanup temp file:', error);
      }
    }
  };

  const showControls = useCallback(() => {
    setIsControlsVisible(true);
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  const hideControls = useCallback(() => {
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      setIsControlsVisible(false);
    });
  }, [fadeAnim]);

  const toggleControls = useCallback(() => {
    if (isControlsVisible) {
      hideControls();
    } else {
      showControls();
    }
  }, [isControlsVisible, showControls, hideControls]);

  // Pan responder for zoom and pan gestures
  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (evt, gestureState) => {
      return Math.abs(gestureState.dx) > 5 || Math.abs(gestureState.dy) > 5;
    },
    onPanResponderGrant: () => {
      // Store initial values
      translateX.setOffset((translateX as any)._value);
      translateY.setOffset((translateY as any)._value);
      translateX.setValue(0);
      translateY.setValue(0);
    },
    onPanResponderMove: Animated.event(
      [null, { dx: translateX, dy: translateY }],
      { useNativeDriver: false }
    ),
    onPanResponderRelease: (evt, gestureState) => {
      translateX.flattenOffset();
      translateY.flattenOffset();

      // If swipe down gesture, close viewer
      if (gestureState.dy > 100 && Math.abs(gestureState.dx) < 100) {
        onClose();
        return;
      }

      // Animate back to center if dragged too far
      Animated.spring(translateX, {
        toValue: 0,
        useNativeDriver: false,
      }).start();
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: false,
      }).start();
    },
  });

  const handleShare = async () => {
    if (!decryptedPath) return;

    try {
      await Share.share({
        url: `file://${decryptedPath}`,
        title: item.originalName,
      });
    } catch (error) {
      console.error('Share failed:', error);
      Alert.alert('Error', 'Failed to share media');
    }
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete Media',
      'Move this item to trash?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const result = await mediaService.moveToTrash(item.id);
              if (result.success) {
                onClose();
              } else {
                Alert.alert('Error', result.error || 'Failed to delete item');
              }
            } catch (error) {
              console.error('Delete failed:', error);
              Alert.alert('Error', 'Failed to delete item');
            }
          },
        },
      ]
    );
  };

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const renderControls = () => (
    <Animated.View style={[styles.controlsContainer, { opacity: fadeAnim }]}>
      {/* Top controls */}
      <BlurView style={styles.topControls} blurType="dark" blurAmount={10}>
        <TouchableOpacity style={styles.controlButton} onPress={onClose}>
          <Icon name="close" size={24} color={COLORS.surface} />
        </TouchableOpacity>
        
        <View style={styles.mediaInfo}>
          <Text style={styles.mediaTitle} numberOfLines={1}>
            {item.originalName}
          </Text>
          <Text style={styles.mediaSubtitle}>
            {formatFileSize(item.size)} • {new Date(item.dateAdded).toLocaleDateString()}
          </Text>
        </View>
        
        <View style={styles.topRightControls}>
          <TouchableOpacity style={styles.controlButton} onPress={handleShare}>
            <Icon name="share" size={24} color={COLORS.surface} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.controlButton} onPress={handleDelete}>
            <Icon name="delete" size={24} color={COLORS.surface} />
          </TouchableOpacity>
        </View>
      </BlurView>

      {/* Video controls removed */}
    </Animated.View>
  );

  const renderMedia = () => {
    if (!decryptedPath) return null;

    return (
      <Animated.View
        style={[
          styles.mediaContainer,
          {
            transform: [
              { translateX },
              { translateY },
              { scale: scaleAnim },
            ],
          },
        ]}
        {...panResponder.panHandlers}
      >
        {item.type === 'video' ? (
          <View style={[styles.media, styles.videoUnsupported]}>
            <Icon name="videocam-off" size={48} color={COLORS.textSecondary} />
            <Text style={styles.videoUnsupportedText}>
              Video playback is not supported
            </Text>
          </View>
        ) : (
          <Image
            source={{ uri: `file://${decryptedPath}` }}
            style={styles.media}
            resizeMode="contain"
            onError={() => {
              Alert.alert('Error', 'Image display failed');
            }}
          />
        )}
      </Animated.View>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar backgroundColor="rgba(0,0,0,0.9)" barStyle="light-content" />
      
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.vaultAccent} />
          <Text style={styles.loadingText}>Decrypting media...</Text>
        </View>
      ) : (
        <>
          <TouchableOpacity
            style={styles.mediaWrapper}
            activeOpacity={1}
            onPress={toggleControls}
          >
            {renderMedia()}
          </TouchableOpacity>
          
          {renderControls()}
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
    zIndex: 1000,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: COLORS.surface,
    fontSize: 16,
    marginTop: 16,
  },
  mediaWrapper: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mediaContainer: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  media: {
    width: '100%',
    height: '100%',
  },
  controlsContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 100,
  },
  topControls: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: StatusBar.currentHeight || 0,
    paddingHorizontal: 16,
    paddingBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  controlButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  mediaInfo: {
    flex: 1,
    marginHorizontal: 16,
  },
  mediaTitle: {
    color: COLORS.surface,
    fontSize: 16,
    fontWeight: '600',
  },
  mediaSubtitle: {
    color: COLORS.surface,
    fontSize: 12,
    opacity: 0.8,
    marginTop: 2,
  },
  topRightControls: {
    flexDirection: 'row',
  },
  bottomControls: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  playButton: {
    padding: 8,
    borderRadius: 25,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    marginRight: 16,
  },
  progressContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  timeText: {
    color: COLORS.surface,
    fontSize: 12,
    fontWeight: '500',
    minWidth: 40,
    textAlign: 'center',
  },
  progressBar: {
    flex: 1,
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 2,
    marginHorizontal: 12,
  },
  progressFill: {
    height: '100%',
    backgroundColor: COLORS.vaultAccent,
    borderRadius: 2,
  },
  videoUnsupported: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
  },
  videoUnsupportedText: {
    color: COLORS.textSecondary,
    fontSize: 16,
    marginTop: 16,
    textAlign: 'center',
  },
});

export default MediaViewer;