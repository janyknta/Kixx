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
import Icon from "@react-native-vector-icons/material-icons";
import { BlurView } from '@react-native-community/blur';

import { VaultItem } from '../types';
import { COLORS } from '../utils/constants';
import { MediaService } from '../services/MediaService';

interface MediaViewerProps {
  item: VaultItem;
  onClose: () => void;
  onItemDeleted?: () => void;
  mediaService: MediaService;
}

const MediaViewer: React.FC<MediaViewerProps> = ({ item, onClose, onItemDeleted, mediaService }) => {
  const [decryptedPath, setDecryptedPath] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isControlsVisible, setIsControlsVisible] = useState(true);
  const [hideTimer, setHideTimer] = useState<NodeJS.Timeout | null>(null);
  
  // Animation values
  const [fadeAnim] = useState(new Animated.Value(1));
  const [scaleAnim] = useState(new Animated.Value(1));
  const [translateX] = useState(new Animated.Value(0));
  const [translateY] = useState(new Animated.Value(0));

  const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

  useEffect(() => {
    loadMedia();
    
    // Auto-hide controls after 5 seconds
    const timer = setTimeout(() => {
      hideControls();
    }, 5000);
    setHideTimer(timer);

    return () => {
      if (timer) clearTimeout(timer);
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
      // Clear existing timer and set new one
      if (hideTimer) clearTimeout(hideTimer);
      const timer = setTimeout(() => {
        hideControls();
      }, 5000);
      setHideTimer(timer);
    }
  }, [isControlsVisible, showControls, hideControls, hideTimer]);

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
                onItemDeleted?.(); // Notify parent that item was deleted
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


  const renderControls = () => (
    <Animated.View style={[styles.controlsContainer, { opacity: fadeAnim }]}>
      {/* Back button */}
      <TouchableOpacity style={styles.backButton} onPress={onClose}>
        <Icon name="arrow-back" size={28} color={COLORS.surface} />
      </TouchableOpacity>
      
      {/* Delete button */}
      <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
        <Icon name="delete" size={24} color={COLORS.surface} />
      </TouchableOpacity>
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
      <StatusBar hidden={true} />
      
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
    backgroundColor: 'black',
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
    pointerEvents: 'box-none',
  },
  backButton: {
    position: 'absolute',
    top: 50,
    left: 20,
    padding: 12,
    borderRadius: 25,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  deleteButton: {
    position: 'absolute',
    top: 50,
    right: 20,
    padding: 12,
    borderRadius: 25,
    backgroundColor: 'rgba(220, 53, 69, 0.8)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
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