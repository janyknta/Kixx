// src/utils/constants.ts

export const VAULT_CONFIG = {
  VAULT_FOLDER: 'vault',
  MEDIA_FOLDER: 'media',
  THUMBNAILS_FOLDER: 'thumbnails',
  METADATA_FOLDER: 'metadata',
  METADATA_FILE: 'vault.json.enc',
  TEMP_FOLDER: 'temp',
  
  // Encryption
  ENCRYPTION_ALGORITHM: 'AES-256-GCM',
  KEY_DERIVATION_ITERATIONS: 10000,
  SALT_LENGTH: 32,
  IV_LENGTH: 16,
  
  // File extensions
  ENCRYPTED_EXTENSION: '.enc',
  THUMBNAIL_SUFFIX: '_thumb',
  
  // Settings defaults
  DEFAULT_AUTO_LOCK_TIMEOUT: 5, // minutes
  DEFAULT_TRASH_RETENTION_DAYS: 30,
  DEFAULT_GRID_SIZE: 'medium' as const,
  MAX_FILE_SIZE: 500 * 1024 * 1024, // 500MB
  
  // Video streaming settings
  VIDEO_CHUNK_SIZE: 5 * 1024 * 1024, // 5MB chunks for streaming
  MAX_VIDEO_SIZE: 2 * 1024 * 1024 * 1024, // 2GB max video size
  STREAM_BUFFER_SIZE: 1024 * 1024, // 1MB buffer for reading
  VIDEO_COMPRESSION_QUALITY: 0.7, // Quality for video compression
  
  // Thumbnail settings
  THUMBNAIL_SIZE: 200,
  THUMBNAIL_QUALITY: 0.8,
  
  // Security
  MAX_PIN_ATTEMPTS: 5,
  PIN_LENGTH: 6,
  SESSION_TIMEOUT: 30 * 60 * 1000, // 30 minutes in milliseconds
};

export const STORAGE_KEYS = {
  VAULT_METADATA: 'vault_metadata',
  USER_SETTINGS: 'user_settings',
  AUTH_STATE: 'auth_state',
  ENCRYPTION_KEY: 'encryption_key',
  DEVICE_SALT: 'device_salt',
  LAST_BACKUP: 'last_backup',
  PIN_HASH: 'pin_hash',
  FAILED_ATTEMPTS: 'failed_attempts',
};

export const PERMISSIONS = {
  ANDROID: {
    READ_EXTERNAL_STORAGE: 'android.permission.READ_EXTERNAL_STORAGE',
    WRITE_EXTERNAL_STORAGE: 'android.permission.WRITE_EXTERNAL_STORAGE',
    CAMERA: 'android.permission.CAMERA',
  },
  IOS: {
    PHOTO_LIBRARY: 'ios.permission.PHOTO_LIBRARY',
    CAMERA: 'ios.permission.CAMERA',
  },
};

export const COLORS = {
  primary: '#6366f1',
  primaryDark: '#4f46e5',
  secondary: '#8b5cf6',
  background: '#f8fafc',
  surface: '#ffffff',
  text: '#1e293b',
  textSecondary: '#64748b',
  border: '#e2e8f0',
  error: '#ef4444',
  success: '#10b981',
  warning: '#f59e0b',
  danger: '#dc2626',
  
  // Vault specific
  vaultBackground: '#0f0f23',
  vaultSurface: '#1a1a3a',
  vaultText: '#ffffff',
  vaultAccent: '#6366f1',
};

export const ANIMATIONS = {
  DURATION: {
    SHORT: 200,
    MEDIUM: 300,
    LONG: 500,
  },
  EASING: {
    EASE_IN: 'ease-in',
    EASE_OUT: 'ease-out',
    EASE_IN_OUT: 'ease-in-out',
  },
};

export const GRID_SIZES = {
  small: { columns: 4, spacing: 8 },
  medium: { columns: 3, spacing: 12 },
  large: { columns: 2, spacing: 16 },
};

export const ERROR_MESSAGES = {
  ENCRYPTION_FAILED: 'Failed to encrypt file',
  DECRYPTION_FAILED: 'Failed to decrypt file',
  FILE_NOT_FOUND: 'File not found',
  INSUFFICIENT_STORAGE: 'Insufficient storage space',
  PERMISSION_DENIED: 'Permission denied',
  INVALID_PIN: 'Invalid PIN',
  IMPORT_FAILED: 'Failed to import media',
  EXPORT_FAILED: 'Failed to export media',
  NETWORK_ERROR: 'Network error occurred',
  UNKNOWN_ERROR: 'An unknown error occurred',
};