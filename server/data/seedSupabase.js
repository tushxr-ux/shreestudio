// data/seedSupabase.js — Uploads current products from JSON to Supabase PostgreSQL table.
// Run with: npm run seed:supabase
require('dotenv').config();
const { read } = require('../db');
const { supabase, isConfigured } = require('../supabaseClient');
const { toSnakeCase } = require('../supabaseDb');

async function seed() {
  console.log('🔄 Connecting to Supabase...');
  if (!isConfigured()) {
    console.error('❌ Error: Supabase credentials are not configured in server/.env.');
    console.log('Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY).');
    process.exit(1);
  }

  const products = read('products');
  if (!products || products.length === 0) {
    console.log('⚠️ No local products found in data/products.json to seed.');
    process.exit(0);
  }

  console.log(`📦 Found ${products.length} local products to upload...`);
  const rows = products.map(toSnakeCase);

  let { data, error } = await supabase
    .from('products')
    .upsert(rows, { onConflict: 'id' })
    .select();

  if (error && String(error.message || '').includes('drive_link')) {
    console.warn('⚠️ drive_link column not created in Supabase yet. Upserting standard fields...');
    const fallbackRows = rows.map((r) => {
      const copy = { ...r };
      delete copy.drive_link;
      return copy;
    });
    const res = await supabase.from('products').upsert(fallbackRows, { onConflict: 'id' }).select();
    error = res.error;
    data = res.data;
  }

  if (error) {
    console.error('❌ Supabase Upsert Error:', error.message);
    console.log('💡 Tip: Make sure you ran data/schema.sql in your Supabase SQL Editor first!');
    process.exit(1);
  }

  console.log(`✅ Successfully seeded ${data ? data.length : rows.length} products to Supabase PostgreSQL!`);
  process.exit(0);
}

seed().catch((err) => {
  console.error('❌ Unexpected error:', err.message || err);
  process.exit(1);
});
