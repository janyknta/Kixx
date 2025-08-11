// src/types/index.ts

export interface VaultItem {
  id: string;
  originalName: string;
  encryptedPath: string;
  thumbnailPath: string;
  type: 'image' | 'video';
  size: number;
  dateAdded: number;
  isDeleted: boolean;
  deletedDate?: number;
  originalPath?: string; // For restoration
}

export interface VaultMetadata {
  version: string;
  items: VaultItem[];
  deletedItems: VaultItem[];
  settings: VaultSettings;
  lastModified: number;
}

export interface VaultSettings {
  autoLockTimeout: number; // minutes
  trashRetentionDays: number;
  showThumbnails: boolean;
  gridSize: 'small' | 'medium' | 'large';
}

export interface MediaItem {
  uri: string;
  filename?: string;
  type: string;
  fileSize?: number;
  width?: number;
  height?: number;
  duration?: number; // for videos
}

export interface EncryptionResult {
  encryptedData: string;
  success: boolean;
  error?: string;
}

export interface DecryptionResult {
  decryptedData: string;
  success: boolean;
  error?: string;
}

export interface ImportProgress {
  current: number;
  total: number;
  currentFileName: string;
  status: 'processing' | 'encrypting' | 'streaming' | 'reading' | 'writing' | 'moving' | 'generating_thumbnail' | 'completed' | 'error';
  // Video streaming specific
  bytesTransferred?: number;
  totalBytes?: number;
  streamProgress?: number; // 0-100 for current file
  currentChunk?: number;
  totalChunks?: number;
  phase?: 'reading' | 'encrypting' | 'writing' | 'complete';
}

export interface AuthState {
  isAuthenticated: boolean;
  isPinSet: boolean;
  lastActiveTime: number;
}

export interface FileOperationResult {
  success: boolean;
  path?: string;
  error?: string;
}

export type MediaType = 'image' | 'video';
export type ViewMode = 'grid' | 'list';
export type SortOption = 'dateAdded' | 'name' | 'size' | 'type';