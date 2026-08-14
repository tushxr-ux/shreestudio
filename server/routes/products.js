const express = require('express');
const { read, write } = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();

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
  if (!rating || rating < 1 || rating > 5) {
    return res.status(400).json({ error: 'Rating must be between 1 and 5.' });
  }
  const products = read('products');
  const product = products.find((p) => p.id === req.params.id);
  if (!product) return res.status(404).json({ error: 'Product not found.' });

  const reviews = read('reviews');
  const review = {
    id: 'r_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    productId: product.id,
    userId: req.user.sub,
    userName: req.user.name,
    rating: Number(rating),
    comment: String(comment || '').slice(0, 500),
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

// POST /api/products — Add a new preset/pack directly through the website (auth required)
router.post('/', requireAuth, async (req, res) => {
  const { name, category, categoryLabel, price, compareAtPrice, tagline, description, format, itemCount, gradient } = req.body || {};

  if (!name || !category || !price) {
    return res.status(400).json({ error: 'Name, category, and price are required.' });
  }

  const products = read('products');
  const id = 'p_' + Date.now().toString(36);
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

  const newProduct = {
    id,
    slug,
    name: String(name).trim(),
    category: String(category).trim(),
    categoryLabel: categoryLabel || (category === 'lightroom' ? 'Lightroom Presets' : category === 'photoshop' ? 'Photoshop Actions' : category === 'premiere' ? 'Premiere Pro' : 'After Effects'),
    price: parseFloat(price) || 0,
    compareAtPrice: compareAtPrice ? parseFloat(compareAtPrice) : null,
    tagline: tagline || 'New Release',
    description: description || 'Professional editing preset pack.',
    format: format || '.XMP / .DNG',
    itemCount: parseInt(itemCount) || 10,
    rating: 5.0,
    reviewCount: 1,
    bestseller: false,
    gradient: gradient || 'linear-gradient(135deg, #e535ab, #7a22ff)',
    createdAt: new Date().toISOString(),
  };

  products.unshift(newProduct);
  await write('products', products);

  res.status(201).json({ product: newProduct });
});

module.exports = router;
