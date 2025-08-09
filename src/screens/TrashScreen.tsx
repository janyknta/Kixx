// src/screens/TrashScreen.tsx

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Alert,
  StatusBar,
  RefreshControl,
  Dimensions,
} from 'react-native';
import Icon from "@react-native-vector-icons/material-icons";
import { Animated } from 'react-native';

import { MediaService } from '../services/MediaService';
import { VaultItem } from '../types';
import { COLORS } from '../utils/constants';
import ConfirmDialog from '../components/ConfirmDialog';

interface TrashScreenProps {
  onBack: () => void;
  onItemRestored: () => void;
}

interface TrashItemProps {
  item: VaultItem;
  isSelected: boolean;
  onSelect: () => void;
  onRestore: () => void;
  onDelete: () => void;
  isSelectionMode: boolean;
}

const TrashItem: React.FC<TrashItemProps> = ({
  item,
  isSelected,
  onSelect,
  onRestore,
  onDelete,
  isSelectionMode,
}) => {
  const scaleValue = React.useRef(new Animated.Value(1)).current;
  const slideValue = React.useRef(new Animated.Value(0)).current;
  
  const animatedStyle = {
    transform: [
      { scale: scaleValue },
      { translateX: slideValue }
    ]
  };

  const getDaysInTrash = (): number => {
    if (!item.deletedDate) return 0;
    const now = Date.now();
    const diffTime = now - item.deletedDate;
    return Math.floor(diffTime / (1000 * 60 * 60 * 24));
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const handlePress = () => {
    if (isSelectionMode) {
      Animated.sequence([
        Animated.timing(scaleValue, {
          toValue: 0.95,
          duration: 100,
          useNativeDriver: true
        }),
        Animated.spring(scaleValue, {
          toValue: 1,
          useNativeDriver: true
        })
      ]).start(() => onSelect());
    }
  };

  const handleRestore = () => {
    Animated.sequence([
      Animated.timing(scaleValue, {
        toValue: 0.95,
        duration: 100,
        useNativeDriver: true
      }),
      Animated.spring(scaleValue, {
        toValue: 1,
        useNativeDriver: true
      })
    ]).start(() => onRestore());
  };

  const handleDelete = () => {
    Animated.sequence([
      Animated.timing(slideValue, {
        toValue: -50,
        duration: 200,
        useNativeDriver: true
      }),
      Animated.spring(slideValue, {
        toValue: 0,
        useNativeDriver: true
      })
    ]).start(() => onDelete());
  };

  const daysInTrash = getDaysInTrash();
  const isExpiringSoon = daysInTrash >= 25; // Warning when close to 30-day limit

  return (
    <Animated.View style={[styles.trashItem, animatedStyle]}>
      <TouchableOpacity
        style={styles.itemContent}
        onPress={handlePress}
        activeOpacity={0.7}
      >
        {/* Selection indicator */}
        {isSelectionMode && (
          <View style={[styles.selectionIndicator, isSelected && styles.selected]}>
            {isSelected && <Icon name="check" size={16} color={COLORS.surface} />}
          </View>
        )}

        {/* Media icon */}
        <View style={styles.mediaIcon}>
          <Icon
            name={item.type === 'video' ? 'videocam' : 'photo'}
            size={24}
            color={COLORS.vaultAccent}
          />
        </View>

        {/* Item details */}
        <View style={styles.itemDetails}>
          <Text style={styles.itemName} numberOfLines={1}>
            {item.originalName}
          </Text>
          <Text style={styles.itemInfo}>
            {formatFileSize(item.size)} • {daysInTrash} day{daysInTrash !== 1 ? 's' : ''} in trash
          </Text>
          {isExpiringSoon && (
            <Text style={styles.expirationWarning}>
              Will be permanently deleted in {30 - daysInTrash} day{30 - daysInTrash !== 1 ? 's' : ''}
            </Text>
          )}
        </View>

        {/* Action buttons */}
        {!isSelectionMode && (
          <View style={styles.actionButtons}>
            <TouchableOpacity
              style={[styles.actionButton, styles.restoreButton]}
              onPress={handleRestore}
            >
              <Icon name="restore" size={20} color={COLORS.success} />
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.actionButton, styles.deleteButton]}
              onPress={handleDelete}
            >
              <Icon name="delete-forever" size={20} color={COLORS.danger} />
            </TouchableOpacity>
          </View>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
};

const TrashScreen: React.FC<TrashScreenProps> = ({ onBack, onItemRestored }) => {
  const [trashItems, setTrashItems] = useState<VaultItem[]>([]);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'restore' | 'delete' | null>(null);
  const [targetItemId, setTargetItemId] = useState<string | null>(null);

  const [mediaService] = useState(() => MediaService.getInstance());

  useEffect(() => {
    loadTrashItems();
  }, []);

  const loadTrashItems = useCallback(async () => {
    try {
      setIsLoading(true);
      
      // Reload metadata to get latest trash items
      const loadResult = await mediaService.loadMetadata();
      if (!loadResult.success) {
        Alert.alert('Error', loadResult.error || 'Failed to load trash data');
        return;
      }

      const items = mediaService.getDeletedItems();
      setTrashItems(items);
    } catch (error) {
      console.error('Failed to load trash items:', error);
      Alert.alert('Error', 'Failed to load trash items');
    } finally {
      setIsLoading(false);
    }
  }, [mediaService]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await loadTrashItems();
    setIsRefreshing(false);
  }, [loadTrashItems]);

  const handleItemSelect = useCallback((itemId: string) => {
    setSelectedItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
      }
      
      if (newSet.size === 0) {
        setIsSelectionMode(false);
      }
      
      return newSet;
    });
  }, []);

  const handleLongPress = useCallback((itemId: string) => {
    setIsSelectionMode(true);
    setSelectedItems(new Set([itemId]));
  }, []);

  const handleSelectAll = useCallback(() => {
    const allItemIds = new Set(trashItems.map(item => item.id));
    setSelectedItems(allItemIds);
  }, [trashItems]);

  const handleDeselectAll = useCallback(() => {
    setSelectedItems(new Set());
    setIsSelectionMode(false);
  }, []);

  const handleSingleRestore = useCallback((itemId: string) => {
    setTargetItemId(itemId);
    setConfirmAction('restore');
    setShowConfirmDialog(true);
  }, []);

  const handleSingleDelete = useCallback((itemId: string) => {
    setTargetItemId(itemId);
    setConfirmAction('delete');
    setShowConfirmDialog(true);
  }, []);

  const handleBatchRestore = useCallback(() => {
    if (selectedItems.size === 0) return;
    setConfirmAction('restore');
    setShowConfirmDialog(true);
  }, [selectedItems.size]);

  const handleBatchDelete = useCallback(() => {
    if (selectedItems.size === 0) return;
    setConfirmAction('delete');
    setShowConfirmDialog(true);
  }, [selectedItems.size]);

  const confirmRestore = async () => {
    setShowConfirmDialog(false);
    
    try {
      if (targetItemId) {
        // Single item restore
        const result = await mediaService.restoreFromTrash(targetItemId);
        if (result.success) {
          Alert.alert('Success', 'Item restored successfully');
          await loadTrashItems();
          onItemRestored();
        } else {
          Alert.alert('Error', result.error || 'Failed to restore item');
        }
      } else {
        // Batch restore
        const itemIds = Array.from(selectedItems);
        const result = await mediaService.batchRestoreFromTrash(itemIds);
        
        Alert.alert(
          'Restore Complete',
          `Restored ${result.processed} item${result.processed !== 1 ? 's' : ''}${
            result.errors.length > 0 ? ` with ${result.errors.length} error${result.errors.length !== 1 ? 's' : ''}` : ''
          }`
        );
        
        await loadTrashItems();
        onItemRestored();
        setSelectedItems(new Set());
        setIsSelectionMode(false);
      }
    } catch (error) {
      console.error('Restore failed:', error);
      Alert.alert('Error', 'Failed to restore item(s)');
    } finally {
      setTargetItemId(null);
    }
  };

  const confirmDelete = async () => {
    setShowConfirmDialog(false);
    
    try {
      if (targetItemId) {
        // Single item delete
        const result = await mediaService.permanentlyDeleteItem(targetItemId);
        if (result.success) {
          Alert.alert('Success', 'Item permanently deleted');
          await loadTrashItems();
        } else {
          Alert.alert('Error', result.error || 'Failed to delete item');
        }
      } else {
        // Batch delete
        const itemIds = Array.from(selectedItems);
        const result = await mediaService.batchPermanentDelete(itemIds);
        
        Alert.alert(
          'Delete Complete',
          `Permanently deleted ${result.processed} item${result.processed !== 1 ? 's' : ''}${
            result.errors.length > 0 ? ` with ${result.errors.length} error${result.errors.length !== 1 ? 's' : ''}` : ''
          }`
        );
        
        await loadTrashItems();
        setSelectedItems(new Set());
        setIsSelectionMode(false);
      }
    } catch (error) {
      console.error('Delete failed:', error);
      Alert.alert('Error', 'Failed to delete item(s)');
    } finally {
      setTargetItemId(null);
    }
  };

  const handleEmptyTrash = useCallback(() => {
    if (trashItems.length === 0) return;
    
    Alert.alert(
      'Empty Trash',
      'Permanently delete all items in trash? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete All',
          style: 'destructive',
          onPress: async () => {
            try {
              const itemIds = trashItems.map(item => item.id);
              const result = await mediaService.batchPermanentDelete(itemIds);
              
              Alert.alert('Success', `Permanently deleted ${result.processed} items`);
              await loadTrashItems();
            } catch (error) {
              console.error('Empty trash failed:', error);
              Alert.alert('Error', 'Failed to empty trash');
            }
          },
        },
      ]
    );
  }, [trashItems, mediaService]);

  const renderItem = useCallback(({ item }: { item: VaultItem }) => (
    <TrashItem
      item={item}
      isSelected={selectedItems.has(item.id)}
      onSelect={() => handleItemSelect(item.id)}
      onRestore={() => handleSingleRestore(item.id)}
      onDelete={() => handleSingleDelete(item.id)}
      isSelectionMode={isSelectionMode}
    />
  ), [selectedItems, isSelectionMode, handleItemSelect, handleSingleRestore, handleSingleDelete]);

  const renderHeader = () => (
    <View style={styles.header}>
      <View style={styles.headerTop}>
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <Icon name="arrow-back" size={24} color={COLORS.vaultText} />
        </TouchableOpacity>
        
        <Text style={styles.headerTitle}>Trash</Text>
        
        <TouchableOpacity style={styles.headerButton} onPress={handleEmptyTrash}>
          <Text style={styles.emptyTrashText}>Empty</Text>
        </TouchableOpacity>
      </View>
      
      <View style={styles.headerInfo}>
        <Text style={styles.headerSubtitle}>
          {trashItems.length} item{trashItems.length !== 1 ? 's' : ''} • Items are automatically deleted after 30 days
        </Text>
        
        {!isSelectionMode && trashItems.length > 0 && (
          <TouchableOpacity
            style={styles.selectModeButton}
            onPress={() => {
              setIsSelectionMode(true);
              setSelectedItems(new Set());
            }}
          >
            <Text style={styles.selectModeText}>Select</Text>
          </TouchableOpacity>
        )}
      </View>
      
      {isSelectionMode && (
        <View style={styles.selectionBar}>
          <Text style={styles.selectionText}>
            {selectedItems.size} selected
          </Text>
          
          <View style={styles.selectionActions}>
            <TouchableOpacity onPress={handleSelectAll} style={styles.selectionButton}>
              <Text style={styles.selectionButtonText}>All</Text>
            </TouchableOpacity>
            
            <TouchableOpacity onPress={handleDeselectAll} style={styles.selectionButton}>
              <Text style={styles.selectionButtonText}>None</Text>
            </TouchableOpacity>
            
            <TouchableOpacity onPress={handleBatchRestore} style={styles.batchRestoreButton}>
              <Icon name="restore" size={18} color={COLORS.surface} />
              <Text style={styles.batchButtonText}>Restore</Text>
            </TouchableOpacity>
            
            <TouchableOpacity onPress={handleBatchDelete} style={styles.batchDeleteButton}>
              <Icon name="delete-forever" size={18} color={COLORS.surface} />
              <Text style={styles.batchButtonText}>Delete</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <Icon name="delete-outline" size={64} color={COLORS.textSecondary} />
      <Text style={styles.emptyTitle}>Trash is empty</Text>
      <Text style={styles.emptySubtitle}>
        Deleted items will appear here and be automatically removed after 30 days
      </Text>
    </View>
  );

  const getDialogProps = () => {
    const isBatch = !targetItemId;
    const count = isBatch ? selectedItems.size : 1;
    
    if (confirmAction === 'restore') {
      return {
        title: 'Restore Items',
        message: `Restore ${count} item${count !== 1 ? 's' : ''} back to your vault?`,
        confirmText: 'Restore',
        type: 'success' as const,
        onConfirm: confirmRestore,
      };
    } else {
      return {
        title: 'Permanent Delete',
        message: `Permanently delete ${count} item${count !== 1 ? 's' : ''}? This action cannot be undone.`,
        confirmText: 'Delete Forever',
        type: 'destructive' as const,
        onConfirm: confirmDelete,
      };
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar backgroundColor={COLORS.vaultBackground} barStyle="light-content" />
      
      {renderHeader()}
      
      {trashItems.length === 0 ? (
        renderEmptyState()
      ) : (
        <FlatList
          data={trashItems}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor={COLORS.vaultAccent}
            />
          }
        />
      )}

      <ConfirmDialog
        visible={showConfirmDialog}
        {...getDialogProps()}
        cancelText="Cancel"
        onCancel={() => {
          setShowConfirmDialog(false);
          setTargetItemId(null);
        }}
      />
    </View>
  );
};

const { width } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.vaultBackground,
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
  emptyTrashText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.danger,
  },
  headerInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
  },
  headerSubtitle: {
    flex: 1,
    fontSize: 14,
    color: COLORS.textSecondary,
    lineHeight: 18,
  },
  selectModeButton: {
    padding: 8,
  },
  selectModeText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.vaultAccent,
  },
  selectionBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  selectionText: {
    fontSize: 16,
    color: COLORS.vaultText,
    fontWeight: '500',
  },
  selectionActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  selectionButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 8,
  },
  selectionButtonText: {
    fontSize: 14,
    color: COLORS.vaultAccent,
    fontWeight: '500',
  },
  batchRestoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.success,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    marginRight: 8,
  },
  batchDeleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.danger,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
  },
  batchButtonText: {
    color: COLORS.surface,
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 4,
  },
  list: {
    padding: 16,
  },
  trashItem: {
    backgroundColor: COLORS.vaultSurface,
    borderRadius: 12,
    marginBottom: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  itemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  selectionIndicator: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  selected: {
    backgroundColor: COLORS.vaultAccent,
    borderColor: COLORS.vaultAccent,
  },
  mediaIcon: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: `${COLORS.vaultAccent}20`,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  itemDetails: {
    flex: 1,
    marginRight: 16,
  },
  itemName: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.vaultText,
    marginBottom: 4,
  },
  itemInfo: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: 2,
  },
  expirationWarning: {
    fontSize: 12,
    color: COLORS.warning,
    fontWeight: '500',
  },
  actionButtons: {
    flexDirection: 'row',
  },
  actionButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  restoreButton: {
    backgroundColor: `${COLORS.success}20`,
  },
  deleteButton: {
    backgroundColor: `${COLORS.danger}20`,
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

export default TrashScreen;