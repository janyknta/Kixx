// src/components/NumberPad.tsx

import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
} from 'react-native';
import Icon from "@react-native-vector-icons/material-icons";
import { COLORS } from '../utils/constants';

interface NumberPadProps {
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
  showDots?: boolean;
  onComplete?: (value: string) => void;
}

const NumberPad: React.FC<NumberPadProps> = ({ 
  value, 
  onChange, 
  maxLength = 6, 
  showDots = true,
  onComplete 
}) => {
  const handleNumberPress = (num: string) => {
    if (value.length < maxLength) {
      const newValue = value + num;
      onChange(newValue);
      if (newValue.length === maxLength && onComplete) {
        onComplete(newValue);
      }
    }
  };

  const handleBackspace = () => {
    if (value.length > 0) {
      onChange(value.slice(0, -1));
    }
  };

  const renderNumber = (num: string) => (
    <TouchableOpacity
      key={num}
      style={styles.numberButton}
      onPress={() => handleNumberPress(num)}
      activeOpacity={0.7}
    >
      <Text style={styles.numberText}>{num}</Text>
    </TouchableOpacity>
  );

  const renderPinDots = () => (
    <View style={styles.pinDotsContainer}>
      {Array.from({ length: maxLength }).map((_, index) => (
        <View
          key={index}
          style={[
            styles.pinDot,
            value.length > index && styles.pinDotFilled,
          ]}
        />
      ))}
    </View>
  );

  return (
    <View style={styles.container}>
      {showDots && renderPinDots()}
      
      <View style={styles.numberPad}>
        <View style={styles.row}>
          {renderNumber('1')}
          {renderNumber('2')}
          {renderNumber('3')}
        </View>
        
        <View style={styles.row}>
          {renderNumber('4')}
          {renderNumber('5')}
          {renderNumber('6')}
        </View>
        
        <View style={styles.row}>
          {renderNumber('7')}
          {renderNumber('8')}
          {renderNumber('9')}
        </View>
        
        <View style={styles.row}>
          <View style={styles.emptyButton} />
          {renderNumber('0')}
          <TouchableOpacity
            style={styles.backspaceButton}
            onPress={handleBackspace}
            activeOpacity={0.7}
          >
            <Icon name="backspace" size={24} color={COLORS.vaultText} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const { width } = Dimensions.get('window');
const buttonSize = (width - 80) / 3;

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  pinDotsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 40,
    paddingHorizontal: 20,
  },
  pinDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: COLORS.textSecondary,
    backgroundColor: 'transparent',
    marginHorizontal: 8,
  },
  pinDotFilled: {
    backgroundColor: COLORS.vaultAccent,
    borderColor: COLORS.vaultAccent,
  },
  numberPad: {
    alignItems: 'center',
  },
  row: {
    flexDirection: 'row',
    marginBottom: 15,
  },
  numberButton: {
    width: buttonSize,
    height: buttonSize,
    borderRadius: buttonSize / 2,
    backgroundColor: COLORS.vaultSurface,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 10,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  numberText: {
    fontSize: 24,
    fontWeight: '600',
    color: COLORS.vaultText,
  },
  backspaceButton: {
    width: buttonSize,
    height: buttonSize,
    borderRadius: buttonSize / 2,
    backgroundColor: COLORS.vaultSurface,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 10,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  emptyButton: {
    width: buttonSize,
    height: buttonSize,
    marginHorizontal: 10,
  },
});

export default NumberPad;