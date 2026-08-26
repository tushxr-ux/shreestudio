const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY && !process.env.SUPABASE_SERVICE_ROLE_KEY.includes('your-supabase')
  ? process.env.SUPABASE_SERVICE_ROLE_KEY
  : process.env.SUPABASE_ANON_KEY || '';

let supabase = null;

if (
  supabaseUrl &&
  supabaseUrl.includes('supabase.co') &&
  supabaseKey &&
  !supabaseKey.includes('your-supabase') &&
  !supabaseKey.includes('placeholder')
) {
  try {
    supabase = createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
    console.log('⚡ Supabase PostgreSQL & Storage client initialized successfully.');
  } catch (err) {
    console.warn('⚠️ Could not initialize Supabase client:', err.message);
  }
} else {
  console.log('ℹ️ Supabase environment variables not configured. Using local JSON store + auth mode.');
}

module.exports = {
  supabase,
  isConfigured: () => Boolean(supabase),
};
