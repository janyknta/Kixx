// src/hooks/useCustomAlert.tsx

import React, { useState, useCallback } from 'react';
import CustomAlert, { AlertButton } from '../components/CustomAlert';

interface AlertConfig {
  title: string;
  message: string;
  buttons: AlertButton[];
  icon?: string;
  iconColor?: string;
}

interface CustomAlertHook {
  showAlert: (config: AlertConfig) => void;
  hideAlert: () => void;
  AlertComponent: React.ReactElement | null;
}

export const useCustomAlert = (): CustomAlertHook => {
  const [alertConfig, setAlertConfig] = useState<AlertConfig | null>(null);
  const [visible, setVisible] = useState(false);

  const showAlert = useCallback((config: AlertConfig) => {
    console.log('useCustomAlert: showAlert called', config);
    setAlertConfig(config);
    setVisible(true);
  }, []);

  const hideAlert = useCallback(() => {
    setVisible(false);
    // Clear config after animation completes
    setTimeout(() => {
      setAlertConfig(null);
    }, 300);
  }, []);

  const AlertComponent = alertConfig ? (
    <CustomAlert
      visible={visible}
      title={alertConfig.title}
      message={alertConfig.message}
      buttons={alertConfig.buttons}
      icon={alertConfig.icon}
      iconColor={alertConfig.iconColor}
      onRequestClose={hideAlert}
    />
  ) : null;

  return {
    showAlert,
    hideAlert,
    AlertComponent,
  };
};