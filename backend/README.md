# Backend Setup with InsForge

This directory contains the necessary files for your InsForge backend, including the PostgreSQL schema and serverless functions.

## 1. PostgreSQL Schema Setup

The `backend/schema.sql` file defines the `users`, `documents`, `signing_sessions`, and `audit_logs` tables, along with Row Level Security (RLS) policies.

**To apply this schema to your InsForge PostgreSQL database:**

You will need `psql` installed on your local machine. If you don't have it, you can install it via your operating system's package manager (e.g., `sudo apt-get install postgresql-client` on Debian/Ubuntu, `brew install libpq` on macOS, or download from the PostgreSQL website).

Run the following command in your terminal, replacing `[PATH_TO_YOUR_PROJECT]` with the absolute path to this `hacktiong` directory:

```bash
psql "postgresql://postgres:e314ad32a3f403caf8dc6b9134cbf07e@yegakpm9.us-east.database.insforge.app:5432/insforge?sslmode=require" -f "[PATH_TO_YOUR_PROJECT]/backend/schema.sql"
```

**IMPORTANT:**
*   Ensure the `[PATH_TO_YOUR_PROJECT]` is correct.
*   The password `e314ad32a3f403caf8dc6b9134cbf07e` is embedded in this command. Be careful not to expose it. For production, consider using environment variables for the password.

## 2. Serverless Functions Deployment

The `backend/functions/` directory contains the following serverless functions:

*   `hash-document.js`: Hashes document content.
*   `submit-timestamp.js`: Proxies to a CCA-approved Time Stamping Authority (placeholder).
*   `assemble-signature.js`: Assembles the PAdES/CAdES signature into the document (placeholder).
*   `audit-log.js`: Records audit trail entries to the `audit_logs` table.

**To deploy these functions to InsForge:**

1.  **Log in to your InsForge account** via their CLI or web console.
2.  **Create new serverless functions** for each of the `.js` files in the `backend/functions/` directory.
3.  **Configure Environment Variables for `audit-log.js`**:
    For the `audit-log.js` function to connect to your InsForge Postgres, you need to set the following environment variables within your InsForge function's settings:
    *   `SUPABASE_URL`: `https://yegakpm9.us-east.database.insforge.app` (InsForge provides this as your project URL)
    *   `SUPABASE_SERVICE_KEY`: `e314ad32a3f403caf8dc6b9134cbf07e` (Your InsForge `service_role` secret key, which you might have from your project settings. **This is different from the `anon` public key.** The provided password `e314ad32a3f403caf8dc6b9134cbf07e` is for the `postgres` user in the connection string, not necessarily the `service_role` key. Please verify the actual `service_role` key from your InsForge project settings if `e314ad32a3f403caf8dc6b9134cbf07e` is only the database user password.)

## 3. Storage Bucket Configuration

You'll need to set up a storage bucket in InsForge for storing documents, especially signed ones.

1.  **Create a new bucket** named `signed-documents`.
2.  **Configure its policies** to:
    *   Allow authenticated users to upload documents (e.g., to folders based on `user_id`).
    *   Allow authenticated users to download their own documents.
    *   Ensure public access is OFF for sensitive documents.

Once these backend components are set up in your InsForge project, we can proceed with the Android native module development.
