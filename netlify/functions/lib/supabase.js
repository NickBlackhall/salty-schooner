const { createClient } = require('@supabase/supabase-js');

let client = null;

function getClient() {
  if (client) return client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set.');
  client = createClient(url, key, {
    db: { schema: 'salty_schooner' },
    auth: { persistSession: false }
  });
  return client;
}

module.exports = { getClient };
