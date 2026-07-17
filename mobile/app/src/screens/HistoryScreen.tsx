import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import BackendService from '../services/BackendService';
import SessionManager from '../services/SessionManager';

const HistoryScreen = () => {
  const navigation = useNavigation<any>();
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    loadHistory();
    return () => { mountedRef.current = false; };
  }, []);

  const loadHistory = async () => {
    setLoading(true);
    try {
      const docs = await BackendService.fetchDocuments();
      if (!mountedRef.current) return;
      const signedDocs = docs.filter((d: any) => d.document_hash);
      setHistory(signedDocs.map((d: any) => ({
        id: d.id,
        name: d.document_name,
        hash: d.document_hash || 'N/A',
        created: d.created_at?.split('T')[0] || '',
        status: 'Signed',
        signedUrl: d.signed_document_url || null,
      })));
    } catch (error: any) {
      if (mountedRef.current) setHistory([]);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  const handleViewDocument = (item: any) => {
    // Invalidate session to require PIN re-verification
    SessionManager.invalidateSession();
    
    // Navigate to secure document screen
    navigation.navigate('SecureDocument', {
      documentUrl: item.signedUrl || '',
      documentName: item.name,
      documentType: 'Signed PDF Document',
    });
  };

  const renderItem = ({ item }: { item: any }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{item.name}</Text>
        <View style={[
          styles.statusBadge,
          item.status === 'Signed' ? styles.signedBadge : styles.pendingBadge,
        ]}>
          <Text style={styles.statusText}>{item.status}</Text>
        </View>
      </View>
      <Text style={styles.cardMeta}>Date: {item.created}</Text>
      <Text style={styles.cardHash} numberOfLines={1}>Hash: {item.hash}</Text>
      
      {item.status === 'Signed' && (
        <TouchableOpacity
          style={styles.viewButton}
          onPress={() => handleViewDocument(item)}
        >
          <Text style={styles.viewButtonText}>View Signed Document</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.headerContainer}>
        <Text style={styles.logoTitle}>SECURESIGN</Text>
        <Text style={styles.title}>Signing History</Text>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#007AFF" style={styles.loader} />
      ) : history.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>📋</Text>
          <Text style={styles.emptyText}>No documents signed yet</Text>
          <Text style={styles.emptyHint}>Signed documents will appear here</Text>
        </View>
      ) : (
        <FlatList
          data={history}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    padding: 20,
  },
  headerContainer: {
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 10,
  },
  logoTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#0066FF',
    letterSpacing: 2,
  },
  title: {
    fontSize: 22,
    fontWeight: '600',
    color: '#333',
    marginTop: 8,
  },
  loader: {
    marginTop: 50,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 18,
    color: '#666',
    marginBottom: 8,
  },
  emptyHint: {
    fontSize: 14,
    color: '#999',
  },
  listContent: {
    paddingBottom: 20,
  },
  card: {
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
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  signedBadge: {
    backgroundColor: '#D4EDDA',
  },
  pendingBadge: {
    backgroundColor: '#FFF3CD',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#333',
  },
  cardMeta: {
    fontSize: 14,
    color: '#666',
    marginTop: 8,
  },
  cardHash: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
    fontFamily: 'monospace',
  },
  viewButton: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
    padding: 10,
    marginTop: 12,
    alignItems: 'center',
  },
  viewButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});

export default HistoryScreen;
