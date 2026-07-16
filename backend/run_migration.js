/**
 * Run this script to add the missing RLS policies.
 * Usage: node run_migration.js
 * 
 * Connects directly to the database (bypasses InsForge SQL Editor limitations).
 */

const { Client } = require('pg');
require('dotenv').config();

const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

const SQL = `
-- Allow user profile inserts after signup
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Service can insert users' AND tablename = 'users'
  ) THEN
    CREATE POLICY "Service can insert users" ON users FOR INSERT WITH CHECK (true);
  END IF;
END $$;

-- Allow users to update their own profile
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Users can update own profile' AND tablename = 'users'
  ) THEN
    CREATE POLICY "Users can update own profile" ON users FOR UPDATE USING (auth.uid() = id);
  END IF;
END $$;
`;

async function main() {
  try {
    await client.connect();
    console.log('Connected to database');
    await client.query(SQL);
    console.log('Migration completed successfully!');
  } catch (err) {
    console.error('Migration failed:', err.message);
  } finally {
    await client.end();
  }
}

main();
