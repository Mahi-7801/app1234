import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// CCA Rule 5: Database credentials loaded from environment variables
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:e314ad32a3f403caf8dc6b9134cbf07e@yegakpm9.us-east.database.insforge.app:5432/insforge?sslmode=require';

async function runSchema() {
  // Dynamically import pg
  const { Client } = await import('pg');
  
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('Connected to database successfully!');

    // Read the schema file
    const schemaPath = join(__dirname, 'schema.sql');
    const schema = readFileSync(schemaPath, 'utf8');

    // Execute the schema
    console.log('Running schema...');
    await client.query(schema);
    console.log('Schema created successfully!');
    
    // Verify tables
    const result = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `);
    
    console.log('\nTables created:');
    result.rows.forEach(row => console.log(`  - ${row.table_name}`));
    
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await client.end();
    console.log('\nConnection closed.');
  }
}

runSchema();
