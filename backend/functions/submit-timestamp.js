
// backend/functions/submit-timestamp.js

const { createClient } = require('@supabase/supabase-js');

// CCA Rule 5: Initialize Supabase client for audit trail persistence
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Submits a signed hash for RFC 3161 timestamping and creates a signing session.
 *
 * CCA Rule 3: Timestamp from CCA-approved TSA (mock for hackathon).
 * CCA Rule 5: Signing session persisted in database for audit trail.
 *
 * @param {object} event - The InsForge serverless function event object.
 * @param {string} event.body.signedHash - The hash that was signed by the DSC.
 * @param {string} event.body.signature - The signature blob from the hardware token.
 * @param {string} event.body.userId - The user performing the signing operation.
 * @returns {object} - A response object containing the RFC 3161 timestamp token.
 */
exports.handler = async (event) => {
  try {
    const { signedHash, signature, userId } = JSON.parse(event.body);

    if (!signedHash) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Signed hash is required.' }),
      };
    }

    // CCA Rule 3: Placeholder for actual TSA integration
    // In production, call a real CCA-approved Time Stamping Authority
    const mockTimestampToken = `mock-rfc3161-timestamp-for-${signedHash.substring(0, 10)}-${Date.now()}`;

    // CCA Rule 5: Create a signing session record for audit trail
    const { data: session, error: sessionError } = await supabase
      .from('signing_sessions')
      .insert({
        user_id: userId || null,
        signed_hash: signedHash,
        signature_blob: signature || '',
        timestamp_token: mockTimestampToken,
        completed_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (sessionError) {
      console.error('Failed to create signing session:', sessionError);
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        timestamp: mockTimestampToken,
        certificateSerial: session?.id || 'DEMO-' + Date.now(),
      }),
    };
  } catch (error) {
    console.error('Error submitting timestamp:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Failed to submit timestamp.', details: error.message }),
    };
  }
};
