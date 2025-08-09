// src/components/MediaGrid.tsx

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Dimensions,
  Image,
  RefreshControl,
  Alert,
  RefreshControlProps,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import Icon from "@react-native-vector-icons/material-icons";
import { BlurView } from '@react-native-community/blur';

import { VaultItem } from '../types';
import { COLORS, GRID_SIZES } from '../utils/constants';
import { MediaService } from '../services/MediaService';
import { logDebug, logError } from '../services/Logger';
import MediaViewer from './MediaViewer';
interface MediaGridProps {
  items: VaultItem[];
  selectedItems: Set<string>;
  isSelectionMode: boolean;
  onItemSelect: (itemId: string) => void;
  onItemLongPress: (itemId: string) => void;
  onItemDeleted?: () => void;
  refreshControl?: React.ReactElement<RefreshControlProps> | undefined;
  gridSize?: 'small' | 'medium' | 'large';
  onViewerStateChange?: (isViewerOpen: boolean) => void;
}

interface GridItemProps {
  item: VaultItem;
  isSelected: boolean;
  isSelectionMode: boolean;
  onSelect: () => void;
  onLongPress: () => void;
  onPress: () => void;
  itemSize: number;
}

const GridItem: React.FC<GridItemProps> = ({
  item,
  isSelected,
  isSelectionMode,
  onSelect,
  onLongPress,
  onPress,
  itemSize,
}) => {
  const [thumbnailUri, setThumbnailUri] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [mediaService] = useState(() => MediaService.getInstance());

  const loadThumbnail = useCallback(async () => {
    if (thumbnailUri || isLoading || !item.thumbnailPath) return;
    
    setIsLoading(true);
    try {
      logDebug('MediaGrid', 'Loading thumbnail for item', { id: item.id, name: item.originalName });
      
      const thumbnailResult = await mediaService.getThumbnailForDisplay(item);
      if (thumbnailResult.success && thumbnailResult.uri) {
        setThumbnailUri(thumbnailResult.uri);
        logDebug('MediaGrid', 'Thumbnail loaded successfully', { id: item.id });
      } else {
        logError('MediaGrid', 'Failed to load thumbnail', { error: thumbnailResult.error, id: item.id });
      }
    } catch (error) {
      logError('MediaGrid', 'Failed to load thumbnail', { error, id: item.id });
    } finally {
      setIsLoading(false);
    }
  }, [thumbnailUri, isLoading, item, mediaService]);

  React.useEffect(() => {
    loadThumbnail();
  }, [loadThumbnail]);

  // Cleanup temporary thumbnail files
  React.useEffect(() => {
    return () => {
      if (thumbnailUri && thumbnailUri.startsWith('file://')) {
        // Clean up temporary thumbnail file when component unmounts
        const filePath = thumbnailUri.replace('file://', '');
        require('react-native-fs').unlink(filePath).catch((error: any) => {
          logDebug('MediaGrid', 'Failed to cleanup thumbnail file', { error, path: filePath });
        });
      }
    };
  }, [thumbnailUri]);

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const formatDate = (timestamp: number): string => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    
    return date.toLocaleDateString();
  };

  return (
    <TouchableOpacity
      style={[
        styles.gridItem,
        { width: itemSize, height: itemSize },
        isSelected && styles.gridItemSelected,
      ]}
      onPress={isSelectionMode ? onSelect : onPress}
      onLongPress={onLongPress}
      activeOpacity={0.7}
    >
      <View style={styles.mediaContainer}>
        {thumbnailUri ? (
          <Image 
            source={{ uri: thumbnailUri }} 
            style={styles.thumbnail}
            onError={() => {
              logError('MediaGrid', 'Failed to display thumbnail image', { id: item.id });
              setThumbnailUri(null);
            }}
          />
        ) : (
          <View style={[styles.thumbnail, styles.placeholderThumbnail]}>
            {isLoading ? (
              <ActivityIndicator size="small" color={COLORS.textSecondary} />
            ) : (
              <Icon
                name={item.type === 'video' ? 'videocam' : 'photo'}
                size={32}
                color={COLORS.textSecondary}
              />
            )}
          </View>
        )}
        
        {/* Video duration overlay */}
        {item.type === 'video' && (
          <View style={styles.durationOverlay}>
            <Icon name="play-circle-filled" size={16} color={COLORS.surface} />
            <Text style={styles.durationText}>Video</Text>
          </View>
        )}
        
        {/* Selection overlay */}
        {isSelectionMode && (
          <BlurView style={styles.selectionOverlay} blurType="dark" blurAmount={10}>
            <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
              {isSelected && (
                <Icon name="check" size={16} color={COLORS.surface} />
              )}
            </View>
          </BlurView>
        )}
        
        {/* Gradient overlay for text */}
        <View style={styles.gradientOverlay} />
        
        {/* Item info */}
        <View style={styles.itemInfo}>
          <Text style={styles.itemName} numberOfLines={1}>
            {item.originalName}
          </Text>
          <Text style={styles.itemDetails}>
            {formatFileSize(item.size)} • {formatDate(item.dateAdded)}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
};

const MediaGrid: React.FC<MediaGridProps> = ({
  items,
  selectedItems,
  isSelectionMode,
  onItemSelect,
  onItemLongPress,
  onItemDeleted,
  refreshControl,
  gridSize = 'medium',
  onViewerStateChange,
}) => {
  const [viewerItem, setViewerItem] = useState<VaultItem | null>(null);
  const [mediaService] = useState(() => MediaService.getInstance());

  const { width } = Dimensions.get('window');
  const { columns, spacing } = GRID_SIZES[gridSize];
  const itemSize = (width - (spacing * (columns + 1))) / columns;

  const handleItemPress = useCallback((item: VaultItem) => {
    if (!isSelectionMode) {
      setViewerItem(item);
      onViewerStateChange?.(true);
    }
  }, [isSelectionMode, onViewerStateChange]);

  const handleCloseViewer = useCallback(() => {
    setViewerItem(null);
    onViewerStateChange?.(false);
  }, [onViewerStateChange]);



  if (items.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Icon name="photo-library" size={64} color={COLORS.textSecondary} />
        <Text style={styles.emptyText}>No items to display</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[styles.grid, { padding: spacing }]}
        showsVerticalScrollIndicator={false}
        refreshControl={refreshControl}
      >
        <View style={[styles.gridContainer, { marginHorizontal: -spacing / 2 }]}>
          {items.map((item) => (
            <View
              key={item.id}
              style={[
                styles.gridItemWrapper,
                { width: itemSize, marginHorizontal: spacing / 2, marginBottom: spacing }
              ]}
            >
              <GridItem
                item={item}
                isSelected={selectedItems.has(item.id)}
                isSelectionMode={isSelectionMode}
                onSelect={() => onItemSelect(item.id)}
                onLongPress={() => onItemLongPress(item.id)}
                onPress={() => handleItemPress(item)}
                itemSize={itemSize}
              />
            </View>
          ))}
        </View>
      </ScrollView>
      
      {viewerItem && (
        <MediaViewer
          item={viewerItem}
          onClose={handleCloseViewer}
          onItemDeleted={onItemDeleted}
          mediaService={mediaService}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  grid: {
    paddingBottom: 100, // Space for FAB
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
  },
  gridItemWrapper: {
    // Dynamic width and margins are set inline
  },
  gridItem: {
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: COLORS.vaultSurface,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  gridItemSelected: {
    borderWidth: 2,
    borderColor: COLORS.vaultAccent,
  },
  mediaContainer: {
    flex: 1,
    position: 'relative',
  },
  thumbnail: {
    width: '100%',
    height: '100%',
    borderRadius: 10,
  },
  placeholderThumbnail: {
    backgroundColor: COLORS.vaultSurface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  durationOverlay: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  durationText: {
    color: COLORS.surface,
    fontSize: 10,
    fontWeight: '500',
    marginLeft: 4,
  },
  selectionOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: COLORS.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxSelected: {
    backgroundColor: COLORS.vaultAccent,
    borderColor: COLORS.vaultAccent,
  },
  gradientOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 60,
    backgroundColor: 'transparent',
    // To achieve a gradient, use a library like 'react-native-linear-gradient' instead of this style.
  },
  itemInfo: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 8,
  },
  itemName: {
    color: COLORS.surface,
    fontSize: 12,
    fontWeight: '500',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  itemDetails: {
    color: COLORS.surface,
    fontSize: 10,
    opacity: 0.8,
    marginTop: 2,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyText: {
    fontSize: 16,
    color: COLORS.textSecondary,
    marginTop: 16,
    textAlign: 'center',
  },
});

export default MediaGrid;