// src/screens/SettingsScreen.tsx

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  Switch,
  Modal,
  TextInput,
  Dimensions,
  Share,
} from 'react-native';
import Icon from "@react-native-vector-icons/material-icons";
import { Animated } from 'react-native';
import { BlurView } from '@react-native-community/blur';

import { AuthService } from '../services/AuthService';
import { MediaService } from '../services/MediaService';
import { FileService } from '../services/FileService';
import { VaultSettings } from '../types';
import { COLORS, VAULT_CONFIG } from '../utils/constants';
import ConfirmDialog from '../components/ConfirmDialog';
import { useTheme } from '../contexts/ThemeContext';
import { useCustomAlert } from '../hooks/useCustomAlert';
import { useNotification } from '../contexts/NotificationContext';

interface SettingsScreenProps {
  onBack: () => void;
  onLogout: () => void;
}

interface SettingItemProps {
  icon: string;
  title: string;
  subtitle?: string;
  value?: string;
  showArrow?: boolean;
  showSwitch?: boolean;
  switchValue?: boolean;
  onPress?: () => void;
  onSwitchChange?: (value: boolean) => void;
  danger?: boolean;
  colors?: any;
}

const SettingItem: React.FC<SettingItemProps> = ({
  icon,
  title,
  subtitle,
  value,
  showArrow = true,
  showSwitch = false,
  switchValue = false,
  onPress,
  onSwitchChange,
  danger = false,
  colors = COLORS,
}) => {
  const scaleValue = React.useRef(new Animated.Value(1)).current;
  
  const animatedStyle = {
    transform: [{ scale: scaleValue }]
  };

  const handlePress = () => {
    if (onPress) {
      Animated.sequence([
        Animated.timing(scaleValue, {
          toValue: 0.98,
          duration: 100,
          useNativeDriver: true
        }),
        Animated.spring(scaleValue, {
          toValue: 1,
          useNativeDriver: true
        })
      ]).start(() => onPress());
    }
  };

  const iconColor = danger ? colors.danger : colors.vaultAccent;
  const titleColor = danger ? colors.danger : colors.vaultText;

  return (
    <Animated.View style={[styles.settingItem, { backgroundColor: colors.vaultSurface }, animatedStyle]}>
      <TouchableOpacity
        style={styles.settingContent}
        onPress={handlePress}
        activeOpacity={0.7}
        disabled={!onPress && !showSwitch}
      >
        <View style={[styles.settingIcon, { backgroundColor: `${iconColor}20` }]}>
          <Icon name={icon} size={24} color={iconColor} />
        </View>
        
        <View style={styles.settingDetails}>
          <Text style={[styles.settingTitle, { color: titleColor }]}>{title}</Text>
          {subtitle && <Text style={[styles.settingSubtitle, { color: colors.textSecondary }]}>{subtitle}</Text>}
        </View>
        
        <View style={styles.settingValue}>
          {value && <Text style={[styles.valueText, { color: colors.textSecondary }]}>{value}</Text>}
          {showSwitch && (
            <Switch
              value={switchValue}
              onValueChange={onSwitchChange}
              trackColor={{ false: colors.border, true: `${colors.vaultAccent}50` }}
              thumbColor={switchValue ? colors.vaultAccent : colors.textSecondary}
            />
          )}
          {showArrow && !showSwitch && (
            <Icon name="chevron-right" size={24} color={colors.textSecondary} />
          )}
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
};

const SettingsScreen: React.FC<SettingsScreenProps> = ({ onBack, onLogout }) => {
  const { theme, colors, toggleTheme } = useTheme();
  const { showAlert, AlertComponent } = useCustomAlert();
  const { showSuccess, showError, showInfo } = useNotification();
  const [settings, setSettings] = useState<VaultSettings | null>(null);
  const [vaultStats, setVaultStats] = useState<any>(null);
  const [showPinDialog, setShowPinDialog] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [confirmAction, setConfirmAction] = useState<string>('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [currentPin, setCurrentPin] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');

  const [authService] = useState(() => AuthService.getInstance());
  const [mediaService] = useState(() => MediaService.getInstance());
  const [fileService] = useState(() => FileService.getInstance());

  useEffect(() => {
    loadSettings();
    loadVaultStats();
  }, []);

  const loadSettings = useCallback(async () => {
    try {
      const vaultSettings = mediaService.getSettings();
      setSettings(vaultSettings);
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  }, [mediaService]);

  const loadVaultStats = useCallback(async () => {
    try {
      const stats = mediaService.getVaultStats();
      const vaultSize = await fileService.getVaultSize();
      setVaultStats({ ...stats, vaultSize });
    } catch (error) {
      console.error('Failed to load vault stats:', error);
    }
  }, [mediaService, fileService]);

  const updateSetting = useCallback(async (key: keyof VaultSettings, value: any) => {
    if (!settings) return;

    const updatedSettings = { ...settings, [key]: value };
    const result = await mediaService.updateSettings(updatedSettings);
    
    if (result.success) {
      setSettings(updatedSettings);
    } else {
      showError(result.error || 'Failed to update settings');
    }
  }, [settings, mediaService]);


  const handleChangePin = useCallback(() => {
    setCurrentPin('');
    setNewPin('');
    setConfirmPin('');
    setShowPinDialog(true);
  }, []);

  const confirmPinChange = useCallback(async () => {
    if (newPin.length !== VAULT_CONFIG.PIN_LENGTH || newPin !== confirmPin) {
      return;
    }

    setIsLoading(true);
    setLoadingMessage('Changing your PIN...');
    
    try {
      const result = await authService.changePin(currentPin, newPin);
      if (result.success) {
        setShowPinDialog(false);
      } else {
        showError(result.error || 'Failed to change PIN');
      }
    } catch (error) {
      console.error('Failed to change PIN:', error);
      showError('Failed to change PIN');
    } finally {
      setIsLoading(false);
    }
  }, [currentPin, newPin, confirmPin, authService]);

  const handleExportData = useCallback(async () => {
    setIsLoading(true);
    setLoadingMessage('Exporting vault data...');
    
    try {
      const result = await mediaService.exportVaultData();
      if (result.success && result.data) {
        setLoadingMessage('Preparing to share...');
        const shareOptions = {
          title: 'Vault Backup',
          message: 'Encrypted vault backup data',
          url: `data:text/plain;base64,${Buffer.from(result.data).toString('base64')}`,
        };
        
        await Share.share(shareOptions);
      } else {
        showError(result.error || 'Failed to export data');
      }
    } catch (error) {
      console.error('Failed to export data:', error);
      showError('Failed to export data');
    } finally {
      setIsLoading(false);
    }
  }, [mediaService]);

  const handleResetVault = useCallback(() => {
    setConfirmAction('reset');
    setShowConfirmDialog(true);
  }, []);

  const confirmResetVault = useCallback(async () => {
    setShowConfirmDialog(false);
    setIsLoading(true);
    setLoadingMessage('Resetting vault...');
    
    try {
      // This would reset all vault data - implement with caution
      const result = await authService.resetAuth();
      if (result.success) {
        showSuccess('Vault has been reset successfully');
        setTimeout(() => onLogout(), 2000);
      } else {
        showError(result.error || 'Failed to reset vault');
      }
    } catch (error) {
      console.error('Failed to reset vault:', error);
      showError('Failed to reset vault');
    } finally {
      setIsLoading(false);
    }
    setShowConfirmDialog(false);
  }, [authService, onLogout]);

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const getAutoLockText = (minutes: number): string => {
    if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
    const hours = Math.floor(minutes / 60);
    return `${hours} hour${hours !== 1 ? 's' : ''}`;
  };

  const authState = authService.getAuthState();

  return (
    <View style={[styles.container, { backgroundColor: colors.vaultBackground }]}>
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Vault Stats */}
        {vaultStats && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.vaultText }]}>Vault Overview</Text>
            <View style={[styles.statsContainer, { backgroundColor: colors.vaultSurface }]}>
              <View style={styles.statItem}>
                <Text style={[styles.statNumber, { color: colors.vaultAccent }]}>{vaultStats.activeItems}</Text>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Items</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={[styles.statNumber, { color: colors.vaultAccent }]}>{vaultStats.imageCount}</Text>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Photos</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={[styles.statNumber, { color: colors.vaultAccent }]}>{vaultStats.videoCount}</Text>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Videos</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={[styles.statNumber, { color: colors.vaultAccent }]}>{formatBytes(vaultStats.vaultSize)}</Text>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Storage</Text>
              </View>
            </View>
          </View>
        )}

        {/* Security Settings */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.vaultText }]}>Security</Text>
          
          <SettingItem
            icon="lock"
            title="Change PIN"
            subtitle="Update your vault access PIN"
            onPress={handleChangePin}
            colors={colors}
          />
          
          
          <SettingItem
            icon="timer"
            title="Auto-lock Timeout"
            subtitle="Automatically lock after inactivity"
            value={getAutoLockText(settings?.autoLockTimeout || 5)}
            onPress={() => {
              // This would open a time picker - simplified for now
              showInfo('Auto-lock timeout settings coming soon');
            }}
            colors={colors}
          />
        </View>

        {/* Display Settings */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.vaultText }]}>Display</Text>
          
          <SettingItem
            icon={theme === 'light' ? 'light-mode' : 'dark-mode'}
            title="Theme"
            subtitle="Choose light or dark mode"
            showSwitch
            showArrow={false}
            switchValue={theme === 'dark'}
            onSwitchChange={toggleTheme}
            colors={colors}
          />
          
          <SettingItem
            icon="grid-view"
            title="Grid Size"
            subtitle="Choose how media is displayed"
            value={settings?.gridSize || 'Medium'}
            onPress={() => {
              showInfo('Grid size settings coming soon');
            }}
            colors={colors}
          />
          
          <SettingItem
            icon="image"
            title="Show Thumbnails"
            subtitle="Display preview images"
            showSwitch
            showArrow={false}
            switchValue={settings?.showThumbnails || true}
            onSwitchChange={(value) => updateSetting('showThumbnails', value)}
            colors={colors}
          />
        </View>

        {/* Storage Settings */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.vaultText }]}>Storage</Text>
          
          <SettingItem
            icon="delete-sweep"
            title="Trash Retention"
            subtitle="Days to keep deleted items"
            value={`${settings?.trashRetentionDays || 30} days`}
            onPress={() => {
              showInfo('Trash retention settings coming soon');
            }}
            colors={colors}
          />
          
          <SettingItem
            icon="cleaning-services"
            title="Clean Cache"
            subtitle="Remove temporary files"
            onPress={() => {
              fileService.cleanupTempFiles();
              showSuccess('Cache cleaned successfully');
            }}
            colors={colors}
          />
        </View>

        {/* Data Management */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.vaultText }]}>Data Management</Text>
          
          <SettingItem
            icon="file-upload"
            title="Export Backup"
            subtitle="Create encrypted backup of vault data"
            onPress={handleExportData}
            colors={colors}
          />
          
          <SettingItem
            icon="file-download"
            title="Import Backup"
            subtitle="Restore vault from backup file"
            onPress={() => {
              showInfo('Import backup feature coming soon');
            }}
            colors={colors}
          />
        </View>

        {/* Danger Zone */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.danger }]}>Danger Zone</Text>
          
          <SettingItem
            icon="logout"
            title="Sign Out"
            subtitle="Lock the vault and clear session"
            onPress={onLogout}
            danger
            showArrow
            colors={colors}
          />
          
          <SettingItem
            icon="delete-forever"
            title="Reset Vault"
            subtitle="Delete all data and reset the app"
            onPress={handleResetVault}
            danger
            showArrow
            colors={colors}
          />
        </View>

        {/* App Info */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.vaultText }]}>About</Text>
          <Text style={[styles.appInfo, { backgroundColor: colors.vaultSurface, color: colors.textSecondary }]}>
            Vault App v1.0.0{'\n'}
            Secure media storage with end-to-end encryption
          </Text>
        </View>
      </ScrollView>

      {/* PIN Change Modal */}
      <Modal
        visible={showPinDialog}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPinDialog(false)}
      >
        <BlurView style={styles.modalOverlay} blurType={theme === 'dark' ? 'dark' : 'light'} blurAmount={10}>
          <View style={[styles.pinDialog, { backgroundColor: colors.vaultSurface }]}>
            <Text style={[styles.dialogTitle, { color: colors.vaultText }]}>Change PIN</Text>
            
            <View style={styles.pinInputContainer}>
              <Text style={[styles.pinInputLabel, { color: colors.vaultText }]}>Current PIN</Text>
              <TextInput
                style={[styles.pinInput, { backgroundColor: colors.vaultBackground, borderColor: colors.border, color: colors.vaultText }]}
                value={currentPin}
                onChangeText={setCurrentPin}
                keyboardType="numeric"
                maxLength={VAULT_CONFIG.PIN_LENGTH}
                secureTextEntry
                placeholder="Enter current PIN"
                placeholderTextColor={colors.textSecondary}
              />
            </View>
            
            <View style={styles.pinInputContainer}>
              <Text style={[styles.pinInputLabel, { color: colors.vaultText }]}>New PIN</Text>
              <TextInput
                style={[styles.pinInput, { backgroundColor: colors.vaultBackground, borderColor: colors.border, color: colors.vaultText }]}
                value={newPin}
                onChangeText={setNewPin}
                keyboardType="numeric"
                maxLength={VAULT_CONFIG.PIN_LENGTH}
                secureTextEntry
                placeholder="Enter new PIN"
                placeholderTextColor={colors.textSecondary}
              />
            </View>
            
            <View style={styles.pinInputContainer}>
              <Text style={[styles.pinInputLabel, { color: colors.vaultText }]}>Confirm New PIN</Text>
              <TextInput
                style={[styles.pinInput, { backgroundColor: colors.vaultBackground, borderColor: colors.border, color: colors.vaultText }]}
                value={confirmPin}
                onChangeText={setConfirmPin}
                keyboardType="numeric"
                maxLength={VAULT_CONFIG.PIN_LENGTH}
                secureTextEntry
                placeholder="Confirm new PIN"
                placeholderTextColor={colors.textSecondary}
              />
            </View>
            
            <View style={styles.dialogButtons}>
              <TouchableOpacity
                style={[styles.dialogButton, styles.cancelButton, { borderColor: colors.border }]}
                onPress={() => setShowPinDialog(false)}
              >
                <Text style={[styles.cancelButtonText, { color: colors.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.dialogButton, styles.confirmButton, { backgroundColor: colors.vaultAccent }]}
                onPress={confirmPinChange}
              >
                <Text style={[styles.confirmButtonText, { color: colors.surface }]}>Change PIN</Text>
              </TouchableOpacity>
            </View>
          </View>
        </BlurView>
      </Modal>

      {/* Confirm Dialog */}

      <ConfirmDialog
        visible={showConfirmDialog}
        title="Reset Vault"
        message="This will permanently delete all your vault data, settings, and authentication credentials. This action cannot be undone."
        confirmText="Reset Vault"
        cancelText="Cancel"
        type="destructive"
        onConfirm={confirmResetVault}
        onCancel={() => setShowConfirmDialog(false)}
      />
      
      {/* Custom Alert Dialog */}
      {AlertComponent}
    </View>
  );
};

const { width } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.vaultBackground,
  },
  header: {
    backgroundColor: COLORS.vaultSurface,
    paddingTop: StatusBar.currentHeight || 0,
    paddingBottom: 16,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.vaultText,
    flex: 1,
    textAlign: 'center',
  },
  placeholder: {
    width: 40,
  },
  content: {
    flex: 1,
  },
  section: {
    marginBottom: 32,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.vaultText,
    marginBottom: 16,
    marginTop: 8,
  },
  statsContainer: {
    backgroundColor: COLORS.vaultSurface,
    borderRadius: 16,
    padding: 20,
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statItem: {
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.vaultAccent,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  settingItem: {
    backgroundColor: COLORS.vaultSurface,
    borderRadius: 12,
    marginBottom: 8,
  },
  settingContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  settingIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  settingDetails: {
    flex: 1,
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.vaultText,
    marginBottom: 2,
  },
  settingSubtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    lineHeight: 18,
  },
  settingValue: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  valueText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginRight: 8,
  },
  appInfo: {
    fontSize: 14,
    color: COLORS.textSecondary,
    lineHeight: 20,
    backgroundColor: COLORS.vaultSurface,
    padding: 16,
    borderRadius: 12,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pinDialog: {
    backgroundColor: COLORS.vaultSurface,
    borderRadius: 20,
    padding: 24,
    width: width - 64,
    maxWidth: 400,
  },
  dialogTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.vaultText,
    textAlign: 'center',
    marginBottom: 24,
  },
  pinInputContainer: {
    marginBottom: 16,
  },
  pinInputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.vaultText,
    marginBottom: 8,
  },
  pinInput: {
    backgroundColor: COLORS.vaultBackground,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: COLORS.vaultText,
    textAlign: 'center',
    letterSpacing: 8,
  },
  dialogButtons: {
    flexDirection: 'row',
    marginTop: 24,
    gap: 12,
  },
  dialogButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  confirmButton: {
    backgroundColor: COLORS.vaultAccent,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  confirmButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.surface,
  },
});

export default SettingsScreen;