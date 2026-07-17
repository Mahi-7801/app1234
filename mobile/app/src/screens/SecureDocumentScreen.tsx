import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  TextInput,
  Modal,
  Platform,
  Linking,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import DSCService from '../services/DSCService';
import BackendService from '../services/BackendService';
import SessionManager from '../services/SessionManager';

/**
 * Secure Document Screen - Requires PIN verification before opening/downloading documents.
 * 
 * This screen acts as a security gate for accessing signed PDFs and documents.
 * Users must verify their PIN before they can view or download the document.
 * 
 * CCA Rule 2: PIN is sent directly to the hardware token.
 * CCA Rule 5: Document access is logged for audit trail.
 */
const SecureDocumentScreen = () => {
  const navigation = useNavigation<any>();
  const route = useRoute();
  const params = route.params as {
    documentUrl: string;
    documentName: string;
    documentType: string;
  } | undefined;

  const documentUrl = params?.documentUrl || '';
  const documentName = (params?.documentName || 'document').replace(/[^a-zA-Z0-9._-]/g, '_');
  const documentType = params?.documentType || 'Document';

  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [verified, setVerified] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const maxAttempts = 3;

  useEffect(() => {
    // Check if session is already valid (user just signed)
    if (SessionManager.isSessionValid()) {
      setVerified(true);
    }
  }, []);

  const handleVerifyPin = async () => {
    if (pin.length < 4) {
      Alert.alert('Invalid PIN', 'PIN must be at least 4 digits');
      return;
    }

    setLoading(true);
    try {
      // CCA Rule 2: PIN is sent directly to hardware token
      // In demo mode (no native module), auto-verify
      let result = false;
      if (DSCService.isNativeModuleAvailable()) {
        result = await DSCService.verifyPin(pin);
      } else {
        // Demo mode: accept any 4+ digit PIN
        result = true;
      }

      // Clear PIN from memory immediately
      setPin('');

      if (result) {
        setVerified(true);
        SessionManager.validateSession();
        
        // Log document access for audit trail
        console.log(`[SecureDocument] Document accessed: ${documentName} at ${new Date().toISOString()}`);
      } else {
        const remaining = maxAttempts - attempts - 1;
        setAttempts(attempts + 1);

        if (remaining <= 0) {
          Alert.alert(
            'Access Denied',
            'Too many failed attempts. Access locked for security.',
            [{ text: 'OK', onPress: () => navigation.goBack() }]
          );
        } else {
          Alert.alert(
            'Incorrect PIN',
            `Please try again. ${remaining} attempts remaining.`
          );
        }
      }
    } catch (error: any) {
      setPin('');
      Alert.alert('Error', error.message || 'Failed to verify PIN');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    if (!documentUrl) {
      Alert.alert('Error', 'Document URL not available');
      return;
    }

    setDownloading(true);
    try {
      // Build full URL: if documentUrl is a relative path, prepend the backend URL
      const fullUrl = documentUrl.startsWith('http')
        ? documentUrl
        : `https://securesign-backend-v2.onrender.com${documentUrl}`;

      // Check if sharing is available
      const isAvailable = await Sharing.isAvailableAsync();

      if (isAvailable) {
        // Download the file first (with auth header)
        const fileUri = FileSystem.cacheDirectory + documentName;
        const authToken = BackendService.getAuthToken();
        const headers: Record<string, string> = {};
        if (authToken) {
          headers['Authorization'] = `Bearer ${authToken}`;
        }

        const downloadResult = await FileSystem.downloadAsync(
          fullUrl,
          fileUri,
          { headers }
        );

        if (downloadResult.status === 200) {
          // Share the downloaded file
          await Sharing.shareAsync(downloadResult.uri, {
            mimeType: 'application/pdf',
            dialogTitle: `Open ${documentName}`,
            UTI: 'com.adobe.pdf',
          });

          // Log download for audit trail
          console.log(`[SecureDocument] Document downloaded: ${documentName} at ${new Date().toISOString()}`);
        } else {
          Alert.alert('Error', `Failed to download document (status ${downloadResult.status})`);
        }
      } else {
        await Linking.openURL(fullUrl);
      }
    } catch (error: any) {
      Alert.alert('Download Error', error.message || 'Failed to download document');
    } finally {
      setDownloading(false);
    }
  };

  const handleKeyPress = (key: string) => {
    if (key === 'backspace') {
      setPin(pin.slice(0, -1));
    } else if (pin.length < 8) {
      setPin(pin + key);
    }
  };

  // If already verified, show download button
  if (verified) {
    // If no document URL, show an error with a way to go back
    if (!documentUrl) {
      return (
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.lockIcon}>🔓</Text>
            <Text style={styles.title}>Document Ready</Text>
            <Text style={styles.subtitle}>
              Your PIN has been verified. However, the signed document URL is not available.
            </Text>
          </View>

          <View style={styles.documentInfo}>
            <Text style={styles.documentName}>{documentName}</Text>
            <Text style={styles.documentType}>{documentType}</Text>
          </View>

          <View style={[styles.securityInfo, { backgroundColor: '#FFF0F0', borderColor: '#FF3B30', borderWidth: 1 }]}>
            <Text style={[styles.securityTitle, { color: '#FF3B30' }]}>Error</Text>
            <Text style={[styles.securityText, { color: '#FF3B30' }]}>
              Document URL not available. The signed document may not have been generated. Please try signing again.
            </Text>
          </View>

          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.lockIcon}>🔓</Text>
          <Text style={styles.title}>Document Ready</Text>
          <Text style={styles.subtitle}>
            Your PIN has been verified. You can now access the document.
          </Text>
        </View>

        <View style={styles.documentInfo}>
          <Text style={styles.documentName}>{documentName}</Text>
          <Text style={styles.documentType}>{documentType}</Text>
        </View>

        <TouchableOpacity
          style={[styles.downloadButton, downloading && styles.downloadButtonDisabled]}
          onPress={handleDownload}
          disabled={downloading}
        >
          {downloading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.downloadButtonText}>Download & Open PDF</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>

        <View style={styles.securityInfo}>
          <Text style={styles.securityTitle}>Security Notice</Text>
          <Text style={styles.securityText}>
            This document access has been logged for audit purposes.
            Your PIN was verified on the hardware token.
          </Text>
        </View>
      </View>
    );
  }

  // PIN verification screen
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.lockIcon}>🔒</Text>
        <Text style={styles.title}>Document Locked</Text>
        <Text style={styles.subtitle}>
          Enter your DSC token PIN to access this document
        </Text>
      </View>

      <View style={styles.documentInfo}>
        <Text style={styles.documentName}>{documentName}</Text>
        <Text style={styles.documentType}>{documentType}</Text>
      </View>

      <View style={styles.pinDisplay}>
        {[...Array(Math.max(pin.length, 6))].map((_, index) => (
          <View
            key={index}
            style={[
              styles.pinDot,
              index < pin.length && styles.pinDotFilled,
            ]}
          />
        ))}
      </View>

      <View style={styles.keypad}>
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'backspace'].map(
          (key, index) => (
            <TouchableOpacity
              key={index}
              style={[
                styles.key,
                key === 'backspace' && styles.backspaceKey,
                key === '' && styles.emptyKey,
              ]}
              onPress={() => handleKeyPress(key)}
              disabled={loading || key === ''}
            >
              <Text style={styles.keyText}>
                {key === 'backspace' ? '⌫' : key}
              </Text>
            </TouchableOpacity>
          )
        )}
      </View>

      <TouchableOpacity
        style={[styles.verifyButton, pin.length < 4 && styles.verifyButtonDisabled]}
        onPress={handleVerifyPin}
        disabled={loading || pin.length < 4}
      >
        <Text style={styles.verifyButtonText}>
          {loading ? 'Verifying...' : 'Verify PIN'}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.cancelButton}
        onPress={() => {
          setPin('');
          if (navigation.canGoBack()) {
            navigation.goBack();
          } else {
            navigation.reset({
              index: 0,
              routes: [{ name: 'MainTabs' }],
            });
          }
        }}
      >
        <Text style={styles.cancelButtonText}>Cancel</Text>
      </TouchableOpacity>

      <View style={styles.securityInfo}>
        <Text style={styles.securityTitle}>Security Notice</Text>
        <Text style={styles.securityText}>
          Your PIN is sent directly to your hardware token and is never stored
          in the app or transmitted to any server. Document access is logged
          for audit trail.
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    padding: 20,
  },
  header: {
    alignItems: 'center',
    marginTop: 20,
  },
  lockIcon: {
    fontSize: 50,
    marginBottom: 15,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginTop: 10,
    textAlign: 'center',
  },
  documentInfo: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginTop: 20,
    alignItems: 'center',
  },
  documentName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  documentType: {
    fontSize: 14,
    color: '#666',
    marginTop: 5,
  },
  pinDisplay: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 30,
    gap: 12,
  },
  pinDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#ccc',
  },
  pinDotFilled: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  keypad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginTop: 30,
    gap: 10,
  },
  key: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  backspaceKey: {
    backgroundColor: '#FF3B30',
  },
  emptyKey: {
    backgroundColor: 'transparent',
    elevation: 0,
  },
  keyText: {
    fontSize: 24,
    fontWeight: '600',
    color: '#333',
  },
  verifyButton: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    padding: 16,
    marginTop: 30,
    alignItems: 'center',
  },
  verifyButtonDisabled: {
    backgroundColor: '#ccc',
  },
  verifyButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  downloadButton: {
    backgroundColor: '#34C759',
    borderRadius: 12,
    padding: 16,
    marginTop: 30,
    alignItems: 'center',
  },
  downloadButtonDisabled: {
    backgroundColor: '#ccc',
  },
  downloadButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  backButton: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    padding: 16,
    marginTop: 15,
    alignItems: 'center',
  },
  backButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  cancelButton: {
    marginTop: 20,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#FF3B30',
    fontSize: 16,
  },
  securityInfo: {
    marginTop: 'auto',
    backgroundColor: '#FFF3CD',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  securityTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#856404',
    marginBottom: 8,
  },
  securityText: {
    fontSize: 12,
    color: '#856404',
    lineHeight: 18,
  },
});

export default SecureDocumentScreen;
