// src/screens/FoldersScreen.tsx

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
} from 'react-native';
import Icon from "@react-native-vector-icons/material-icons";
import { useTheme } from '../contexts/ThemeContext';

interface FoldersScreenProps {
  onBack?: () => void;
}

const FoldersScreen: React.FC<FoldersScreenProps> = ({ onBack }) => {
  const { colors } = useTheme();

  const folders = [
    { id: '1', name: 'Personal Photos', count: 45, icon: 'photo', color: colors.primary },
    { id: '2', name: 'Work Documents', count: 12, icon: 'work', color: colors.warning },
    { id: '3', name: 'Family Videos', count: 23, icon: 'video-library', color: colors.success },
    { id: '4', name: 'Screenshots', count: 67, icon: 'screenshot', color: colors.secondary },
  ];

  return (
    <View style={[styles.container, { backgroundColor: colors.vaultBackground }]}>
      <StatusBar backgroundColor={colors.vaultSurface} barStyle={colors.statusBarStyle} />
      
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.emptyState}>
          <Icon name="folder" size={64} color={colors.textSecondary} />
          <Text style={[styles.emptyTitle, { color: colors.vaultText }]}>
            Folders Coming Soon
          </Text>
          <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
            Organize your vault items into custom folders for better management
          </Text>
        </View>

        {/* Future folder grid will go here */}
        {/* 
        <View style={styles.foldersGrid}>
          {folders.map(folder => (
            <TouchableOpacity 
              key={folder.id} 
              style={[styles.folderCard, { backgroundColor: colors.vaultSurface }]}
            >
              <View style={[styles.folderIcon, { backgroundColor: `${folder.color}20` }]}>
                <Icon name={folder.icon} size={24} color={folder.color} />
              </View>
              <Text style={[styles.folderName, { color: colors.vaultText }]}>
                {folder.name}
              </Text>
              <Text style={[styles.folderCount, { color: colors.textSecondary }]}>
                {folder.count} items
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        */}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginTop: 16,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 16,
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 22,
  },
  foldersGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  folderCard: {
    width: '48%',
    aspectRatio: 1.2,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  folderIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  folderName: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 4,
  },
  folderCount: {
    fontSize: 12,
    textAlign: 'center',
  },
});

export default FoldersScreen;