-- Migration: Add missing RLS policies for user signup, document upload, and audit logging
-- Run this in InsForge SQL Editor

-- Allow new user profiles to be inserted (needed for signup flow)
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
