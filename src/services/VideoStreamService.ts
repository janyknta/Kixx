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
        const readingProgress = Math.round((processedBytes / fileSize) * 100);
        progressCallback?.({
          bytesProcessed: processedBytes,
          totalBytes: fileSize,
          progress: readingProgress,
          currentChunk: chunkIndex + 1,
          totalChunks,
          phase: 'reading'
        });
        
        console.log(`VideoStreamService: Reading chunk ${chunkIndex + 1}/${totalChunks} (${readingProgress}%)`);

        try {
          // Read chunk using streaming
          const chunkData = await this.readVideoChunk(sourcePath, start, actualChunkSize);
          
          // Report progress - encrypting phase
          const encryptingProgress = Math.round(((processedBytes + actualChunkSize * 0.3) / fileSize) * 100);
          progressCallback?.({
            bytesProcessed: processedBytes + actualChunkSize * 0.3,
            totalBytes: fileSize,
            progress: encryptingProgress,
            currentChunk: chunkIndex + 1,
            totalChunks,
            phase: 'encrypting'
          });
          
          console.log(`VideoStreamService: Encrypting chunk ${chunkIndex + 1}/${totalChunks} (${encryptingProgress}%)`);

          // Encrypt chunk
          const encryptResult = cryptoService.encryptFile(chunkData);
          if (!encryptResult.success) {
            throw new Error(encryptResult.error || 'Encryption failed');
          }

          // Report progress - writing phase
          const writingProgress = Math.round(((processedBytes + actualChunkSize * 0.7) / fileSize) * 100);
          progressCallback?.({
            bytesProcessed: processedBytes + actualChunkSize * 0.7,
            totalBytes: fileSize,
            progress: writingProgress,
            currentChunk: chunkIndex + 1,
            totalChunks,
            phase: 'writing'
          });
          
          console.log(`VideoStreamService: Writing encrypted chunk ${chunkIndex + 1}/${totalChunks} (${writingProgress}%)`);

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
   * Fast stream decrypt a large video file with proper chunk handling and caching
   */
  public async streamDecryptVideo(
    encryptedPath: string,
    outputPath: string,
    cryptoService: CryptoService,
    progressCallback?: (progress: StreamProgress) => void
  ): Promise<StreamResult> {
    try {
      console.log('VideoStreamService: Starting fast stream decryption');
      
      // Check if we can use cached decrypted version first
      const cachedPath = await this.getCachedDecryptedVideo(encryptedPath, outputPath);
      if (cachedPath) {
        console.log('VideoStreamService: Using cached decrypted video');
        progressCallback?.({
          bytesProcessed: 1,
          totalBytes: 1,
          progress: 100,
          currentChunk: 1,
          totalChunks: 1,
          phase: 'complete'
        });
        return { success: true, path: cachedPath };
      }
      
      // Get encrypted file stats
      const encryptedStats = await RNFS.stat(encryptedPath);
      const encryptedSize = encryptedStats.size;
      
      console.log(`VideoStreamService: Fast decryption - File: ${encryptedSize} bytes`);
      
      // Report progress - reading
      progressCallback?.({
        bytesProcessed: 0,
        totalBytes: encryptedSize,
        progress: 0,
        currentChunk: 1,
        totalChunks: 1,
        phase: 'reading'
      });
      
      console.log('VideoStreamService: Starting to read encrypted file for decryption');
      
      // Use streaming approach for large files to avoid memory issues
      console.log('VideoStreamService: Starting streaming decryption to avoid memory allocation errors');
      
      // Report progress - parsing/decrypting
      progressCallback?.({
        bytesProcessed: encryptedSize * 0.1,
        totalBytes: encryptedSize,
        progress: 10,
        currentChunk: 1,
        totalChunks: 1,
        phase: 'reading'
      });
      
      console.log('VideoStreamService: Starting streaming chunk parsing and decryption');
      
      // Parse and decrypt chunks using streaming approach
      const decryptedChunks = await this.parseAndDecryptChunksStreaming(encryptedPath, encryptedSize, cryptoService, progressCallback);
      if (!decryptedChunks.success) {
        return {
          success: false,
          error: decryptedChunks.error || 'Chunk decryption failed'
        };
      }

      // Report progress - writing
      progressCallback?.({
        bytesProcessed: encryptedSize * 0.9,
        totalBytes: encryptedSize,
        progress: 90,
        currentChunk: 1,
        totalChunks: 1,
        phase: 'writing'
      });
      
      console.log('VideoStreamService: Writing decrypted chunks to output file');

      // Write chunks sequentially to output file
      if (!decryptedChunks.data) {
        return {
          success: false,
          error: 'No decrypted data received'
        };
      }
      await this.writeDecryptedChunksToFile(outputPath, decryptedChunks.data);
      
      // Cache the decrypted video for faster future playback
      await this.cacheDecryptedVideo(encryptedPath, outputPath);
      
      // Report completion
      progressCallback?.({
        bytesProcessed: encryptedSize,
        totalBytes: encryptedSize,
        progress: 100,
        currentChunk: 1,
        totalChunks: 1,
        phase: 'complete'
      });

      console.log('VideoStreamService: Fast stream decryption completed successfully');
      return {
        success: true,
        path: outputPath
      };

    } catch (error) {
      console.error('VideoStreamService: Fast stream decryption failed:', error);
      return {
        success: false,
        error: `Fast decryption failed: ${error}`
      };
    }
  }
  
  /**
   * Parse and decrypt chunked encrypted data using streaming approach to avoid memory issues
   */
  private async parseAndDecryptChunksStreaming(
    encryptedPath: string,
    encryptedSize: number,
    cryptoService: CryptoService,
    progressCallback?: (progress: StreamProgress) => void
  ): Promise<{ success: boolean; data?: string | string[]; error?: string }> {
    try {
      console.log('VideoStreamService: Starting streaming chunk decryption');
      
      // Read file in smaller chunks to avoid memory issues
      const BUFFER_SIZE = 2 * 1024 * 1024; // 2MB buffer chunks
      const decryptedChunks: string[] = [];
      let processedBytes = 0;
      let buffer = '';
      
      while (processedBytes < encryptedSize) {
        const remainingBytes = encryptedSize - processedBytes;
        const chunkSize = Math.min(BUFFER_SIZE, remainingBytes);
        
        // Read chunk from file
        const chunk = await RNFS.read(encryptedPath, chunkSize, processedBytes, 'utf8');
        buffer += chunk;
        processedBytes += chunkSize;
        
        // Process complete encrypted blocks from buffer
        const processed = await this.processBufferChunks(buffer, cryptoService);
        if (processed.chunks.length > 0) {
          decryptedChunks.push(...processed.chunks);
        }
        buffer = processed.remaining;
        
        // Report progress
        const progress = Math.round(10 + (processedBytes / encryptedSize) * 70); // 10-80% range
        progressCallback?.({
          bytesProcessed: processedBytes,
          totalBytes: encryptedSize,
          progress,
          currentChunk: decryptedChunks.length,
          totalChunks: Math.ceil(encryptedSize / BUFFER_SIZE),
          phase: 'reading'
        });
        
        // Force garbage collection periodically
        if (global.gc && processedBytes % (4 * 1024 * 1024) === 0) {
          global.gc();
        }
      }
      
      // Process any remaining buffer
      if (buffer.trim()) {
        const final = await this.processBufferChunks(buffer, cryptoService);
        if (final.chunks.length > 0) {
          decryptedChunks.push(...final.chunks);
        }
      }
      
      console.log(`VideoStreamService: Successfully decrypted ${decryptedChunks.length} chunks via streaming`);
      return { success: true, data: decryptedChunks };
      
    } catch (error) {
      console.error('VideoStreamService: Streaming chunk decryption failed:', error);
      return { success: false, error: `Streaming decryption failed: ${error}` };
    }
  }

  /**
   * Process buffer to extract and decrypt complete chunks
   */
  private async processBufferChunks(
    buffer: string,
    cryptoService: CryptoService
  ): Promise<{ chunks: string[]; remaining: string }> {
    const chunks: string[] = [];
    let currentPos = 0;
    const ivLength = VAULT_CONFIG.IV_LENGTH * 2; // Hex string length
    
    while (currentPos < buffer.length) {
      // Find IV:Data pattern
      const ivEnd = currentPos + ivLength;
      if (ivEnd >= buffer.length || buffer[ivEnd] !== ':') {
        // Not enough data for complete chunk, return remaining buffer
        break;
      }
      
      // Look for next IV pattern to determine chunk boundary
      let nextChunkStart = currentPos + ivLength + 1;
      let nextIVPos = -1;
      
      while (nextChunkStart < buffer.length - ivLength - 1) {
        const potentialIVEnd = nextChunkStart + ivLength;
        if (potentialIVEnd < buffer.length && buffer[potentialIVEnd] === ':') {
          const potentialIV = buffer.substring(nextChunkStart, potentialIVEnd);
          if (/^[0-9a-fA-F]+$/.test(potentialIV)) {
            nextIVPos = nextChunkStart;
            break;
          }
        }
        nextChunkStart++;
      }
      
      // If no next chunk found and we're not at end, wait for more data
      if (nextIVPos === -1 && currentPos + ivLength + 1 < buffer.length) {
        // Check if this might be the last chunk by trying to decrypt what we have
        const possibleChunk = buffer.substring(currentPos);
        const testResult = cryptoService.decryptFile(possibleChunk);
        if (testResult.success) {
          chunks.push(testResult.decryptedData);
          currentPos = buffer.length;
          break;
        } else {
          // Wait for more data
          break;
        }
      }
      
      // Extract and decrypt chunk
      const chunkEnd = nextIVPos > 0 ? nextIVPos : buffer.length;
      const chunk = buffer.substring(currentPos, chunkEnd);
      
      const decryptResult = cryptoService.decryptFile(chunk);
      if (decryptResult.success) {
        chunks.push(decryptResult.decryptedData);
      } else {
        console.warn('VideoStreamService: Failed to decrypt buffer chunk, skipping');
      }
      
      currentPos = nextIVPos > 0 ? nextIVPos : buffer.length;
    }
    
    const remaining = buffer.substring(currentPos);
    return { chunks, remaining };
  }

  /**
   * Parse and decrypt chunked encrypted data (kept for fallback)
   */
  private async parseAndDecryptChunks(
    encryptedData: string, 
    cryptoService: CryptoService,
    progressCallback?: (progress: StreamProgress) => void
  ): Promise<{ success: boolean; data?: string | string[]; error?: string }> {
    try {
      console.log('VideoStreamService: Parsing encrypted chunks');
      
      // Parse chunks - each chunk has format "IV:EncryptedData"
      // But we need to be careful because there are multiple IVs
      const chunks: string[] = [];
      let currentPos = 0;
      const ivLength = VAULT_CONFIG.IV_LENGTH * 2; // Hex string length
      
      while (currentPos < encryptedData.length) {
        // Find the next IV:Data boundary
        // IV is fixed length, followed by ':'
        const ivEnd = currentPos + ivLength;
        if (ivEnd >= encryptedData.length || encryptedData[ivEnd] !== ':') {
          // Try single chunk decryption (fallback for non-streaming files)
          console.log('VideoStreamService: Attempting single chunk decryption');
          const singleResult = cryptoService.decryptFile(encryptedData);
          if (singleResult.success) {
            return { success: true, data: singleResult.decryptedData };
          } else {
            return { success: false, error: 'Invalid chunk format and single decryption failed' };
          }
        }
        
        // Find the next IV start (next occurrence of exact IV length followed by :)
        let nextChunkStart = currentPos + ivLength + 1; // Skip current IV:
        let nextIVPos = -1;
        
        // Look for next IV pattern
        while (nextChunkStart < encryptedData.length - ivLength - 1) {
          const potentialIVEnd = nextChunkStart + ivLength;
          if (potentialIVEnd < encryptedData.length && encryptedData[potentialIVEnd] === ':') {
            // Check if this looks like a valid hex IV
            const potentialIV = encryptedData.substring(nextChunkStart, potentialIVEnd);
            if (/^[0-9a-fA-F]+$/.test(potentialIV)) {
              nextIVPos = nextChunkStart;
              break;
            }
          }
          nextChunkStart++;
        }
        
        // Extract current chunk
        const chunkEnd = nextIVPos > 0 ? nextIVPos : encryptedData.length;
        const chunk = encryptedData.substring(currentPos, chunkEnd);
        chunks.push(chunk);
        
        currentPos = nextIVPos > 0 ? nextIVPos : encryptedData.length;
      }
      
      console.log(`VideoStreamService: Found ${chunks.length} encrypted chunks`);
      
      // Decrypt each chunk
      const decryptedChunks: string[] = [];
      for (let i = 0; i < chunks.length; i++) {
        const decryptResult = cryptoService.decryptFile(chunks[i]);
        if (!decryptResult.success) {
          console.error(`VideoStreamService: Failed to decrypt chunk ${i + 1}:`, decryptResult.error);
          return { success: false, error: `Chunk ${i + 1} decryption failed: ${decryptResult.error}` };
        }
        decryptedChunks.push(decryptResult.decryptedData);
        
        // Report progress during decryption
        const decryptProgress = Math.round(30 + ((i + 1) / chunks.length) * 50); // 30-80% range for chunk decryption
        progressCallback?.({
          bytesProcessed: (i + 1) / chunks.length,
          totalBytes: chunks.length,
          progress: decryptProgress,
          currentChunk: i + 1,
          totalChunks: chunks.length,
          phase: chunks.length > 1 ? 'reading' : 'reading' // Use 'reading' consistently but show chunk info
        });
        
        console.log(`VideoStreamService: Decrypted chunk ${i + 1}/${chunks.length} (${decryptProgress}%)`);
      }
      
      // For React Native, we need to write chunks directly to file instead of combining base64
      console.log(`VideoStreamService: Successfully decrypted ${chunks.length} chunks, will write directly to file`);
      return { success: true, data: decryptedChunks };
      
    } catch (error) {
      console.error('VideoStreamService: Chunk parsing failed:', error);
      return { success: false, error: `Chunk parsing failed: ${error}` };
    }
  }

  /**
   * Write decrypted chunks to file properly by using binary operations
   */
  private async writeDecryptedChunksToFile(outputPath: string, chunks: string | string[]): Promise<void> {
    try {
      if (typeof chunks === 'string') {
        // Single chunk (non-streaming file)
        await RNFS.writeFile(outputPath, chunks, 'base64');
        console.log('VideoStreamService: Successfully wrote single chunk to file');
        return;
      }
      
      if (chunks.length === 0) {
        throw new Error('No chunks to write');
      }
      
      if (chunks.length === 1) {
        // Only one chunk, write directly
        await RNFS.writeFile(outputPath, chunks[0], 'base64');
        console.log('VideoStreamService: Successfully wrote single decrypted chunk');
        return;
      }
      
      // For multiple chunks, we need to use a different approach
      // Write first chunk, then append binary data of remaining chunks
      console.log(`VideoStreamService: Writing ${chunks.length} chunks to ${outputPath}`);
      
      // Write first chunk as base64
      await RNFS.writeFile(outputPath, chunks[0], 'base64');
      
      // For remaining chunks, we'll write them as temporary binary files and concatenate
      for (let i = 1; i < chunks.length; i++) {
        const tempChunkPath = `${FileService.getTempDirectory()}/temp_chunk_${i}.bin`;
        
        try {
          // Write chunk as binary file
          await RNFS.writeFile(tempChunkPath, chunks[i], 'base64');
          
          // Read as binary and append to main file
          const binaryData = await RNFS.readFile(tempChunkPath, 'base64');
          await RNFS.appendFile(outputPath, binaryData, 'base64');
          
          // Cleanup temp file
          await RNFS.unlink(tempChunkPath).catch(() => {});
          
        } catch (chunkError) {
          console.error(`VideoStreamService: Error processing chunk ${i}:`, chunkError);
          await RNFS.unlink(tempChunkPath).catch(() => {});
          throw chunkError;
        }
      }
      
      console.log(`VideoStreamService: Successfully wrote all ${chunks.length} chunks to video file`);
      
    } catch (error) {
      console.error('VideoStreamService: Failed to write chunks to file:', error);
      throw error;
    }
  }

  /**
   * Check if file should use streaming upload (more aggressive for performance)
   */
  public static shouldUseStreaming(fileSize: number, mediaType: 'image' | 'video'): boolean {
    // Use streaming for videos larger than 5MB or any file larger than 20MB
    if (mediaType === 'video' && fileSize > 5 * 1024 * 1024) {
      return true;
    }
    
    return fileSize > 20 * 1024 * 1024;
  }

  /**
   * Estimate compression ratio for progress calculation
   */
  public static estimateVideoSize(originalSize: number): number {
    // Estimate that videos will compress to about 70% of original size
    return Math.round(originalSize * VAULT_CONFIG.VIDEO_COMPRESSION_QUALITY);
  }

  /**
   * Get cached decrypted video if available and valid
   */
  private async getCachedDecryptedVideo(encryptedPath: string, outputPath: string): Promise<string | null> {
    try {
      const cacheKey = this.getCacheKey(encryptedPath);
      const cacheDir = `${FileService.getTempDirectory()}/video_cache`;
      const cachedPath = `${cacheDir}/${cacheKey}`;
      
      // Ensure cache directory exists
      await RNFS.mkdir(cacheDir).catch(() => {});
      
      // Check if cached file exists
      const cachedExists = await RNFS.exists(cachedPath);
      if (cachedExists) {
        // Copy cached file to requested output path
        await RNFS.copyFile(cachedPath, outputPath);
        return outputPath;
      }
      
      return null;
    } catch (error) {
      console.warn('VideoStreamService: Failed to check cache:', error);
      return null;
    }
  }
  
  /**
   * Cache decrypted video for faster future access
   */
  private async cacheDecryptedVideo(encryptedPath: string, decryptedPath: string): Promise<void> {
    try {
      const cacheKey = this.getCacheKey(encryptedPath);
      const cacheDir = `${FileService.getTempDirectory()}/video_cache`;
      const cachedPath = `${cacheDir}/${cacheKey}`;
      
      // Ensure cache directory exists
      await RNFS.mkdir(cacheDir).catch(() => {});
      
      // Copy decrypted file to cache
      await RNFS.copyFile(decryptedPath, cachedPath);
      
      // Clean up old cache files (keep only last 3)
      await this.cleanupVideoCache(cacheDir);
      
      console.log('VideoStreamService: Cached decrypted video for faster access');
    } catch (error) {
      console.warn('VideoStreamService: Failed to cache decrypted video:', error);
    }
  }
  
  /**
   * Generate cache key from encrypted file path
   */
  private getCacheKey(encryptedPath: string): string {
    const filename = encryptedPath.split('/').pop() || 'unknown';
    return `${filename.replace(VAULT_CONFIG.ENCRYPTED_EXTENSION, '')}.mp4`;
  }
  
  /**
   * Clean up old cached videos to save space
   */
  private async cleanupVideoCache(cacheDir: string): Promise<void> {
    try {
      const cacheFiles = await RNFS.readDir(cacheDir);
      
      // Sort by modification time (newest first)
      cacheFiles.sort((a: any, b: any) => b.mtime.getTime() - a.mtime.getTime());
      
      // Keep only the 3 most recent files
      const filesToDelete = cacheFiles.slice(3);
      
      for (const file of filesToDelete) {
        try {
          await RNFS.unlink(file.path);
          console.log('VideoStreamService: Cleaned up old cached video:', file.name);
        } catch (error) {
          console.warn('VideoStreamService: Failed to clean up cached file:', file.name);
        }
      }
    } catch (error) {
      console.warn('VideoStreamService: Failed to cleanup video cache:', error);
    }
  }

  /**
   * Clean up any temporary streaming files and cache
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
      
      // Also clean up video cache periodically
      const cacheDir = `${tempDir}/video_cache`;
      if (await RNFS.exists(cacheDir)) {
        await this.cleanupVideoCache(cacheDir);
      }
    } catch (error) {
      console.warn('VideoStreamService: Failed to cleanup streaming files:', error);
    }
  }
}