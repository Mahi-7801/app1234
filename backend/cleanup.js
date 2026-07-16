const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function cleanup() {
  // Delete in correct order (respect foreign keys)
  await supabase.from('signing_sessions').delete().eq('user_id', '3cd57ffb-e944-490b-89b1-1d3b06001b81');
  await supabase.from('audit_logs').delete().eq('user_id', '3cd57ffb-e944-490b-89b1-1d3b06001b81');
  await supabase.from('documents').delete().eq('user_id', '3cd57ffb-e944-490b-89b1-1d3b06001b81');
  await supabase.from('users').delete().eq('id', '3cd57ffb-e944-490b-89b1-1d3b06001b81');
  console.log('Test data cleaned up.');
}
cleanup();
