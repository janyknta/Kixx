// src/contexts/NotificationContext.tsx

import React, { createContext, useContext, useState, ReactNode } from 'react';

export interface NotificationData {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
  duration?: number;
  action?: {
    label: string;
    onPress: () => void;
  };
}

interface NotificationContextType {
  showNotification: (notification: Omit<NotificationData, 'id'>) => void;
  showSuccess: (message: string, action?: NotificationData['action']) => void;
  showError: (message: string, action?: NotificationData['action']) => void;
  showInfo: (message: string, action?: NotificationData['action']) => void;
  showWarning: (message: string, action?: NotificationData['action']) => void;
  showSuccessWithConfetti: (message: string, action?: NotificationData['action']) => void;
  hideNotification: (id: string) => void;
  notifications: NotificationData[];
  confettiVisible: boolean;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

interface NotificationProviderProps {
  children: ReactNode;
}

export const NotificationProvider: React.FC<NotificationProviderProps> = ({ children }) => {
  const [notifications, setNotifications] = useState<NotificationData[]>([]);
  const [confettiVisible, setConfettiVisible] = useState(false);

  const generateId = () => {
    return `notification_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  };

  const showNotification = (notification: Omit<NotificationData, 'id'>) => {
    const id = generateId();
    const newNotification: NotificationData = {
      ...notification,
      id,
      duration: notification.duration || 4000,
    };

    setNotifications(prev => [newNotification, ...prev]);

    // Auto-remove after duration
    setTimeout(() => {
      hideNotification(id);
    }, newNotification.duration + 500); // Extra buffer for hide animation
  };

  const showSuccess = (message: string, action?: NotificationData['action']) => {
    showNotification({
      message,
      type: 'success',
      action,
    });
  };

  const showError = (message: string, action?: NotificationData['action']) => {
    showNotification({
      message,
      type: 'error',
      duration: 6000, // Errors stay longer
      action,
    });
  };

  const showInfo = (message: string, action?: NotificationData['action']) => {
    showNotification({
      message,
      type: 'info',
      action,
    });
  };

  const showWarning = (message: string, action?: NotificationData['action']) => {
    showNotification({
      message,
      type: 'warning',
      action,
    });
  };

  const showSuccessWithConfetti = (message: string, action?: NotificationData['action']) => {
    // Show confetti first
    setConfettiVisible(true);
    
    // Show notification after a brief delay
    setTimeout(() => {
      showSuccess(message, action);
    }, 500);

    // Hide confetti after animation
    setTimeout(() => {
      setConfettiVisible(false);
    }, 3500);
  };

  const hideNotification = (id: string) => {
    setNotifications(prev => prev.filter(notification => notification.id !== id));
  };

  const value: NotificationContextType = {
    showNotification,
    showSuccess,
    showError,
    showInfo,
    showWarning,
    showSuccessWithConfetti,
    hideNotification,
    notifications,
    confettiVisible,
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotification = (): NotificationContextType => {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  return context;
};