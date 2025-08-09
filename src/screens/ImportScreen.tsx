// src/screens/ImportScreen.tsx

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Image,
  Alert,
  StatusBar,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { CameraRoll } from '@react-native-camera-roll/camera-roll';
import Icon from "@react-native-vector-icons/material-icons";
import { BlurView } from '@react-native-community/blur';
import { Animated } from 'react-native';

import { MediaService } from '../services/MediaService';
import { PermissionsUtil } from '../utils/permissions';
import { COLORS } from '../utils/constants';
import { MediaItem, ImportProgress } from '../types';
import ConfirmDialog from '../components/ConfirmDialog';
import LoadingOverlay from '../components/LoadingOverlay';

interface ImportScreenProps {
  onBack: () => void;
  onImportComplete: () => void;
}

interface GalleryItem {
  uri: string;
  filename?: string;
  type: string;
  fileSize?: number;
  width?: number;
  height?: number;
  timestamp: number;
}

interface ImportItemProps {
  item: GalleryItem;
  isSelected: boolean;
  onToggleSelect: () => void;
  itemSize: number;
}

const ImportItem: React.FC<ImportItemProps> = ({ 
  item, 
  isSelected, 
  onToggleSelect, 
  itemSize 
}) => {
  const scaleValue = React.useRef(new Animated.Value(1)).current;
  const checkScale = React.useRef(new Animated.Value(isSelected ? 1 : 0)).current;

  const animatedStyle = {
    transform: [{ scale: scaleValue }]
  };

  const checkAnimatedStyle = {
    transform: [{ scale: checkScale }]
  };

  useEffect(() => {
    Animated.spring(checkScale, {
      toValue: isSelected ? 1 : 0,
      damping: 12,
      stiffness: 100,
      useNativeDriver: true
    }).start();
  }, [isSelected]);

  const handlePress = () => {
    Animated.sequence([
      Animated.timing(scaleValue, {
        toValue: 0.95,
        duration: 100,
        useNativeDriver: true
      }),
      Animated.spring(scaleValue, {
        toValue: 1,
        damping: 10,
        stiffness: 100,
        useNativeDriver: true
      })
    ]).start(() => onToggleSelect());
  };

  const formatFileSize = (bytes: number | undefined): string => {
    if (!bytes) return '';
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  return (
    <Animated.View style={[styles.importItem, { width: itemSize, height: itemSize }, animatedStyle]}>
      <TouchableOpacity
        onPress={handlePress}
        activeOpacity={0.9}
        style={styles.itemTouchable}
      >
        <Image source={{ uri: item.uri }} style={styles.itemImage} />
        
        {/* Video indicator */}
        {item.type.startsWith('video/') && (
          <View style={styles.videoIndicator}>
            <Icon name="videocam" size={16} color={COLORS.surface} />
          </View>
        )}

        {/* File size */}
        {item.fileSize && (
          <View style={styles.fileSizeContainer}>
            <Text style={styles.fileSizeText}>{formatFileSize(item.fileSize)}</Text>
          </View>
        )}

        {/* Selection overlay */}
        <View style={[styles.selectionOverlay, isSelected && styles.selectionOverlayActive]}>
          <Animated.View style={[styles.checkbox, checkAnimatedStyle]}>
            <Icon name="check" size={16} color={COLORS.surface} />
          </Animated.View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
};

const ImportScreen: React.FC<ImportScreenProps> = ({ onBack, onImportComplete }) => {
  const [galleryItems, setGalleryItems] = useState<GalleryItem[]>([]);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  const [mediaService] = useState(() => MediaService.getInstance());
  const { width } = Dimensions.get('window');
  const itemSize = (width - 48) / 3; // 3 columns with 16px padding and 8px gaps

  useEffect(() => {
    loadGalleryItems();
  }, []);

  const loadGalleryItems = async () => {
    try {
      setIsLoading(true);

      // Check permissions first
      const hasPermission = await PermissionsUtil.checkAndRequestPermission('photoLibrary');
      if (!hasPermission) {
        console.warn('Photo library permission not granted');
        // Continue anyway - some permissions might work
      }

      // Load photos and videos from gallery
      const photos = await CameraRoll.getPhotos({
        first: 1000, // Load first 1000 items
        assetType: 'All',
        include: ['filename', 'fileSize', 'imageSize', 'playableDuration'],
      });

      const items: GalleryItem[] = photos.edges.map((edge: {
        node: {
          type: string;
          timestamp: number;
          image: {
            uri: string;
            filename?: string;
            fileSize?: number;
            width?: number;
            height?: number;
          };
        };
      }) => ({
        uri: edge.node.image.uri,
        filename: edge.node.image.filename ?? undefined,
        type: edge.node.type,
        fileSize: edge.node.image.fileSize ?? undefined,
        width: edge.node.image.width,
        height: edge.node.image.height,
        timestamp: new Date(edge.node.timestamp * 1000).getTime(),
      }));

      // Sort by timestamp (newest first)
      items.sort((a, b) => b.timestamp - a.timestamp);

      setGalleryItems(items);
    } catch (error) {
      console.error('Failed to load gallery items:', error);
      Alert.alert(
        'Error',
        'Failed to load gallery items. Please check permissions and try again.',
        [{ text: 'OK', onPress: onBack }]
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleItemToggle = useCallback((uri: string) => {
    setSelectedItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(uri)) {
        newSet.delete(uri);
      } else {
        newSet.add(uri);
      }
      return newSet;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    const allUris = new Set(galleryItems.map(item => item.uri));
    setSelectedItems(allUris);
  }, [galleryItems]);

  const handleDeselectAll = useCallback(() => {
    setSelectedItems(new Set());
  }, []);

  const handleImport = useCallback(() => {
    if (selectedItems.size === 0) {
      return;
    }
    setShowConfirmDialog(true);
  }, [selectedItems.size]);

  const confirmImport = async () => {
    setShowConfirmDialog(false);
    setIsImporting(true);

    try {
      // Convert selected items to MediaItem format
      const selectedMediaItems: MediaItem[] = galleryItems
        .filter(item => selectedItems.has(item.uri))
        .map(item => ({
          uri: item.uri,
          filename: item.filename,
          type: item.type,
          fileSize: item.fileSize,
          width: item.width,
          height: item.height,
        }));

      // Import with progress tracking
      const result = await mediaService.importMediaItems(selectedMediaItems, (progress) => {
        setImportProgress(progress);
      });

      if (result.success) {
        onImportComplete();
      } else {
        Alert.alert('Import Failed', 'Failed to import media items.');
      }
    } catch (error) {
      console.error('Import failed:', error);
      Alert.alert('Import Failed', 'An error occurred during import.');
    } finally {
      setIsImporting(false);
      setImportProgress(null);
    }
  };

  const renderItem = useCallback(({ item }: { item: GalleryItem }) => (
    <ImportItem
      item={item}
      isSelected={selectedItems.has(item.uri)}
      onToggleSelect={() => handleItemToggle(item.uri)}
      itemSize={itemSize}
    />
  ), [selectedItems, handleItemToggle, itemSize]);

  const renderHeader = () => (
    <View style={styles.header}>
      <View style={styles.headerTop}>
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <Icon name="arrow-back" size={24} color={COLORS.vaultText} />
        </TouchableOpacity>
        
        <Text style={styles.headerTitle}>Import Media</Text>
        
        <TouchableOpacity 
          style={styles.headerButton} 
          onPress={selectedItems.size === galleryItems.length ? handleDeselectAll : handleSelectAll}
        >
          <Text style={styles.headerButtonText}>
            {selectedItems.size === galleryItems.length ? 'None' : 'All'}
          </Text>
        </TouchableOpacity>
      </View>
      
      <View style={styles.selectionInfo}>
        <Text style={styles.selectionText}>
          {selectedItems.size} of {galleryItems.length} selected
        </Text>
        
        {selectedItems.size > 0 && (
          <TouchableOpacity style={styles.importButton} onPress={handleImport}>
            <Icon name="download" size={20} color={COLORS.surface} />
            <Text style={styles.importButtonText}>Import</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );


  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar backgroundColor={COLORS.vaultBackground} barStyle="light-content" />
        <LoadingOverlay
          visible={true}
          message="Loading your gallery..."
          icon="photo-library"
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar backgroundColor={COLORS.vaultBackground} barStyle="light-content" />
      
      {renderHeader()}
      
      {galleryItems.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Icon name="photo-library" size={64} color={COLORS.textSecondary} />
          <Text style={styles.emptyTitle}>No media found</Text>
          <Text style={styles.emptySubtitle}>
            Your device gallery appears to be empty
          </Text>
        </View>
      ) : (
        <FlatList
          data={galleryItems}
          renderItem={renderItem}
          keyExtractor={(item) => item.uri}
          numColumns={3}
          contentContainerStyle={styles.gridContainer}
          showsVerticalScrollIndicator={false}
          getItemLayout={(_, index) => ({
            length: itemSize,
            offset: itemSize * index,
            index,
          })}
        />
      )}

      <LoadingOverlay
        visible={isImporting}
        message={importProgress?.status === 'completed' ? 'Import Complete!' : 'Importing your media...'}
        progress={importProgress ? {
          current: importProgress.current,
          total: importProgress.total,
          filename: importProgress.currentFileName,
        } : undefined}
        type="progress"
        icon="download"
      />

      <ConfirmDialog
        visible={showConfirmDialog}
        title="Import Media"
        message={`Import ${selectedItems.size} selected items into your vault? Original files will be removed from your gallery.`}
        confirmText="Import"
        cancelText="Cancel"
        type="warning"
        onConfirm={confirmImport}
        onCancel={() => setShowConfirmDialog(false)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.vaultBackground,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: COLORS.vaultBackground,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: COLORS.vaultText,
    fontSize: 16,
    marginTop: 16,
  },
  header: {
    backgroundColor: COLORS.vaultSurface,
    paddingTop: StatusBar.currentHeight || 0,
    paddingBottom: 16,
    paddingHorizontal: 16,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 16,
    paddingBottom: 8,
  },
  backButton: {
    padding: 8,
    marginRight: 8,
  },
  headerTitle: {
    flex: 1,
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.vaultText,
  },
  headerButton: {
    padding: 8,
  },
  headerButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.vaultAccent,
  },
  selectionInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
  },
  selectionText: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  importButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.vaultAccent,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  importButtonText: {
    color: COLORS.surface,
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 4,
  },
  gridContainer: {
    padding: 16,
    gap: 8,
  },
  importItem: {
    borderRadius: 8,
    overflow: 'hidden',
    margin: 4,
  },
  itemTouchable: {
    flex: 1,
    position: 'relative',
  },
  itemImage: {
    width: '100%',
    height: '100%',
    backgroundColor: COLORS.vaultSurface,
  },
  videoIndicator: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 12,
    padding: 4,
  },
  fileSizeContainer: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  fileSizeText: {
    color: COLORS.surface,
    fontSize: 10,
    fontWeight: '500',
  },
  selectionOverlay: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.8)',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectionOverlayActive: {
    backgroundColor: COLORS.vaultAccent,
    borderColor: COLORS.vaultAccent,
  },
  checkbox: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: COLORS.vaultText,
    marginTop: 16,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 16,
    color: COLORS.textSecondary,
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 22,
  },
});

export default ImportScreen;