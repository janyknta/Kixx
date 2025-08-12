// src/services/MediaService.ts

import AsyncStorage from '@react-native-async-storage/async-storage';
import { CameraRoll } from '@react-native-camera-roll/camera-roll';
import ImagePicker from 'react-native-image-crop-picker';
import RNFS from 'react-native-fs';
import ImageResizer from '@bam.tech/react-native-image-resizer';
import { v4 as uuidv4 } from 'uuid';

import { STORAGE_KEYS, VAULT_CONFIG, ERROR_MESSAGES } from '../utils/constants';
import { VaultItem, VaultMetadata, VaultSettings, MediaItem, ImportProgress, MediaType } from '../types';
import { CryptoService } from './CryptoService';
import { FileService } from './FileService';
import { VideoStreamService } from './VideoStreamService';
import { logDebug, logInfo, logWarn, logError } from './Logger';

export class MediaService {
  private static instance: MediaService;
  private vaultMetadata: VaultMetadata;
  private fileService: FileService;
  private cryptoService: CryptoService;
  private videoStreamService: VideoStreamService;

  private constructor() {
    this.fileService = FileService.getInstance();
    this.cryptoService = CryptoService.getInstance();
    this.videoStreamService = VideoStreamService.getInstance();
    this.vaultMetadata = this.getDefaultMetadata();
    logDebug('MediaService', 'Constructor initialized with CryptoService and VideoStreamService instances');
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

      // Clean up any leftover streaming temp files
      await this.videoStreamService.cleanupStreamingFiles();
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
      console.log('LoadMetadata - Checking path:', metadataPath);
      const exists = await this.fileService.fileExists(metadataPath);
      console.log('LoadMetadata - Metadata file exists:', exists);

      if (!exists) {
        // First time setup - save default metadata
        console.log('LoadMetadata - First time setup, creating default metadata');
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
      console.log('LoadMetadata - Decrypting metadata, crypto master key set:', this.cryptoService.isMasterKeySet());
      const decryptResult = this.cryptoService.decryptMetadata<VaultMetadata>(encryptedMetadata);
      console.log('LoadMetadata - Decrypt result:', decryptResult.success, decryptResult.error);
      
      if (!decryptResult.success || !decryptResult.data) {
        return {
          success: false,
          error: decryptResult.error || 'Failed to decrypt metadata',
        };
      }

      this.vaultMetadata = decryptResult.data;
      console.log('LoadMetadata - Loaded metadata with', this.vaultMetadata.items.length, 'items');
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
   * Check if a media item already exists in vault based on filename and size
   */
  private isDuplicate(mediaItem: MediaItem): boolean {
    if (!mediaItem.filename || !mediaItem.fileSize) {
      return false; // Can't determine if duplicate without filename and size
    }

    return this.vaultMetadata.items.some(existingItem => 
      existingItem.originalName === mediaItem.filename &&
      existingItem.size === mediaItem.fileSize &&
      !existingItem.isDeleted
    );
  }

  /**
   * Filter out duplicate media items
   */
  private filterDuplicates(mediaItems: MediaItem[]): { unique: MediaItem[]; duplicates: MediaItem[] } {
    const unique: MediaItem[] = [];
    const duplicates: MediaItem[] = [];

    for (const mediaItem of mediaItems) {
      if (this.isDuplicate(mediaItem)) {
        duplicates.push(mediaItem);
      } else {
        unique.push(mediaItem);
      }
    }

    return { unique, duplicates };
  }

  /**
   * Import specific media items to vault
   */
  public async importMediaItems(
    mediaItems: MediaItem[],
    progressCallback?: (progress: ImportProgress) => void
  ): Promise<{ success: boolean; imported: number; errors: string[]; duplicatesSkipped: number }> {
    const errors: string[] = [];
    let importedCount = 0;

    try {
      if (mediaItems.length === 0) {
        return { success: true, imported: 0, errors: [], duplicatesSkipped: 0 };
      }

      // Check if user is authenticated and crypto service is ready
      if (!this.cryptoService.isMasterKeySet()) {
        return {
          success: false,
          imported: 0,
          errors: ['Authentication required'],
          duplicatesSkipped: 0,
        };
      }

      // Filter out duplicates to save space
      const { unique, duplicates } = this.filterDuplicates(mediaItems);
      
      if (duplicates.length > 0) {
        console.log(`Skipping ${duplicates.length} duplicate items to save space`);
      }

      if (unique.length === 0) {
        return {
          success: true,
          imported: 0,
          errors: duplicates.length > 0 ? [`Skipped ${duplicates.length} duplicate items`] : [],
          duplicatesSkipped: duplicates.length,
        };
      }

      // Process each unique media item
      for (let i = 0; i < unique.length; i++) {
        const mediaItem = unique[i];

        progressCallback?.({
          current: i + 1,
          total: unique.length,
          currentFileName: mediaItem.filename || 'Unknown file',
          status: 'encrypting',
        });

        try {
          console.log(`Importing: ${mediaItem.filename || 'Unknown'} from ${mediaItem.uri}`);
          const importResult = await this.importSingleMedia(
            mediaItem, 
            progressCallback, 
            i + 1, 
            unique.length
          );
          if (importResult.success) {
            importedCount++;
            console.log(`Successfully imported: ${mediaItem.filename || 'Unknown'}`);
          } else {
            const errorMsg = `${mediaItem.filename || 'Unknown file'}: ${importResult.error}`;
            console.error('Import failed:', errorMsg);
            errors.push(errorMsg);
          }
        } catch (error) {
          const errorMsg = `${mediaItem.filename || 'Unknown file'}: ${error}`;
          console.error('Import exception:', errorMsg);
          errors.push(errorMsg);
        }
      }

      // Save updated metadata
      await this.saveMetadata();

      progressCallback?.({
        current: unique.length,
        total: unique.length,
        currentFileName: '',
        status: 'completed',
      });

      // Add info about duplicates skipped
      if (duplicates.length > 0) {
        errors.push(`Skipped ${duplicates.length} duplicate items to save space`);
      }

      return {
        success: true,
        imported: importedCount,
        errors,
        duplicatesSkipped: duplicates.length,
      };
    } catch (error) {
      console.error('Import media items failed:', error);
      return {
        success: false,
        imported: importedCount,
        errors: [ERROR_MESSAGES.IMPORT_FAILED],
        duplicatesSkipped: 0,
      };
    }
  }

  /**
   * Import media from device gallery using image picker
   */
  public async importFromGallery(
    progressCallback?: (progress: ImportProgress) => void
  ): Promise<{ success: boolean; imported: number; errors: string[] }> {
    const errors: string[] = [];
    let importedCount = 0;

    try {
      console.log('ImportFromGallery - Starting import...');
      console.log('ImportFromGallery - CryptoService instance:', this.cryptoService);
      console.log('ImportFromGallery - CryptoService master key set:', this.cryptoService.isMasterKeySet());
      
      // Check if master key is set before starting
      if (!this.cryptoService.isMasterKeySet()) {
        console.log('ImportFromGallery - Master key not set, returning error');
        return {
          success: false,
          imported: 0,
          errors: ['Authentication required'],
        };
      }
      
      // Store reference to ensure we're using the same instance
      const cryptoService = this.cryptoService;
      console.log('ImportFromGallery - Stored cryptoService reference:', cryptoService);
      console.log('ImportFromGallery - Stored cryptoService master key set:', cryptoService.isMasterKeySet());
      
      // Launch image picker for multiple selection
      const result = await new Promise<MediaItem[]>((resolve, reject) => {
        ImagePicker.openPicker({
          multiple: true,
          mediaType: 'any',
          compressImageQuality: 0.8,
          maxFiles: 50,
          cropping: false, // Disabled to avoid Android video issues
        }).then((response: any) => {
          if (!response || response.length === 0) {
            resolve([]);
            return;
          }

          const mediaItems: MediaItem[] = response.map((asset: any) => ({
            uri: asset.path || asset.uri || '',
            filename: asset.filename || `media_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
            type: asset.mime || '',
            fileSize: asset.size,
            width: asset.width,
            height: asset.height,
            duration: asset.duration,
          }));

          resolve(mediaItems);
        }).catch((error: any) => {
          if (error.code === 'E_PICKER_CANCELLED') {
            // User cancelled - return empty array, don't treat as error
            logInfo('MediaService', 'User cancelled image selection');
            resolve([]);
            return;
          }
          reject(new Error(error.message || 'Image picker failed'));
        });
      });

      if (result.length === 0) {
        return { success: true, imported: 0, errors: [] };
      }

      console.log('ImportFromGallery - Processing', result.length, 'selected items');
      
      // Filter out duplicates to save space
      const { unique, duplicates } = this.filterDuplicates(result);
      
      if (duplicates.length > 0) {
        console.log(`ImportFromGallery - Skipping ${duplicates.length} duplicate items to save space`);
        errors.push(`Skipped ${duplicates.length} duplicate items to save space`);
      }

      if (unique.length === 0) {
        return {
          success: true,
          imported: 0,
          errors: duplicates.length > 0 ? [`All ${result.length} items were duplicates`] : [],
        };
      }
      
      // Check if master key was cleared during image picker operation
      if (!this.cryptoService.isMasterKeySet()) {
        console.log('ImportFromGallery - Master key was cleared during image picker, attempting to restore...');
        
        // Get AuthService and restore master key
        const { AuthService } = require('./AuthService');
        const authService = AuthService.getInstance();
        
        const restoreResult = await authService.restoreMasterKey();
        console.log('ImportFromGallery - Master key restore result:', restoreResult);
        
        if (!restoreResult.success) {
          return {
            success: false,
            imported: 0,
          errors: ['Authentication required'],
          };
        }
        
        console.log('ImportFromGallery - Master key restored, continuing with import...');
      }
      
      // Process each unique media item
      for (let i = 0; i < unique.length; i++) {
        const mediaItem = unique[i];

        progressCallback?.({
          current: i + 1,
          total: unique.length,
          currentFileName: mediaItem.filename || 'Unknown file',
          status: 'encrypting',
        });

        try {
          console.log(`ImportFromGallery - Processing item ${i + 1}/${unique.length}: ${mediaItem.filename}`);
          
          const importResult = await this.importSingleMedia(
            mediaItem, 
            progressCallback, 
            i + 1, 
            unique.length
          );
          console.log(`ImportFromGallery - Import result for ${mediaItem.filename}:`, importResult);
          
          if (importResult.success) {
            importedCount++;
          } else {
            errors.push(`${mediaItem.filename}: ${importResult.error}`);
          }
        } catch (error) {
          console.error(`ImportFromGallery - Exception for ${mediaItem.filename}:`, error);
          errors.push(`${mediaItem.filename}: ${error}`);
        }
      }

      // Save updated metadata
      console.log('ImportFromGallery - Saving metadata with', this.vaultMetadata.items.length, 'items');
      const saveResult = await this.saveMetadata();
      console.log('ImportFromGallery - Metadata save result:', saveResult);

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
   * Import a single media item to vault with progress support
   */
  private async importSingleMedia(
    mediaItem: MediaItem, 
    progressCallback?: (progress: ImportProgress) => void,
    itemIndex?: number,
    totalItems?: number
  ): Promise<{ success: boolean; error?: string }> {
    try {
      console.log('ImportSingleMedia - Starting for:', mediaItem.filename || 'Unknown');
      console.log('ImportSingleMedia - CryptoService master key set:', this.cryptoService.isMasterKeySet());
      
      if (!mediaItem.uri) {
        return {
          success: false,
          error: 'Invalid media URI',
        };
      }

      // Determine media type
      const mediaType: MediaType = mediaItem.type?.startsWith('video/') ? 'video' : 'image';
      const fileSize = mediaItem.fileSize || 0;
      
      // Check file size limits based on media type
      const maxSize = mediaType === 'video' ? VAULT_CONFIG.MAX_VIDEO_SIZE : VAULT_CONFIG.MAX_FILE_SIZE;
      if (fileSize > maxSize) {
        return {
          success: false,
          error: `${mediaType === 'video' ? 'Video' : 'File'} too large. Maximum size is ${maxSize / (1024*1024)}MB`,
        };
      }

      // Check available storage
      const hasSpace = await this.fileService.hasEnoughSpace(fileSize);
      if (!hasSpace) {
        return {
          success: false,
          error: ERROR_MESSAGES.INSUFFICIENT_STORAGE,
        };
      }
      
      // Generate vault item
      const vaultItem: VaultItem = {
        id: uuidv4(),
        originalName: mediaItem.filename || `media_${Date.now()}`,
        encryptedPath: '',
        thumbnailPath: '',
        type: mediaType,
        size: fileSize,
        dateAdded: Date.now(),
        isDeleted: false,
        originalPath: mediaItem.uri,
      };

      console.log(`ImportSingleMedia - Processing ${mediaType}: ${vaultItem.originalName} (${fileSize} bytes)`);
      console.log(`ImportSingleMedia - Will use streaming: ${VideoStreamService.shouldUseStreaming(fileSize, mediaType)}`);

      // Check if we should use streaming for this file
      const useStreaming = VideoStreamService.shouldUseStreaming(fileSize, mediaType);
      let moveResult: { success: boolean; path?: string; error?: string };

      if (useStreaming && mediaType === 'video') {
        console.log('ImportSingleMedia - Using streaming upload for large video');
        
        // Use streaming upload with progress tracking
        moveResult = await this.videoStreamService.streamUploadVideo(
          mediaItem.uri,
          vaultItem.originalName,
          this.cryptoService,
          (streamProgress) => {
            // Convert stream progress to import progress
            progressCallback?.({
              current: itemIndex || 1,
              total: totalItems || 1,
              currentFileName: vaultItem.originalName,
              status: 'streaming',
              bytesTransferred: streamProgress.bytesProcessed,
              totalBytes: streamProgress.totalBytes,
              streamProgress: streamProgress.progress,
              currentChunk: streamProgress.currentChunk,
              totalChunks: streamProgress.totalChunks,
              phase: streamProgress.phase,
            });
          }
        );
      } else {
        console.log('ImportSingleMedia - Using standard upload');
        
        // Report processing status
        progressCallback?.({
          current: itemIndex || 1,
          total: totalItems || 1,
          currentFileName: vaultItem.originalName,
          status: 'processing',
        });
        
        // Use standard file service upload
        moveResult = await this.fileService.moveToVault(
          mediaItem.uri,
          vaultItem.originalName,
          this.cryptoService
        );
      }
      
      console.log('ImportSingleMedia - Upload result:', moveResult.success, moveResult.error);

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

      // Skip deleting original files from camera roll as it may cause permission issues
      // The files will remain in the user's gallery but encrypted copies are in the vault
      console.log('Import completed, original file preserved in gallery');

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
      // Generate thumbnails for images only (not videos)
      if (vaultItem.type !== 'image') {
        return {
          success: false,
          error: 'Thumbnails only supported for images',
        };
      }
      
      logDebug('MediaService', 'Generating thumbnail for item', { id: vaultItem.id, name: vaultItem.originalName });

      // Check if ImageResizer is available
      if (!ImageResizer || typeof ImageResizer.createResizedImage !== 'function') {
        logError('MediaService', 'ImageResizer module not available', { available: !!ImageResizer });
        return {
          success: false,
          error: 'Image resizer module not properly linked',
        };
      }

      // First, decrypt the original image to a temporary file
      const tempOriginalPath = this.fileService.getTempFilePath(`original_${vaultItem.id}`);
      const decryptResult = await this.fileService.restoreFromVault(
        vaultItem.encryptedPath,
        tempOriginalPath,
        this.cryptoService
      );

      if (!decryptResult.success) {
        logError('MediaService', 'Failed to decrypt image for thumbnail generation', decryptResult.error);
        return {
          success: false,
          error: decryptResult.error,
        };
      }

      try {
        // Resize the image to create thumbnail
        const thumbnailResponse = await ImageResizer.createResizedImage(
          tempOriginalPath,
          VAULT_CONFIG.THUMBNAIL_SIZE,
          VAULT_CONFIG.THUMBNAIL_SIZE,
          'JPEG',
          VAULT_CONFIG.THUMBNAIL_QUALITY * 100, // Convert 0.8 to 80
          0, // rotation
          undefined, // outputPath (auto-generate)
          false, // keepMeta
          {
            mode: 'cover',
            onlyScaleDown: true,
          }
        );

        // Read the thumbnail as base64
        const thumbnailBase64 = await RNFS.readFile(thumbnailResponse.uri, 'base64');

        // Encrypt the thumbnail
        const encryptResult = this.cryptoService.encryptFile(thumbnailBase64);
        if (!encryptResult.success) {
          logError('MediaService', 'Failed to encrypt thumbnail', encryptResult.error);
          return {
            success: false,
            error: encryptResult.error,
          };
        }

        // Save encrypted thumbnail
        const thumbnailFileName = `${vaultItem.id}${VAULT_CONFIG.THUMBNAIL_SUFFIX}${VAULT_CONFIG.ENCRYPTED_EXTENSION}`;
        const thumbnailPath = `${FileService.getThumbnailsDirectory()}/${thumbnailFileName}`;
        
        const saveResult = await this.fileService.writeStringToFile(thumbnailPath, encryptResult.encryptedData);
        if (!saveResult.success) {
          logError('MediaService', 'Failed to save encrypted thumbnail', saveResult.error);
          return {
            success: false,
            error: saveResult.error,
          };
        }

        // Clean up temporary files
        try {
          await RNFS.unlink(tempOriginalPath);
          await RNFS.unlink(thumbnailResponse.uri);
        } catch (cleanupError) {
          logWarn('MediaService', 'Failed to cleanup temporary files', cleanupError);
        }

        logInfo('MediaService', 'Thumbnail generated successfully', { path: thumbnailPath });
        return {
          success: true,
          path: thumbnailPath,
        };

      } catch (resizeError) {
        logError('MediaService', 'Image resize failed', resizeError);
        // Clean up temp file
        try {
          await RNFS.unlink(tempOriginalPath);
        } catch {}
        
        return {
          success: false,
          error: 'Failed to resize image for thumbnail',
        };
      }

    } catch (error) {
      logError('MediaService', 'Thumbnail generation failed', error);
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
   * Get decrypted thumbnail for display
   */
  public async getThumbnailForDisplay(vaultItem: VaultItem): Promise<{ success: boolean; uri?: string; error?: string }> {
    try {
      if (!vaultItem.thumbnailPath) {
        return {
          success: false,
          error: 'No thumbnail available for this item',
        };
      }

      logDebug('MediaService', 'Getting thumbnail for display', { id: vaultItem.id });

      // Generate temporary file name for decrypted thumbnail
      const tempThumbnailName = `thumb_${vaultItem.id}_${Date.now()}.jpg`;
      const tempThumbnailPath = this.fileService.getTempFilePath(tempThumbnailName);

      // Decrypt thumbnail to temp path
      const decryptResult = await this.fileService.restoreFromVault(
        vaultItem.thumbnailPath,
        tempThumbnailPath,
        this.cryptoService
      );

      if (!decryptResult.success) {
        logError('MediaService', 'Failed to decrypt thumbnail', decryptResult.error);
        return {
          success: false,
          error: decryptResult.error,
        };
      }

      // Return file URI for display
      return {
        success: true,
        uri: `file://${tempThumbnailPath}`,
      };

    } catch (error) {
      logError('MediaService', 'Failed to get thumbnail for display', error);
      return {
        success: false,
        error: 'Failed to get thumbnail',
      };
    }
  }

  /**
   * Decrypt and get temporary path for viewing media (with streaming support for large videos)
   */
  public async getMediaForViewing(
    vaultItem: VaultItem,
    progressCallback?: (progress: { phase: string; progress: number; currentChunk?: number; totalChunks?: number }) => void
  ): Promise<{ success: boolean; path?: string; error?: string }> {
    try {
      console.log(`getMediaForViewing - Processing ${vaultItem.type}: ${vaultItem.originalName} (${vaultItem.size} bytes)`);
      
      // Generate temporary file name
      const extension = FileService.getFileExtension(vaultItem.originalName);
      const tempFileName = `view_${vaultItem.id}_${Date.now()}${extension}`;
      const tempPath = this.fileService.getTempFilePath(tempFileName);

      // Check if we should use streaming for large videos
      const useStreaming = VideoStreamService.shouldUseStreaming(vaultItem.size, vaultItem.type);
      
      if (useStreaming && vaultItem.type === 'video') {
        console.log('getMediaForViewing - Using streaming decryption for large video');
        
        // Use streaming decryption
        const streamResult = await this.videoStreamService.streamDecryptVideo(
          vaultItem.encryptedPath,
          tempPath,
          this.cryptoService,
          (streamProgress) => {
            console.log('MediaService - Stream decryption progress:', streamProgress);
            progressCallback?.({
              phase: streamProgress.phase,
              progress: streamProgress.progress,
              currentChunk: streamProgress.currentChunk,
              totalChunks: streamProgress.totalChunks
            });
          }
        );
        
        return streamResult;
      } else {
        console.log('getMediaForViewing - Using standard decryption');
        
        // Report decryption progress
        progressCallback?.({
          phase: 'reading',
          progress: 0
        });

        // Use standard file service decryption
        const restoreResult = await this.fileService.restoreFromVault(
          vaultItem.encryptedPath,
          tempPath,
          this.cryptoService
        );

        progressCallback?.({
          phase: 'complete',
          progress: 100
        });

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
      }
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
   * Regenerate missing thumbnails for existing items
   */
  public async regenerateMissingThumbnails(): Promise<{ success: boolean; generated: number; errors: string[] }> {
    const errors: string[] = [];
    let generatedCount = 0;

    try {
      logInfo('MediaService', 'Starting thumbnail regeneration for missing thumbnails');
      
      const items = this.vaultMetadata.items.filter(item => 
        !item.isDeleted && 
        item.type === 'image' && 
        !item.thumbnailPath
      );

      logInfo('MediaService', 'Found items missing thumbnails', { count: items.length });

      for (const item of items) {
        try {
          logDebug('MediaService', 'Generating thumbnail for item', { id: item.id, name: item.originalName });
          
          const thumbnailResult = await this.generateThumbnail(item);
          if (thumbnailResult.success && thumbnailResult.path) {
            item.thumbnailPath = thumbnailResult.path;
            generatedCount++;
            logInfo('MediaService', 'Thumbnail generated', { id: item.id });
          } else {
            const errorMsg = `${item.originalName}: ${thumbnailResult.error}`;
            logError('MediaService', 'Thumbnail generation failed', { id: item.id, error: thumbnailResult.error });
            errors.push(errorMsg);
          }
        } catch (error) {
          const errorMsg = `${item.originalName}: ${error}`;
          logError('MediaService', 'Thumbnail generation exception', { id: item.id, error });
          errors.push(errorMsg);
        }
      }

      if (generatedCount > 0) {
        // Save updated metadata
        await this.saveMetadata();
        logInfo('MediaService', 'Thumbnail regeneration completed', { generated: generatedCount, errors: errors.length });
      }

      return {
        success: true,
        generated: generatedCount,
        errors,
      };

    } catch (error) {
      logError('MediaService', 'Thumbnail regeneration failed', error);
      return {
        success: false,
        generated: generatedCount,
        errors: [ERROR_MESSAGES.UNKNOWN_ERROR],
      };
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