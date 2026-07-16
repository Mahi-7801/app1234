
-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create the 'users' table
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create the 'documents' table
CREATE TABLE documents (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  document_name TEXT NOT NULL,
  document_hash TEXT UNIQUE NOT NULL, -- Hash of the original document content
  storage_path TEXT NOT NULL, -- Path to the original document in storage
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create the 'signing_sessions' table
CREATE TABLE signing_sessions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  document_id uuid REFERENCES documents(id) ON DELETE CASCADE,
  certificate_serial_number TEXT NOT NULL, -- Serial number of the DSC used
  signed_hash TEXT NOT NULL, -- The hash that was actually signed by the DSC
  signature_blob TEXT NOT NULL, -- The final PAdES/CAdES signature blob
  timestamp_token TEXT, -- RFC 3161 timestamp token from TSA
  audit_log_id uuid, -- Reference to the audit log entry for this session
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- Create the 'audit_logs' table
CREATE TABLE audit_logs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL, -- e.g., 'document_hashed', 'pin_verified', 'document_signed'
  event_details JSONB, -- JSON object for additional contextual information
  ip_address INET,
  user_agent TEXT,
  timestamp TIMESTAMPTZ DEFAULT now()
);

-- Enable Row Level Security (RLS) for all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE signing_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Policies for 'users' table
CREATE POLICY "Can view own user data" ON users FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Service can insert users" ON users FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can update own profile" ON users FOR UPDATE USING (auth.uid() = id);

-- Policies for 'documents' table
CREATE POLICY "Can view own documents" ON documents FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Can insert own documents" ON documents FOR INSERT WITH CHECK (auth.uid() = user_id);
-- Assuming document updates are not allowed after creation (hash is immutable)

-- Policies for 'signing_sessions' table
CREATE POLICY "Can view own signing sessions" ON signing_sessions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Can insert own signing sessions" ON signing_sessions FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Policies for 'audit_logs' table
CREATE POLICY "Can view own audit logs" ON audit_logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Can insert own audit logs" ON audit_logs FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Storage bucket for documents
-- You would typically configure this in your InsForge/Supabase storage section
-- No SQL commands for bucket creation, but here's a placeholder for documentation:
-- Bucket Name: 'signed-documents'
-- Public access: Off (documents should be accessed via signed URLs or authenticated requests)
-- Policies for storage:
-- Allow authenticated users to upload to their own user_id folder
-- Allow authenticated users to download their own documents
