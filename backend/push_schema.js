const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const statements = [
  `CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`,

  `CREATE TABLE IF NOT EXISTS users (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS documents (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id uuid REFERENCES users(id) ON DELETE CASCADE,
    document_name TEXT NOT NULL,
    document_hash TEXT UNIQUE NOT NULL,
    storage_path TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS signing_sessions (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id uuid REFERENCES users(id) ON DELETE CASCADE,
    document_id uuid REFERENCES documents(id) ON DELETE CASCADE,
    certificate_serial_number TEXT NOT NULL,
    signed_hash TEXT NOT NULL,
    signature_blob TEXT NOT NULL,
    timestamp_token TEXT,
    audit_log_id uuid,
    created_at TIMESTAMPTZ DEFAULT now(),
    completed_at TIMESTAMPTZ
  )`,

  `CREATE TABLE IF NOT EXISTS audit_logs (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id uuid REFERENCES users(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    event_details JSONB,
    ip_address INET,
    user_agent TEXT,
    timestamp TIMESTAMPTZ DEFAULT now()
  )`,

  `ALTER TABLE users ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE documents ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE signing_sessions ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY`,
];

const policies = [
  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view own data' AND tablename = 'users') THEN
      CREATE POLICY "Users can view own data" ON users FOR SELECT USING (auth.uid() = id);
    END IF;
  END $$`,
  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service can insert users' AND tablename = 'users') THEN
      CREATE POLICY "Service can insert users" ON users FOR INSERT WITH CHECK (true);
    END IF;
  END $$`,
  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can update own profile' AND tablename = 'users') THEN
      CREATE POLICY "Users can update own profile" ON users FOR UPDATE USING (auth.uid() = id);
    END IF;
  END $$`,
  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view own documents' AND tablename = 'documents') THEN
      CREATE POLICY "Users can view own documents" ON documents FOR SELECT USING (auth.uid() = user_id);
    END IF;
  END $$`,
  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can insert own documents' AND tablename = 'documents') THEN
      CREATE POLICY "Users can insert own documents" ON documents FOR INSERT WITH CHECK (auth.uid() = user_id);
    END IF;
  END $$`,
  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view own sessions' AND tablename = 'signing_sessions') THEN
      CREATE POLICY "Users can view own sessions" ON signing_sessions FOR SELECT USING (auth.uid() = user_id);
    END IF;
  END $$`,
  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can insert own sessions' AND tablename = 'signing_sessions') THEN
      CREATE POLICY "Users can insert own sessions" ON signing_sessions FOR INSERT WITH CHECK (auth.uid() = user_id);
    END IF;
  END $$`,
  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view own logs' AND tablename = 'audit_logs') THEN
      CREATE POLICY "Users can view own logs" ON audit_logs FOR SELECT USING (auth.uid() = user_id);
    END IF;
  END $$`,
  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can insert own logs' AND tablename = 'audit_logs') THEN
      CREATE POLICY "Users can insert own logs" ON audit_logs FOR INSERT WITH CHECK (auth.uid() = user_id);
    END IF;
  END $$`,
];

async function pushSchema() {
  const all = [...statements, ...policies];
  for (const sql of all) {
    try {
      const { error } = await supabase.rpc('exec_sql', { query: sql });
      if (error) {
        // Supabase may not have exec_sql, try alternatives
        console.log('exec_sql not available, trying direct query...');
        break;
      }
      console.log('OK');
    } catch (e) {
      console.log('RPC failed, trying alternative...');
      break;
    }
  }
}

// Alternative: use pg directly
async function pushWithPg() {
  const { Client } = require('pg');
  const db = new Client({
    connectionString: process.env.SUPABASE_DB_URL || 
      'postgresql://postgres.nfyvyvcakczhuqvautko:your-password@aws-0-ap-south-1.pooler.supabase.com:6543/postgres',
  });

  // If no direct DB URL, we need the user to provide it
  // For now, let's try the Supabase SQL API
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  
  const allSql = [...statements, ...policies].join(';\n');
  
  const res = await fetch(url + '/rest/v1/rpc/exec_sql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': key,
      'Authorization': 'Bearer ' + key,
    },
    body: JSON.stringify({ query: allSql }),
  });
  
  const body = await res.text();
  console.log('SQL API response:', res.status, body.substring(0, 500));
}

pushSchema().then(() => pushWithPg()).catch(console.error);
