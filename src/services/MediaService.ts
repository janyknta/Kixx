// src/services/MediaService.ts

import AsyncStorage from '@react-native-async-storage/async-storage';
import { CameraRoll } from '@react-native-camera-roll/camera-roll';
import { launchImageLibrary, MediaType as PickerMediaType } from 'react-native-image-picker';
import RNFS from 'react-native-fs';
import { v4 as uuidv4 } from 'uuid';

import { STORAGE_KEYS, VAULT_CONFIG, ERROR_MESSAGES } from '../utils/constants';
import { VaultItem, VaultMetadata, VaultSettings, MediaItem, ImportProgress, MediaType } from '../types';
import { CryptoService } from './CryptoService';
import { FileService } from './FileService';

export class MediaService {
  private static instance: MediaService;
  private vaultMetadata: VaultMetadata;
  private fileService: FileService;
  private cryptoService: CryptoService;

  private constructor() {
    this.fileService = FileService.getInstance();
    this.cryptoService = CryptoService.getInstance();
    this.vaultMetadata = this.getDefaultMetadata();
  }

  public static getInstance(): MediaService {
    if (!MediaService.instance) {
      MediaService.instance = new MediaService();
    }
    return MediaService.instance;
  }

  /**
   * Initialize media service
   */
  public async initialize(): Promise<void> {
    try {
      // Initialize vault directories
      await this.fileService.initializeVault();

      // Load existing metadata
      await this.loadMetadata();
    } catch (error) {
      console.error('Failed to initialize media service:', error);
    }
  }

  /**
   * Get default metadata structure
   */
  private getDefaultMetadata(): VaultMetadata {
    return {
      version: '1.0.0',
      items: [],
      deletedItems: [],
      lastModified: Date.now(),
      settings: {
        autoLockTimeout: VAULT_CONFIG.DEFAULT_AUTO_LOCK_TIMEOUT,
        biometricEnabled: false,
        trashRetentionDays: VAULT_CONFIG.DEFAULT_TRASH_RETENTION_DAYS,
        showThumbnails: true,
        gridSize: VAULT_CONFIG.DEFAULT_GRID_SIZE,
      },
    };
  }

  /**
   * Load metadata from encrypted storage
   */
  public async loadMetadata(): Promise<{ success: boolean; error?: string }> {
    try {
      const metadataPath = `${FileService.getMetadataDirectory()}/${VAULT_CONFIG.METADATA_FILE}`;
      const exists = await this.fileService.fileExists(metadataPath);

      if (!exists) {
        // First time setup - save default metadata
        await this.saveMetadata();
        return { success: true };
      }

      // Read encrypted metadata
      const encryptedMetadata = await RNFS.readFile(metadataPath, 'utf8');
      if (!encryptedMetadata) {
        return {
          success: false,
          error: 'Failed to read metadata file',
        };
      }

      // Decrypt metadata
      const decryptResult = this.cryptoService.decryptMetadata<VaultMetadata>(encryptedMetadata);
      if (!decryptResult.success || !decryptResult.data) {
        return {
          success: false,
          error: decryptResult.error || 'Failed to decrypt metadata',
        };
      }

      this.vaultMetadata = decryptResult.data;
      return { success: true };
    } catch (error) {
      console.error('Failed to load metadata:', error);
      return {
        success: false,
        error: 'Failed to load vault metadata',
      };
    }
  }

  /**
   * Save metadata to encrypted storage
   */
  public async saveMetadata(): Promise<{ success: boolean; error?: string }> {
    try {
      this.vaultMetadata.lastModified = Date.now();

      // Encrypt metadata
      const encryptResult = this.cryptoService.encryptMetadata(this.vaultMetadata);
      if (!encryptResult.success) {
        return {
          success: false,
          error: encryptResult.error,
        };
      }

      // Save encrypted metadata
      const metadataPath = `${FileService.getMetadataDirectory()}/${VAULT_CONFIG.METADATA_FILE}`;
      await RNFS.writeFile(metadataPath, encryptResult.encryptedData, 'utf8');

      return { success: true };
    } catch (error) {
      console.error('Failed to save metadata:', error);
      return {
        success: false,
        error: 'Failed to save vault metadata',
      };
    }
  }

  /**
   * Import media from device gallery
   */
  public async importFromGallery(
    progressCallback?: (progress: ImportProgress) => void
  ): Promise<{ success: boolean; imported: number; errors: string[] }> {
    const errors: string[] = [];
    let importedCount = 0;

    try {
      // Launch image picker for multiple selection
      const result = await new Promise<MediaItem[]>((resolve, reject) => {
        launchImageLibrary(
          {
            mediaType: 'mixed' as PickerMediaType,
            selectionLimit: 0, // 0 means unlimited
            quality: 1,
            includeBase64: false,
          },
          (response) => {
            if (response.didCancel || response.errorMessage) {
              reject(new Error(response.errorMessage || 'User cancelled'));
              return;
            }

            if (!response.assets || response.assets.length === 0) {
              resolve([]);
              return;
            }

            const mediaItems: MediaItem[] = response.assets.map((asset) => ({
              uri: asset.uri || '',
              filename: asset.fileName,
              type: asset.type || '',
              fileSize: asset.fileSize,
              width: asset.width,
              height: asset.height,
              duration: asset.duration,
            }));

            resolve(mediaItems);
          }
        );
      });

      if (result.length === 0) {
        return { success: true, imported: 0, errors: [] };
      }

      // Process each selected media item
      for (let i = 0; i < result.length; i++) {
        const mediaItem = result[i];

        progressCallback?.({
          current: i + 1,
          total: result.length,
          currentFileName: mediaItem.filename || 'Unknown file',
          status: 'encrypting',
        });

        try {
          const importResult = await this.importSingleMedia(mediaItem);
          if (importResult.success) {
            importedCount++;
          } else {
            errors.push(`${mediaItem.filename}: ${importResult.error}`);
          }
        } catch (error) {
          errors.push(`${mediaItem.filename}: ${error}`);
        }
      }

      // Save updated metadata
      await this.saveMetadata();

      progressCallback?.({
        current: result.length,
        total: result.length,
        currentFileName: '',
        status: 'completed',
      });

      return {
        success: true,
        imported: importedCount,
        errors,
      };
    } catch (error) {
      console.error('Import from gallery failed:', error);
      return {
        success: false,
        imported: importedCount,
        errors: [ERROR_MESSAGES.IMPORT_FAILED],
      };
    }
  }

  /**
   * Import a single media item to vault
   */
  private async importSingleMedia(mediaItem: MediaItem): Promise<{ success: boolean; error?: string }> {
    try {
      if (!mediaItem.uri) {
        return {
          success: false,
          error: 'Invalid media URI',
        };
      }

      // Check file size
      if (mediaItem.fileSize && mediaItem.fileSize > VAULT_CONFIG.MAX_FILE_SIZE) {
        return {
          success: false,
          error: 'File too large',
        };
      }

      // Check available storage
      const hasSpace = await this.fileService.hasEnoughSpace(mediaItem.fileSize || 0);
      if (!hasSpace) {
        return {
          success: false,
          error: ERROR_MESSAGES.INSUFFICIENT_STORAGE,
        };
      }

      // Determine media type
      const mediaType: MediaType = mediaItem.type?.startsWith('video/') ? 'video' : 'image';
      
      // Generate vault item
      const vaultItem: VaultItem = {
        id: uuidv4(),
        originalName: mediaItem.filename || `media_${Date.now()}`,
        encryptedPath: '',
        thumbnailPath: '',
        type: mediaType,
        size: mediaItem.fileSize || 0,
        dateAdded: Date.now(),
        isDeleted: false,
        originalPath: mediaItem.uri,
      };

      // Move and encrypt media file
      const moveResult = await this.fileService.moveToVault(
        mediaItem.uri,
        vaultItem.originalName,
        this.cryptoService
      );

      if (!moveResult.success) {
        return {
          success: false,
          error: moveResult.error,
        };
      }

      vaultItem.encryptedPath = moveResult.path!;

      // Generate thumbnail
      const thumbnailResult = await this.generateThumbnail(vaultItem);
      if (thumbnailResult.success) {
        vaultItem.thumbnailPath = thumbnailResult.path!;
      }

      // Add to metadata
      this.vaultMetadata.items.push(vaultItem);

      // Try to delete original file from gallery/storage
      try {
        await this.fileService.deleteFile(mediaItem.uri);
      } catch (error) {
        console.warn('Could not delete original file:', error);
        // Non-critical error - continue with import
      }

      return { success: true };
    } catch (error) {
      console.error('Failed to import single media:', error);
      return {
        success: false,
        error: 'Import failed',
      };
    }
  }

  /**
   * Generate encrypted thumbnail for media
   */
  private async generateThumbnail(vaultItem: VaultItem): Promise<{ success: boolean; path?: string; error?: string }> {
    try {
      // For now, we'll skip thumbnail generation and implement it later
      // This would involve decrypting the media, creating a thumbnail, and re-encrypting it
      
      const thumbnailFileName = `${vaultItem.id}${VAULT_CONFIG.THUMBNAIL_SUFFIX}${VAULT_CONFIG.ENCRYPTED_EXTENSION}`;
      const thumbnailPath = `${FileService.getThumbnailsDirectory()}/${thumbnailFileName}`;

      // TODO: Implement actual thumbnail generation
      // For now, return empty success
      return {
        success: false,
        error: 'Thumbnail generation not implemented yet',
      };
    } catch (error) {
      console.error('Thumbnail generation failed:', error);
      return {
        success: false,
        error: 'Thumbnail generation failed',
      };
    }
  }

  /**
   * Get all vault items (non-deleted)
   */
  public getVaultItems(): VaultItem[] {
    return this.vaultMetadata.items.filter(item => !item.isDeleted);
  }

  /**
   * Get deleted items (trash)
   */
  public getDeletedItems(): VaultItem[] {
    return this.vaultMetadata.items.filter(item => item.isDeleted);
  }

  /**
   * Get vault item by ID
   */
  public getVaultItem(id: string): VaultItem | undefined {
    return this.vaultMetadata.items.find(item => item.id === id);
  }

  /**
   * Decrypt and get temporary path for viewing media
   */
  public async getMediaForViewing(vaultItem: VaultItem): Promise<{ success: boolean; path?: string; error?: string }> {
    try {
      // Generate temporary file name
      const extension = FileService.getFileExtension(vaultItem.originalName);
      const tempFileName = `view_${vaultItem.id}_${Date.now()}${extension}`;
      const tempPath = this.fileService.getTempFilePath(tempFileName);

      // Decrypt and save to temp path
      const restoreResult = await this.fileService.restoreFromVault(
        vaultItem.encryptedPath,
        tempPath,
        this.cryptoService
      );

      if (!restoreResult.success) {
        return {
          success: false,
          error: restoreResult.error,
        };
      }

      return {
        success: true,
        path: tempPath,
      };
    } catch (error) {
      console.error('Failed to decrypt media for viewing:', error);
      return {
        success: false,
        error: 'Failed to decrypt media',
      };
    }
  }

  /**
   * Move item to trash (soft delete)
   */
  public async moveToTrash(itemId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const item = this.getVaultItem(itemId);
      if (!item) {
        return {
          success: false,
          error: 'Item not found',
        };
      }

      // Mark as deleted
      item.isDeleted = true;
      item.deletedDate = Date.now();

      // Save metadata
      const saveResult = await this.saveMetadata();
      return saveResult;
    } catch (error) {
      console.error('Failed to move item to trash:', error);
      return {
        success: false,
        error: 'Failed to move item to trash',
      };
    }
  }

  /**
   * Restore item from trash
   */
  public async restoreFromTrash(itemId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const item = this.getVaultItem(itemId);
      if (!item) {
        return {
          success: false,
          error: 'Item not found',
        };
      }

      // Restore from trash
      item.isDeleted = false;
      item.deletedDate = undefined;

      // Save metadata
      const saveResult = await this.saveMetadata();
      return saveResult;
    } catch (error) {
      console.error('Failed to restore item from trash:', error);
      return {
        success: false,
        error: 'Failed to restore item from trash',
      };
    }
  }

  /**
   * Permanently delete item
   */
  public async permanentlyDeleteItem(itemId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const itemIndex = this.vaultMetadata.items.findIndex(item => item.id === itemId);
      if (itemIndex === -1) {
        return {
          success: false,
          error: 'Item not found',
        };
      }

      const item = this.vaultMetadata.items[itemIndex];

      // Delete encrypted file
      if (item.encryptedPath) {
        await this.fileService.deleteFile(item.encryptedPath);
      }

      // Delete thumbnail if exists
      if (item.thumbnailPath) {
        await this.fileService.deleteFile(item.thumbnailPath);
      }

      // Remove from metadata
      this.vaultMetadata.items.splice(itemIndex, 1);

      // Save metadata
      const saveResult = await this.saveMetadata();
      return saveResult;
    } catch (error) {
      console.error('Failed to permanently delete item:', error);
      return {
        success: false,
        error: 'Failed to permanently delete item',
      };
    }
  }

  /**
   * Restore media back to device gallery
   */
  public async restoreToGallery(itemId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const item = this.getVaultItem(itemId);
      if (!item) {
        return {
          success: false,
          error: 'Item not found',
        };
      }

      // Create destination path in device storage
      const extension = FileService.getFileExtension(item.originalName);
      const restoreFileName = `restored_${Date.now()}${extension}`;
      const destPath = `${RNFS.PicturesDirectoryPath}/${restoreFileName}`;

      // Decrypt and restore file
      const restoreResult = await this.fileService.restoreFromVault(
        item.encryptedPath,
        destPath,
        this.cryptoService
      );

      if (!restoreResult.success) {
        return restoreResult;
      }

      // Save to camera roll
      try {
        await CameraRoll.save(destPath, { type: item.type === 'video' ? 'video' : 'photo' });
      } catch (error) {
        console.error('Failed to save to camera roll:', error);
        // File is still restored to device storage even if camera roll fails
      }

      return { success: true };
    } catch (error) {
      console.error('Failed to restore to gallery:', error);
      return {
        success: false,
        error: 'Failed to restore to gallery',
      };
    }
  }

  /**
   * Clean up old trash items based on retention policy
   */
  public async cleanupTrash(): Promise<void> {
    try {
      const retentionPeriod = this.vaultMetadata.settings.trashRetentionDays * 24 * 60 * 60 * 1000;
      const cutoffTime = Date.now() - retentionPeriod;

      const itemsToDelete = this.vaultMetadata.items.filter(
        item => item.isDeleted && item.deletedDate && item.deletedDate < cutoffTime
      );

      for (const item of itemsToDelete) {
        await this.permanentlyDeleteItem(item.id);
      }

      console.log(`Cleaned up ${itemsToDelete.length} old trash items`);
    } catch (error) {
      console.error('Failed to cleanup trash:', error);
    }
  }

  /**
   * Get vault statistics
   */
  public getVaultStats(): {
    totalItems: number;
    activeItems: number;
    deletedItems: number;
    totalSize: number;
    imageCount: number;
    videoCount: number;
  } {
    const activeItems = this.getVaultItems();
    const deletedItems = this.getDeletedItems();

    return {
      totalItems: this.vaultMetadata.items.length,
      activeItems: activeItems.length,
      deletedItems: deletedItems.length,
      totalSize: this.vaultMetadata.items.reduce((total, item) => total + item.size, 0),
      imageCount: activeItems.filter(item => item.type === 'image').length,
      videoCount: activeItems.filter(item => item.type === 'video').length,
    };
  }

  /**
   * Search vault items
   */
  public searchItems(query: string): VaultItem[] {
    const searchQuery = query.toLowerCase();
    const activeItems = this.getVaultItems();

    return activeItems.filter(item =>
      item.originalName.toLowerCase().includes(searchQuery)
    );
  }

  /**
   * Update vault settings
   */
  public async updateSettings(settings: Partial<VaultSettings>): Promise<{ success: boolean; error?: string }> {
    try {
      this.vaultMetadata.settings = {
        ...this.vaultMetadata.settings,
        ...settings,
      };

      return await this.saveMetadata();
    } catch (error) {
      console.error('Failed to update settings:', error);
      return {
        success: false,
        error: 'Failed to update settings',
      };
    }
  }

  /**
   * Get current vault settings
   */
  public getSettings(): VaultSettings {
    return { ...this.vaultMetadata.settings };
  }

  /**
   * Export vault data (for backup)
   */
  public async exportVaultData(): Promise<{ success: boolean; data?: string; error?: string }> {
    try {
      // Create export data structure
      const exportData = {
        metadata: this.vaultMetadata,
        exportDate: Date.now(),
        version: '1.0.0',
      };

      // Encrypt export data
      const encryptResult = this.cryptoService.encryptMetadata(exportData);
      if (!encryptResult.success) {
        return {
          success: false,
          error: encryptResult.error,
        };
      }

      return {
        success: true,
        data: encryptResult.encryptedData,
      };
    } catch (error) {
      console.error('Failed to export vault data:', error);
      return {
        success: false,
        error: 'Failed to export vault data',
      };
    }
  }

  /**
   * Import vault data (from backup)
   */
  public async importVaultData(encryptedData: string): Promise<{ success: boolean; error?: string }> {
    try {
      // Decrypt import data
      const decryptResult = this.cryptoService.decryptMetadata<{
        metadata: VaultMetadata;
        exportDate: number;
        version: string;
      }>(encryptedData);

      if (!decryptResult.success || !decryptResult.data) {
        return {
          success: false,
          error: decryptResult.error || 'Failed to decrypt import data',
        };
      }

      // Validate import data
      const importData = decryptResult.data;
      if (!importData.metadata || !importData.metadata.items) {
        return {
          success: false,
          error: 'Invalid import data format',
        };
      }

      // Backup current metadata
      const backupMetadata = { ...this.vaultMetadata };

      try {
        // Import metadata
        this.vaultMetadata = importData.metadata;
        this.vaultMetadata.lastModified = Date.now();

        // Save imported metadata
        const saveResult = await this.saveMetadata();
        if (!saveResult.success) {
          // Restore backup on failure
          this.vaultMetadata = backupMetadata;
          return saveResult;
        }

        return { success: true };
      } catch (error) {
        // Restore backup on failure
        this.vaultMetadata = backupMetadata;
        throw error;
      }
    } catch (error) {
      console.error('Failed to import vault data:', error);
      return {
        success: false,
        error: 'Failed to import vault data',
      };
    }
  }

  /**
   * Batch operations for multiple items
   */
  public async batchMoveToTrash(itemIds: string[]): Promise<{ success: boolean; processed: number; errors: string[] }> {
    const errors: string[] = [];
    let processed = 0;

    for (const itemId of itemIds) {
      const result = await this.moveToTrash(itemId);
      if (result.success) {
        processed++;
      } else {
        errors.push(`${itemId}: ${result.error}`);
      }
    }

    return {
      success: errors.length === 0,
      processed,
      errors,
    };
  }

  public async batchRestoreFromTrash(itemIds: string[]): Promise<{ success: boolean; processed: number; errors: string[] }> {
    const errors: string[] = [];
    let processed = 0;

    for (const itemId of itemIds) {
      const result = await this.restoreFromTrash(itemId);
      if (result.success) {
        processed++;
      } else {
        errors.push(`${itemId}: ${result.error}`);
      }
    }

    return {
      success: errors.length === 0,
      processed,
      errors,
    };
  }

  public async batchPermanentDelete(itemIds: string[]): Promise<{ success: boolean; processed: number; errors: string[] }> {
    const errors: string[] = [];
    let processed = 0;

    for (const itemId of itemIds) {
      const result = await this.permanentlyDeleteItem(itemId);
      if (result.success) {
        processed++;
      } else {
        errors.push(`${itemId}: ${result.error}`);
      }
    }

    return {
      success: errors.length === 0,
      processed,
      errors,
    };
  }

  /**
   * Get vault metadata (for debugging/admin purposes)
   */
  public getMetadata(): VaultMetadata {
    return { ...this.vaultMetadata };
  }
}