const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const sqlStatements = [
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

const policyStatements = [
  `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view own data' AND tablename = 'users') THEN CREATE POLICY "Users can view own data" ON users FOR SELECT USING (auth.uid() = id); END IF; END $$`,
  `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service can insert users' AND tablename = 'users') THEN CREATE POLICY "Service can insert users" ON users FOR INSERT WITH CHECK (true); END IF; END $$`,
  `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can update own profile' AND tablename = 'users') THEN CREATE POLICY "Users can update own profile" ON users FOR UPDATE USING (auth.uid() = id); END IF; END $$`,
  `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view own documents' AND tablename = 'documents') THEN CREATE POLICY "Users can view own documents" ON documents FOR SELECT USING (auth.uid() = user_id); END IF; END $$`,
  `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can insert own documents' AND tablename = 'documents') THEN CREATE POLICY "Users can insert own documents" ON documents FOR INSERT WITH CHECK (auth.uid() = user_id); END IF; END $$`,
  `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view own sessions' AND tablename = 'signing_sessions') THEN CREATE POLICY "Users can view own sessions" ON signing_sessions FOR SELECT USING (auth.uid() = user_id); END IF; END $$`,
  `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can insert own sessions' AND tablename = 'signing_sessions') THEN CREATE POLICY "Users can insert own sessions" ON signing_sessions FOR INSERT WITH CHECK (auth.uid() = user_id); END IF; END $$`,
  `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view own logs' AND tablename = 'audit_logs') THEN CREATE POLICY "Users can view own logs" ON audit_logs FOR SELECT USING (auth.uid() = user_id); END IF; END $$`,
  `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can insert own logs' AND tablename = 'audit_logs') THEN CREATE POLICY "Users can insert own logs" ON audit_logs FOR INSERT WITH CHECK (auth.uid() = user_id); END IF; END $$`,
];

async function pushSchema() {
  const allStatements = [...sqlStatements, ...policyStatements];
  let success = 0;
  let failed = 0;

  console.log(`Pushing ${allStatements.length} SQL statements...\n`);

  for (let i = 0; i < allStatements.length; i++) {
    const sql = allStatements[i];
    const label = sql.substring(0, 60).replace(/\n/g, ' ');

    try {
      // Try RPC first
      const { error } = await supabase.rpc('exec_sql', { query: sql });
      if (error) {
        // Try direct query via Supabase's internal SQL endpoint
        const res = await fetch(`${process.env.SUPABASE_URL}/rest/v1/`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': process.env.SUPABASE_SERVICE_KEY,
            'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
            'Prefer': 'return=minimal',
          },
          body: JSON.stringify({ query: sql }),
        });
        
        if (res.ok) {
          console.log(`[${i+1}/${allStatements.length}] OK: ${label}...`);
          success++;
        } else {
          console.log(`[${i+1}/${allStatements.length}] FAIL (${res.status}): ${label}...`);
          failed++;
        }
      } else {
        console.log(`[${i+1}/${allStatements.length}] OK: ${label}...`);
        success++;
      }
    } catch (e) {
      console.log(`[${i+1}/${allStatements.length}] ERROR: ${label}... (${e.message})`);
      failed++;
    }
  }

  console.log(`\nDone! ${success} succeeded, ${failed} failed.`);
}

pushSchema().catch(console.error);
