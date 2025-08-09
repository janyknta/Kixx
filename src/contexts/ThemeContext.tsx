import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'react-native';

export type ThemeType = 'light' | 'dark';

export interface ThemeColors {
  primary: string;
  primaryDark: string;
  secondary: string;
  background: string;
  surface: string;
  card: string;
  text: string;
  textSecondary: string;
  border: string;
  success: string;
  warning: string;
  danger: string;
  accent: string;
  
  // Vault specific colors
  vaultBackground: string;
  vaultSurface: string;
  vaultText: string;
  vaultAccent: string;
  
  // Calculator specific colors
  calculatorBackground: string;
  calculatorButton: string;
  calculatorButtonText: string;
  calculatorDisplay: string;
  calculatorDisplayText: string;
  
  // Status bar style
  statusBarStyle: 'light-content' | 'dark-content';
}

export const lightTheme: ThemeColors = {
  primary: '#007AFF',
  primaryDark: '#0056CC',
  secondary: '#5856D6',
  background: '#F2F2F7',
  surface: '#FFFFFF',
  card: '#FFFFFF',
  text: '#000000',
  textSecondary: '#8E8E93',
  border: '#C6C6C8',
  success: '#34C759',
  warning: '#FF9500',
  danger: '#FF3B30',
  accent: '#007AFF',
  
  vaultBackground: '#F2F2F7',
  vaultSurface: '#FFFFFF',
  vaultText: '#000000',
  vaultAccent: '#007AFF',
  
  calculatorBackground: '#000000',
  calculatorButton: '#333333',
  calculatorButtonText: '#FFFFFF',
  calculatorDisplay: '#000000',
  calculatorDisplayText: '#FFFFFF',
  
  statusBarStyle: 'dark-content',
};

export const darkTheme: ThemeColors = {
  primary: '#0A84FF',
  primaryDark: '#0969DA',
  secondary: '#5E5CE6',
  background: '#000000',
  surface: '#1C1C1E',
  card: '#2C2C2E',
  text: '#FFFFFF',
  textSecondary: '#8E8E93',
  border: '#38383A',
  success: '#30D158',
  warning: '#FF9F0A',
  danger: '#FF453A',
  accent: '#0A84FF',
  
  vaultBackground: '#000000',
  vaultSurface: '#1C1C1E',
  vaultText: '#FFFFFF',
  vaultAccent: '#0A84FF',
  
  calculatorBackground: '#000000',
  calculatorButton: '#333333',
  calculatorButtonText: '#FFFFFF',
  calculatorDisplay: '#000000',
  calculatorDisplayText: '#FFFFFF',
  
  statusBarStyle: 'light-content',
};

interface ThemeContextType {
  theme: ThemeType;
  colors: ThemeColors;
  toggleTheme: () => void;
  setTheme: (theme: ThemeType) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

interface ThemeProviderProps {
  children: ReactNode;
}

const THEME_STORAGE_KEY = 'app_theme';

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  const [theme, setThemeState] = useState<ThemeType>('light');
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    loadTheme();
  }, []);

  useEffect(() => {
    // Update status bar when theme changes
    StatusBar.setBarStyle(colors.statusBarStyle);
  }, [theme]);

  const loadTheme = async () => {
    try {
      const savedTheme = await AsyncStorage.getItem(THEME_STORAGE_KEY);
      if (savedTheme && (savedTheme === 'light' || savedTheme === 'dark')) {
        setThemeState(savedTheme as ThemeType);
      }
    } catch (error) {
      console.error('Failed to load theme:', error);
    } finally {
      setIsLoaded(true);
    }
  };

  const saveTheme = async (newTheme: ThemeType) => {
    try {
      await AsyncStorage.setItem(THEME_STORAGE_KEY, newTheme);
    } catch (error) {
      console.error('Failed to save theme:', error);
    }
  };

  const setTheme = (newTheme: ThemeType) => {
    setThemeState(newTheme);
    saveTheme(newTheme);
  };

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
  };

  const colors = theme === 'light' ? lightTheme : darkTheme;

  // Don't render children until theme is loaded
  if (!isLoaded) {
    return null;
  }

  return (
    <ThemeContext.Provider value={{ theme, colors, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};