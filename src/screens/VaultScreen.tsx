// src/screens/VaultScreen.tsx

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
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
import FoldersScreen from './FoldersScreen';
import LoadingOverlay from '../components/LoadingOverlay';
import { useTheme } from '../contexts/ThemeContext';
import { useNotification } from '../contexts/NotificationContext';
import { useCustomAlert } from '../hooks/useCustomAlert';
import ImageOptionsModal from '../components/ImageOptionsModal';
import ImageDetailsModal from '../components/ImageDetailsModal';

interface VaultScreenProps {
  onLogout: () => void;
}

type ScreenMode = 'home' | 'folders' | 'trash' | 'settings';

const VaultScreen: React.FC<VaultScreenProps> = ({ onLogout }) => {
  const { colors, toggleTheme, theme } = useTheme();
  const { showSuccessWithConfetti, showSuccess, showError, showInfo, showWarning } = useNotification();
  const { showAlert, AlertComponent } = useCustomAlert();
  
  // Image modals state
  const [selectedImageItem, setSelectedImageItem] = useState<VaultItem | null>(null);
  const [showImageOptions, setShowImageOptions] = useState(false);
  const [showImageDetails, setShowImageDetails] = useState(false);
  
  const handleImageLongPress = useCallback((item: VaultItem) => {
    setSelectedImageItem(item);
    setShowImageOptions(true);
  }, []);
  
  const handleShowImageDetails = useCallback(() => {
    setShowImageDetails(true);
  }, []);
  
  const [currentScreen, setCurrentScreen] = useState<ScreenMode>('home');
  const [vaultItems, setVaultItems] = useState<VaultItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{current: number, total: number, filename?: string} | null>(null);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);
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
        showError(loadResult.error || 'Failed to load vault data', {
          label: 'Retry',
          onPress: () => loadVaultItems()
        });
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
      showError('Failed to load vault items', {
        label: 'Retry',
        onPress: () => loadVaultItems()
      });
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
          // If restore fails, show error but don't logout
          showError('Session expired. Please try again.', {
            label: 'Retry',
            onPress: () => handleImportPress()
          });
          return;
        }
      }
      
      // Double-check that master key is now set
      if (!cryptoService.isMasterKeySet()) {
        showError('Unable to access vault. Please try again.', {
          label: 'Retry',
          onPress: () => handleImportPress()
        });
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
          
          // Show success notification with confetti
          const itemText = result.imported === 1 ? 'item' : 'items';
          showSuccessWithConfetti(
            `${result.imported} ${itemText} moved to vault`,
            {
              label: 'View',
              onPress: () => {
                // Already on vault screen, just dismiss
              }
            }
          );
        } else {
          // No items imported (could be duplicates or user canceled)
          if (!result.errors.some(err => err.includes('cancelled') || err.includes('canceled'))) {
            showInfo('No new items to import - all selected items are already in your vault');
          }
        }
      } else {
        // Only show error if there are actual import errors (not user cancellation)
        if (result.errors.length > 0 && !result.errors.some(err => err.includes('cancelled') || err.includes('canceled'))) {
          const errorMessage = result.errors.length === 1 ? result.errors[0] : 
            `Import failed with ${result.errors.length} errors. Check your device storage and permissions.`;
          showError(errorMessage, {
            label: 'Retry',
            onPress: () => handleImportPress()
          });
        }
      }
    } catch (error) {
      logError('VaultScreen', 'Import failed', error);
      showError(
        `Import failed: ${error instanceof Error ? error.message : 'An unexpected error occurred'}`,
        {
          label: 'Retry',
          onPress: () => handleImportPress()
        }
      );
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
      // Find the item and show options modal
      const item = vaultItems.find(item => item.id === itemId);
      if (item) {
        setSelectedImageItem(item);
        setShowImageOptions(true);
      } else {
        // Fallback to selection mode
        setIsSelectionMode(true);
        setSelectedItems(new Set([itemId]));
      }
    }
  }, [isSelectionMode, vaultItems]);

  const handleSelectAll = useCallback(() => {
    const allItemIds = new Set(vaultItems.map(item => item.id));
    setSelectedItems(allItemIds);
  }, [vaultItems]);

  const handleDeselectAll = useCallback(() => {
    setSelectedItems(new Set());
    setIsSelectionMode(false);
  }, []);

  const handleMoveToTrash = useCallback(async () => {
    console.log('handleMoveToTrash called', { selectedItemsSize: selectedItems.size });
    if (selectedItems.size === 0) return;

    const itemText = selectedItems.size === 1 ? 'item' : 'items';
    
    console.log('Showing custom alert');
    showAlert({
      title: 'Move to Trash',
      message: `Are you sure you want to move ${selectedItems.size} ${itemText} to trash? You can restore them later.`,
      icon: 'delete',
      iconColor: colors.warning,
      buttons: [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Move to Trash',
          style: 'destructive',
          onPress: async () => {
            console.log('Move to Trash button pressed, starting operation');
            try {
              const itemIds = Array.from(selectedItems);
              const result = await mediaService.batchMoveToTrash(itemIds);
              
              if (result.success) {
                await loadVaultItems();
                setSelectedItems(new Set());
                setIsSelectionMode(false);
                
                const processedText = result.processed === 1 ? 'item' : 'items';
                showSuccess(
                  `${result.processed} ${processedText} moved to trash`,
                  {
                    label: 'View Trash',
                    onPress: () => {
                      setCurrentScreen('trash');
                    }
                  }
                );
              } else {
                const processedText = result.processed === 1 ? 'item' : 'items';
                showWarning(`Moved ${result.processed} ${processedText}. Some items had errors.`);
              }
            } catch (error) {
              logError('VaultScreen', 'Failed to move items to trash', error);
              showError('Failed to move items to trash', {
                label: 'Retry',
                onPress: () => handleMoveToTrash()
              });
            }
          }
        },
      ],
    });
  }, [selectedItems, mediaService, loadVaultItems, showSuccess, showWarning, showError, setCurrentScreen, showAlert, colors.warning]);

  const handleDeleteFromModal = useCallback(() => {
    if (selectedImageItem) {
      setSelectedItems(new Set([selectedImageItem.id]));
      setIsSelectionMode(true);
      handleMoveToTrash();
    }
  }, [selectedImageItem, handleMoveToTrash]);

  const getFilteredItems = useCallback(() => {
    return vaultItems;
  }, [vaultItems]);

  const handleViewerStateChange = useCallback((isOpen: boolean) => {
    setIsViewerOpen(isOpen);
  }, []);

  const renderHeader = () => {
    const stats = mediaService.getVaultStats();
    const showStats = currentScreen === 'home';
    
    return (
      <View style={[styles.header, { backgroundColor: colors.vaultBackground }]}>
        <View style={styles.headerContent}>
          {/* Logo/Brand */}
          <View style={styles.brandContainer}>
            <View style={[styles.logoContainer, { backgroundColor: colors.vaultAccent }]}>
              <Icon name="security" size={16} color={colors.surface} />
            </View>
            <Text style={[styles.brandText, { color: colors.vaultText }]}>Vault</Text>
          </View>
          
          {/* Actions */}
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: colors.vaultSurface }]}
              onPress={toggleTheme}
              activeOpacity={0.8}
            >
              <Icon 
                name={theme === 'dark' ? 'light-mode' : 'dark-mode'} 
                size={20} 
                color={colors.vaultAccent} 
              />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: colors.vaultSurface }]}
              onPress={onLogout}
              activeOpacity={0.8}
            >
              <Icon name="logout" size={20} color={colors.danger} />
            </TouchableOpacity>
          </View>
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
              <TouchableOpacity onPress={() => {
                console.log('Delete button clicked, selected items:', selectedItems.size);
                handleMoveToTrash();
              }} style={[styles.deleteButton, { backgroundColor: colors.danger }]}>
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

  const renderFAB = () => {
    // Only show FAB on home screen
    if (currentScreen !== 'home') return null;
    
    return (
      <TouchableOpacity
        style={[styles.fab, { backgroundColor: colors.vaultAccent }]}
        onPress={handleImportPress}
      >
        <Icon name="add" size={24} color={colors.surface} />
      </TouchableOpacity>
    );
  };

  const renderBottomNav = () => {
    const tabs = [
      { key: 'home', label: 'Home', icon: 'home', activeIcon: 'home' },
      { key: 'folders', label: 'Folders', icon: 'folder', activeIcon: 'folder' },
      { key: 'trash', label: 'Trash', icon: 'delete', activeIcon: 'delete' },
      { key: 'settings', label: 'Vault', icon: 'settings', activeIcon: 'settings' },
    ];

    return (
      <View style={[styles.bottomNav, { backgroundColor: colors.vaultSurface }]}>
        <View style={[styles.navContainer]}>
          {tabs.map((tab) => {
            const isActive = currentScreen === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                style={[
                  styles.navTab, 
                  isActive && { 
                    backgroundColor: colors.vaultAccent,
                    shadowColor: colors.vaultAccent,
                    shadowOffset: { width: 0, height: 1 },
                    shadowOpacity: 0.3,
                    shadowRadius: 4,
                    elevation: 3,
                  }
                ]}
                onPress={() => setCurrentScreen(tab.key as ScreenMode)}
                activeOpacity={0.7}
              >
                <View style={[styles.navIconContainer, isActive && styles.activeNavIcon, { opacity: isActive ? 1 : 0.6 }]}>
                  <Icon 
                    name={tab.icon} 
                    size={22} 
                    color={isActive ? colors.surface : colors.textSecondary} 
                  />
                </View>
                {isActive && (
                  <Text style={[styles.navTabLabel, { color: colors.surface }]}>
                    {tab.label}
                  </Text>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    );
  };

  const renderHomeScreen = () => {
    const filteredItems = getFilteredItems();
    
    return (
      <View style={styles.screenContent}>
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
      </View>
    );
  };

  const renderCurrentScreen = () => {
    switch (currentScreen) {
      case 'home':
        return renderHomeScreen();
      case 'folders':
        return <FoldersScreen />;
      case 'trash':
        return (
          <View style={styles.screenContent}>
            <TrashScreen
              onBack={() => setCurrentScreen('home')}
              onItemRestored={loadVaultItems}
            />
          </View>
        );
      case 'settings':
        return (
          <View style={styles.screenContent}>
            <SettingsScreen
              onBack={() => setCurrentScreen('home')}
              onLogout={onLogout}
            />
          </View>
        );
      default:
        return renderHomeScreen();
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.vaultBackground }]}>
      {!isViewerOpen && renderHeader()}
      
      {renderCurrentScreen()}
      
      {!isSelectionMode && !isViewerOpen && renderFAB()}
      
      {!isViewerOpen && renderBottomNav()}
      
      {/* Custom Alert Dialog */}
      {AlertComponent}
      
      {/* Image Options Modal */}
      <ImageOptionsModal
        visible={showImageOptions}
        item={selectedImageItem}
        onClose={() => {
          setShowImageOptions(false);
          setSelectedImageItem(null);
        }}
        onShowDetails={handleShowImageDetails}
        onDelete={handleDeleteFromModal}
      />
      
      {/* Image Details Modal */}
      <ImageDetailsModal
        visible={showImageDetails}
        item={selectedImageItem}
        onClose={() => {
          setShowImageDetails(false);
          setSelectedImageItem(null);
        }}
      />
    </View>
  );
};


const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.vaultBackground,
  },
  header: {
    paddingTop: StatusBar.currentHeight || 0,
    paddingBottom: 12,
    paddingHorizontal: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 16,
  },
  brandContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  brandText: {
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statsContainer: {
    paddingTop: 16,
    alignItems: 'flex-start',
  },
  statsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  statsText: {
    fontSize: 12,
    fontWeight: '600',
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
    bottom: 100, // Moved up to account for bottom nav
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
  screenContent: {
    flex: 1,
  },
  bottomNav: {
    paddingBottom: 20,
    paddingTop: 8,
    paddingHorizontal: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 8,
  },
  navContainer: {
    flexDirection: 'row',
    borderRadius: 24,
    padding: 3,
    justifyContent: 'space-around',
  },
  navTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    minHeight: 44,
  },
  navIconContainer: {
    marginRight: 0,
  },
  activeNavIcon: {
    marginRight: 8,
  },
  navTabLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
});

export default VaultScreen;