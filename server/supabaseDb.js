// supabaseDb.js — Dual-mode database layer
// If Supabase is configured in .env, operations query PostgreSQL tables.
// Otherwise, it transparently uses the local JSON file store (db.js).
const { supabase, isConfigured } = require('./supabaseClient');
const localDb = require('./db');

// --- Helper converters between camelCase (JS) and snake_case (PostgreSQL) ---
function toSnakeCase(product) {
  if (!product) return null;
  const copy = { ...product };
  if ('categoryLabel' in copy) { copy.category_label = copy.categoryLabel; delete copy.categoryLabel; }
  if ('compareAtPrice' in copy) { copy.compare_at_price = copy.compareAtPrice; delete copy.compareAtPrice; }
  if ('itemCount' in copy) { copy.item_count = copy.itemCount; delete copy.itemCount; }
  if ('reviewCount' in copy) { copy.review_count = copy.reviewCount; delete copy.reviewCount; }
  if ('previewVideo' in copy) { copy.preview_video = copy.previewVideo; delete copy.previewVideo; }
  if ('driveLink' in copy) { copy.drive_link = copy.driveLink; delete copy.driveLink; }
  if ('filePath' in copy) { copy.file_path = copy.filePath; delete copy.filePath; }
  if ('createdAt' in copy) { copy.created_at = copy.createdAt; delete copy.createdAt; }
  if ('updatedAt' in copy) { copy.updated_at = copy.updatedAt; delete copy.updatedAt; }
  return copy;
}

function toCamelCase(row) {
  if (!row) return null;
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    category: row.category,
    categoryLabel: row.category_label || row.categoryLabel || '',
    price: Number(row.price),
    compareAtPrice: row.compare_at_price != null ? Number(row.compare_at_price) : (row.compareAtPrice || null),
    tagline: row.tagline || '',
    description: row.description || '',
    format: row.format || '.XMP / .DNG',
    itemCount: row.item_count != null ? Number(row.item_count) : (row.itemCount || 10),
    rating: row.rating != null ? Number(row.rating) : 5.0,
    reviewCount: row.review_count != null ? Number(row.review_count) : 0,
    bestseller: Boolean(row.bestseller),
    gradient: row.gradient || 'linear-gradient(135deg, #e535ab, #7a22ff)',
    previewVideo: row.preview_video || row.previewVideo || null,
    driveLink: row.drive_link || row.driveLink || null,
    filePath: row.file_path || row.filePath || null,
    createdAt: row.created_at || row.createdAt || new Date().toISOString(),
  };
}

// ── PRODUCTS ────────────────────────────────────────────────────────
async function getProducts(filter = {}) {
  if (isConfigured()) {
    try {
      let query = supabase.from('products').select('*');
      if (filter.category && filter.category !== 'all') {
        query = query.eq('category', filter.category);
      }
      if (filter.bestseller === 'true' || filter.bestseller === true) {
        query = query.eq('bestseller', true);
      }
      const { data, error } = await query;
      if (!error && Array.isArray(data)) {
        return data.map(toCamelCase);
      }
      console.warn('Supabase query error, falling back to local DB:', error?.message);
    } catch (e) {
      console.warn('Supabase getProducts failed, using local DB:', e.message);
    }
  }
  return localDb.read('products');
}

async function getProductByIdOrSlug(idOrSlug) {
  if (isConfigured()) {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .or(`id.eq.${idOrSlug},slug.eq.${idOrSlug}`)
        .maybeSingle();
      if (!error && data) return toCamelCase(data);
    } catch (_e) {}
  }
  const products = localDb.read('products');
  return products.find((p) => p.id === idOrSlug || p.slug === idOrSlug) || null;
}

async function insertProduct(product) {
  // Always update local DB for instant fallback consistency
  const localProducts = localDb.read('products');
  localProducts.unshift(product);
  await localDb.write('products', localProducts);

  if (isConfigured()) {
    try {
      await supabase.from('products').insert([toSnakeCase(product)]);
    } catch (err) {
      console.warn('Supabase insertProduct sync error:', err.message);
    }
  }
  return product;
}

// ── ORDERS ──────────────────────────────────────────────────────────
async function insertOrder(order) {
  const localOrders = localDb.read('orders');
  localOrders.push(order);
  await localDb.write('orders', localOrders);

  if (isConfigured()) {
    try {
      await supabase.from('orders').insert([{
        id: order.id,
        user_id: order.userId,
        items: order.items,
        subtotal: order.subtotal,
        payment_id: order.paymentId || null,
        razorpay_order_id: order.razorpayOrderId || null,
        payment_method: order.paymentMethod || 'razorpay_upi',
        status: order.status || 'paid',
        download_ready: Boolean(order.downloadReady),
        created_at: order.createdAt,
      }]);
    } catch (err) {
      console.warn('Supabase insertOrder sync error:', err.message);
    }
  }
  return order;
}

// ── SECURE STORAGE DOWNLOAD LINK ────────────────────────────────────
async function getSignedDownloadUrl(filePath, expiresInSeconds = 86400) {
  if (!isConfigured() || !filePath) return null;
  try {
    const bucket = process.env.SUPABASE_STORAGE_BUCKET || 'presets';
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(filePath, expiresInSeconds);
    if (!error && data?.signedUrl) {
      return data.signedUrl;
    }
  } catch (err) {
    console.warn('Could not generate signed download URL:', err.message);
  }
  return null;
}

async function updateProductPreview(id, previewUrl) {
  // Update local DB
  const localProducts = localDb.read('products');
  const prod = localProducts.find((p) => p.id === id || p.slug === id);
  if (prod) {
    prod.previewVideo = previewUrl || null;
    await localDb.write('products', localProducts);
  }

  // Update Supabase if configured
  if (isConfigured() && prod) {
    try {
      await supabase
        .from('products')
        .update({ preview_video: previewUrl || null, updated_at: new Date().toISOString() })
        .eq('id', prod.id);
    } catch (err) {
      console.warn('Supabase updateProductPreview sync error:', err.message);
    }
  }
  return prod;
}

module.exports = {
  getProducts,
  getProductByIdOrSlug,
  insertProduct,
  updateProductPreview,
  insertOrder,
  getSignedDownloadUrl,
  toCamelCase,
  toSnakeCase,
};
