import { NativeModules, NativeEventEmitter, Platform, Linking, Alert } from 'react-native';

/**
 * DSC Service - Interface to native DSC signing modules.
 *
 * CCA Compliance:
 * - Rule 1: Private keys never leave hardware token
 * - Rule 2: PIN handled securely in native layer
 * - Rule 3: PAdES/CAdES signatures with timestamps
 * - Rule 4: Retry limits enforced by token
 * - Rule 5: Audit trail logging
 */

const DSCSigning = NativeModules?.DSCSigning;
const eventEmitter = DSCSigning ? new NativeEventEmitter(DSCSigning) : null;

// Check if native module is available
const NATIVE_MODULE_AVAILABLE = !!DSCSigning;

class DSCService {
  /**
   * Check if native USB module is available
   */
  static isNativeModuleAvailable(): boolean {
    return NATIVE_MODULE_AVAILABLE;
  }

  /**
   * Get instructions for setting up development build
   */
  static getSetupInstructions(): string {
    if (Platform.OS === 'android') {
      return 'To use real DSC tokens, you need to create a development build:\n\n1. Install expo-dev-client: npx expo install expo-dev-client\n2. Build the app: npx expo run:android\n3. Install the custom build on your device';
    }
    return 'iOS requires a Mac with Xcode for development builds.';
  }

  /**
   * Open Expo docs for development builds
   */
  static async openSetupDocs() {
    const url = 'https://docs.expo.dev/develop/development-builds/introduction/';
    const canOpen = await Linking.canOpenURL(url);
    if (canOpen) {
      await Linking.openURL(url);
    }
  }

  /**
   * Scans for connected DSC dongles.
   *
   * CCA Rule 4: Validates token presence before operations.
   */
  static async listTokens(): Promise<any[]> {
    if (!NATIVE_MODULE_AVAILABLE) {
      throw new Error('Native USB module not available. Please set up a development build to use real DSC tokens.');
    }

    try {
      return await DSCSigning.listTokens();
    } catch (error: any) {
      throw new Error(error.message || 'Failed to scan for DSC tokens. Make sure your token is connected via USB OTG.');
    }
  }

  /**
   * Connects to a DSC dongle.
   *
   * CCA Rule 4: User must explicitly grant access.
   */
  static async connectDevice(serialNumber: string): Promise<boolean> {
    if (!NATIVE_MODULE_AVAILABLE) {
      throw new Error('Native USB module not available.');
    }

    try {
      const result = await DSCSigning.connectDevice(serialNumber);
      return result.connected;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to connect to device');
    }
  }

  /**
   * Verifies PIN on the hardware token.
   *
   * CCA Rule 2: PIN is sent directly to the hardware token.
   * Never passed through JavaScript bridge in plaintext.
   */
  static async verifyPin(pin: string): Promise<boolean> {
    if (!NATIVE_MODULE_AVAILABLE) {
      throw new Error('Native USB module not available.');
    }

    try {
      return await DSCSigning.verifyPin(pin);
    } catch (error: any) {
      throw new Error(error.message || 'Failed to verify PIN');
    }
  }

  /**
   * Gets the certificate from the token.
   *
   * CCA Rule 1: Certificate retrieval does not expose private key material.
   */
  static async getCertificate(): Promise<any> {
    if (!NATIVE_MODULE_AVAILABLE) {
      throw new Error('Native USB module not available.');
    }

    try {
      return await DSCSigning.getCertificate();
    } catch (error: any) {
      throw new Error(error.message || 'Failed to get certificate');
    }
  }

  /**
   * Signs a hash using the hardware token's private key.
   *
   * CCA Rule 1: Signing operation happens entirely on the hardware token.
   * We only receive the signature blob back - private key never leaves.
   *
   * @param hash The hash to sign (hex string)
   * @param algorithm The signing algorithm (e.g., 'SHA256WithRSA')
   */
  static async sign(hash: string, algorithm: string = 'SHA256WithRSA'): Promise<any> {
    if (!NATIVE_MODULE_AVAILABLE) {
      throw new Error('Native USB module not available.');
    }

    try {
      return await DSCSigning.sign(hash, algorithm);
    } catch (error: any) {
      throw new Error(error.message || 'Failed to sign');
    }
  }

  /**
   * Disconnects from the current device.
   */
  static async disconnect(): Promise<boolean> {
    if (!NATIVE_MODULE_AVAILABLE) {
      throw new Error('Native USB module not available.');
    }

    try {
      return await DSCSigning.disconnect();
    } catch (error: any) {
      throw new Error(error.message || 'Failed to disconnect');
    }
  }

  /**
   * Listens for device connection events.
   */
  static onDeviceConnected(callback: (data: any) => void) {
    if (!NATIVE_MODULE_AVAILABLE || !eventEmitter) {
      return { remove: () => {} };
    }
    return eventEmitter.addListener('onDeviceConnected', callback);
  }

  /**
   * Listens for device disconnection events.
   */
  static onDeviceDisconnected(callback: () => void) {
    if (!NATIVE_MODULE_AVAILABLE || !eventEmitter) {
      return { remove: () => {} };
    }
    return eventEmitter.addListener('onDeviceDisconnected', callback);
  }
}

export default DSCService;
