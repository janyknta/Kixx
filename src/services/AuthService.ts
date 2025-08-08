// src/services/AuthService.ts

import AsyncStorage from '@react-native-async-storage/async-storage';
import { setGenericPassword, getGenericPassword, resetGenericPassword } from 'react-native-keychain';
import ReactNativeBiometrics from 'react-native-biometrics';
import { STORAGE_KEYS, VAULT_CONFIG, ERROR_MESSAGES } from '../utils/constants';
import { AuthState } from '../types';
import { CryptoService } from './CryptoService';

export class AuthService {
  private static instance: AuthService;
  private authState: AuthState;
  private sessionTimer: NodeJS.Timeout | null = null;

  private constructor() {
    this.authState = {
      isAuthenticated: false,
      isPinSet: false,
      biometricAvailable: false,
      biometricEnabled: false,
      lastActiveTime: 0,
    };
  }

  public static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  /**
   * Initialize authentication service
   */
  public async initialize(): Promise<void> {
    try {
      // Check if PIN is already set
      const pinHash = await AsyncStorage.getItem(STORAGE_KEYS.PIN_HASH);
      this.authState.isPinSet = !!pinHash;

      // Check biometric availability
      const biometrics = new ReactNativeBiometrics();
      const { available, biometryType } = await biometrics.isSensorAvailable();
      this.authState.biometricAvailable = available;

      if (available) {
        // Check if biometric is enabled by user
        const biometricEnabled = await AsyncStorage.getItem('biometric_enabled');
        this.authState.biometricEnabled = biometricEnabled === 'true';
      }

      // Load auth state from storage
      await this.loadAuthState();
    } catch (error) {
      console.error('Failed to initialize auth service:', error);
    }
  }

  /**
   * Set up PIN for the first time
   */
  public async setupPin(pin: string): Promise<{ success: boolean; error?: string }> {
    try {
      if (pin.length !== VAULT_CONFIG.PIN_LENGTH) {
        return {
          success: false,
          error: `PIN must be ${VAULT_CONFIG.PIN_LENGTH} digits`,
        };
      }

      // Generate device salt if not exists
      let deviceSalt = await AsyncStorage.getItem(STORAGE_KEYS.DEVICE_SALT);
      if (!deviceSalt) {
        deviceSalt = CryptoService.generateDeviceSalt();
        await AsyncStorage.setItem(STORAGE_KEYS.DEVICE_SALT, deviceSalt);
      }

      // Hash the PIN for storage
      const pinHash = CryptoService.hashPin(pin, deviceSalt);
      await AsyncStorage.setItem(STORAGE_KEYS.PIN_HASH, pinHash);

      // Derive and store encryption key
      const encryptionKey = CryptoService.deriveKeyFromPin(pin, deviceSalt);
      await setGenericPassword(STORAGE_KEYS.ENCRYPTION_KEY, encryptionKey, {
        service: 'VaultApp',
      });

      this.authState.isPinSet = true;
      await this.saveAuthState();

      return { success: true };
    } catch (error) {
      console.error('Failed to setup PIN:', error);
      return {
        success: false,
        error: 'Failed to setup PIN',
      };
    }
  }

  /**
   * Authenticate with PIN
   */
  public async authenticateWithPin(pin: string): Promise<{ success: boolean; error?: string }> {
    try {
      const deviceSalt = await AsyncStorage.getItem(STORAGE_KEYS.DEVICE_SALT);
      const storedPinHash = await AsyncStorage.getItem(STORAGE_KEYS.PIN_HASH);

      if (!deviceSalt || !storedPinHash) {
        return {
          success: false,
          error: 'Authentication data not found',
        };
      }

      // Verify PIN
      const isValidPin = CryptoService.verifyPin(pin, storedPinHash, deviceSalt);
      if (!isValidPin) {
        await this.handleFailedAttempt();
        return {
          success: false,
          error: ERROR_MESSAGES.INVALID_PIN,
        };
      }

      // Derive encryption key
      const encryptionKey = CryptoService.deriveKeyFromPin(pin, deviceSalt);
      
      // Set up crypto service with master key
      const cryptoService = CryptoService.getInstance();
      cryptoService.setMasterKey(encryptionKey);

      // Update auth state
      this.authState.isAuthenticated = true;
      this.authState.lastActiveTime = Date.now();
      await this.saveAuthState();

      // Reset failed attempts
      await AsyncStorage.removeItem(STORAGE_KEYS.FAILED_ATTEMPTS);

      // Start session timer
      this.startSessionTimer();

      return { success: true };
    } catch (error) {
      console.error('PIN authentication failed:', error);
      return {
        success: false,
        error: 'Authentication failed',
      };
    }
  }

  /**
   * Authenticate with biometrics
   */
  public async authenticateWithBiometrics(): Promise<{ success: boolean; error?: string }> {
    try {
      if (!this.authState.biometricAvailable || !this.authState.biometricEnabled) {
        return {
          success: false,
          error: ERROR_MESSAGES.BIOMETRIC_NOT_AVAILABLE,
        };
      }

      const biometrics = new ReactNativeBiometrics();
      const { success } = await biometrics.simplePrompt({
        promptMessage: 'Authenticate to access your vault',
        cancelButtonText: 'Cancel',
      });

      if (!success) {
        return {
          success: false,
          error: 'Biometric authentication failed',
        };
      }

      // Get stored encryption key
      const credentials = await getGenericPassword({
        service: 'VaultApp',
      });

      if (!credentials) {
        return {
          success: false,
          error: 'Encryption key not found',
        };
      }

      // Set up crypto service with master key
      const cryptoService = CryptoService.getInstance();
      cryptoService.setMasterKey(credentials.password);

      // Update auth state
      this.authState.isAuthenticated = true;
      this.authState.lastActiveTime = Date.now();
      await this.saveAuthState();

      // Start session timer
      this.startSessionTimer();

      return { success: true };
    } catch (error) {
      console.error('Biometric authentication failed:', error);
      return {
        success: false,
        error: 'Biometric authentication failed',
      };
    }
  }

  /**
   * Enable/disable biometric authentication
   */
  public async setBiometricEnabled(enabled: boolean): Promise<{ success: boolean; error?: string }> {
    try {
      if (enabled && !this.authState.biometricAvailable) {
        return {
          success: false,
          error: ERROR_MESSAGES.BIOMETRIC_NOT_AVAILABLE,
        };
      }

      await AsyncStorage.setItem('biometric_enabled', enabled.toString());
      this.authState.biometricEnabled = enabled;
      await this.saveAuthState();

      return { success: true };
    } catch (error) {
      console.error('Failed to set biometric preference:', error);
      return {
        success: false,
        error: 'Failed to update biometric settings',
      };
    }
  }

  /**
   * Change PIN
   */
  public async changePin(oldPin: string, newPin: string): Promise<{ success: boolean; error?: string }> {
    try {
      // First verify old PIN
      const authResult = await this.authenticateWithPin(oldPin);
      if (!authResult.success) {
        return authResult;
      }

      // Set new PIN
      return await this.setupPin(newPin);
    } catch (error) {
      console.error('Failed to change PIN:', error);
      return {
        success: false,
        error: 'Failed to change PIN',
      };
    }
  }

  /**
   * Logout user
   */
  public async logout(): Promise<void> {
    try {
      this.authState.isAuthenticated = false;
      this.authState.lastActiveTime = 0;
      await this.saveAuthState();

      // Clear crypto service master key
      const cryptoService = CryptoService.getInstance();
      cryptoService.clearMasterKey();

      // Stop session timer
      this.stopSessionTimer();
    } catch (error) {
      console.error('Logout failed:', error);
    }
  }

  /**
   * Reset all authentication data (for app reset)
   */
  public async resetAuth(): Promise<{ success: boolean; error?: string }> {
    try {
      // Clear all stored data
      await AsyncStorage.multiRemove([
        STORAGE_KEYS.PIN_HASH,
        STORAGE_KEYS.DEVICE_SALT,
        STORAGE_KEYS.AUTH_STATE,
        STORAGE_KEYS.FAILED_ATTEMPTS,
        'biometric_enabled',
      ]);

      // Clear keychain
      await resetGenericPassword({
        service: 'VaultApp',
      });

      // Reset auth state
      this.authState = {
        isAuthenticated: false,
        isPinSet: false,
        biometricAvailable: this.authState.biometricAvailable, // Keep biometric availability
        biometricEnabled: false,
        lastActiveTime: 0,
      };

      // Clear crypto service
      const cryptoService = CryptoService.getInstance();
      cryptoService.clearMasterKey();

      this.stopSessionTimer();

      return { success: true };
    } catch (error) {
      console.error('Failed to reset auth:', error);
      return {
        success: false,
        error: 'Failed to reset authentication',
      };
    }
  }

  /**
   * Check if session is valid
   */
  public isSessionValid(): boolean {
    if (!this.authState.isAuthenticated) {
      return false;
    }

    const sessionTimeout = VAULT_CONFIG.SESSION_TIMEOUT;
    const timeSinceLastActivity = Date.now() - this.authState.lastActiveTime;

    return timeSinceLastActivity < sessionTimeout;
  }

  /**
   * Update last active time
   */
  public async updateActivity(): Promise<void> {
    if (this.authState.isAuthenticated) {
      this.authState.lastActiveTime = Date.now();
      await this.saveAuthState();
    }
  }

  /**
   * Get current auth state
   */
  public getAuthState(): AuthState {
    return { ...this.authState };
  }

  /**
   * Handle failed authentication attempts
   */
  private async handleFailedAttempt(): Promise<void> {
    try {
      const attemptsStr = await AsyncStorage.getItem(STORAGE_KEYS.FAILED_ATTEMPTS);
      const attempts = parseInt(attemptsStr || '0') + 1;
      
      await AsyncStorage.setItem(STORAGE_KEYS.FAILED_ATTEMPTS, attempts.toString());

      if (attempts >= VAULT_CONFIG.MAX_PIN_ATTEMPTS) {
        // Lock the app or take additional security measures
        console.warn('Maximum PIN attempts exceeded');
        // Could implement temporary lockout or other security measures
      }
    } catch (error) {
      console.error('Failed to handle failed attempt:', error);
    }
  }

  /**
   * Start session timer for auto-logout
   */
  private startSessionTimer(): void {
    this.stopSessionTimer(); // Clear any existing timer

    this.sessionTimer = setTimeout(async () => {
      console.log('Session timeout - logging out');
      await this.logout();
    }, VAULT_CONFIG.SESSION_TIMEOUT);
  }

  /**
   * Stop session timer
   */
  private stopSessionTimer(): void {
    if (this.sessionTimer) {
      clearTimeout(this.sessionTimer);
      this.sessionTimer = null;
    }
  }

  /**
   * Save auth state to storage
   */
  private async saveAuthState(): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.AUTH_STATE, JSON.stringify(this.authState));
    } catch (error) {
      console.error('Failed to save auth state:', error);
    }
  }

  /**
   * Load auth state from storage
   */
  private async loadAuthState(): Promise<void> {
    try {
      const authStateStr = await AsyncStorage.getItem(STORAGE_KEYS.AUTH_STATE);
      if (authStateStr) {
        const savedState = JSON.parse(authStateStr);
        this.authState = { ...this.authState, ...savedState };
      }
    } catch (error) {
      console.error('Failed to load auth state:', error);
    }
  }
}