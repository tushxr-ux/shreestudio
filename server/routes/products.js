const express = require('express');
const { read, write } = require('../db');
const { requireAuth, requireAdmin } = require('../auth');
const { handlePreviewUpload, publicPreviewUrl, removePreviewFile } = require('../upload');
const { insertProduct, updateProductPreview } = require('../supabaseDb');

const router = express.Router();

// ── Helpers ──────────────────────────────────────────────────────────
function findProduct(products, idOrSlug) {
  return products.find((p) => p.id === idOrSlug || p.slug === idOrSlug);
}

/** Strip HTML tags to prevent stored XSS */
function stripHtml(str) {
  return String(str).replace(/<[^>]*>/g, '').trim();
}

// GET /api/products?category=lightroom&search=sunset&sort=price_asc&bestseller=true
router.get('/', (req, res) => {
  let products = read('products');
  const { category, search, sort, bestseller } = req.query;

  if (category && category !== 'all') {
    products = products.filter((p) => p.category === category);
  }
  if (bestseller === 'true') {
    products = products.filter((p) => p.bestseller);
  }
  if (search) {
    const q = String(search).toLowerCase();
    products = products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.categoryLabel.toLowerCase().includes(q)
    );
  }
  if (sort === 'price_asc') products = [...products].sort((a, b) => a.price - b.price);
  if (sort === 'price_desc') products = [...products].sort((a, b) => b.price - a.price);
  if (sort === 'rating') products = [...products].sort((a, b) => b.rating - a.rating);
  if (sort === 'newest') products = [...products].reverse();

  res.json({ products, count: products.length });
});

// GET /api/products/categories — counts per category, driven by real data
router.get('/categories', (_req, res) => {
  const products = read('products');
  const counts = {};
  for (const p of products) {
    counts[p.category] = counts[p.category] || { category: p.category, label: p.categoryLabel, count: 0 };
    counts[p.category].count += 1;
  }
  res.json({ categories: Object.values(counts) });
});

// GET /api/products/:slug
router.get('/:slug', (req, res) => {
  const products = read('products');
  const product = products.find((p) => p.slug === req.params.slug || p.id === req.params.slug);
  if (!product) return res.status(404).json({ error: 'Product not found.' });
  const reviews = read('reviews').filter((r) => r.productId === product.id);
  res.json({ product, reviews });
});

// POST /api/products/:id/reviews — leave a review (auth required)
router.post('/:id/reviews', requireAuth, async (req, res) => {
  const { rating, comment } = req.body || {};
  const parsedRating = Math.round(Number(rating)); // force integer
  if (!parsedRating || parsedRating < 1 || parsedRating > 5) {
    return res.status(400).json({ error: 'Rating must be an integer between 1 and 5.' });
  }
  const products = read('products');
  const product = products.find((p) => p.id === req.params.id);
  if (!product) return res.status(404).json({ error: 'Product not found.' });

  const reviews = read('reviews');
  const review = {
    id: 'r_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    productId: product.id,
    userId: req.user.sub,
    userName: stripHtml(req.user.name || 'Anonymous'),
    rating: parsedRating,
    comment: stripHtml(String(comment || '').slice(0, 500)), // sanitize XSS
    createdAt: new Date().toISOString(),
  };
  reviews.push(review);
  await write('reviews', reviews);

  // recompute aggregate rating
  const productReviews = reviews.filter((r) => r.productId === product.id);
  product.reviewCount = productReviews.length;
  product.rating =
    Math.round(
      (productReviews.reduce((sum, r) => sum + r.rating, 0) / productReviews.length) * 10
    ) / 10;
  await write('products', products);

  res.status(201).json({ review, product });
});

// POST /api/products — Add a new preset/pack (admin). Optional previewVideo file.
router.post('/', requireAdmin, handlePreviewUpload, async (req, res) => {
  const { name, category, categoryLabel, price, compareAtPrice, tagline, description, format, itemCount, gradient } = req.body || {};

  if (!name || !String(name).trim() || String(name).trim().length > 200) {
    if (req.file) removePreviewFile(publicPreviewUrl(req.file.filename));
    return res.status(400).json({ error: 'Name is required (max 200 chars).' });
  }
  if (!category || !String(category).trim()) {
    if (req.file) removePreviewFile(publicPreviewUrl(req.file.filename));
    return res.status(400).json({ error: 'Category is required.' });
  }
  if (!price || isNaN(parseFloat(price)) || parseFloat(price) < 0) {
    if (req.file) removePreviewFile(publicPreviewUrl(req.file.filename));
    return res.status(400).json({ error: 'Price must be a non-negative number.' });
  }
  if (description && String(description).length > 2000) {
    if (req.file) removePreviewFile(publicPreviewUrl(req.file.filename));
    return res.status(400).json({ error: 'Description is too long (max 2000 chars).' });
  }

  const products = read('products');
  const id = 'p_' + Date.now().toString(36);
  const slug = String(name).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

  const newProduct = {
    id,
    slug,
    name: stripHtml(String(name).trim()),
    category: stripHtml(String(category).trim()),
    categoryLabel: stripHtml(categoryLabel || (category === 'lightroom' ? 'Lightroom Presets' : category === 'photoshop' ? 'Photoshop Actions' : category === 'premiere' ? 'Premiere Pro' : 'After Effects')),
    price: parseFloat(price) || 0,
    compareAtPrice: compareAtPrice ? parseFloat(compareAtPrice) : null,
    tagline: stripHtml(tagline || 'New Release'),
    description: stripHtml(description || 'Professional editing preset pack.'),
    format: stripHtml(format || '.XMP / .DNG'),
    itemCount: parseInt(itemCount) || 10,
    rating: 5.0,
    reviewCount: 1,
    bestseller: false,
    gradient: gradient || 'linear-gradient(135deg, #e535ab, #7a22ff)',
    previewVideo: req.file ? publicPreviewUrl(req.file.filename) : null,
    createdAt: new Date().toISOString(),
  };

  await insertProduct(newProduct);

  res.status(201).json({ product: newProduct });
});

// POST /api/products/:id/preview — upload or replace a preview video (admin)
router.post('/:id/preview', requireAdmin, handlePreviewUpload, async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Choose a preview video to upload (MP4, WebM, or MOV).' });
  }
  const products = read('products');
  const product = findProduct(products, req.params.id);
  if (!product) {
    removePreviewFile(publicPreviewUrl(req.file.filename));
    return res.status(404).json({ error: 'Product not found.' });
  }
  removePreviewFile(product.previewVideo);
  const updatedProduct = await updateProductPreview(product.id, publicPreviewUrl(req.file.filename));
  res.json({ product: updatedProduct || product });
});

// DELETE /api/products/:id/preview — remove a preview video (admin)
router.delete('/:id/preview', requireAdmin, async (req, res) => {
  const products = read('products');
  const product = findProduct(products, req.params.id);
  if (!product) return res.status(404).json({ error: 'Product not found.' });
  removePreviewFile(product.previewVideo);
  const updatedProduct = await updateProductPreview(product.id, null);
  res.json({ product: updatedProduct || product });
});

module.exports = router;
