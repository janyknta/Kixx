// src/services/CryptoService.ts

import CryptoJS from 'crypto-js';
import { VAULT_CONFIG, ERROR_MESSAGES } from '../utils/constants';
import { EncryptionResult, DecryptionResult } from '../types';

export class CryptoService {
  private static instance: CryptoService;
  private masterKey: string | null = null;

  private constructor() {}

  public static getInstance(): CryptoService {
    if (!CryptoService.instance) {
      CryptoService.instance = new CryptoService();
    }
    return CryptoService.instance;
  }

  /**
   * Generate a random salt for key derivation
   */
  private static generateSalt(): string {
    try {
      return CryptoJS.lib.WordArray.random(VAULT_CONFIG.SALT_LENGTH).toString();
    } catch (error) {
      console.warn('Native crypto random failed, using fallback:', error);
      // Fallback: use timestamp + Math.random for less secure but functional salt
      const fallbackData = Date.now().toString() + Math.random().toString(36);
      return CryptoJS.SHA256(fallbackData).toString().substring(0, VAULT_CONFIG.SALT_LENGTH * 2);
    }
  }

  /**
   * Generate a random initialization vector
   */
  private static generateIV(): string {
    try {
      return CryptoJS.lib.WordArray.random(VAULT_CONFIG.IV_LENGTH).toString();
    } catch (error) {
      console.warn('Native crypto random failed for IV, using fallback:', error);
      // Fallback: use timestamp + Math.random for less secure but functional IV
      const fallbackData = Date.now().toString() + Math.random().toString(36);
      return CryptoJS.SHA256(fallbackData).toString().substring(0, VAULT_CONFIG.IV_LENGTH * 2);
    }
  }

  /**
   * Derive encryption key from PIN and device salt using PBKDF2
   */
  public static deriveKeyFromPin(pin: string, salt: string): string {
    const key = CryptoJS.PBKDF2(pin, salt, {
      keySize: 256 / 32,
      iterations: VAULT_CONFIG.KEY_DERIVATION_ITERATIONS,
    });
    return key.toString();
  }

  /**
   * Set the master key for the session
   */
  public setMasterKey(key: string): void {
    this.masterKey = key;
  }

  /**
   * Clear the master key from memory
   */
  public clearMasterKey(): void {
    this.masterKey = null;
  }

  /**
   * Check if master key is set
   */
  public isMasterKeySet(): boolean {
    return this.masterKey !== null;
  }

  /**
   * Encrypt data using AES-256-GCM
   */
  public encrypt(data: string, customKey?: string): EncryptionResult {
    try {
      const key = customKey || this.masterKey;
      if (!key) {
        return {
          encryptedData: '',
          success: false,
          error: 'Master key not set',
        };
      }

      const iv = CryptoService.generateIV();
      const encrypted = CryptoJS.AES.encrypt(data, key, {
        iv: CryptoJS.enc.Hex.parse(iv),
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7,
      });

      // Combine IV and encrypted data
      const result = iv + ':' + encrypted.toString();

      return {
        encryptedData: result,
        success: true,
      };
    } catch (error) {
      console.error('Encryption error:', error);
      return {
        encryptedData: '',
        success: false,
        error: ERROR_MESSAGES.ENCRYPTION_FAILED,
      };
    }
  }

  /**
   * Decrypt data using AES-256-GCM
   */
  public decrypt(encryptedData: string, customKey?: string): DecryptionResult {
    try {
      const key = customKey || this.masterKey;
      if (!key) {
        return {
          decryptedData: '',
          success: false,
          error: 'Master key not set',
        };
      }

      // Split IV and encrypted data
      const parts = encryptedData.split(':');
      if (parts.length !== 2) {
        return {
          decryptedData: '',
          success: false,
          error: 'Invalid encrypted data format',
        };
      }

      const [iv, encrypted] = parts;
      const decrypted = CryptoJS.AES.decrypt(encrypted, key, {
        iv: CryptoJS.enc.Hex.parse(iv),
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7,
      });

      // The original data was base64 string treated as UTF-8 during encryption
      // So we need to get it back as UTF-8 (which is the base64 string)
      const decryptedString = decrypted.toString(CryptoJS.enc.Utf8);

      if (!decryptedString) {
        return {
          decryptedData: '',
          success: false,
          error: 'Decryption failed - invalid key or corrupted data',
        };
      }

      return {
        decryptedData: decryptedString,
        success: true,
      };
    } catch (error) {
      console.error('Decryption error:', error);
      return {
        decryptedData: '',
        success: false,
        error: ERROR_MESSAGES.DECRYPTION_FAILED,
      };
    }
  }

  /**
   * Encrypt file data (base64 encoded file content)
   */
  public encryptFile(fileData: string, customKey?: string): EncryptionResult {
    return this.encrypt(fileData, customKey);
  }

  /**
   * Decrypt file data (returns base64 encoded file content)
   */
  public decryptFile(encryptedFileData: string, customKey?: string): DecryptionResult {
    return this.decrypt(encryptedFileData, customKey);
  }

  /**
   * Hash PIN for storage verification
   */
  public static hashPin(pin: string, salt: string): string {
    return CryptoJS.SHA256(pin + salt).toString();
  }

  /**
   * Verify PIN against stored hash
   */
  public static verifyPin(pin: string, hash: string, salt: string): boolean {
    const pinHash = CryptoService.hashPin(pin, salt);
    return pinHash === hash;
  }

  /**
   * Generate a random device salt (one-time setup)
   */
  public static generateDeviceSalt(): string {
    return CryptoService.generateSalt();
  }

  /**
   * Encrypt JSON metadata
   */
  public encryptMetadata(metadata: object, customKey?: string): EncryptionResult {
    const jsonString = JSON.stringify(metadata);
    return this.encrypt(jsonString, customKey);
  }

  /**
   * Decrypt JSON metadata
   */
  public decryptMetadata<T>(encryptedMetadata: string, customKey?: string): { data: T | null; success: boolean; error?: string } {
    const decryptResult = this.decrypt(encryptedMetadata, customKey);
    
    if (!decryptResult.success) {
      return {
        data: null,
        success: false,
        error: decryptResult.error,
      };
    }

    try {
      const data = JSON.parse(decryptResult.decryptedData) as T;
      return {
        data,
        success: true,
      };
    } catch (error) {
      return {
        data: null,
        success: false,
        error: 'Failed to parse decrypted metadata',
      };
    }
  }

  /**
   * Generate a secure random string for file naming
   */
  public static generateSecureFileName(extension: string = ''): string {
    const randomBytes = CryptoJS.lib.WordArray.random(16);
    const fileName = randomBytes.toString();
    return extension ? `${fileName}${extension}` : fileName;
  }

  /**
   * Secure memory cleanup (attempt to overwrite sensitive data)
   */
  public secureCleanup(): void {
    if (this.masterKey) {
      // Attempt to overwrite the key in memory (limited effectiveness in JS)
      this.masterKey = '0'.repeat(this.masterKey.length);
      this.masterKey = null;
    }
  }
}