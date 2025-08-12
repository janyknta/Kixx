// src/components/SuccessConfetti.tsx

import React, { useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  Animated,
  Dimensions,
} from 'react-native';
import { useTheme } from '../contexts/ThemeContext';

interface ConfettiPiece {
  id: number;
  x: number;
  y: number;
  size: number;
  color: string;
  rotation: Animated.Value;
  fall: Animated.Value;
  swing: Animated.Value;
  rotationSpeed: number;
  swingSpeed: number;
}

interface SuccessConfettiProps {
  visible: boolean;
  duration?: number;
  onComplete?: () => void;
}

const SuccessConfetti: React.FC<SuccessConfettiProps> = ({
  visible,
  duration = 3000,
  onComplete,
}) => {
  const { colors } = useTheme();
  const confettiPieces = useRef<ConfettiPiece[]>([]);
  const animationRef = useRef<Animated.CompositeAnimation>();

  const { width, height } = Dimensions.get('window');

  const confettiColors = [
    colors.success,
    colors.primary,
    colors.warning,
    colors.info,
    '#FF6B9D', // Pink
    '#4ECDC4', // Teal  
    '#45B7D1', // Light blue
    '#96CEB4', // Light green
    '#FFEAA7', // Light yellow
    '#DDA0DD', // Plum
  ];

  const createConfettiPiece = (id: number): ConfettiPiece => {
    const startX = Math.random() * width;
    const startY = -50;
    const size = Math.random() * 8 + 4;
    const color = confettiColors[Math.floor(Math.random() * confettiColors.length)];
    
    return {
      id,
      x: startX,
      y: startY,
      size,
      color,
      rotation: new Animated.Value(0),
      fall: new Animated.Value(startY),
      swing: new Animated.Value(startX),
      rotationSpeed: Math.random() * 4 + 2,
      swingSpeed: (Math.random() - 0.5) * 100,
    };
  };

  const generateConfetti = () => {
    const pieces: ConfettiPiece[] = [];
    for (let i = 0; i < 50; i++) {
      pieces.push(createConfettiPiece(i));
    }
    confettiPieces.current = pieces;
  };

  const startConfettiAnimation = () => {
    generateConfetti();
    
    const animations = confettiPieces.current.map((piece) => {
      return Animated.parallel([
        // Falling animation
        Animated.timing(piece.fall, {
          toValue: height + 100,
          duration: duration + Math.random() * 1000,
          useNativeDriver: true,
        }),
        // Swinging animation
        Animated.timing(piece.swing, {
          toValue: piece.x + piece.swingSpeed,
          duration: duration / 2,
          useNativeDriver: true,
        }),
        // Rotation animation
        Animated.loop(
          Animated.timing(piece.rotation, {
            toValue: piece.rotationSpeed,
            duration: 1000,
            useNativeDriver: true,
          }),
        ),
      ]);
    });

    animationRef.current = Animated.parallel(animations);
    animationRef.current.start(() => {
      if (onComplete) {
        onComplete();
      }
    });
  };

  useEffect(() => {
    if (visible) {
      startConfettiAnimation();
    } else {
      // Stop animation if visible becomes false
      if (animationRef.current) {
        animationRef.current.stop();
      }
    }

    return () => {
      if (animationRef.current) {
        animationRef.current.stop();
      }
    };
  }, [visible]);

  if (!visible) {
    return null;
  }

  return (
    <View style={styles.container} pointerEvents="none">
      {confettiPieces.current.map((piece) => (
        <Animated.View
          key={piece.id}
          style={[
            styles.confettiPiece,
            {
              backgroundColor: piece.color,
              width: piece.size,
              height: piece.size,
              transform: [
                {
                  translateY: piece.fall,
                },
                {
                  translateX: piece.swing,
                },
                {
                  rotate: piece.rotation.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0deg', '360deg'],
                  }),
                },
              ],
            },
          ]}
        />
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
    zIndex: 9998, // Lower than notifications but still high
    elevation: 40, // High but lower than notifications
  },
  confettiPiece: {
    position: 'absolute',
    borderRadius: 2,
  },
});

export default SuccessConfetti;