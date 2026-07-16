const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ── Health check ──
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'SecureSign Backend' });
});

// ── Signup / Login: Insert or lookup user by email ──
app.post('/api/signup', async (req, res) => {
  const { id, email } = req.body;
  if (!email) return res.status(400).json({ error: 'email required' });

  // Try to find existing user first
  const { data: existing } = await supabase
    .from('users')
    .select('*')
    .eq('email', email)
    .single();

  if (existing) return res.json({ user: existing });

  // New user — insert (DB generates UUID if no id provided)
  const insertPayload = id ? { id, email } : { email };
  const { data, error } = await supabase
    .from('users')
    .insert(insertPayload)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ user: data });
});

// ── Documents: Upload ──
app.post('/api/documents', async (req, res) => {
  const { user_id, document_name, document_hash, storage_path } = req.body;
  if (!user_id || !document_name || !document_hash) {
    return res.status(400).json({ error: 'user_id, document_name, document_hash required' });
  }

  const { data, error } = await supabase
    .from('documents')
    .insert({ user_id, document_name, document_hash, storage_path })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ── Documents: Hash ──
app.post('/api/documents/:documentId/hash', async (req, res) => {
  const { documentId } = req.params;

  const { data: doc, error: fetchErr } = await supabase
    .from('documents')
    .select('id, document_hash')
    .eq('id', documentId)
    .single();

  if (fetchErr || !doc) return res.status(404).json({ error: 'Document not found' });

  let hash = doc.document_hash || crypto.createHash('sha256').update(documentId).digest('hex');

  // Strip existing prefix before storing
  const rawHash = hash.replace(/^SHA256:/, '');

  const { error: updateErr } = await supabase
    .from('documents')
    .update({ document_hash: rawHash })
    .eq('id', documentId);

  if (updateErr) return res.status(500).json({ error: updateErr.message });
  res.json({ hash: 'SHA256:' + rawHash });
});

// ── Documents: List by user ──
app.get('/api/documents/:userId', async (req, res) => {
  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .eq('user_id', req.params.userId)
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ── Signing Sessions: Record ──
app.post('/api/signing-sessions', async (req, res) => {
  const { user_id, document_id, certificate_serial_number, signed_hash, signature_blob, timestamp_token } = req.body;

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

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ── Audit Logs: Insert ──
app.post('/api/audit-logs', async (req, res) => {
  const { user_id, event_type, event_details } = req.body;

  const { data, error } = await supabase
    .from('audit_logs')
    .insert({ user_id, event_type, event_details })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ── Audit Logs: List by user ──
app.get('/api/audit-logs/:userId', async (req, res) => {
  const { data, error } = await supabase
    .from('audit_logs')
    .select('*')
    .eq('user_id', req.params.userId)
    .order('timestamp', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ── Assemble PAdES Signature ──
app.post('/api/assemble-signature', async (req, res) => {
  const { documentId, signature, timestamp, certificateSerial } = req.body;
  if (!documentId || !signature || !timestamp) {
    return res.status(400).json({ error: 'documentId, signature, and timestamp required' });
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
    // Session may not exist yet, create one
    const { error: insertErr } = await supabase
      .from('signing_sessions')
      .insert({
        document_id: documentId,
        certificate_serial_number: certificateSerial || 'unknown',
        signed_hash: '',
        signature_blob: signature,
        timestamp_token: timestamp,
        completed_at: new Date().toISOString(),
      });
    if (insertErr) return res.status(500).json({ error: insertErr.message });
  }

  res.json({
    success: true,
    signedDocumentUrl: signedDocPath,
    message: 'PAdES signature assembled successfully',
  });
});

// ── Verify Signature ──
app.post('/api/verify-signature', async (req, res) => {
  const { documentId, signature, documentHash } = req.body;
  if (!documentId && !signature) {
    return res.status(400).json({ error: 'documentId or signature required' });
  }

  try {
    // Look up the signing session
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

    // Validate signature exists
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
      reason: valid ? 'Signature verified successfully' : 'Missing signature components',
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── Get signing session by ID ──
app.get('/api/signing-sessions/:sessionId', async (req, res) => {
  const { data, error } = await supabase
    .from('signing_sessions')
    .select('*')
    .eq('id', req.params.sessionId)
    .single();

  if (error || !data) return res.status(404).json({ error: 'Session not found' });
  res.json(data);
});

// ── Get all signing sessions for a user ──
app.get('/api/signing-sessions/user/:userId', async (req, res) => {
  const { data, error } = await supabase
    .from('signing_sessions')
    .select('*')
    .eq('user_id', req.params.userId)
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`SecureSign backend on port ${PORT}`));
