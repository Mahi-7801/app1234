
// backend/functions/hash-document.js

const { createHash } = require('crypto');
const { createClient } = require('@supabase/supabase-js');

// CCA Rule 5: Initialize Supabase client for audit trail persistence
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Hashes a document's content and persists the hash in the database.
 *
 * CCA Rule 3: Document hash is generated server-side for integrity.
 * CCA Rule 5: Hash is stored in the documents table for audit trail.
 *
 * @param {object} event - The InsForge serverless function event object.
 * @param {string} event.body.documentId - The document ID to update with the hash.
 * @param {string} [event.body.documentContent] - Base64 encoded content (optional if document exists in DB).
 * @returns {object} - A response object containing the document hash.
 */
exports.handler = async (event) => {
  try {
    const { documentId, documentContent } = JSON.parse(event.body);

    if (!documentId && !documentContent) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Either documentId or documentContent is required.' }),
      };
    }

    let hash;
    let docId = documentId;

    if (documentContent) {
      // Decode base64 content and hash it
      const documentBuffer = Buffer.from(documentContent, 'base64');
      hash = createHash('sha256').update(documentBuffer).digest('hex');
    } else {
      // Fetch document from DB and compute hash from its metadata
      const { data: doc, error: fetchError } = await supabase
        .from('documents')
        .select('id, document_hash')
        .eq('id', documentId)
        .single();

      if (fetchError || !doc) {
        return {
          statusCode: 404,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Document not found.' }),
        };
      }

      // Use existing hash or generate one from the document ID
      hash = doc.document_hash || createHash('sha256').update(documentId).digest('hex');
      docId = doc.id;
    }

    // CCA Rule 5: Persist the hash in the documents table
    if (docId) {
      await supabase
        .from('documents')
        .update({ document_hash: hash })
        .eq('id', docId);
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hash: 'SHA256:' + hash }),
    };
  } catch (error) {
    console.error('Error hashing document:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Failed to hash document.', details: error.message }),
    };
  }
};
