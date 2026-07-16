const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function testInsert() {
  console.log('Testing inserts on all tables...\n');

  // 1. Insert into users
  console.log('--- users table ---');
  const { data: user, error: userErr } = await supabase
    .from('users')
    .insert({ email: 'test@example.com' })
    .select()
    .single();

  if (userErr) {
    console.log('FAIL:', userErr.message);
  } else {
    console.log('OK:', JSON.stringify(user));
  }

  if (!user) {
    console.log('\nCannot continue without a user. Tables may not exist yet.');
    return;
  }

  // 2. Insert into documents
  console.log('\n--- documents table ---');
  const { data: doc, error: docErr } = await supabase
    .from('documents')
    .insert({
      user_id: user.id,
      document_name: 'test-document.pdf',
      document_hash: 'abc123hash',
      storage_path: '/signed-documents/test.pdf',
    })
    .select()
    .single();

  if (docErr) {
    console.log('FAIL:', docErr.message);
  } else {
    console.log('OK:', JSON.stringify(doc));
  }

  // 3. Insert into audit_logs
  console.log('\n--- audit_logs table ---');
  const { data: log, error: logErr } = await supabase
    .from('audit_logs')
    .insert({
      user_id: user.id,
      event_type: 'document_hashed',
      event_details: { filename: 'test-document.pdf' },
      ip_address: '127.0.0.1',
      user_agent: 'test-script',
    })
    .select()
    .single();

  if (logErr) {
    console.log('FAIL:', logErr.message);
  } else {
    console.log('OK:', JSON.stringify(log));
  }

  // 4. Insert into signing_sessions
  console.log('\n--- signing_sessions table ---');
  const { data: session, error: sessErr } = await supabase
    .from('signing_sessions')
    .insert({
      user_id: user.id,
      document_id: doc ? doc.id : '00000000-0000-0000-0000-000000000000',
      certificate_serial_number: 'TEST-SERIAL-001',
      signed_hash: 'signed_hash_value',
      signature_blob: 'base64signatureblob',
    })
    .select()
    .single();

  if (sessErr) {
    console.log('FAIL:', sessErr.message);
  } else {
    console.log('OK:', JSON.stringify(session));
  }

  // Cleanup: delete test data
  console.log('\n--- Cleaning up test data ---');
  await supabase.from('signing_sessions').delete().eq('user_id', user.id);
  await supabase.from('audit_logs').delete().eq('user_id', user.id);
  await supabase.from('documents').delete().eq('user_id', user.id);
  await supabase.from('users').eq('id', user.id).delete();
  console.log('Done!');
}

testInsert().catch(console.error);
