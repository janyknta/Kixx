// src/services/FileService.ts

import RNFS from 'react-native-fs';
import { VAULT_CONFIG, ERROR_MESSAGES } from '../utils/constants';
import { FileOperationResult } from '../types';
import { CryptoService } from './CryptoService';

export class FileService {
  private static instance: FileService;

  private constructor() {}

  public static getInstance(): FileService {
    if (!FileService.instance) {
      FileService.instance = new FileService();
    }
    return FileService.instance;
  }

  /**
   * Get the main vault directory path
   */
  public static getVaultDirectory(): string {
    return `${RNFS.DocumentDirectoryPath}/${VAULT_CONFIG.VAULT_FOLDER}`;
  }

  /**
   * Get the media directory path
   */
  public static getMediaDirectory(): string {
    return `${FileService.getVaultDirectory()}/${VAULT_CONFIG.MEDIA_FOLDER}`;
  }

  /**
   * Get the thumbnails directory path
   */
  public static getThumbnailsDirectory(): string {
    return `${FileService.getVaultDirectory()}/${VAULT_CONFIG.THUMBNAILS_FOLDER}`;
  }

  /**
   * Get the metadata directory path
   */
  public static getMetadataDirectory(): string {
    return `${FileService.getVaultDirectory()}/${VAULT_CONFIG.METADATA_FOLDER}`;
  }

  /**
   * Get the temp directory path
   */
  public static getTempDirectory(): string {
    return `${FileService.getVaultDirectory()}/${VAULT_CONFIG.TEMP_FOLDER}`;
  }

  /**
   * Initialize vault directory structure
   */
  public async initializeVault(): Promise<FileOperationResult> {
    try {
      const directories = [
        FileService.getVaultDirectory(),
        FileService.getMediaDirectory(),
        FileService.getThumbnailsDirectory(),
        FileService.getMetadataDirectory(),
        FileService.getTempDirectory(),
      ];

      // Create all directories
      for (const dir of directories) {
        const exists = await RNFS.exists(dir);
        if (!exists) {
          await RNFS.mkdir(dir);
          console.log(`Created directory: ${dir}`);
        }
      }

      return { success: true };
    } catch (error) {
      console.error('Failed to initialize vault:', error);
      return {
        success: false,
        error: 'Failed to initialize vault directories',
      };
    }
  }

  /**
   * Check if file exists
   */
  public async fileExists(filePath: string): Promise<boolean> {
    try {
      return await RNFS.exists(filePath);
    } catch {
      return false;
    }
  }

  /**
   * Get file info
   */
  public async getFileInfo(filePath: string): Promise<RNFS.StatResult | null> {
    try {
      const exists = await this.fileExists(filePath);
      if (!exists) return null;
      
      return await RNFS.stat(filePath);
    } catch (error) {
      console.error('Failed to get file info:', error);
      return null;
    }
  }

  /**
   * Read file as base64
   */
  public async readFileAsBase64(filePath: string): Promise<string | null> {
    try {
      const exists = await this.fileExists(filePath);
      if (!exists) {
        console.error('File does not exist:', filePath);
        return null;
      }

      return await RNFS.readFile(filePath, 'base64');
    } catch (error) {
      console.error('Failed to read file:', error);
      return null;
    }
  }

  /**
   * Write base64 data to file
   */
  public async writeBase64ToFile(filePath: string, base64Data: string): Promise<FileOperationResult> {
    try {
      await RNFS.writeFile(filePath, base64Data, 'base64');
      return { success: true, path: filePath };
    } catch (error) {
      console.error('Failed to write file:', error);
      return {
        success: false,
        error: 'Failed to write file',
      };
    }
  }

  /**
   * Copy file to vault with encryption
   */
  public async moveToVault(
    sourcePath: string,
    originalFileName: string,
    cryptoService: CryptoService
  ): Promise<FileOperationResult> {
    try {
      // Check if source file exists
      const exists = await this.fileExists(sourcePath);
      if (!exists) {
        return {
          success: false,
          error: ERROR_MESSAGES.FILE_NOT_FOUND,
        };
      }

      // Read the source file as base64
      const fileData = await this.readFileAsBase64(sourcePath);
      if (!fileData) {
        return {
          success: false,
          error: 'Failed to read source file',
        };
      }

      // Encrypt the file data
      const encryptionResult = cryptoService.encryptFile(fileData);
      if (!encryptionResult.success) {
        return {
          success: false,
          error: encryptionResult.error,
        };
      }

      // Generate secure filename for vault
      const vaultFileName = CryptoService.generateSecureFileName(VAULT_CONFIG.ENCRYPTED_EXTENSION);
      const vaultFilePath = `${FileService.getMediaDirectory()}/${vaultFileName}`;

      // Write encrypted data to vault
      const writeResult = await this.writeBase64ToFile(vaultFilePath, encryptionResult.encryptedData);
      if (!writeResult.success) {
        return writeResult;
      }

      return {
        success: true,
        path: vaultFilePath,
      };
    } catch (error) {
      console.error('Failed to move file to vault:', error);
      return {
        success: false,
        error: ERROR_MESSAGES.IMPORT_FAILED,
      };
    }
  }

  /**
   * Restore file from vault with decryption
   */
  public async restoreFromVault(
    vaultPath: string,
    destinationPath: string,
    cryptoService: CryptoService
  ): Promise<FileOperationResult> {
    try {
      // Check if vault file exists
      const exists = await this.fileExists(vaultPath);
      if (!exists) {
        return {
          success: false,
          error: ERROR_MESSAGES.FILE_NOT_FOUND,
        };
      }

      // Read encrypted data from vault
      const encryptedData = await RNFS.readFile(vaultPath, 'utf8');
      if (!encryptedData) {
        return {
          success: false,
          error: 'Failed to read vault file',
        };
      }

      // Decrypt the file data
      const decryptionResult = cryptoService.decryptFile(encryptedData);
      if (!decryptionResult.success) {
        return {
          success: false,
          error: decryptionResult.error,
        };
      }

      // Write decrypted data to destination
      const writeResult = await this.writeBase64ToFile(destinationPath, decryptionResult.decryptedData);
      if (!writeResult.success) {
        return writeResult;
      }

      return {
        success: true,
        path: destinationPath,
      };
    } catch (error) {
      console.error('Failed to restore file from vault:', error);
      return {
        success: false,
        error: ERROR_MESSAGES.EXPORT_FAILED,
      };
    }
  }

  /**
   * Delete file from device
   */
  public async deleteFile(filePath: string): Promise<FileOperationResult> {
    try {
      const exists = await this.fileExists(filePath);
      if (!exists) {
        return { success: true }; // File doesn't exist, consider it deleted
      }

      await RNFS.unlink(filePath);
      return { success: true };
    } catch (error) {
      console.error('Failed to delete file:', error);
      return {
        success: false,
        error: 'Failed to delete file',
      };
    }
  }

  /**
   * Get available storage space
   */
  public async getAvailableSpace(): Promise<number> {
    try {
      const freeSpace = await RNFS.getFSInfo();
      return freeSpace.freeSpace;
    } catch (error) {
      console.error('Failed to get storage info:', error);
      return 0;
    }
  }

  /**
   * Check if there's enough space for a file
   */
  public async hasEnoughSpace(requiredBytes: number): Promise<boolean> {
    try {
      const availableSpace = await this.getAvailableSpace();
      // Add 20% buffer for encryption overhead
      const requiredWithBuffer = requiredBytes * 1.2;
      return availableSpace > requiredWithBuffer;
    } catch {
      return false;
    }
  }

  /**
   * Get vault size
   */
  public async getVaultSize(): Promise<number> {
    try {
      const mediaDir = FileService.getMediaDirectory();
      const thumbnailsDir = FileService.getThumbnailsDirectory();
      
      let totalSize = 0;

      // Calculate media files size
      const mediaFiles = await RNFS.readDir(mediaDir);
      for (const file of mediaFiles) {
        if (file.isFile()) {
          totalSize += file.size;
        }
      }

      // Calculate thumbnails size
      const thumbnailFiles = await RNFS.readDir(thumbnailsDir);
      for (const file of thumbnailFiles) {
        if (file.isFile()) {
          totalSize += file.size;
        }
      }

      return totalSize;
    } catch (error) {
      console.error('Failed to calculate vault size:', error);
      return 0;
    }
  }

  /**
   * Clean up temp files
   */
  public async cleanupTempFiles(): Promise<void> {
    try {
      const tempDir = FileService.getTempDirectory();
      const exists = await this.fileExists(tempDir);
      
      if (exists) {
        const files = await RNFS.readDir(tempDir);
        for (const file of files) {
          if (file.isFile()) {
            await RNFS.unlink(file.path);
          }
        }
      }
    } catch (error) {
      console.error('Failed to cleanup temp files:', error);
    }
  }

  /**
   * Generate temporary file path
   */
  public getTempFilePath(fileName: string): string {
    return `${FileService.getTempDirectory()}/${fileName}`;
  }

  /**
   * Copy file to temp directory for temporary access
   */
  public async copyToTemp(sourcePath: string, fileName?: string): Promise<FileOperationResult> {
    try {
      const tempFileName = fileName || `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const tempPath = this.getTempFilePath(tempFileName);
      
      await RNFS.copyFile(sourcePath, tempPath);
      
      return {
        success: true,
        path: tempPath,
      };
    } catch (error) {
      console.error('Failed to copy to temp:', error);
      return {
        success: false,
        error: 'Failed to copy file to temporary location',
      };
    }
  }

  /**
   * Get file extension from path
   */
  public static getFileExtension(filePath: string): string {
    const lastDot = filePath.lastIndexOf('.');
    if (lastDot === -1) return '';
    return filePath.substring(lastDot);
  }

  /**
   * Get file name without extension
   */
  public static getFileNameWithoutExtension(filePath: string): string {
    const fileName = filePath.split('/').pop() || '';
    const lastDot = fileName.lastIndexOf('.');
    if (lastDot === -1) return fileName;
    return fileName.substring(0, lastDot);
  }
}