// src/components/ImageOptionsModal.tsx

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
} from 'react-native';
import Icon from "@react-native-vector-icons/material-icons";
import { useTheme } from '../contexts/ThemeContext';
import { VaultItem } from '../types';

interface ImageOptionsModalProps {
  visible: boolean;
  item: VaultItem | null;
  onClose: () => void;
  onRestore?: () => void;
  onDelete?: () => void;
  onShowDetails: () => void;
  showRestore?: boolean;
}

const ImageOptionsModal: React.FC<ImageOptionsModalProps> = ({
  visible,
  item,
  onClose,
  onRestore,
  onDelete,
  onShowDetails,
  showRestore = false,
}) => {
  const { colors, theme } = useTheme();
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;

  useEffect(() => {
    if (visible) {
      // Show animation
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
        Animated.spring(slideAnim, {
          toValue: 0,
          damping: 20,
          stiffness: 100,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      // Hide animation
      Animated.parallel([
        Animated.timing(scaleAnim, {
          toValue: 0.8,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 50,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]);

  if (!visible || !item) {
    return null;
  }

  const options = [
    ...(showRestore ? [{
      icon: 'restore',
      label: 'Restore',
      color: colors.success,
      onPress: () => {
        onClose();
        if (onRestore) onRestore();
      }
    }] : []),
    {
      icon: 'info',
      label: 'Show Details',
      color: colors.info,
      onPress: () => {
        // Call onShowDetails first, then close modal
        onShowDetails();
        setTimeout(() => onClose(), 100);
      }
    },
    {
      icon: 'delete',
      label: 'Delete',
      color: colors.danger,
      onPress: () => {
        onClose();
        if (onDelete) onDelete();
      }
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
      <StatusBar backgroundColor="rgba(0,0,0,0.5)" barStyle="light-content" />
      
      {/* Simple overlay with uniform background */}
      <Animated.View 
        style={[
          styles.overlay,
          {
            opacity: opacityAnim,
            backgroundColor: 'rgba(0, 0, 0, 0.5)', // Simple semi-transparent background
          }
        ]}
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
              transform: [
                { scale: scaleAnim },
                { translateY: slideAnim }
              ],
            },
          ]}
        >
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <Icon name={item.type === 'image' ? 'image' : 'videocam'} size={24} color={colors.vaultAccent} />
            <Text style={[styles.title, { color: colors.vaultText }]} numberOfLines={1}>
              {item.originalName}
            </Text>
          </View>

          {/* Options */}
          <View style={styles.optionsContainer}>
            {options.map((option, index) => (
              <TouchableOpacity
                key={index}
                style={[
                  styles.option, 
                  { borderBottomColor: index < options.length - 1 ? colors.border : 'transparent' }
                ]}
                onPress={option.onPress}
                activeOpacity={0.7}
              >
                <View style={[styles.optionIcon, { backgroundColor: `${option.color}15` }]}>
                  <Icon name={option.icon} size={20} color={option.color} />
                </View>
                <Text style={[styles.optionLabel, { color: colors.vaultText }]}>
                  {option.label}
                </Text>
                <Icon name="chevron-right" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            ))}
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
};

const { width } = Dimensions.get('window');

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  modalContainer: {
    width: Math.min(width - 48, 300),
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 12,
    flex: 1,
  },
  optionsContainer: {
    paddingVertical: 8,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  optionIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  optionLabel: {
    fontSize: 16,
    fontWeight: '500',
    flex: 1,
  },
});

export default ImageOptionsModal;