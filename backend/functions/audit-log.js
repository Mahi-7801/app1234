
// backend/functions/audit-log.js

const { createClient } = require('@supabase/supabase-js');

// CCA Rule 5: Initialize Supabase client for audit trail persistence
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables are required');
}

const supabase = createClient(supabaseUrl || '', supabaseKey || '');

/**
 * Records an audit log entry in the InsForge Postgres database.
 *
 * CCA Rule 5: Full audit trail per signing session (who, when, which cert, which document hash)
 * stored in InsForge Postgres. Never stores PIN or private key material.
 *
 * @param {object} event - The InsForge serverless function event object.
 * @param {string} event.body.userId - The ID of the user performing the action.
 * @param {string} event.body.eventType - The type of event (e.g., 'document_signed', 'pin_verified').
 * @param {object} event.body.eventDetails - JSON object for additional contextual information.
 * @returns {object} - A response object indicating success or failure.
 */
exports.handler = async (event) => {
  try {
    const { userId, eventType, eventDetails } = JSON.parse(event.body);

    if (!userId || !eventType) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'User ID and event type are required for audit logging.' }),
      };
    }

    const ipAddress = event.headers['x-forwarded-for'] || event.requestContext?.identity?.sourceIp;
    const userAgent = event.headers['user-agent'];

    const { data, error } = await supabase
      .from('audit_logs')
      .insert({
        user_id: userId,
        event_type: eventType,
        event_details: eventDetails || {},
        ip_address: ipAddress || null,
        user_agent: userAgent || null,
      })
      .select()
      .single();

    if (error) {
      console.error('Supabase audit log error:', error);
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Failed to record audit log.', details: error.message }),
      };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ auditId: data.id }),
    };
  } catch (error) {
    console.error('Error in audit-log:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Failed to record audit log.', details: error.message }),
    };
  }
};
