import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Dimensions,
} from 'react-native';

const { width, height } = Dimensions.get('window');

const SplashScreen = ({ onAnimationEnd }: { onAnimationEnd: () => void }) => {
  const shieldScale = useRef(new Animated.Value(0)).current;
  const titleOpacity = useRef(new Animated.Value(0)).current;
  const subtitleOpacity = useRef(new Animated.Value(0)).current;
  const taglineOpacity = useRef(new Animated.Value(0)).current;
  const featuresOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      // Shield appears with bounce
      Animated.spring(shieldScale, {
        toValue: 1,
        friction: 4,
        tension: 40,
        useNativeDriver: true,
      }),
      // Title fades in
      Animated.timing(titleOpacity, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
      // Subtitle fades in
      Animated.timing(subtitleOpacity, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
      // Tagline fades in
      Animated.timing(taglineOpacity, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
      // Features fade in
      Animated.timing(featuresOpacity, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setTimeout(onAnimationEnd, 800);
    });
  }, []);

  return (
    <View style={styles.container}>
      {/* Background gradient effect */}
      <View style={styles.bgCircle1} />
      <View style={styles.bgCircle2} />

      {/* Shield Logo */}
      <Animated.View style={[styles.shieldContainer, { transform: [{ scale: shieldScale }] }]}>
        <View style={styles.shield}>
          <Text style={styles.shieldIcon}>🛡️</Text>
          <View style={styles.shieldCheckmark}>
            <Text style={styles.checkmarkText}>✓</Text>
          </View>
        </View>
      </Animated.View>

      {/* Title */}
      <Animated.View style={[styles.titleContainer, { opacity: titleOpacity }]}>
        <Text style={styles.secureText}>SECURE</Text>
        <Text style={styles.signText}>SIGN</Text>
      </Animated.View>

      {/* Subtitle */}
      <Animated.Text style={[styles.subtitle, { opacity: subtitleOpacity }]}>
        Innovation Challenge
      </Animated.Text>

      {/* Tagline */}
      <Animated.View style={[styles.taglineContainer, { opacity: taglineOpacity }]}>
        <Text style={styles.taglineDot}>•</Text>
        <Text style={styles.taglineText}>INNOVATE</Text>
        <Text style={styles.taglineDot}>•</Text>
        <Text style={styles.taglineText}>INTEGRATE</Text>
        <Text style={styles.taglineDot}>•</Text>
        <Text style={styles.taglineText}>SIGN SECURE</Text>
        <Text style={styles.taglineDot}>•</Text>
      </Animated.View>

      {/* Features */}
      <Animated.View style={[styles.featuresContainer, { opacity: featuresOpacity }]}>
        <View style={styles.featureItem}>
          <Text style={styles.featureIcon}>🔌</Text>
          <Text style={styles.featureText}>Type-C DSC{'\n'}Dongle</Text>
        </View>
        <View style={styles.featureItem}>
          <Text style={styles.featureIcon}>🔒</Text>
          <Text style={styles.featureText}>CCA{'\n'}Compliant</Text>
        </View>
        <View style={styles.featureItem}>
          <Text style={styles.featureIcon}>📱</Text>
          <Text style={styles.featureText}>iOS &{'\n'}Android</Text>
        </View>
        <View style={styles.featureItem}>
          <Text style={styles.featureIcon}>✍️</Text>
          <Text style={styles.featureText}>Digital{'\n'}Signing</Text>
        </View>
      </Animated.View>

      {/* Loading indicator */}
      <Animated.View style={[styles.loadingContainer, { opacity: featuresOpacity }]}>
        <View style={styles.loadingBar}>
          <View style={styles.loadingProgress} />
        </View>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A1628',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bgCircle1: {
    position: 'absolute',
    width: width * 1.5,
    height: width * 1.5,
    borderRadius: width * 0.75,
    backgroundColor: 'rgba(0, 102, 255, 0.08)',
    top: -width * 0.3,
    right: -width * 0.5,
  },
  bgCircle2: {
    position: 'absolute',
    width: width * 1.2,
    height: width * 1.2,
    borderRadius: width * 0.6,
    backgroundColor: 'rgba(0, 200, 150, 0.06)',
    bottom: -width * 0.3,
    left: -width * 0.4,
  },
  shieldContainer: {
    marginBottom: 20,
  },
  shield: {
    width: 120,
    height: 140,
    backgroundColor: '#0066FF',
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#0066FF',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 10,
  },
  shieldIcon: {
    fontSize: 60,
  },
  shieldCheckmark: {
    position: 'absolute',
    bottom: -10,
    right: -10,
    width: 36,
    height: 36,
    backgroundColor: '#00C896',
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#0A1628',
  },
  checkmarkText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  secureText: {
    fontSize: 42,
    fontWeight: 'bold',
    color: '#FFFFFF',
    letterSpacing: 3,
  },
  signText: {
    fontSize: 42,
    fontWeight: 'bold',
    color: '#00C896',
    letterSpacing: 3,
  },
  subtitle: {
    fontSize: 18,
    color: '#8899AA',
    marginTop: 8,
    letterSpacing: 4,
    textTransform: 'uppercase',
  },
  taglineContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 30,
    paddingHorizontal: 20,
  },
  taglineDot: {
    color: '#0066FF',
    fontSize: 10,
    marginHorizontal: 8,
  },
  taglineText: {
    color: '#FFFFFF',
    fontSize: 12,
    letterSpacing: 2,
    fontWeight: '600',
  },
  featuresContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: width * 0.9,
    marginTop: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 16,
    padding: 20,
  },
  featureItem: {
    alignItems: 'center',
  },
  featureIcon: {
    fontSize: 28,
    marginBottom: 8,
  },
  featureText: {
    fontSize: 11,
    color: '#8899AA',
    textAlign: 'center',
    lineHeight: 16,
  },
  loadingContainer: {
    position: 'absolute',
    bottom: 60,
    width: width * 0.6,
  },
  loadingBar: {
    height: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  loadingProgress: {
    height: '100%',
    width: '60%',
    backgroundColor: '#0066FF',
    borderRadius: 2,
  },
});

export default SplashScreen;
