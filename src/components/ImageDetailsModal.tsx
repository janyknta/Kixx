// src/components/ImageDetailsModal.tsx

import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Animated,
  Dimensions,
  StatusBar,
  ScrollView,
} from 'react-native';
import { BlurView } from '@react-native-community/blur';
import Icon from "@react-native-vector-icons/material-icons";
import { useTheme } from '../contexts/ThemeContext';
import { VaultItem } from '../types';

interface ImageDetailsModalProps {
  visible: boolean;
  item: VaultItem | null;
  onClose: () => void;
}

const ImageDetailsModal: React.FC<ImageDetailsModalProps> = ({
  visible,
  item,
  onClose,
}) => {
  const { colors, theme } = useTheme();
  const scaleAnim = useRef(new Animated.Value(0.9)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          damping: 15,
          stiffness: 150,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(scaleAnim, {
          toValue: 0.9,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]);

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (!visible || !item) {
    return null;
  }

  const details = [
    {
      icon: 'label',
      label: 'File Name',
      value: item.fileName,
    },
    {
      icon: 'storage',
      label: 'File Size',
      value: formatFileSize(item.size),
    },
    {
      icon: 'folder',
      label: 'Vault Path',
      value: item.encryptedPath,
    },
    {
      icon: 'schedule',
      label: 'Date Added',
      value: formatDate(item.createdAt),
    },
    {
      icon: item.type === 'image' ? 'image' : 'videocam',
      label: 'File Type',
      value: item.type === 'image' ? 'Image' : 'Video',
    },
  ];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <StatusBar backgroundColor="rgba(0,0,0,0.7)" barStyle="light-content" />
      
      <Animated.View 
        style={[
          styles.overlay,
          {
            opacity: opacityAnim,
          }
        ]}
      >
        <BlurView
          style={styles.blurContainer}
          blurType={theme === 'dark' ? 'dark' : 'light'}
          blurAmount={25}
        >
          <TouchableOpacity 
            style={styles.backdrop} 
            activeOpacity={1} 
            onPress={onClose}
          />
          
          <Animated.View
            style={[
              styles.modalContainer,
              {
                backgroundColor: colors.vaultSurface,
                transform: [{ scale: scaleAnim }],
              },
            ]}
          >
            {/* Header */}
            <View style={[styles.header, { borderBottomColor: colors.border }]}>
              <Icon name="info" size={24} color={colors.vaultAccent} />
              <Text style={[styles.title, { color: colors.vaultText }]}>
                File Details
              </Text>
              <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                <Icon name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Details */}
            <ScrollView style={styles.detailsContainer} showsVerticalScrollIndicator={false}>
              {details.map((detail, index) => (
                <View 
                  key={index} 
                  style={[styles.detailRow, { borderBottomColor: colors.border }]}
                >
                  <View style={[styles.detailIcon, { backgroundColor: `${colors.vaultAccent}15` }]}>
                    <Icon name={detail.icon} size={18} color={colors.vaultAccent} />
                  </View>
                  <View style={styles.detailContent}>
                    <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>
                      {detail.label}
                    </Text>
                    <Text style={[styles.detailValue, { color: colors.vaultText }]} numberOfLines={2}>
                      {detail.value}
                    </Text>
                  </View>
                </View>
              ))}
            </ScrollView>
          </Animated.View>
        </BlurView>
      </Animated.View>
    </Modal>
  );
};

const { width, height } = Dimensions.get('window');

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  blurContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  modalContainer: {
    width: Math.min(width - 48, 360),
    maxHeight: height * 0.7,
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 12,
    },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 30,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 20,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    marginLeft: 12,
    flex: 1,
  },
  closeButton: {
    padding: 4,
  },
  detailsContainer: {
    maxHeight: 400,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  detailIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  detailContent: {
    flex: 1,
  },
  detailLabel: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 4,
  },
  detailValue: {
    fontSize: 16,
    fontWeight: '400',
    lineHeight: 20,
  },
});

export default ImageDetailsModal;