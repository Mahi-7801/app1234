import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import DSCService from '../services/DSCService';
import BackendService from '../services/BackendService';
import SessionManager from '../services/SessionManager';

/**
 * Sign Confirmation Screen - Final step before signing.
 * 
 * Shows document details and asks for confirmation before signing.
 * 
 * CCA Rule 1: Signing happens on hardware token.
 * CCA Rule 3: PAdES/CAdES signature with timestamp.
 * CCA Rule 5: Audit trail logged.
 */
const SignConfirmationScreen = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const { document, documentHash } = route.params as {
    document: any;
    documentHash: string;
  };

  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'confirm' | 'signing' | 'timestamping' | 'complete'>('confirm');
  const [signatureResult, setSignatureResult] = useState<any>(null);

  // Check session validity when screen comes into focus
  useFocusEffect(
    React.useCallback(() => {
      // Check if session is still valid
      if (!SessionManager.isSessionValid()) {
        // Session expired — re-enter PIN instead of resetting to MainTabs
        navigation.navigate('PINEntry', { reVerify: true });
        return;
      }
    }, [])
  );

  const handleSign = async () => {
    setLoading(true);
    setStep('signing');

    try {
      // CCA Rule 1: Sign the hash using hardware token
      const signature = await DSCService.sign(documentHash, 'SHA256WithRSA');
      
      setStep('timestamping');
      
      // CCA Rule 3: Submit for RFC 3161 timestamp
      const timestampResult = await BackendService.submitTimestamp(
        signature.signature,
        documentHash
      );

      setStep('complete');
      
      setSignatureResult({
        signature: signature.signature,
        timestamp: timestampResult.timestamp,
        certificateSerial: timestampResult.certificateSerial,
      });

    } catch (error: any) {
      Alert.alert('Signing Error', error.message || 'Failed to sign document');
      setStep('confirm');
    } finally {
      setLoading(false);
    }
  };

  const [auditId, setAuditId] = useState<string | null>(null);
  const [assembleResult, setAssembleResult] = useState<any>(null);
  const [verificationResult, setVerificationResult] = useState<any>(null);
  const [finishLoading, setFinishLoading] = useState(false);

  const handleFinish = async () => {
    if (!signatureResult) return;

    setFinishLoading(true);
    try {
      const sessionResult = await BackendService.recordSigningSession({
        documentId: document.id,
        certificateSerialNumber: signatureResult.certificateSerial,
        signedHash: documentHash,
        signatureBlob: signatureResult.signature,
        timestampToken: signatureResult.timestamp,
      });

      const assembled = await BackendService.assembleSignature({
        documentId: document.id,
        signature: signatureResult.signature,
        timestamp: signatureResult.timestamp,
        certificateSerial: signatureResult.certificateSerial,
      });
      setAssembleResult(assembled);

      const auditResult = await BackendService.logAudit({
        eventType: 'document_signed',
        documentId: document.id,
        documentHash: documentHash,
        signature: signatureResult.signature,
        timestamp: signatureResult.timestamp,
        certificateSerial: signatureResult.certificateSerial,
      });
      setAuditId(auditResult.auditId);

      const verified = await BackendService.verifySignature({
        documentId: document.id,
        signature: signatureResult.signature,
        documentHash,
      });
      setVerificationResult(verified);

    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to complete signing process');
    } finally {
      setFinishLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Confirm Signature</Text>

      {step === 'confirm' && (
        <>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Document Details</Text>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Name:</Text>
              <Text style={styles.detailValue}>{document.name}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Size:</Text>
              <Text style={styles.detailValue}>{document.size}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Hash:</Text>
              <Text style={styles.detailValue} numberOfLines={2}>
                {documentHash}
              </Text>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Signing Process</Text>
            <Text style={styles.processText}>
              1. Your document hash will be sent to your DSC token
            </Text>
            <Text style={styles.processText}>
              2. The token will sign the hash (private key never leaves)
            </Text>
            <Text style={styles.processText}>
              3. The signature will be timestamped via RFC 3161
            </Text>
            <Text style={styles.processText}>
              4. A PAdES/CAdES signature will be created
            </Text>
          </View>

          <TouchableOpacity style={styles.signButton} onPress={handleSign}>
            <Text style={styles.signButtonText}>Sign Document</Text>
          </TouchableOpacity>
        </>
      )}

      {step === 'signing' && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Signing with your DSC token...</Text>
          <Text style={styles.loadingHint}>
            Please wait while your hardware token signs the document hash.
          </Text>
        </View>
      )}

      {step === 'timestamping' && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FF9500" />
          <Text style={styles.loadingText}>Getting RFC 3161 timestamp...</Text>
          <Text style={styles.loadingHint}>
            Submitting signature to Time Stamping Authority.
          </Text>
        </View>
      )}

      {step === 'complete' && signatureResult && (
        <>
          <View style={styles.successContainer}>
            <Text style={styles.successIcon}>✓</Text>
            <Text style={styles.successTitle}>Signing Complete!</Text>
          </View>

          {verificationResult && (
            <View style={[
              styles.section,
              verificationResult.valid ? styles.verifiedSection : styles.failedSection,
            ]}>
              <Text style={styles.sectionTitle}>
                {verificationResult.valid ? '✓ Signature Verified' : '✗ Verification Failed'}
              </Text>
              <Text style={styles.detailValue}>{verificationResult.reason}</Text>
            </View>
          )}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Signature Details</Text>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Status:</Text>
              <Text style={styles.successText}>Signed Successfully</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Algorithm:</Text>
              <Text style={styles.detailValue}>SHA256WithRSA</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Certificate:</Text>
              <Text style={styles.detailValue}>
                Serial: {signatureResult.certificateSerial}
              </Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Timestamp:</Text>
              <Text style={styles.detailValue} numberOfLines={2}>
                {signatureResult.timestamp}
              </Text>
            </View>
            {auditId && (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Audit Ref:</Text>
                <Text style={styles.detailValue} selectable>
                  {auditId}
                </Text>
              </View>
            )}
            {assembleResult && (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Signed PDF:</Text>
                <Text style={styles.detailValue} numberOfLines={1}>
                  {assembleResult.signedDocumentUrl}
                </Text>
              </View>
            )}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Signature (Hex)</Text>
            <Text style={styles.signatureHex} selectable>
              {signatureResult.signature}
            </Text>
          </View>

          {!auditId ? (
            <TouchableOpacity style={styles.finishButton} onPress={handleFinish} disabled={finishLoading}>
              <Text style={styles.finishButtonText}>
                {finishLoading ? 'Processing...' : 'Finish & Log Audit'}
              </Text>
            </TouchableOpacity>
          ) : (
            <>
              <TouchableOpacity
                style={styles.finishButton}
                onPress={() => {
                  if (!assembleResult?.signedDocumentUrl) {
                    Alert.alert('Error', 'Signed document URL not available. Please try again.');
                    return;
                  }
                  // Navigate to secure document screen for PIN verification before download
                  navigation.navigate('SecureDocument', {
                    documentUrl: assembleResult.signedDocumentUrl,
                    documentName: document.name || 'Signed Document',
                    documentType: 'PDF Document',
                  });
                }}
              >
                <Text style={styles.finishButtonText}>Download Signed PDF</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.finishButton, { backgroundColor: '#007AFF', marginTop: 12 }]}
                onPress={() => navigation.navigate('MainTabs')}
              >
                <Text style={styles.finishButtonText}>Done</Text>
              </TouchableOpacity>
            </>
          )}
        </>
      )}

      <View style={styles.complianceInfo}>
        <Text style={styles.complianceTitle}>CCA Compliance</Text>
        <Text style={styles.complianceText}>
          This signing process complies with CCA guidelines:
          {'\n'}• Private key never leaves hardware token (Rule 1)
          {'\n'}• PIN verified on token (Rule 2)
          {'\n'}• PAdES/CAdES with RFC 3161 timestamp (Rule 3)
          {'\n'}• Token enforces retry limits (Rule 4)
          {'\n'}• Full audit trail maintained (Rule 5)
        </Text>
      </View>
    </ScrollView>
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
    marginBottom: 30,
  },
  section: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  detailLabel: {
    width: 100,
    fontSize: 14,
    color: '#666',
  },
  detailValue: {
    flex: 1,
    fontSize: 14,
    color: '#333',
  },
  processText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
    lineHeight: 20,
  },
  signButton: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    padding: 16,
    marginTop: 20,
    alignItems: 'center',
  },
  signButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  loadingContainer: {
    alignItems: 'center',
    marginTop: 50,
  },
  loadingText: {
    fontSize: 18,
    color: '#333',
    marginTop: 20,
  },
  loadingHint: {
    fontSize: 14,
    color: '#666',
    marginTop: 10,
    textAlign: 'center',
  },
  successContainer: {
    alignItems: 'center',
    marginBottom: 30,
  },
  successIcon: {
    fontSize: 60,
    color: '#34C759',
  },
  successTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#34C759',
    marginTop: 10,
  },
  successText: {
    fontSize: 14,
    color: '#34C759',
    fontWeight: '600',
  },
  verifiedSection: {
    borderColor: '#34C759',
    borderWidth: 2,
    backgroundColor: '#f0fff4',
  },
  failedSection: {
    borderColor: '#FF3B30',
    borderWidth: 2,
    backgroundColor: '#fff0f0',
  },
  signatureHex: {
    fontSize: 12,
    fontFamily: 'monospace',
    color: '#666',
    lineHeight: 18,
    backgroundColor: '#f5f5f5',
    padding: 12,
    borderRadius: 8,
  },
  finishButton: {
    backgroundColor: '#34C759',
    borderRadius: 12,
    padding: 16,
    marginTop: 20,
    alignItems: 'center',
  },
  finishButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  complianceInfo: {
    marginTop: 20,
    marginBottom: 40,
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
});

export default SignConfirmationScreen;
