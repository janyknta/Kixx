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
import Icon from "@react-native-vector-icons/material-icons";

import { MediaService } from '../services/MediaService';
import { AuthService } from '../services/AuthService';
import { VaultItem } from '../types';
import { COLORS, GRID_SIZES } from '../utils/constants';
import { logDebug, logInfo, logError } from '../services/Logger';
import MediaGrid from '../components/MediaGrid';
import SettingsScreen from './SettingsScreen';
import TrashScreen from './TrashScreen';

interface VaultScreenProps {
  onLogout: () => void;
}

type ScreenMode = 'vault' | 'settings' | 'trash';

const VaultScreen: React.FC<VaultScreenProps> = ({ onLogout }) => {
  const [currentScreen, setCurrentScreen] = useState<ScreenMode>('vault');
  const [vaultItems, setVaultItems] = useState<VaultItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isViewerOpen, setIsViewerOpen] = useState(false);
  
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
      logDebug('VaultScreen', 'Loading vault items');
      
      // Ensure master key is available for decrypting metadata
      const { CryptoService } = require('../services/CryptoService');
      const cryptoService = CryptoService.getInstance();
      
      if (!cryptoService.isMasterKeySet()) {
        logInfo('VaultScreen', 'Master key not set, attempting to restore');
        const restoreResult = await authService.restoreMasterKey();
        logDebug('VaultScreen', 'Master key restore result', restoreResult);
        
        if (!restoreResult.success) {
          logError('VaultScreen', 'Failed to restore master key, forcing logout');
          onLogout();
          return;
        }
      }
      
      // Reload metadata from storage
      const loadResult = await mediaService.loadMetadata();
      logDebug('VaultScreen', 'Load metadata result', loadResult);
      
      if (!loadResult.success) {
        Alert.alert('Error', loadResult.error || 'Failed to load vault data');
        return;
      }

      // Get active vault items
      const items = mediaService.getVaultItems();
      logInfo('VaultScreen', 'Loaded vault items', { count: items.length });
      setVaultItems(items);

      // Generate missing thumbnails in background
      if (items.length > 0) {
        setTimeout(() => {
          mediaService.regenerateMissingThumbnails().then((result) => {
            if (result.generated > 0) {
              logInfo('VaultScreen', 'Generated missing thumbnails', { count: result.generated });
              // Refresh items to show new thumbnails
              const updatedItems = mediaService.getVaultItems();
              setVaultItems(updatedItems);
            }
          }).catch((error) => {
            logError('VaultScreen', 'Thumbnail regeneration failed', error);
          });
        }, 1000); // Small delay to not interfere with UI loading
      }
    } catch (error) {
      logError('VaultScreen', 'Failed to load vault items', error);
      Alert.alert('Error', 'Failed to load vault items');
    } finally {
      setIsLoading(false);
    }
  }, [mediaService, authService, onLogout]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await loadVaultItems();
    setIsRefreshing(false);
  }, [loadVaultItems]);


  const handleImportPress = useCallback(async () => {
    try {
      // Always ensure master key is available before importing
      const { CryptoService } = require('../services/CryptoService');
      const cryptoService = CryptoService.getInstance();
      
      logDebug('VaultScreen', 'Checking master key status');
      logDebug('VaultScreen', 'Auth service state', authService.getAuthState());
      logDebug('VaultScreen', 'Is session valid', { valid: authService.isSessionValid() });
      logDebug('VaultScreen', 'Is master key set', { set: cryptoService.isMasterKeySet() });
      
      // If master key is not set, try to restore it
      if (!cryptoService.isMasterKeySet()) {
        logInfo('VaultScreen', 'Master key not set, attempting to restore');
        
        const restoreResult = await authService.restoreMasterKey();
        logDebug('VaultScreen', 'Restore result', restoreResult);
        
        if (!restoreResult.success) {
          // If restore fails, force re-authentication
          Alert.alert(
            'Authentication Required', 
            `Session expired. ${restoreResult.error || 'Please authenticate again.'}`,
            [
              {
                text: 'OK',
                onPress: onLogout,
              },
            ]
          );
          return;
        }
      }
      
      // Double-check that master key is now set
      if (!cryptoService.isMasterKeySet()) {
        throw new Error('Master key could not be restored');
      }
      
      logInfo('VaultScreen', 'Master key confirmed - proceeding with import');
      
      // Direct import using image picker
      const result = await mediaService.importFromGallery((progress) => {
        // You could show a progress indicator here if needed
        logDebug('VaultScreen', 'Import progress', { current: progress.current, total: progress.total, file: progress.currentFileName });
      });

      if (result.success) {
        // Only show alert if something was actually imported
        if (result.imported > 0) {
          Alert.alert(
            'Import Complete',
            `Successfully imported ${result.imported} item${result.imported !== 1 ? 's' : ''}${
              result.errors.length > 0 ? ` with ${result.errors.length} error${result.errors.length !== 1 ? 's' : ''}` : ''
            }.`,
            [{ text: 'OK' }]
          );
        }
        // Refresh the vault items if anything was imported
        if (result.imported > 0) {
          await loadVaultItems();
        }
      } else {
        // Show detailed error messages if import failed
        const errorMessage = result.errors.length > 0 
          ? `Failed to import media items:\n${result.errors.join('\n')}`
          : 'Failed to import media items.';
        Alert.alert('Import Failed', errorMessage);
      }
    } catch (error) {
      logError('VaultScreen', 'Import failed', error);
      Alert.alert('Import Failed', `An error occurred during import: ${error.message || error}`);
    }
  }, [onLogout, mediaService, loadVaultItems, authService]);

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
              logError('VaultScreen', 'Failed to move items to trash', error);
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

  const handleViewerStateChange = useCallback((isOpen: boolean) => {
    setIsViewerOpen(isOpen);
  }, []);

  const renderHeader = () => {
    const stats = mediaService.getVaultStats();
    
    return (
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text style={styles.headerTitle}>Vault</Text>
          <View style={styles.headerActions}>
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
        onPress={handleImportPress}
      >
        <Icon name="add" size={24} color={COLORS.surface} />
        <Text style={styles.importButtonText}>Import Media</Text>
      </TouchableOpacity>
    </View>
  );

  const renderFAB = () => (
    <TouchableOpacity
      style={styles.fab}
      onPress={handleImportPress}
    >
      <Icon name="add" size={24} color={COLORS.surface} />
    </TouchableOpacity>
  );

  const renderVaultScreen = () => {
    const filteredItems = getFilteredItems();
    
    return (
      <View style={styles.container}>
        {!isViewerOpen && renderHeader()}
        
        {filteredItems.length === 0 && !isLoading ? (
          renderEmptyState()
        ) : (
          <MediaGrid
            items={filteredItems}
            selectedItems={selectedItems}
            isSelectionMode={isSelectionMode}
            onItemSelect={handleItemSelect}
            onItemLongPress={handleItemLongPress}
            onItemDeleted={loadVaultItems}
            onViewerStateChange={handleViewerStateChange}
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={handleRefresh}
                tintColor={COLORS.vaultAccent}
              />
            }
          />
        )}
        
        {!isSelectionMode && !isViewerOpen && renderFAB()}
      </View>
    );
  };

  // Render different screens based on current mode
  switch (currentScreen) {
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