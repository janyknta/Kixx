// src/utils/SecurityManager.ts

import { NativeModules, Platform } from 'react-native';
import { logDebug, logInfo, logWarn } from '../services/Logger';

interface SecurityModuleInterface {
  enableSecureMode(): void;
  disableSecureMode(): void;
  removeFromRecents(): void;
}

const { SecurityModule } = NativeModules as { SecurityModule: SecurityModuleInterface };

export class SecurityManager {
  /**
   * Enable secure mode - prevents screenshots and app preview in recents
   */
  static enableSecureMode(): void {
    if (Platform.OS === 'android' && SecurityModule) {
      SecurityModule.enableSecureMode();
    }
  }

  /**
   * Disable secure mode - allows screenshots (usually not needed in vault apps)
   */
  static disableSecureMode(): void {
    if (Platform.OS === 'android' && SecurityModule) {
      SecurityModule.disableSecureMode();
    }
  }

  /**
   * Remove app from recent apps list - for maximum security
   */
  static removeFromRecents(): void {
    if (Platform.OS === 'android' && SecurityModule) {
      logInfo('SecurityManager', 'Removing app from recents');
      SecurityModule.removeFromRecents();
    }
  }

  /**
   * Handle app going to background with security measures
   */
  static handleAppBackground(): void {
    logDebug('SecurityManager', 'App going to background, applying security measures');
    
    if (Platform.OS === 'android') {
      // For now, just enable secure mode (prevents screenshots and preview)
      // Removing from recents is too aggressive and prevents app from reopening
      SecurityManager.enableSecureMode();
      
      // TODO: Implement a more sophisticated approach that allows reopening
      // setTimeout(() => {
      //   SecurityManager.removeFromRecents();
      // }, 100);
    }
  }
}