// src/components/VideoPlayer.tsx

import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  StatusBar,
  ActivityIndicator,
  PanResponder,
  Animated,
} from 'react-native';
import Video, { VideoRef, OnLoadData, OnProgressData } from 'react-native-video';
import Slider from '@react-native-community/slider';
import Icon from '@react-native-vector-icons/material-icons';
import { useTheme } from '../contexts/ThemeContext';
import { VaultItem } from '../types';
import { MediaService } from '../services/MediaService';

interface VideoPlayerProps {
  vaultItem: VaultItem;
  onClose: () => void;
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({ vaultItem, onClose }) => {
  const { colors } = useTheme();
  const [isPlaying, setIsPlaying] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSeeking, setIsSeeking] = useState(false);
  const [seekTime, setSeekTime] = useState(0);
  
  const videoRef = useRef<VideoRef>(null);
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const mediaService = new MediaService();

  React.useEffect(() => {
    loadVideoForPlayback();
    
    return () => {
      // Clean up temp video file when component unmounts
      // The MediaService will handle cleanup of temp files
    };
  }, []);

  const loadVideoForPlayback = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      console.log('VideoPlayer: Loading video for playback:', vaultItem.originalName);
      
      const result = await mediaService.getMediaForViewing(vaultItem, (progress) => {
        console.log('VideoPlayer: Decryption progress:', progress);
      });
      
      if (result.success && result.path) {
        console.log('VideoPlayer: Video loaded successfully:', result.path);
        setVideoUri(`file://${result.path}`);
      } else {
        console.error('VideoPlayer: Failed to load video:', result.error);
        setError(result.error || 'Failed to load video');
      }
    } catch (error) {
      console.error('VideoPlayer: Error loading video:', error);
      setError('Failed to load video for playback');
    } finally {
      setIsLoading(false);
    }
  };

  const onLoad = useCallback((data: OnLoadData) => {
    console.log('VideoPlayer: Video loaded with duration:', data.duration);
    setDuration(data.duration);
    setIsLoading(false);
  }, []);

  const onProgress = useCallback((data: OnProgressData) => {
    setCurrentTime(data.currentTime);
  }, []);

  const onError = useCallback((error: any) => {
    console.error('VideoPlayer: Video playback error:', error);
    setError('Video playback failed');
    setIsLoading(false);
  }, []);

  const onEnd = useCallback(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    videoRef.current?.seek(0);
  }, []);

  const togglePlayPause = useCallback(() => {
    setIsPlaying(!isPlaying);
  }, [isPlaying]);

  const toggleControls = useCallback(() => {
    setShowControls(!showControls);
  }, [showControls]);


  const formatTime = useCallback((seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }, []);

  const onSeekStart = useCallback(() => {
    setIsSeeking(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
  }, []);

  const onSeekChange = useCallback((value: number) => {
    setSeekTime(value);
  }, []);

  const onSeekComplete = useCallback((value: number) => {
    videoRef.current?.seek(value);
    setCurrentTime(value);
    setIsSeeking(false);
  }, []);

  const onSeekForward = useCallback(() => {
    const newTime = Math.min(currentTime + 10, duration);
    videoRef.current?.seek(newTime);
    setCurrentTime(newTime);
  }, [currentTime, duration]);

  const onSeekBackward = useCallback(() => {
    const newTime = Math.max(currentTime - 10, 0);
    videoRef.current?.seek(newTime);
    setCurrentTime(newTime);
  }, [currentTime]);

  const toggleOrientation = useCallback(() => {
    // For now, just placeholder - orientation functionality can be added later
    // when react-native-orientation-locker is properly installed
    console.log('Toggle orientation pressed');
  }, []);

  const handleScreenTap = useCallback(() => {
    // Screen tap now does nothing - controls are managed by toggle button
  }, []);

  const handleClose = useCallback(() => {
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    onClose();
  }, [onClose]);

  if (error) {
    return (
      <View style={styles.container}>
        <StatusBar hidden />
        
        <View style={styles.errorContainer}>
          <Icon name="error" size={64} color="#FF3B30" />
          <Text style={styles.errorTitle}>
            Playback Error
          </Text>
          <Text style={styles.errorMessage}>
            {error}
          </Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={loadVideoForPlayback}
          >
            <Text style={styles.retryButtonText}>
              Retry
            </Text>
          </TouchableOpacity>
        </View>
        
        <TouchableOpacity style={[styles.backButton, { position: 'absolute', top: 50, left: 16 }]} onPress={handleClose}>
          <Icon name="arrow-back" size={28} color="#ffffff" />
        </TouchableOpacity>
      </View>
    );
  }

  if (isLoading || !videoUri) {
    return (
      <View style={styles.container}>
        <StatusBar hidden />
        
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>
            Loading video...
          </Text>
        </View>
        
        <TouchableOpacity style={[styles.backButton, { position: 'absolute', top: 50, left: 16 }]} onPress={handleClose}>
          <Icon name="arrow-back" size={28} color="#ffffff" />
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar hidden />
      
      <TouchableOpacity
        style={styles.videoContainer}
        activeOpacity={1}
        onPress={handleScreenTap}
      >
        <Video
          ref={videoRef}
          source={{ uri: videoUri }}
          style={styles.video}
          resizeMode="contain"
          paused={!isPlaying}
          onLoad={onLoad}
          onProgress={onProgress}
          onError={onError}
          onEnd={onEnd}
          progressUpdateInterval={1000}
        />
      </TouchableOpacity>

      {/* Toggle Button - Always Visible */}
      <TouchableOpacity 
        style={styles.toggleButtonFixed} 
        onPress={toggleControls}
        activeOpacity={0.7}
      >
        <Icon name={showControls ? 'keyboard-arrow-down' : 'keyboard-arrow-up'} size={28} color="#ffffff" />
      </TouchableOpacity>

      {/* Controls Overlay */}
      {showControls && (
        <View style={styles.controlsOverlay}>
          {/* Top Bar with Back Button and Title */}
          <View style={styles.topBar}>
            <TouchableOpacity style={styles.backButton} onPress={handleClose}>
              <Icon name="arrow-back" size={28} color="#ffffff" />
            </TouchableOpacity>
            <Text style={styles.videoTitle} numberOfLines={1}>
              {vaultItem.originalName}
            </Text>
          </View>

          {/* Bottom Controls Panel */}
          <View style={styles.bottomControlsPanel}>
            {/* Progress Bar */}
            <View style={styles.progressSection}>
              <Text style={styles.timeText}>
                {formatTime(isSeeking ? seekTime : currentTime)}
              </Text>
              
              <View style={styles.sliderContainer}>
                <Slider
                  style={styles.progressSlider}
                  minimumValue={0}
                  maximumValue={duration}
                  value={isSeeking ? seekTime : currentTime}
                  onSlidingStart={onSeekStart}
                  onValueChange={onSeekChange}
                  onSlidingComplete={onSeekComplete}
                  minimumTrackTintColor="#007AFF"
                  maximumTrackTintColor="rgba(255,255,255,0.3)"
                  thumbTintColor="#007AFF"
                />
              </View>
              
              <Text style={styles.timeText}>
                {formatTime(duration)}
              </Text>
            </View>

            {/* Control Buttons */}
            <View style={styles.controlButtonsRow}>
              <TouchableOpacity
                style={styles.controlButton}
                onPress={onSeekBackward}
              >
                <Icon name="replay-10" size={24} color="#ffffff" />
              </TouchableOpacity>
              
              <TouchableOpacity
                style={styles.controlButton}
                onPress={togglePlayPause}
              >
                <Icon
                  name={isPlaying ? 'pause' : 'play-arrow'}
                  size={32}
                  color="#ffffff"
                />
              </TouchableOpacity>
              
              <TouchableOpacity
                style={styles.controlButton}
                onPress={onSeekForward}
              >
                <Icon name="forward-10" size={24} color="#ffffff" />
              </TouchableOpacity>
              
              <TouchableOpacity
                style={styles.controlButton}
                onPress={toggleOrientation}
              >
                <Icon name="screen-rotation" size={24} color="#ffffff" />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </View>
  );
};

const { width, height } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#000000',
    zIndex: 1000,
  },
  videoContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  video: {
    width: width,
    height: height,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
    color: '#ffffff',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  errorTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 16,
    marginBottom: 8,
    color: '#ffffff',
  },
  errorMessage: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
    color: '#ffffff',
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#007AFF',
  },
  retryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  controlsOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'space-between',
  },
  toggleButtonFixed: {
    position: 'absolute',
    top: 50,
    right: 16,
    padding: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.6)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
    zIndex: 200,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 16,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  backButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.6)',
    marginRight: 16,
  },
  videoTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    color: '#ffffff',
  },
  bottomControlsPanel: {
    paddingHorizontal: 20,
    paddingVertical: 20,
    backgroundColor: 'rgba(0,0,0,0.9)',
  },
  progressSection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  controlButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  controlButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  timeText: {
    fontSize: 14,
    fontWeight: '500',
    minWidth: 50,
    textAlign: 'center',
    color: '#ffffff',
  },
  sliderContainer: {
    flex: 1,
    marginHorizontal: 12,
  },
  progressSlider: {
    width: '100%',
    height: 40,
  },
});

export default VideoPlayer;