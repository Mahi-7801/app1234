import * as Crypto from 'expo-crypto';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL ?? 'https://securesign-backend-v2.onrender.com';

class BackendService {
  private static _currentUserId: string | null = null;

  static setCurrentUserId(id: string | null) {
    BackendService._currentUserId = id;
  }

  static getCurrentUserId(): string | null {
    return BackendService._currentUserId;
  }

  // ── Signup ──
  static async signup(email: string, _password: string, _fullName: string): Promise<{ user: any }> {
    try {
      const res = await fetch(`${BACKEND_URL}/api/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Signup failed');
      return { user: data.user };
    } catch (error) {
      if (__DEV__) {
        console.warn('Backend unavailable, mock signup:', error);
        return { user: { id: 'mock-' + Date.now(), email } };
      }
      throw error;
    }
  }

  // ── Login ──
  static async login(email: string, _password: string): Promise<{ user: any }> {
    try {
      // For demo: lookup user by email (in production use Supabase Auth)
      const res = await fetch(`${BACKEND_URL}/api/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Login failed');
      return { user: data.user };
    } catch (error) {
      if (__DEV__) {
        console.warn('Backend unavailable, mock login:', error);
        return { user: { id: 'mock-' + Date.now(), email } };
      }
      throw error;
    }
  }

  // ── Upload Document ──
  static async uploadDocument(
    fileName: string,
    _fileBase64: string,
    documentHash: string
  ): Promise<{ id: string; storagePath: string }> {
    const userId = BackendService.getCurrentUserId() || 'anonymous';
    const storagePath = `${userId}/${Date.now()}_${fileName}`;

    try {
      const res = await fetch(`${BACKEND_URL}/api/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          document_name: fileName,
          document_hash: documentHash,
          storage_path: storagePath,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      return { id: data.id, storagePath };
    } catch (error) {
      if (__DEV__) {
        console.warn('Backend unavailable, mock upload:', error);
        return { id: 'doc-mock-' + Date.now(), storagePath };
      }
      throw error;
    }
  }

  // ── Hash Document ──
  static async hashDocument(documentId: string): Promise<{ hash: string }> {
    try {
      const res = await fetch(`${BACKEND_URL}/api/documents/${documentId}/hash`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Hash failed');
      return { hash: data.hash };
    } catch (error) {
      if (__DEV__) {
        console.warn('Backend unavailable, mock hash:', error);
        return { hash: 'SHA256:mock-' + Date.now() };
      }
      throw error;
    }
  }

  // ── Fetch Documents ──
  static async fetchDocuments(): Promise<any[]> {
    const userId = BackendService.getCurrentUserId();
    if (!userId) return [];

    try {
      const res = await fetch(`${BACKEND_URL}/api/documents/${userId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      return data;
    } catch (error) {
      if (__DEV__) {
        console.warn('Backend unavailable, returning empty:', error);
        return [];
      }
      throw error;
    }
  }

  // ── Record Signing Session ──
  static async recordSigningSession(params: {
    documentId: string;
    certificateSerialNumber: string;
    signedHash: string;
    signatureBlob: string;
    timestampToken?: string;
  }): Promise<{ sessionId: string }> {
    const userId = BackendService.getCurrentUserId() || 'anonymous';

    try {
      const res = await fetch(`${BACKEND_URL}/api/signing-sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          document_id: params.documentId,
          certificate_serial_number: params.certificateSerialNumber,
          signed_hash: params.signedHash,
          signature_blob: params.signatureBlob,
          timestamp_token: params.timestampToken || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      return { sessionId: data.id };
    } catch (error) {
      if (__DEV__) {
        console.warn('Backend unavailable, mock session:', error);
        return { sessionId: 'session-mock-' + Date.now() };
      }
      throw error;
    }
  }

  // ── Log Audit ──
  static async logAudit(auditData: {
    eventType: string;
    documentId: string;
    documentHash: string;
    signature: string;
    timestamp: string;
    certificateSerial: string;
  }): Promise<{ auditId: string }> {
    const userId = BackendService.getCurrentUserId() || 'anonymous';

    try {
      const res = await fetch(`${BACKEND_URL}/api/audit-logs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          event_type: auditData.eventType,
          event_details: {
            document_id: auditData.documentId,
            document_hash: auditData.documentHash,
            signature: auditData.signature,
            timestamp: auditData.timestamp,
            certificate_serial: auditData.certificateSerial,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      return { auditId: data.id };
    } catch (error) {
      if (__DEV__) {
        console.warn('Backend unavailable, mock audit:', error);
        return { auditId: 'AUDIT-' + Math.random().toString(36).substr(2, 9).toUpperCase() };
      }
      throw error;
    }
  }

  // ── Assemble Signature (PAdES) ──
  static async assembleSignature(params: {
    documentId: string;
    signature: string;
    timestamp: string;
    certificateSerial: string;
  }): Promise<{ signedDocumentUrl: string }> {
    try {
      const res = await fetch(`${BACKEND_URL}/api/assemble-signature`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentId: params.documentId,
          signature: params.signature,
          timestamp: params.timestamp,
          certificateSerial: params.certificateSerial,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      return { signedDocumentUrl: data.signedDocumentUrl };
    } catch (error) {
      if (__DEV__) {
        console.warn('Backend unavailable, mock assemble:', error);
        return { signedDocumentUrl: `/signed-documents/${params.documentId}-signed.pdf` };
      }
      throw error;
    }
  }

  // ── Verify Signature ──
  static async verifySignature(params: {
    documentId: string;
    signature: string;
    documentHash?: string;
  }): Promise<{ valid: boolean; reason: string; certificateSerial: string; timestamp: string }> {
    try {
      const res = await fetch(`${BACKEND_URL}/api/verify-signature`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentId: params.documentId,
          signature: params.signature,
          documentHash: params.documentHash,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      return data;
    } catch (error) {
      if (__DEV__) {
        console.warn('Backend unavailable, mock verify:', error);
        return { valid: true, reason: 'Mock verification passed', certificateSerial: 'MOCK-CERT', timestamp: new Date().toISOString() };
      }
      throw error;
    }
  }

  // ── Get Signing Sessions ──
  static async getSigningSessions(userId: string): Promise<any[]> {
    try {
      const res = await fetch(`${BACKEND_URL}/api/signing-sessions/user/${userId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      return data;
    } catch (error) {
      if (__DEV__) {
        return [];
      }
      throw error;
    }
  }

  // ── Logout ──
  static logout() {
    BackendService._currentUserId = null;
  }
}

export default BackendService;
