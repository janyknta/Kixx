// src/utils/permissions.ts

import { Platform, PermissionsAndroid, Alert } from 'react-native';
import { request, PERMISSIONS, RESULTS, Permission } from 'react-native-permissions';
import { PERMISSIONS as APP_PERMISSIONS } from './constants';

export class PermissionsUtil {
  /**
   * Request camera permissions
   */
  public static async requestCameraPermission(): Promise<boolean> {
    try {
      if (Platform.OS === 'android') {
        const result = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.CAMERA,
          {
            title: 'Camera Permission',
            message: 'This app needs access to your camera to take photos for the vault.',
            buttonNeutral: 'Ask Me Later',
            buttonNegative: 'Cancel',
            buttonPositive: 'OK',
          }
        );
        return result === PermissionsAndroid.RESULTS.GRANTED;
      } else {
        const result = await request(PERMISSIONS.IOS.CAMERA);
        return result === RESULTS.GRANTED;
      }
    } catch (error) {
      console.error('Camera permission request failed:', error);
      return false;
    }
  }

  /**
   * Request photo library permissions
   */
  public static async requestPhotoLibraryPermission(): Promise<boolean> {
    try {
      if (Platform.OS === 'android') {
        // For Android, we need both READ and WRITE permissions
        const readResult = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
          {
            title: 'Photo Library Permission',
            message: 'This app needs access to your photos to import them into the vault.',
            buttonNeutral: 'Ask Me Later',
            buttonNegative: 'Cancel',
            buttonPositive: 'OK',
          }
        );

        if (readResult !== PermissionsAndroid.RESULTS.GRANTED) {
          return false;
        }

        const writeResult = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
          {
            title: 'Storage Permission',
            message: 'This app needs write access to manage your vault files.',
            buttonNeutral: 'Ask Me Later',
            buttonNegative: 'Cancel',
            buttonPositive: 'OK',
          }
        );

        return writeResult === PermissionsAndroid.RESULTS.GRANTED;
      } else {
        const result = await request(PERMISSIONS.IOS.PHOTO_LIBRARY);
        return result === RESULTS.GRANTED;
      }
    } catch (error) {
      console.error('Photo library permission request failed:', error);
      return false;
    }
  }

  /**
   * Request all necessary permissions at once
   */
  public static async requestAllPermissions(): Promise<{
    camera: boolean;
    photoLibrary: boolean;
    allGranted: boolean;
  }> {
    const results = {
      camera: false,
      photoLibrary: false,
      allGranted: false,
    };

    try {
      // Request photo library permission first (most important)
      results.photoLibrary = await this.requestPhotoLibraryPermission();

      // Request camera permission
      results.camera = await this.requestCameraPermission();

      results.allGranted = results.camera && results.photoLibrary;

      return results;
    } catch (error) {
      console.error('Failed to request permissions:', error);
      return results;
    }
  }

  /**
   * Check if camera permission is granted
   */
  public static async checkCameraPermission(): Promise<boolean> {
    try {
      if (Platform.OS === 'android') {
        return await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.CAMERA);
      } else {
        const result = await request(PERMISSIONS.IOS.CAMERA);
        return result === RESULTS.GRANTED;
      }
    } catch (error) {
      console.error('Camera permission check failed:', error);
      return false;
    }
  }

  /**
   * Check if photo library permission is granted
   */
  public static async checkPhotoLibraryPermission(): Promise<boolean> {
    try {
      if (Platform.OS === 'android') {
        const readGranted = await PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE
        );
        const writeGranted = await PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE
        );
        return readGranted && writeGranted;
      } else {
        const result = await request(PERMISSIONS.IOS.PHOTO_LIBRARY);
        return result === RESULTS.GRANTED;
      }
    } catch (error) {
      console.error('Photo library permission check failed:', error);
      return false;
    }
  }

  /**
   * Show permission rationale dialog
   */
  public static showPermissionRationale(
    title: string,
    message: string,
    onRetry?: () => void,
    onCancel?: () => void
  ): void {
    Alert.alert(
      title,
      message,
      [
        {
          text: 'Cancel',
          style: 'cancel',
          onPress: onCancel,
        },
        {
          text: 'Retry',
          onPress: onRetry,
        },
        {
          text: 'Settings',
          onPress: () => {
            // Open app settings
            if (Platform.OS === 'ios') {
              // For iOS, you would typically use Linking.openURL('app-settings:')
              // But this requires additional setup
              console.log('Open iOS settings');
            } else {
              // For Android, you can open app settings
              console.log('Open Android app settings');
            }
          },
        },
      ],
      { cancelable: false }
    );
  }

  /**
   * Handle permission denied scenarios
   */
  public static handlePermissionDenied(
    permissionType: 'camera' | 'photoLibrary',
    onRetry?: () => void
  ): void {
    const messages = {
      camera: {
        title: 'Camera Permission Required',
        message: 'To take photos for your vault, please grant camera permission in settings.',
      },
      photoLibrary: {
        title: 'Photo Library Permission Required',
        message: 'To import photos into your vault, please grant photo library access in settings.',
      },
    };

    const { title, message } = messages[permissionType];
    this.showPermissionRationale(title, message, onRetry);
  }

  /**
   * Check and request permission with user-friendly handling
   */
  public static async checkAndRequestPermission(
    type: 'camera' | 'photoLibrary'
  ): Promise<boolean> {
    try {
      // First check if permission is already granted
      const checkMethod = type === 'camera' 
        ? this.checkCameraPermission 
        : this.checkPhotoLibraryPermission;
      
      const isGranted = await checkMethod();
      if (isGranted) {
        return true;
      }

      // Request permission
      const requestMethod = type === 'camera'
        ? this.requestCameraPermission
        : this.requestPhotoLibraryPermission;

      const granted = await requestMethod();
      // if (!granted) {
      //   this.handlePermissionDenied(type, () => {
      //     // Retry permission request
      //     this.checkAndRequestPermission(type);
      //   });
      // }

      return granted;
    } catch (error) {
      console.error(`Permission check/request failed for ${type}:`, error);
      return false;
    }
  }

  /**
   * Initialize all required permissions - request once at app launch
   */
  public static async initializePermissions(): Promise<{
    success: boolean;
    missingPermissions: string[];
  }> {
    const missingPermissions: string[] = [];

    try {
      if (Platform.OS === 'android') {
        // Request all Android permissions at once
        const permissions = [
          PermissionsAndroid.PERMISSIONS.CAMERA,
          PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
          PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
        ];

        const results = await PermissionsAndroid.requestMultiple(permissions);
        
        if (results[PermissionsAndroid.PERMISSIONS.CAMERA] !== PermissionsAndroid.RESULTS.GRANTED) {
          missingPermissions.push('Camera');
        }
        
        if (results[PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE] !== PermissionsAndroid.RESULTS.GRANTED ||
            results[PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE] !== PermissionsAndroid.RESULTS.GRANTED) {
          missingPermissions.push('Storage');
        }
      } else {
        // For iOS, request permissions individually (iOS handles them better)
        const cameraResult = await request(PERMISSIONS.IOS.CAMERA);
        if (cameraResult !== RESULTS.GRANTED) {
          missingPermissions.push('Camera');
        }

        const photoResult = await request(PERMISSIONS.IOS.PHOTO_LIBRARY);
        if (photoResult !== RESULTS.GRANTED) {
          missingPermissions.push('Photo Library');
        }
      }

      return {
        success: missingPermissions.length === 0,
        missingPermissions,
      };
    } catch (error) {
      console.error('Failed to initialize permissions:', error);
      return {
        success: false,
        missingPermissions: ['Permission Request Failed'],
      };
    }
  }

  /**
   * Show permission setup guide
   */
  public static showPermissionGuide(): void {
    const message = Platform.OS === 'ios'
      ? 'To use all features of the Vault app:\n\n• Allow Photo Library access to import your photos\n• Allow Camera access to take new photos\n\nYou can change these settings anytime in your device Settings > Privacy.'
      : 'To use all features of the Vault app:\n\n• Allow Storage access to import your photos\n• Allow Camera access to take new photos\n\nYou can change these settings anytime in your device Settings > Apps > Vault > Permissions.';

    Alert.alert(
      'Permission Setup',
      message,
      [
        {
          text: 'OK',
          style: 'default',
        },
      ]
    );
  }
}