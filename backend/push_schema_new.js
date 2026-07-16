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
  // Try using Supabase SQL API first (Management API)
  const projectRef = 'edegjyajfyijslkpzrtd';
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;

  console.log('Attempting to push schema via Supabase SQL API...');

  // Method 1: Use Supabase SQL endpoint
  try {
    const response = await fetch(`https://${projectRef}.supabase.co/sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ query: allSQL }),
    });

    if (response.ok) {
      const result = await response.text();
      console.log('Schema pushed successfully via SQL API!');
      console.log('Response:', result.substring(0, 1000));
      return;
    }
    console.log('SQL API returned status:', response.status);
  } catch (e) {
    console.log('SQL API failed:', e.message);
  }

  // Method 2: Use Supabase Management API
  try {
    const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ query: allSQL }),
    });

    if (response.ok) {
      const result = await response.text();
      console.log('Schema pushed successfully via Management API!');
      console.log('Response:', result.substring(0, 1000));
      return;
    }
    console.log('Management API returned status:', response.status);
  } catch (e) {
    console.log('Management API failed:', e.message);
  }

  console.log('\nDirect SQL API methods failed.');
  console.log('Please run the SQL manually in Supabase SQL Editor:');
  console.log(`https://supabase.com/dashboard/project/${projectRef}/sql/new`);
}

pushSchema().catch(console.error);
