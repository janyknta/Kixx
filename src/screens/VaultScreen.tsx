// src/screens/VaultScreen.tsx

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Alert,
  RefreshControl,
  StatusBar,
  Dimensions,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';

import { MediaService } from '../services/MediaService';
import { AuthService } from '../services/AuthService';
import { VaultItem } from '../types';
import { COLORS, GRID_SIZES } from '../utils/constants';
import MediaGrid from '../components/MediaGrid';
import ImportScreen from './ImportScreen';
import SettingsScreen from './SettingsScreen';
import TrashScreen from './TrashScreen';

interface VaultScreenProps {
  onLogout: () => void;
}

type ScreenMode = 'vault' | 'import' | 'settings' | 'trash';

const VaultScreen: React.FC<VaultScreenProps> = ({ onLogout }) => {
  const [currentScreen, setCurrentScreen] = useState<ScreenMode>('vault');
  const [vaultItems, setVaultItems] = useState<VaultItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [mediaService] = useState(() => MediaService.getInstance());
  const [authService] = useState(() => AuthService.getInstance());

  useEffect(() => {
    loadVaultItems();
    
    // Update activity on screen interaction
    const updateActivity = () => authService.updateActivity();
    updateActivity();
    
    // Set up interval to update activity
    const activityInterval = setInterval(updateActivity, 30000); // Every 30 seconds
    
    return () => clearInterval(activityInterval);
  }, []);

  const loadVaultItems = useCallback(async () => {
    try {
      setIsLoading(true);
      
      // Reload metadata from storage
      const loadResult = await mediaService.loadMetadata();
      if (!loadResult.success) {
        Alert.alert('Error', loadResult.error || 'Failed to load vault data');
        return;
      }

      // Get active vault items
      const items = mediaService.getVaultItems();
      setVaultItems(items);
    } catch (error) {
      console.error('Failed to load vault items:', error);
      Alert.alert('Error', 'Failed to load vault items');
    } finally {
      setIsLoading(false);
    }
  }, [mediaService]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await loadVaultItems();
    setIsRefreshing(false);
  }, [loadVaultItems]);

  const handleImportComplete = useCallback(() => {
    setCurrentScreen('vault');
    loadVaultItems();
  }, [loadVaultItems]);

  const handleItemSelect = useCallback((itemId: string) => {
    setSelectedItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
      }
      
      // Exit selection mode if no items are selected
      if (newSet.size === 0) {
        setIsSelectionMode(false);
      }
      
      return newSet;
    });
  }, []);

  const handleItemLongPress = useCallback((itemId: string) => {
    if (!isSelectionMode) {
      setIsSelectionMode(true);
      setSelectedItems(new Set([itemId]));
    }
  }, [isSelectionMode]);

  const handleSelectAll = useCallback(() => {
    const allItemIds = new Set(vaultItems.map(item => item.id));
    setSelectedItems(allItemIds);
  }, [vaultItems]);

  const handleDeselectAll = useCallback(() => {
    setSelectedItems(new Set());
    setIsSelectionMode(false);
  }, []);

  const handleMoveToTrash = useCallback(async () => {
    if (selectedItems.size === 0) return;

    Alert.alert(
      'Move to Trash',
      `Move ${selectedItems.size} item(s) to trash?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Move',
          style: 'destructive',
          onPress: async () => {
            try {
              const itemIds = Array.from(selectedItems);
              const result = await mediaService.batchMoveToTrash(itemIds);
              
              if (result.success) {
                Alert.alert('Success', `Moved ${result.processed} items to trash`);
                await loadVaultItems();
                setSelectedItems(new Set());
                setIsSelectionMode(false);
              } else {
                Alert.alert(
                  'Partial Success',
                  `Moved ${result.processed} items. Errors: ${result.errors.join(', ')}`
                );
              }
            } catch (error) {
              console.error('Failed to move items to trash:', error);
              Alert.alert('Error', 'Failed to move items to trash');
            }
          },
        },
      ]
    );
  }, [selectedItems, mediaService, loadVaultItems]);

  const getFilteredItems = useCallback(() => {
    let filtered = vaultItems;
    
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = mediaService.searchItems(query);
    }
    
    return filtered;
  }, [vaultItems, searchQuery, mediaService]);

  const renderHeader = () => {
    const stats = mediaService.getVaultStats();
    
    return (
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text style={styles.headerTitle}>Vault</Text>
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={styles.headerButton}
              onPress={() => setCurrentScreen('trash')}
            >
              <Icon name="delete" size={24} color={COLORS.vaultText} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.headerButton}
              onPress={() => setCurrentScreen('settings')}
            >
              <Icon name="settings" size={24} color={COLORS.vaultText} />
            </TouchableOpacity>
          </View>
        </View>
        
        <View style={styles.statsContainer}>
          <Text style={styles.statsText}>
            {stats.activeItems} items • {stats.imageCount} photos • {stats.videoCount} videos
          </Text>
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
              <TouchableOpacity onPress={handleMoveToTrash} style={styles.deleteButton}>
                <Icon name="delete" size={20} color={COLORS.surface} />
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <Icon name="photo-library" size={64} color={COLORS.textSecondary} />
      <Text style={styles.emptyTitle}>Your vault is empty</Text>
      <Text style={styles.emptySubtitle}>
        Import photos and videos to get started
      </Text>
      <TouchableOpacity
        style={styles.importButton}
        onPress={() => setCurrentScreen('import')}
      >
        <Icon name="add" size={24} color={COLORS.surface} />
        <Text style={styles.importButtonText}>Import Media</Text>
      </TouchableOpacity>
    </View>
  );

  const renderFAB = () => (
    <TouchableOpacity
      style={styles.fab}
      onPress={() => setCurrentScreen('import')}
    >
      <Icon name="add" size={24} color={COLORS.surface} />
    </TouchableOpacity>
  );

  const renderVaultScreen = () => {
    const filteredItems = getFilteredItems();
    
    return (
      <View style={styles.container}>
        {renderHeader()}
        
        {filteredItems.length === 0 && !isLoading ? (
          renderEmptyState()
        ) : (
          <MediaGrid
            items={filteredItems}
            selectedItems={selectedItems}
            isSelectionMode={isSelectionMode}
            onItemSelect={handleItemSelect}
            onItemLongPress={handleItemLongPress}
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={handleRefresh}
                tintColor={COLORS.vaultAccent}
              />
            }
          />
        )}
        
        {!isSelectionMode && renderFAB()}
      </View>
    );
  };

  // Render different screens based on current mode
  switch (currentScreen) {
    case 'import':
      return (
        <ImportScreen
          onBack={() => setCurrentScreen('vault')}
          onImportComplete={handleImportComplete}
        />
      );
    case 'settings':
      return (
        <SettingsScreen
          onBack={() => setCurrentScreen('vault')}
          onLogout={onLogout}
        />
      );
    case 'trash':
      return (
        <TrashScreen
          onBack={() => setCurrentScreen('vault')}
          onItemRestored={loadVaultItems}
        />
      );
    default:
      return renderVaultScreen();
  }
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 16,
    paddingBottom: 8,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: COLORS.vaultText,
  },
  headerActions: {
    flexDirection: 'row',
  },
  headerButton: {
    marginLeft: 16,
    padding: 8,
  },
  statsContainer: {
    paddingTop: 8,
  },
  statsText: {
    fontSize: 14,
    color: COLORS.textSecondary,
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
  deleteButton: {
    backgroundColor: COLORS.danger,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    marginLeft: 8,
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
  importButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.vaultAccent,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 25,
    marginTop: 24,
  },
  importButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.surface,
    marginLeft: 8,
  },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.vaultAccent,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
});

export default VaultScreen;