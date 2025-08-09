// src/components/CalculatorScreen.tsx

import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  StatusBar,
} from 'react-native';
import { COLORS } from '../utils/constants';

interface CalculatorScreenProps {
  onPinEntered: (pin: string) => Promise<boolean>;
}

const CalculatorScreen: React.FC<CalculatorScreenProps> = ({ onPinEntered }) => {
  const [display, setDisplay] = useState('0');
  const [previousValue, setPreviousValue] = useState<string | null>(null);
  const [operation, setOperation] = useState<string | null>(null);
  const [waitingForNewValue, setWaitingForNewValue] = useState(false);

  const inputNumber = (num: string) => {
    if (waitingForNewValue) {
      setDisplay(num);
      setWaitingForNewValue(false);
    } else {
      setDisplay(display === '0' ? num : display + num);
    }
  };

  const inputOperation = (nextOperation: string) => {
    const inputValue = parseFloat(display);

    if (previousValue === null) {
      setPreviousValue(display);
    } else if (operation) {
      const currentValue = previousValue || '0';
      const newValue = calculate(parseFloat(currentValue), inputValue, operation);

      setDisplay(String(newValue));
      setPreviousValue(String(newValue));
    }

    setWaitingForNewValue(true);
    setOperation(nextOperation);
  };

  const calculate = (firstValue: number, secondValue: number, operation: string): number => {
    switch (operation) {
      case '+':
        return firstValue + secondValue;
      case '-':
        return firstValue - secondValue;
      case '×':
        return firstValue * secondValue;
      case '÷':
        return secondValue !== 0 ? firstValue / secondValue : 0;
      default:
        return secondValue;
    }
  };

  const performCalculation = async () => {
    // Check if current display could be a PIN (numeric and reasonable length)
    const currentDisplay = display;
    if (currentDisplay.length >= 4 && currentDisplay.length <= 8 && /^\d+$/.test(currentDisplay)) {
      const success = await onPinEntered(currentDisplay);
      if (success) {
        return; // Don't continue with calculation if PIN was correct
      }
    }

    const inputValue = parseFloat(display);

    if (previousValue !== null && operation) {
      const currentValue = parseFloat(previousValue);
      const newValue = calculate(currentValue, inputValue, operation);

      setDisplay(String(newValue));
      setPreviousValue(null);
      setOperation(null);
      setWaitingForNewValue(true);
    }
  };

  const clear = () => {
    setDisplay('0');
    setPreviousValue(null);
    setOperation(null);
    setWaitingForNewValue(false);
  };

  const clearEntry = () => {
    setDisplay('0');
  };

  const toggleSign = () => {
    const value = parseFloat(display);
    setDisplay(String(value * -1));
  };

  const percentage = () => {
    const value = parseFloat(display);
    setDisplay(String(value / 100));
  };

  const renderButton = (
    text: string,
    onPress: () => void,
    style?: object,
    textStyle?: object
  ) => (
    <TouchableOpacity
      style={[styles.button, style]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={[styles.buttonText, textStyle]}>{text}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <StatusBar backgroundColor="#000" barStyle="light-content" />
      
      {/* Display */}
      <View style={styles.displayContainer}>
        <Text style={styles.displayText} numberOfLines={1} adjustsFontSizeToFit>
          {display}
        </Text>
      </View>

      {/* Button Grid */}
      <View style={styles.buttonContainer}>
        {/* Row 1 */}
        <View style={styles.row}>
          {renderButton('C', clear, styles.functionButton, styles.functionText)}
          {renderButton('CE', clearEntry, styles.functionButton, styles.functionText)}
          {renderButton('%', percentage, styles.functionButton, styles.functionText)}
          {renderButton('÷', () => inputOperation('÷'), styles.operatorButton, styles.operatorText)}
        </View>

        {/* Row 2 */}
        <View style={styles.row}>
          {renderButton('7', () => inputNumber('7'), styles.numberButton)}
          {renderButton('8', () => inputNumber('8'), styles.numberButton)}
          {renderButton('9', () => inputNumber('9'), styles.numberButton)}
          {renderButton('×', () => inputOperation('×'), styles.operatorButton, styles.operatorText)}
        </View>

        {/* Row 3 */}
        <View style={styles.row}>
          {renderButton('4', () => inputNumber('4'), styles.numberButton)}
          {renderButton('5', () => inputNumber('5'), styles.numberButton)}
          {renderButton('6', () => inputNumber('6'), styles.numberButton)}
          {renderButton('-', () => inputOperation('-'), styles.operatorButton, styles.operatorText)}
        </View>

        {/* Row 4 */}
        <View style={styles.row}>
          {renderButton('1', () => inputNumber('1'), styles.numberButton)}
          {renderButton('2', () => inputNumber('2'), styles.numberButton)}
          {renderButton('3', () => inputNumber('3'), styles.numberButton)}
          {renderButton('+', () => inputOperation('+'), styles.operatorButton, styles.operatorText)}
        </View>

        {/* Row 5 */}
        <View style={styles.row}>
          {renderButton('±', toggleSign, styles.functionButton, styles.functionText)}
          {renderButton('0', () => inputNumber('0'), styles.numberButton)}
          {renderButton('.', () => inputNumber('.'), styles.numberButton)}
          {renderButton('=', performCalculation, styles.equalsButton, styles.operatorText)}
        </View>
      </View>
    </View>
  );
};

const { width, height } = Dimensions.get('window');
const buttonWidth = (width - 50) / 4;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  displayContainer: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
    paddingHorizontal: 20,
    paddingBottom: 20,
    backgroundColor: '#000',
  },
  displayText: {
    fontSize: 60,
    color: '#fff',
    fontWeight: '300',
    textAlign: 'right',
  },
  buttonContainer: {
    paddingHorizontal: 10,
    paddingBottom: 20,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  button: {
    width: buttonWidth,
    height: buttonWidth,
    borderRadius: buttonWidth / 2,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  buttonText: {
    fontSize: 24,
    fontWeight: '400',
  },
  numberButton: {
    backgroundColor: '#333',
  },
  functionButton: {
    backgroundColor: '#a6a6a6',
  },
  functionText: {
    color: '#000',
    fontSize: 20,
    fontWeight: '600',
  },
  operatorButton: {
    backgroundColor: '#ff9500',
  },
  operatorText: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '300',
  },
  equalsButton: {
    backgroundColor: '#ff9500',
  },
});

export default CalculatorScreen;