// src/components/NotificationContainer.tsx

import React from 'react';
import { View, StyleSheet } from 'react-native';
import ToastNotification from './ToastNotification';
import SuccessConfetti from './SuccessConfetti';
import { useNotification } from '../contexts/NotificationContext';

const NotificationContainer: React.FC = () => {
  const { notifications, hideNotification, confettiVisible } = useNotification();

  return (
    <View style={styles.container} pointerEvents="box-none">
      {/* Confetti Animation */}
      <SuccessConfetti visible={confettiVisible} />
      
      {/* Toast Notifications */}
      <View style={styles.notificationsContainer}>
        {notifications.map((notification, index) => (
          <View
            key={notification.id}
            style={{
              position: 'absolute',
              top: index * 80, // Stack notifications vertically
              left: 0,
              right: 0,
              zIndex: 99999 - index, // Ensure proper stacking order with very high z-index
            }}
          >
            <ToastNotification
              visible={true}
              message={notification.message}
              type={notification.type}
              duration={notification.duration}
              action={notification.action}
              onHide={() => hideNotification(notification.id)}
            />
          </View>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 99999, // Much higher z-index
    elevation: 50, // Higher elevation for Android
  },
  notificationsContainer: {
    position: 'absolute',
    top: 60, // Start below status bar
    left: 0,
    right: 0,
    zIndex: 99999, // Much higher z-index
    elevation: 50, // Higher elevation for Android
  },
});

export default NotificationContainer;