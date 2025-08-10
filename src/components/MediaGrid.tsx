// src/components/MediaGrid.tsx

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Image,
  RefreshControl,
  RefreshControlProps,
  ActivityIndicator,
} from 'react-native';
import Icon from "@react-native-vector-icons/material-icons";
import { BlurView } from '@react-native-community/blur';
import { FlashList } from '@shopify/flash-list';

import { VaultItem } from '../types';
import { COLORS, GRID_SIZES } from '../utils/constants';
import { MediaService } from '../services/MediaService';
import { logDebug, logError } from '../services/Logger';
import MediaViewer from './MediaViewer';
import { useTheme } from '../contexts/ThemeContext';
import { useCustomAlert } from '../hooks/useCustomAlert';

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
  colors: any;
}

const GridItem: React.FC<GridItemProps> = ({
  item,
  isSelected,
  isSelectionMode,
  onSelect,
  onLongPress,
  onPress,
  itemSize,
  colors,
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
        { width: itemSize, height: itemSize, backgroundColor: colors.vaultSurface },
        isSelected && { borderColor: colors.vaultAccent },
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
          <View style={[styles.thumbnail, styles.placeholderThumbnail, { backgroundColor: colors.vaultSurface }]}>
            {isLoading ? (
              <ActivityIndicator size="small" color={colors.textSecondary} />
            ) : (
              <Icon
                name={item.type === 'video' ? 'videocam' : 'photo'}
                size={32}
                color={colors.textSecondary}
              />
            )}
          </View>
        )}
        
        {/* Video duration overlay */}
        {item.type === 'video' && (
          <View style={styles.durationOverlay}>
            <Icon name="play-circle-filled" size={16} color={colors.surface} />
            <Text style={[styles.durationText, { color: colors.surface }]}>Video</Text>
          </View>
        )}
        
        {/* Selection overlay */}
        {isSelectionMode && (
          <BlurView style={styles.selectionOverlay} blurType="dark" blurAmount={10}>
            <View style={[styles.checkbox, { borderColor: colors.surface }, isSelected && { backgroundColor: colors.vaultAccent, borderColor: colors.vaultAccent }]}>
              {isSelected && (
                <Icon name="check" size={16} color={colors.surface} />
              )}
            </View>
          </BlurView>
        )}

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
  const { colors } = useTheme();
  const { showAlert, AlertComponent } = useCustomAlert();
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

  // Create rows of items for FlashList
  const createRows = useCallback(() => {
    const rows: VaultItem[][] = [];
    for (let i = 0; i < items.length; i += columns) {
      rows.push(items.slice(i, i + columns));
    }
    return rows;
  }, [items, columns]);

const renderRow = useCallback(({ item: row }: { item: VaultItem[] }) => (
  <View style={[styles.row, { paddingHorizontal: spacing / 2 }]}>
    {/* Add this empty view to push content to center */}
    {row.length < columns && (
      <View style={{ flex: 1 }} />
    )}
    
    {row.map((item, index) => (
      <View
        key={item.id}
        style={[
          styles.gridItemWrapper,
          { 
            width: itemSize, 
            marginHorizontal: spacing / 2,
          }
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
          colors={colors}
        />
      </View>
    ))}
    
    {/* Add this empty view to push content to center */}
    {row.length < columns && (
      <View style={{ flex: 1 }} />
    )}
  </View>
), [itemSize, spacing, columns, selectedItems, isSelectionMode, onItemSelect, onItemLongPress, handleItemPress, colors]);

  const getItemType = useCallback(() => {
    return 'row';
  }, []);

  if (items.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Icon name="photo-library" size={64} color={colors.textSecondary} />
        <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No items to display</Text>
      </View>
    );
  }

  const rows = createRows();

  return (
    <View style={styles.container}>
      <FlashList
        data={rows}
        renderItem={renderRow}
        getItemType={getItemType}
        contentContainerStyle={[styles.flashListContent, { paddingBottom: 120, paddingHorizontal: 16 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={refreshControl}
        keyExtractor={(item, index) => `row-${index}`}
        ItemSeparatorComponent={() => <View style={{ height: spacing }} />}
      />
      
      {viewerItem && (
        <MediaViewer
          item={viewerItem}
          onClose={handleCloseViewer}
          onItemDeleted={onItemDeleted}
          mediaService={mediaService}
        />
      )}
      
      {/* Custom Alert Dialog */}
      {AlertComponent}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flashListContent: {
    paddingTop: 20,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'center'
  },
  gridItemWrapper: {
    // Dynamic width and margins are set inline
  },
  gridItem: {
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: COLORS.vaultSurface,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
  },
  gridItemSelected: {
    borderWidth: 3,
    borderColor: COLORS.vaultAccent,
    shadowColor: COLORS.vaultAccent,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 6,
  },
  mediaContainer: {
    flex: 1,
    position: 'relative',
  },
  thumbnail: {
    width: '100%',
    height: '100%',
    borderRadius: 14,
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