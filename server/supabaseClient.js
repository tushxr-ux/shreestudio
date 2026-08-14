const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';

let supabase = null;

if (supabaseUrl && supabaseUrl.includes('supabase.co') && supabaseAnonKey && !supabaseAnonKey.includes('your-supabase')) {
  try {
    supabase = createClient(supabaseUrl, supabaseAnonKey);
    console.log('⚡ Supabase client initialized successfully.');
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
