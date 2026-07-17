import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Crypto from 'expo-crypto';
import DSCService from '../services/DSCService';
import BackendService from '../services/BackendService';
import SessionManager from '../services/SessionManager';

/**
 * Document Select Screen - Choose a document to sign.
 * 
 * CCA Rule 5: Documents are tracked for audit trail.
 */
const DocumentSelectScreen = () => {
  const navigation = useNavigation<any>();
  const [documents, setDocuments] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<any>(null);
  const mountedRef = useRef(true);

  useFocusEffect(
    React.useCallback(() => {
      if (!SessionManager.isSessionValid()) {
        navigation.reset({
          index: 0,
          routes: [{ name: 'PINEntry', params: { reVerify: true } }],
        });
        return;
      }

      loadDocuments();

      return () => {
        mountedRef.current = false;
      };
    }, [])
  );

  const loadDocuments = async () => {
    setLoading(true);
    try {
      const docs = await BackendService.fetchDocuments();
      if (!mountedRef.current) return;
      setDocuments(docs.map((d: any) => ({
        id: d.id,
        name: d.document_name,
        size: '—',
        created: d.created_at?.split('T')[0] || '',
        hash: d.document_hash || 'Pending',
        uri: null,
        isLocal: false,
      })));
    } catch (error: any) {
      if (!mountedRef.current) return;
      setDocuments([]);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  const handlePickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'],
        copyToCacheDirectory: true,
      });

      if (result.canceled) return;

      const file = result.assets[0];
      const fileInfo = await FileSystem.getInfoAsync(file.uri);

      const content = await FileSystem.readAsStringAsync(file.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const hash = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        content
      );
      const documentHash = `SHA256:${hash}`;

      // Upload to InsForge storage + insert into 'documents' table
      const uploadResult = await BackendService.uploadDocument(
        file.name,
        content,
        documentHash
      );

      const doc = {
        id: uploadResult.id,
        name: file.name,
        size: fileInfo.exists ? `${(fileInfo.size / 1024).toFixed(1)} KB` : 'Unknown',
        created: new Date().toISOString().split('T')[0],
        hash: documentHash,
        uri: file.uri,
        storagePath: uploadResult.storagePath,
        isLocal: false,
      };

      setDocuments(prev => [doc, ...prev]);
      setSelectedDoc(doc);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to pick document');
    }
  };

  const handleSelectDocument = (doc: any) => {
    setSelectedDoc(doc);
  };

  const handleRemoveDocument = (docId: string) => {
    setDocuments(prev => prev.filter(d => d.id !== docId));
    if (selectedDoc?.id === docId) {
      setSelectedDoc(null);
    }
  };

  const handleSignDocument = async () => {
    if (!selectedDoc) {
      Alert.alert('No Document Selected', 'Please select a document to sign');
      return;
    }

    setLoading(true);
    try {
      let documentHash: string;

      if (selectedDoc.isLocal) {
        documentHash = selectedDoc.hash;
      } else {
        const hashResult = await BackendService.hashDocument(selectedDoc.id);
        documentHash = hashResult.hash;
      }

      navigation.navigate('SignConfirmation', {
        document: selectedDoc,
        documentHash,
      });
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to prepare document');
    } finally {
      setLoading(false);
    }
  };

  const renderDocument = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={[
        styles.docCard,
        selectedDoc?.id === item.id && styles.selectedCard,
      ]}
      onPress={() => handleSelectDocument(item)}
    >
      <View style={styles.docIcon}>
        <Text style={styles.docIconText}>📄</Text>
      </View>
      <View style={styles.docInfo}>
        <Text style={styles.docName}>{item.name}</Text>
        <Text style={styles.docMeta}>
          {item.size} • Created: {item.created}
        </Text>
        <Text style={styles.docHash} numberOfLines={1}>
          {item.hash}
        </Text>
      </View>
      {selectedDoc?.id === item.id && (
        <View style={styles.checkmark}>
          <Text style={styles.checkmarkText}>✓</Text>
        </View>
      )}
      {item.isLocal && (
        <TouchableOpacity
          style={styles.removeButton}
          onPress={() => handleRemoveDocument(item.id)}
        >
          <Text style={styles.removeButtonText}>×</Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Select Document</Text>
      <Text style={styles.subtitle}>Choose a document to sign with your DSC</Text>

      {loading ? (
        <ActivityIndicator size="large" color="#007AFF" style={styles.loader} />
      ) : (
        <>
          <TouchableOpacity style={styles.addButton} onPress={handlePickDocument}>
            <Text style={styles.addButtonText}>+ Add Document from Device</Text>
          </TouchableOpacity>

          <FlatList
            data={documents}
            renderItem={renderDocument}
            keyExtractor={(item) => item.id}
            style={styles.docList}
            contentContainerStyle={styles.docListContent}
          />

          <TouchableOpacity
            style={[
              styles.signButton,
              !selectedDoc && styles.signButtonDisabled,
            ]}
            onPress={handleSignDocument}
            disabled={!selectedDoc}
          >
            <Text style={styles.signButtonText}>Continue to Sign</Text>
          </TouchableOpacity>
        </>
      )}

      <View style={styles.complianceInfo}>
        <Text style={styles.complianceTitle}>CCA Compliance</Text>
        <Text style={styles.complianceText}>
          Document hashes are generated to ensure integrity. Local documents
          are hashed on-device. The original document is never modified during
          the signing process.
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
  loader: {
    marginTop: 50,
  },
  addButton: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    padding: 14,
    marginTop: 20,
    alignItems: 'center',
  },
  addButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  removeButton: {
    width: 28,
    height: 28,
    backgroundColor: '#FF3B30',
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  removeButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  docList: {
    flex: 1,
    marginTop: 20,
  },
  docListContent: {
    paddingBottom: 20,
  },
  docCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  selectedCard: {
    borderColor: '#007AFF',
    borderWidth: 2,
  },
  docIcon: {
    width: 50,
    height: 50,
    backgroundColor: '#E8F4FD',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  docIconText: {
    fontSize: 24,
  },
  docInfo: {
    flex: 1,
    marginLeft: 16,
  },
  docName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  docMeta: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  docHash: {
    fontSize: 12,
    color: '#999',
    marginTop: 8,
    fontFamily: 'monospace',
  },
  checkmark: {
    width: 30,
    height: 30,
    backgroundColor: '#007AFF',
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkmarkText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  signButton: {
    backgroundColor: '#34C759',
    borderRadius: 12,
    padding: 16,
    marginTop: 15,
    alignItems: 'center',
  },
  signButtonDisabled: {
    backgroundColor: '#ccc',
  },
  signButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  complianceInfo: {
    marginTop: 15,
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

export default DocumentSelectScreen;
