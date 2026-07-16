const { Client } = require('pg');
require('dotenv').config();

const allSQL = `
-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Documents table
CREATE TABLE IF NOT EXISTS documents (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  document_name TEXT NOT NULL,
  document_hash TEXT UNIQUE NOT NULL,
  storage_path TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Signing sessions table
CREATE TABLE IF NOT EXISTS signing_sessions (
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
);

-- Audit logs table
CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  event_details JSONB,
  ip_address INET,
  user_agent TEXT,
  timestamp TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE signing_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Users policies
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view own data' AND tablename = 'users') THEN
    CREATE POLICY "Users can view own data" ON users FOR SELECT USING (auth.uid() = id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service can insert users' AND tablename = 'users') THEN
    CREATE POLICY "Service can insert users" ON users FOR INSERT WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can update own profile' AND tablename = 'users') THEN
    CREATE POLICY "Users can update own profile" ON users FOR UPDATE USING (auth.uid() = id);
  END IF;
END $$;

-- Documents policies
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view own documents' AND tablename = 'documents') THEN
    CREATE POLICY "Users can view own documents" ON documents FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can insert own documents' AND tablename = 'documents') THEN
    CREATE POLICY "Users can insert own documents" ON documents FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- Signing sessions policies
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view own sessions' AND tablename = 'signing_sessions') THEN
    CREATE POLICY "Users can view own sessions" ON signing_sessions FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can insert own sessions' AND tablename = 'signing_sessions') THEN
    CREATE POLICY "Users can insert own sessions" ON signing_sessions FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- Audit logs policies
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view own logs' AND tablename = 'audit_logs') THEN
    CREATE POLICY "Users can view own logs" ON audit_logs FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can insert own logs' AND tablename = 'audit_logs') THEN
    CREATE POLICY "Users can insert own logs" ON audit_logs FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;
`;

async function pushSchema() {
  // Supabase direct DB connection (Session mode pooler)
  const projectRef = 'edegjyajfyijslkpzrtd';
  
  // Try to get DB URL from env or construct it
  const dbUrl = process.env.SUPABASE_DB_URL || 
    process.env.DATABASE_URL ||
    `postgresql://postgres.${projectRef}:${process.env.SUPABASE_DB_PASSWORD || 'placeholder'}@aws-0-us-east-1.pooler.supabase.com:6543/postgres`;

  console.log('Connecting to Supabase database...');
  console.log('Project:', projectRef);

  const client = new Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    console.log('Connected!\n');

    // Split into individual statements and execute one by one
    const statements = allSQL
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    let success = 0;
    let failed = 0;

    for (let i = 0; i < statements.length; i++) {
      const sql = statements[i];
      const label = sql.substring(0, 60).replace(/\n/g, ' ');
      try {
        await client.query(sql);
        console.log(`[${i+1}/${statements.length}] OK: ${label}...`);
        success++;
      } catch (e) {
        // "already exists" is fine
        if (e.message.includes('already exists')) {
          console.log(`[${i+1}/${statements.length}] SKIP (exists): ${label}...`);
          success++;
        } else {
          console.log(`[${i+1}/${statements.length}] FAIL: ${label}...`);
          console.log(`  Error: ${e.message}`);
          failed++;
        }
      }
    }

    console.log(`\nDone! ${success} succeeded, ${failed} failed.`);
  } catch (e) {
    console.error('Connection failed:', e.message);
    console.log('\nYou need your Supabase database password.');
    console.log('Find it at: https://supabase.com/dashboard/project/' + projectRef + '/settings/database');
    console.log('Then set SUPABASE_DB_URL in .env or run with:');
    console.log(`  SUPABASE_DB_URL="postgresql://postgres.${projectRef}:YOUR_PASSWORD@aws-0-us-east-1.pooler.supabase.com:6543/postgres" node push_schema_db.js`);
  } finally {
    await client.end().catch(() => {});
  }
}

pushSchema().catch(console.error);
