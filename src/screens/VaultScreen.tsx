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
} from 'react-native';
import Icon from "@react-native-vector-icons/material-icons";

import { MediaService } from '../services/MediaService';
import { AuthService } from '../services/AuthService';
import { VaultItem } from '../types';
import { COLORS } from '../utils/constants';
import { logDebug, logInfo, logError } from '../services/Logger';
import MediaGrid from '../components/MediaGrid';
import SettingsScreen from './SettingsScreen';
import TrashScreen from './TrashScreen';
import LoadingOverlay from '../components/LoadingOverlay';
import PinReentryModal from '../components/PinReentryModal';
import { useTheme } from '../contexts/ThemeContext';

interface VaultScreenProps {
  onLogout: () => void;
}

type ScreenMode = 'vault' | 'settings' | 'trash';

const VaultScreen: React.FC<VaultScreenProps> = ({ onLogout }) => {
  const { colors } = useTheme();
  const [currentScreen, setCurrentScreen] = useState<ScreenMode>('vault');
  const [vaultItems, setVaultItems] = useState<VaultItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{current: number, total: number, filename?: string} | null>(null);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);
  
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
          logError('VaultScreen', 'Failed to restore master key, showing PIN modal');
          setShowPinModal(true);
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
    // Start loading immediately
    setIsImporting(true);
    setImportProgress(null);

    try {
      logInfo('VaultScreen', 'Import started - user clicked import button');
      // Always ensure master key is available before importing
      const { CryptoService } = require('../services/CryptoService');
      const cryptoService = CryptoService.getInstance();
      
      logDebug('VaultScreen', 'Checking master key status');
      
      // If master key is not set, try to restore it silently
      if (!cryptoService.isMasterKeySet()) {
        logInfo('VaultScreen', 'Master key not set, attempting to restore');
        
        // Update progress to show authentication is happening
        setImportProgress({
          current: 0,
          total: 1,
          filename: 'Preparing vault access...',
        });
        
        const restoreResult = await authService.restoreMasterKey();
        logDebug('VaultScreen', 'Restore result', restoreResult);
        
        if (!restoreResult.success) {
          // If restore fails, show PIN modal
          setIsImporting(false);
          setImportProgress(null);
          setShowPinModal(true);
          return;
        }
      }
      
      // Double-check that master key is now set
      if (!cryptoService.isMasterKeySet()) {
        setIsImporting(false);
        setImportProgress(null);
        setShowPinModal(true);
        return;
      }
      
      logInfo('VaultScreen', 'Master key confirmed - proceeding with import');
      
      // Reset progress for actual import
      setImportProgress(null);
      
      logInfo('VaultScreen', 'Calling mediaService.importFromGallery...');
      
      // Direct import using image picker
      const result = await mediaService.importFromGallery((progress) => {
        logDebug('VaultScreen', 'Import progress', { current: progress.current, total: progress.total, file: progress.currentFileName });
        setImportProgress({
          current: progress.current,
          total: progress.total,
          filename: progress.currentFileName,
        });
      });

      logInfo('VaultScreen', 'Import result received', { success: result.success, imported: result.imported, errors: result.errors });

      if (result.success) {
        // Refresh the vault items if anything was imported
        if (result.imported > 0) {
          await loadVaultItems();
        }
      } else {
        // Check if error is due to authentication/master key issues
        const hasAuthError = result.errors.some(err => 
          err.includes('Authentication required') || 
          err.includes('Master key') || 
          err.includes('not available for encryption')
        );
        
        if (hasAuthError) {
          // Show PIN modal instead of error alert
          logInfo('VaultScreen', 'Authentication error detected, showing PIN modal');
          setShowPinModal(true);
        } else {
          // Only show error if there are actual import errors (not user cancellation)
          if (result.errors.length > 0 && !result.errors.some(err => err.includes('cancelled') || err.includes('canceled'))) {
            const errorMessage = result.errors.join('\n');
            Alert.alert('Import Failed', errorMessage);
          }
        }
      }
    } catch (error) {
      logError('VaultScreen', 'Import failed', error);
      
      // Check if the error is authentication-related
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('Authentication') || errorMessage.includes('Master key') || errorMessage.includes('Session')) {
        logInfo('VaultScreen', 'Import failed due to authentication, showing PIN modal');
        setShowPinModal(true);
      } else {
        Alert.alert('Import Failed', `An error occurred during import: ${errorMessage}`);
      }
    } finally {
      // Always clear loading state
      setIsImporting(false);
      setImportProgress(null);
    }
  }, [mediaService, loadVaultItems, authService]);

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
    return vaultItems;
  }, [vaultItems]);

  const handleViewerStateChange = useCallback((isOpen: boolean) => {
    setIsViewerOpen(isOpen);
  }, []);

  const handlePinModalSuccess = useCallback(() => {
    setShowPinModal(false);
    // Refresh the vault items after successful re-authentication
    loadVaultItems();
    
    // If user was trying to import, we could retry the import here
    // For now, they can click import again after PIN is verified
  }, [loadVaultItems]);

  const handlePinModalCancel = useCallback(() => {
    setShowPinModal(false);
    // Force logout if user cancels PIN re-entry
    onLogout();
  }, [onLogout]);

  const renderHeader = () => {
    const stats = mediaService.getVaultStats();
    
    return (
      <View style={[styles.header, { backgroundColor: colors.vaultSurface }]}>
        <View style={styles.headerTop}>
          <Text style={[styles.headerTitle, { color: colors.vaultText }]}>Vault</Text>
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={styles.headerButton}
              onPress={() => setCurrentScreen('settings')}
            >
              <Icon name="settings" size={24} color={colors.vaultText} />
            </TouchableOpacity>
          </View>
        </View>
        
        <View style={styles.statsContainer}>
          <Text style={[styles.statsText, { color: colors.textSecondary }]}>
            {stats.activeItems} items • {stats.imageCount} photos • {stats.videoCount} videos
          </Text>
        </View>
        
        {isSelectionMode && (
          <View style={[styles.selectionBar, { borderTopColor: colors.border }]}>
            <Text style={[styles.selectionText, { color: colors.vaultText }]}>
              {selectedItems.size} selected
            </Text>
            <View style={styles.selectionActions}>
              <TouchableOpacity onPress={handleSelectAll} style={styles.selectionButton}>
                <Text style={[styles.selectionButtonText, { color: colors.vaultAccent }]}>All</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleDeselectAll} style={styles.selectionButton}>
                <Text style={[styles.selectionButtonText, { color: colors.vaultAccent }]}>None</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleMoveToTrash} style={[styles.deleteButton, { backgroundColor: colors.danger }]}>
                <Icon name="delete" size={20} color={colors.surface} />
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <Icon name="photo-library" size={64} color={colors.textSecondary} />
      <Text style={[styles.emptyTitle, { color: colors.vaultText }]}>Your vault is empty</Text>
      <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
        Import photos and videos to get started
      </Text>
      <TouchableOpacity
        style={[styles.importButton, { backgroundColor: colors.vaultAccent }]}
        onPress={handleImportPress}
      >
        <Icon name="add" size={24} color={colors.surface} />
        <Text style={[styles.importButtonText, { color: colors.surface }]}>Import Media</Text>
      </TouchableOpacity>
    </View>
  );

  const renderFAB = () => (
    <TouchableOpacity
      style={[styles.fab, { backgroundColor: colors.vaultAccent }]}
      onPress={handleImportPress}
    >
      <Icon name="add" size={24} color={colors.surface} />
    </TouchableOpacity>
  );

  const renderVaultScreen = () => {
    const filteredItems = getFilteredItems();
    
    return (
      <View style={[styles.container, { backgroundColor: colors.vaultBackground }]}>
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
                tintColor={colors.vaultAccent}
              />
            }
          />
        )}
        
        {!isSelectionMode && !isViewerOpen && renderFAB()}
        
        <LoadingOverlay
          visible={isLoading}
          message="Loading your vault..."
          icon="folder-special"
        />
        
        <LoadingOverlay
          visible={isImporting}
          message={importProgress?.filename === 'Preparing vault access...' 
            ? "Preparing vault access..." 
            : "Importing media to vault..."}
          progress={importProgress ? {
            current: importProgress.current,
            total: importProgress.total,
            filename: importProgress.filename,
          } : undefined}
          type="progress"
          icon={importProgress?.filename === 'Preparing vault access...' ? "security" : "download"}
        />
        
        <PinReentryModal
          visible={showPinModal}
          onSuccess={handlePinModalSuccess}
          onCancel={handlePinModalCancel}
          title="Session Expired"
          message="Your session has expired for security. Please enter your PIN to continue accessing the vault."
        />
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