declare module '@react-native-async-storage/async-storage';
declare module '@react-native-vector-icons/material-icons';
declare module 'react-native-keychain';
declare module 'react-native-image-picker';
declare module 'react-native-fs';
declare module 'react-native-permissions';
declare module '@react-native-camera-roll/camera-roll';
declare module 'react-native-get-random-values';
declare module 'crypto-js';

declare module '@bam.tech/react-native-image-resizer' {
  interface ResizeOptions {
    mode?: 'contain' | 'cover' | 'stretch';
    onlyScaleDown?: boolean;
  }

  interface ResizeResponse {
    path: string;
    uri: string;
    name?: string;
    width: number;
    height: number;
    size: number;
  }

  export function createResizedImage(
    uri: string,
    width: number,
    height: number,
    format: 'PNG' | 'JPEG' | 'WEBP',
    quality: number,
    rotation?: number,
    outputPath?: string,
    keepMeta?: boolean,
    options?: ResizeOptions
  ): Promise<ResizeResponse>;

  export default {
    createResizedImage,
  };
}