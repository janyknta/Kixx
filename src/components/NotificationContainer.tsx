// src/components/NotificationContainer.tsx

import React from 'react';
import { View, StyleSheet } from 'react-native';
import ToastNotification from './ToastNotification';
import ProgressNotification from './ProgressNotification';
import SuccessConfetti from './SuccessConfetti';
import { useNotification } from '../contexts/NotificationContext';

const NotificationContainer: React.FC = () => {
  const { notifications, hideNotification, confettiVisible } = useNotification();

  // Separate progress and regular notifications
  const progressNotifications = notifications.filter(n => n.type === 'progress');
  const regularNotifications = notifications.filter(n => n.type !== 'progress');

  return (
    <View style={styles.container} pointerEvents="box-none">
      {/* Confetti Animation */}
      <SuccessConfetti visible={confettiVisible} />
      
      {/* Regular Toast Notifications (Top) */}
      <View style={styles.notificationsContainer}>
        {regularNotifications.map((notification, index) => (
          <View
            key={notification.id}
            style={{
              position: 'absolute',
              top: index * 60, // Stack notifications vertically (reduced spacing for compact design)
              left: 0,
              right: 0,
              zIndex: 99999 - index, // Ensure proper stacking order with very high z-index
            }}
          >
            <ToastNotification
              visible={true}
              message={notification.message}
              type={notification.type as 'success' | 'error' | 'info' | 'warning'}
              duration={notification.duration}
              action={notification.action}
              onHide={() => hideNotification(notification.id)}
            />
          </View>
        ))}
      </View>

      {/* Progress Notifications (Bottom) */}
      {progressNotifications.map((notification, index) => (
        <View
          key={notification.id}
          style={{
            position: 'absolute',
            bottom: index * 90, // Stack progress notifications from bottom
            left: 0,
            right: 0,
            zIndex: 99998 - index, // High z-index but below regular notifications
          }}
        >
          <ProgressNotification
            notification={notification}
            visible={true}
            onHide={() => hideNotification(notification.id)}
          />
        </View>
      ))}
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
    top: 50, // Start below status bar (closer like Dynamic Island)
    left: 0,
    right: 0,
    zIndex: 99999, // Much higher z-index
    elevation: 50, // Higher elevation for Android
  },
});

export default NotificationContainer;