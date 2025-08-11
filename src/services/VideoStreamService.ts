// src/services/VideoStreamService.ts

import RNFS from 'react-native-fs';
import { VAULT_CONFIG } from '../utils/constants';
import { CryptoService } from './CryptoService';
import { FileService } from './FileService';

export interface StreamProgress {
  bytesProcessed: number;
  totalBytes: number;
  progress: number; // 0-100
  currentChunk: number;
  totalChunks: number;
  phase: 'reading' | 'encrypting' | 'writing' | 'complete';
}

export interface StreamResult {
  success: boolean;
  path?: string;
  error?: string;
}

export class VideoStreamService {
  private static instance: VideoStreamService;

  private constructor() {}

  public static getInstance(): VideoStreamService {
    if (!VideoStreamService.instance) {
      VideoStreamService.instance = new VideoStreamService();
    }
    return VideoStreamService.instance;
  }

  /**
   * Stream upload a large video file with encryption
   */
  public async streamUploadVideo(
    sourcePath: string,
    originalFileName: string,
    cryptoService: CryptoService,
    progressCallback?: (progress: StreamProgress) => void
  ): Promise<StreamResult> {
    try {
      console.log('VideoStreamService: Starting stream upload for', originalFileName);
      
      // Get file stats
      const fileStats = await RNFS.stat(sourcePath);
      const fileSize = fileStats.size;
      
      if (fileSize > VAULT_CONFIG.MAX_VIDEO_SIZE) {
        return {
          success: false,
          error: `Video file too large. Maximum size is ${VAULT_CONFIG.MAX_VIDEO_SIZE / (1024*1024*1024)}GB`
        };
      }

      const chunkSize = VAULT_CONFIG.VIDEO_CHUNK_SIZE;
      const totalChunks = Math.ceil(fileSize / chunkSize);

      console.log(`VideoStreamService: File size: ${fileSize} bytes, chunks: ${totalChunks}`);

      // Generate secure filename for vault
      const vaultFileName = CryptoService.generateSecureFileName(VAULT_CONFIG.ENCRYPTED_EXTENSION);
      const vaultFilePath = `${FileService.getMediaDirectory()}/${vaultFileName}`;
      
      // Create temporary file for streaming writes
      const tempVaultPath = `${FileService.getTempDirectory()}/${vaultFileName}`;

      // Process file in streaming chunks
      let processedBytes = 0;
      
      for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
        const start = chunkIndex * chunkSize;
        const end = Math.min(start + chunkSize, fileSize);
        const actualChunkSize = end - start;

        // Report progress - reading phase
        progressCallback?.({
          bytesProcessed: processedBytes,
          totalBytes: fileSize,
          progress: Math.round((processedBytes / fileSize) * 100),
          currentChunk: chunkIndex + 1,
          totalChunks,
          phase: 'reading'
        });

        try {
          // Read chunk using streaming
          const chunkData = await this.readVideoChunk(sourcePath, start, actualChunkSize);
          
          // Report progress - encrypting phase
          progressCallback?.({
            bytesProcessed: processedBytes,
            totalBytes: fileSize,
            progress: Math.round((processedBytes / fileSize) * 100),
            currentChunk: chunkIndex + 1,
            totalChunks,
            phase: 'encrypting'
          });

          // Encrypt chunk
          const encryptResult = cryptoService.encryptFile(chunkData);
          if (!encryptResult.success) {
            throw new Error(encryptResult.error || 'Encryption failed');
          }

          // Report progress - writing phase
          progressCallback?.({
            bytesProcessed: processedBytes,
            totalBytes: fileSize,
            progress: Math.round((processedBytes / fileSize) * 100),
            currentChunk: chunkIndex + 1,
            totalChunks,
            phase: 'writing'
          });

          // Append encrypted chunk to temp file
          await this.appendEncryptedChunk(tempVaultPath, encryptResult.encryptedData, chunkIndex === 0);

          processedBytes += actualChunkSize;

          // Force garbage collection to free memory
          if (global.gc) {
            global.gc();
          }

        } catch (chunkError) {
          console.error(`VideoStreamService: Error processing chunk ${chunkIndex + 1}:`, chunkError);
          
          // Clean up temp file
          try {
            await RNFS.unlink(tempVaultPath);
          } catch {}
          
          return {
            success: false,
            error: `Failed to process video chunk ${chunkIndex + 1}: ${chunkError}`
          };
        }
      }

      // Move temp file to final vault location
      try {
        await RNFS.moveFile(tempVaultPath, vaultFilePath);
      } catch (moveError) {
        console.error('VideoStreamService: Failed to move temp file to vault:', moveError);
        
        // Clean up temp file
        try {
          await RNFS.unlink(tempVaultPath);
        } catch {}
        
        return {
          success: false,
          error: 'Failed to finalize video upload'
        };
      }

      // Report completion
      progressCallback?.({
        bytesProcessed: fileSize,
        totalBytes: fileSize,
        progress: 100,
        currentChunk: totalChunks,
        totalChunks,
        phase: 'complete'
      });

      console.log('VideoStreamService: Stream upload completed successfully');
      return {
        success: true,
        path: vaultFilePath
      };

    } catch (error) {
      console.error('VideoStreamService: Stream upload failed:', error);
      return {
        success: false,
        error: `Stream upload failed: ${error}`
      };
    }
  }

  /**
   * Read a video chunk using efficient streaming
   */
  private async readVideoChunk(filePath: string, start: number, size: number): Promise<string> {
    try {
      // Use RNFS.read for efficient chunk reading with base64 encoding
      const chunkData = await RNFS.read(filePath, size, start, 'base64');
      return chunkData;
    } catch (error) {
      console.error('VideoStreamService: Failed to read video chunk:', error);
      throw new Error(`Failed to read video chunk: ${error}`);
    }
  }

  /**
   * Append encrypted chunk to temp file
   */
  private async appendEncryptedChunk(filePath: string, encryptedData: string, isFirstChunk: boolean): Promise<void> {
    try {
      if (isFirstChunk) {
        // Create new file for first chunk
        await RNFS.writeFile(filePath, encryptedData, 'utf8');
      } else {
        // Append to existing file
        await RNFS.appendFile(filePath, encryptedData, 'utf8');
      }
    } catch (error) {
      console.error('VideoStreamService: Failed to write encrypted chunk:', error);
      throw new Error(`Failed to write encrypted chunk: ${error}`);
    }
  }

  /**
   * Stream decrypt a large video file
   */
  public async streamDecryptVideo(
    encryptedPath: string,
    outputPath: string,
    cryptoService: CryptoService,
    progressCallback?: (progress: StreamProgress) => void
  ): Promise<StreamResult> {
    try {
      console.log('VideoStreamService: Starting stream decryption');
      
      // Get encrypted file stats
      const encryptedStats = await RNFS.stat(encryptedPath);
      const encryptedSize = encryptedStats.size;
      
      // Read encrypted file and decrypt in streaming manner
      const encryptedData = await RNFS.readFile(encryptedPath, 'utf8');
      
      // Report progress - decrypting
      progressCallback?.({
        bytesProcessed: 0,
        totalBytes: encryptedSize,
        progress: 0,
        currentChunk: 1,
        totalChunks: 1,
        phase: 'reading'
      });
      
      // Decrypt the entire encrypted data
      const decryptResult = cryptoService.decryptFile(encryptedData);
      if (!decryptResult.success) {
        return {
          success: false,
          error: decryptResult.error || 'Decryption failed'
        };
      }

      // Report progress - writing
      progressCallback?.({
        bytesProcessed: encryptedSize / 2,
        totalBytes: encryptedSize,
        progress: 50,
        currentChunk: 1,
        totalChunks: 1,
        phase: 'writing'
      });

      // Write decrypted data to output file
      await RNFS.writeFile(outputPath, decryptResult.decryptedData, 'base64');

      // Report completion
      progressCallback?.({
        bytesProcessed: encryptedSize,
        totalBytes: encryptedSize,
        progress: 100,
        currentChunk: 1,
        totalChunks: 1,
        phase: 'complete'
      });

      console.log('VideoStreamService: Stream decryption completed successfully');
      return {
        success: true,
        path: outputPath
      };

    } catch (error) {
      console.error('VideoStreamService: Stream decryption failed:', error);
      return {
        success: false,
        error: `Stream decryption failed: ${error}`
      };
    }
  }

  /**
   * Check if file should use streaming upload
   */
  public static shouldUseStreaming(fileSize: number, mediaType: 'image' | 'video'): boolean {
    // Use streaming for videos larger than 10MB or any file larger than 50MB
    if (mediaType === 'video' && fileSize > 10 * 1024 * 1024) {
      return true;
    }
    
    return fileSize > 50 * 1024 * 1024;
  }

  /**
   * Estimate compression ratio for progress calculation
   */
  public static estimateVideoSize(originalSize: number): number {
    // Estimate that videos will compress to about 70% of original size
    return Math.round(originalSize * VAULT_CONFIG.VIDEO_COMPRESSION_QUALITY);
  }

  /**
   * Clean up any temporary streaming files
   */
  public async cleanupStreamingFiles(): Promise<void> {
    try {
      const tempDir = FileService.getTempDirectory();
      const tempFiles = await RNFS.readDir(tempDir);
      
      // Clean up any .enc files in temp directory (streaming artifacts)
      for (const file of tempFiles) {
        if (file.name.endsWith(VAULT_CONFIG.ENCRYPTED_EXTENSION)) {
          try {
            await RNFS.unlink(file.path);
            console.log('VideoStreamService: Cleaned up temp streaming file:', file.name);
          } catch (error) {
            console.warn('VideoStreamService: Failed to clean up temp file:', file.name, error);
          }
        }
      }
    } catch (error) {
      console.warn('VideoStreamService: Failed to cleanup streaming files:', error);
    }
  }
}