import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  ScrollView,
  Linking,
  Platform,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import DSCService from '../services/DSCService';
import BackendService from '../services/BackendService';
import SessionManager from '../services/SessionManager';

/**
 * Home Screen - Main entry point for the DSC signing app.
 *
 * CCA Rule 4: Validates token presence before operations.
 */
const HomeScreen = () => {
  const navigation = useNavigation();
  const [tokens, setTokens] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [connectedDevice, setConnectedDevice] = useState<string | null>(null);
  const [nativeModuleAvailable, setNativeModuleAvailable] = useState(true);
  const [showDongleAlert, setShowDongleAlert] = useState(false);

  useEffect(() => {
    setNativeModuleAvailable(DSCService.isNativeModuleAvailable());
  }, []);

  // Only register USB listeners and scan when this screen is focused
  useFocusEffect(
    React.useCallback(() => {
      if (!DSCService.isNativeModuleAvailable()) return;

      let scanTimeout: ReturnType<typeof setTimeout>;

      // Listen for device connection events
      const connectListener = DSCService.onDeviceConnected((data: any) => {
        setConnectedDevice(data.serialNumber);
        setShowDongleAlert(false);
        Alert.alert('Device Connected', `Connected to: ${data.serialNumber}`);
      });

      const disconnectListener = DSCService.onDeviceDisconnected(() => {
        setConnectedDevice(null);
        Alert.alert('Device Disconnected', 'The DSC dongle has been disconnected.');
      });

      // Delay scan to let USB permission settle
      scanTimeout = setTimeout(() => {
        scanForTokens();
      }, 1500);

      return () => {
        clearTimeout(scanTimeout);
        connectListener?.remove();
        disconnectListener?.remove();
      };
    }, [])
  );

  const scanForTokens = async () => {
    setLoading(true);
    try {
      const foundTokens = await DSCService.listTokens();
      setTokens(foundTokens);
      if (foundTokens.length === 0) {
        setShowDongleAlert(true);
      } else {
        setShowDongleAlert(false);
      }
    } catch (error: any) {
      setTokens([]);
      setShowDongleAlert(true);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    BackendService.logout();
    SessionManager.resetSession();
    navigation.reset({ index: 0, routes: [{ name: 'Login' as never }] });
  };

  const handleConnect = async (serialNumber: string) => {
    setLoading(true);
    try {
      await DSCService.connectDevice(serialNumber);
      SessionManager.invalidateSession();
      navigation.navigate('PINEntry' as never);
    } catch (error: any) {
      Alert.alert('Connection Error', error.message || 'Failed to connect');
    } finally {
      setLoading(false);
    }
  };

  const handleRetry = () => {
    setShowDongleAlert(false);
    scanForTokens();
  };

  const handleOpenDocs = async () => {
    const url = 'https://docs.expo.dev/develop/development-builds/introduction/';
    const canOpen = await Linking.canOpenURL(url);
    if (canOpen) {
      await Linking.openURL(url);
    }
  };

  // Show setup screen when native module is not available
  if (!nativeModuleAvailable) {
    return (
      <ScrollView style={styles.container}>
        <View style={styles.setupContainer}>
          <View style={styles.logoContainer}>
            <View style={styles.logoIcon}>
              <Text style={styles.logoIconText}>🛡️</Text>
            </View>
            <Text style={styles.logoTitle}>SECURESIGN</Text>
            <Text style={styles.logoTagline}>Innovate • Integrate • Sign Secure</Text>
          </View>
          <View style={styles.setupIcon}>
            <Text style={styles.setupIconText}>🔌</Text>
          </View>
          <Text style={styles.setupTitle}>USB Device Access Required</Text>
          <Text style={styles.setupSubtitle}>
            To scan and use real DSC tokens, this app needs a development build
            with native USB module support.
          </Text>

          <View style={styles.setupCard}>
            <Text style={styles.setupCardTitle}>Why is this needed?</Text>
            <Text style={styles.setupCardText}>
              Expo Go doesn't support direct USB device access. A custom
              development build includes the native code needed to communicate
              with your DSC token.
            </Text>
          </View>

          <View style={styles.setupCard}>
            <Text style={styles.setupCardTitle}>How to set up:</Text>
            <Text style={styles.setupStep}>1. Install expo-dev-client</Text>
            <Text style={styles.setupCommand}>npx expo install expo-dev-client</Text>
            <Text style={styles.setupStep}>2. Create development build</Text>
            <Text style={styles.setupCommand}>npx expo run:android</Text>
            <Text style={styles.setupStep}>3. Install the build on your device</Text>
          </View>

          <TouchableOpacity style={styles.setupButton} onPress={handleOpenDocs}>
            <Text style={styles.setupButtonText}>Read Expo Docs</Text>
          </TouchableOpacity>

          <View style={styles.complianceInfo}>
            <Text style={styles.complianceTitle}>CCA Compliance</Text>
            <Text style={styles.complianceText}>
              This app ensures private keys never leave your hardware token.
              USB communication happens directly between the token and the app.
            </Text>
          </View>

          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <Text style={styles.logoutButtonText}>Logout</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  // Normal scan screen when native module is available
  return (
    <View style={styles.container}>
      <View style={styles.logoContainer}>
        <View style={styles.logoIcon}>
          <Text style={styles.logoIconText}>🛡️</Text>
        </View>
        <Text style={styles.logoTitle}>SECURESIGN</Text>
        <Text style={styles.logoTagline}>Innovate • Integrate • Sign Secure</Text>
      </View>
      <Text style={styles.title}>DSC Mobile Signing</Text>
      <Text style={styles.subtitle}>Connect your Type-C DSC dongle</Text>

      {loading ? (
        <ActivityIndicator size="large" color="#007AFF" style={styles.loader} />
      ) : (
        <>
          {tokens.length > 0 ? (
            <View style={styles.tokenList}>
              <Text style={styles.sectionTitle}>Detected USB Devices:</Text>
              {tokens.map((token, index) => (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.tokenCard,
                    connectedDevice === token.serialNumber && styles.connectedCard,
                  ]}
                  onPress={() => handleConnect(token.serialNumber)}
                >
                  <Text style={styles.tokenName}>{token.productName || token.deviceName || 'USB Device'}</Text>
                  <Text style={styles.tokenSerial}>Name: {token.deviceName || 'N/A'}</Text>
                  <Text style={styles.tokenSerial}>Vendor: 0x{token.vendorId?.toString(16)?.toUpperCase()} | Product: 0x{token.productId?.toString(16)?.toUpperCase()}</Text>
                  <Text style={styles.tokenSerial}>Serial: {token.serialNumber}</Text>
                  {connectedDevice === token.serialNumber && (
                    <Text style={styles.connectedText}>Connected</Text>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            <View style={styles.noDevices}>
              <Text style={styles.noDevicesIcon}>🔌</Text>
              <Text style={styles.noDevicesText}>No DSC dongles detected</Text>
              <Text style={styles.hint}>
                Please connect a Type-C DSC dongle via USB OTG cable.
              </Text>
              <Text style={styles.hint}>
                Make sure the dongle is properly plugged in and try scanning again.
              </Text>
            </View>
          )}

          <TouchableOpacity style={styles.scanButton} onPress={scanForTokens}>
            <Text style={styles.scanButtonText}>Scan Again</Text>
          </TouchableOpacity>

          {connectedDevice && (
            <TouchableOpacity
              style={styles.signButton}
              onPress={() => navigation.navigate('DocumentSelect' as never)}
            >
              <Text style={styles.signButtonText}>Select Document to Sign</Text>
            </TouchableOpacity>
          )}
        </>
      )}

      <View style={styles.featuresContainer}>
        <View style={styles.featureRow}>
          <View style={styles.featureItem}>
            <Text style={styles.featureIcon}>🔌</Text>
            <Text style={styles.featureText}>Type-C DSC{'\n'}Dongle Support</Text>
          </View>
          <View style={styles.featureItem}>
            <Text style={styles.featureIcon}>🔒</Text>
            <Text style={styles.featureText}>Secure &{'\n'}Compliant</Text>
          </View>
          <View style={styles.featureItem}>
            <Text style={styles.featureIcon}>📱</Text>
            <Text style={styles.featureText}>iOS & Android{'\n'}Compatible</Text>
          </View>
          <View style={styles.featureItem}>
            <Text style={styles.featureIcon}>✍️</Text>
            <Text style={styles.featureText}>Seamless{'\n'}Digital Signing</Text>
          </View>
        </View>
      </View>

      <View style={styles.complianceInfo}>
        <Text style={styles.complianceTitle}>CCA Compliance</Text>
        <Text style={styles.complianceText}>
          This app complies with CCA guidelines for digital signature operations.
          Private keys remain securely on your hardware token.
        </Text>
      </View>

      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Text style={styles.logoutButtonText}>Logout</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    padding: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
    marginTop: 20,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginTop: 10,
  },
  logoContainer: {
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 10,
  },
  logoIcon: {
    width: 80,
    height: 80,
    borderRadius: 20,
    backgroundColor: '#0066FF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#0066FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  logoIconText: {
    fontSize: 40,
  },
  logoTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#0066FF',
    marginTop: 12,
    letterSpacing: 2,
  },
  logoTagline: {
    fontSize: 12,
    color: '#333',
    marginTop: 4,
    letterSpacing: 1,
  },
  loader: {
    marginTop: 50,
  },
  tokenList: {
    marginTop: 30,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 15,
  },
  tokenCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  connectedCard: {
    borderColor: '#007AFF',
    borderWidth: 2,
  },
  tokenName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  tokenSerial: {
    fontSize: 14,
    color: '#666',
    marginTop: 5,
  },
  connectedText: {
    fontSize: 14,
    color: '#007AFF',
    fontWeight: '600',
    marginTop: 10,
  },
  noDevices: {
    marginTop: 30,
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
  },
  noDevicesIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  noDevicesText: {
    fontSize: 18,
    color: '#333',
    fontWeight: '600',
    marginBottom: 8,
  },
  hint: {
    fontSize: 14,
    color: '#666',
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 20,
  },
  scanButton: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    padding: 16,
    marginTop: 20,
    alignItems: 'center',
  },
  scanButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  signButton: {
    backgroundColor: '#34C759',
    borderRadius: 12,
    padding: 16,
    marginTop: 15,
    alignItems: 'center',
  },
  signButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  complianceInfo: {
    marginTop: 'auto',
    backgroundColor: '#E8F4FD',
    borderRadius: 12,
    padding: 16,
  },
  complianceTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#007AFF',
    marginBottom: 8,
  },
  complianceText: {
    fontSize: 12,
    color: '#666',
    lineHeight: 18,
  },
  featuresContainer: {
    marginTop: 15,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
  },
  featureRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  featureItem: {
    alignItems: 'center',
    width: '24%',
  },
  featureIcon: {
    fontSize: 24,
    marginBottom: 6,
  },
  featureText: {
    fontSize: 10,
    color: '#333',
    textAlign: 'center',
    lineHeight: 14,
  },
  // Setup screen styles
  setupContainer: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 30,
  },
  setupIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FFF3CD',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  setupIconText: {
    fontSize: 40,
  },
  setupTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
    marginBottom: 10,
  },
  setupSubtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    paddingHorizontal: 20,
    lineHeight: 20,
  },
  setupCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginTop: 20,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  setupCardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 10,
  },
  setupCardText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  setupStep: {
    fontSize: 14,
    color: '#333',
    marginTop: 8,
  },
  setupCommand: {
    fontSize: 12,
    fontFamily: 'monospace',
    color: '#007AFF',
    backgroundColor: '#f5f5f5',
    padding: 8,
    borderRadius: 6,
    marginTop: 6,
  },
  setupButton: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    padding: 16,
    marginTop: 24,
    width: '100%',
    alignItems: 'center',
  },
  setupButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  logoutButton: {
    backgroundColor: '#FF3B30',
    borderRadius: 12,
    padding: 14,
    marginTop: 15,
    alignItems: 'center',
  },
  logoutButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default HomeScreen;
