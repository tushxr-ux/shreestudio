const express = require('express');
const crypto = require('crypto');
const { read, write } = require('../db');
const { optionalAuth } = require('../auth');

const router = express.Router();
const CART_COOKIE = 'shreestudio_cart_id';

function getCartId(req, res) {
  if (req.user) return 'user:' + req.user.sub;
  let cartId = req.cookies && req.cookies[CART_COOKIE];
  if (!cartId) {
    cartId = 'guest:' + crypto.randomBytes(12).toString('hex');
    res.cookie(CART_COOKIE, cartId, { httpOnly: true, sameSite: 'lax', maxAge: 30 * 24 * 60 * 60 * 1000 });
  }
  return cartId;
}

function hydrate(cart) {
  const products = read('products');
  const items = cart.items
    .map((item) => {
      const product = products.find((p) => p.id === item.productId);
      if (!product) return null;
      return {
        productId: product.id,
        slug: product.slug,
        name: product.name,
        price: product.price,
        gradient: product.gradient,
        previewVideo: product.previewVideo || null,
        categoryLabel: product.categoryLabel,
        quantity: item.quantity,
        lineTotal: Math.round(product.price * item.quantity * 100) / 100,
      };
    })
    .filter(Boolean);
  const subtotal = Math.round(items.reduce((sum, i) => sum + i.lineTotal, 0) * 100) / 100;
  return { items, subtotal, count: items.reduce((sum, i) => sum + i.quantity, 0) };
}

router.use(optionalAuth);

router.get('/', (req, res) => {
  const cartId = getCartId(req, res);
  const carts = read('carts');
  const cart = carts.find((c) => c.id === cartId) || { id: cartId, items: [] };
  res.json(hydrate(cart));
});

router.post('/items', async (req, res) => {
  const { productId, quantity } = req.body || {};
  const qty = Math.max(1, Number(quantity) || 1);
  const products = read('products');
  if (!products.some((p) => p.id === productId)) {
    return res.status(404).json({ error: 'Product not found.' });
  }

  const cartId = getCartId(req, res);
  const carts = read('carts');
  let cart = carts.find((c) => c.id === cartId);
  if (!cart) {
    cart = { id: cartId, items: [] };
    carts.push(cart);
  }
  const existing = cart.items.find((i) => i.productId === productId);
  if (existing) existing.quantity += qty;
  else cart.items.push({ productId, quantity: qty });

  await write('carts', carts);
  res.status(201).json(hydrate(cart));
});

router.patch('/items/:productId', async (req, res) => {
  const { quantity } = req.body || {};
  const qty = Number(quantity);
  const cartId = getCartId(req, res);
  const carts = read('carts');
  const cart = carts.find((c) => c.id === cartId);
  if (!cart) return res.status(404).json({ error: 'Cart is empty.' });

  if (qty <= 0) {
    cart.items = cart.items.filter((i) => i.productId !== req.params.productId);
  } else {
    const item = cart.items.find((i) => i.productId === req.params.productId);
    if (!item) return res.status(404).json({ error: 'Item not in cart.' });
    item.quantity = qty;
  }
  await write('carts', carts);
  res.json(hydrate(cart));
});

router.delete('/items/:productId', async (req, res) => {
  const cartId = getCartId(req, res);
  const carts = read('carts');
  const cart = carts.find((c) => c.id === cartId);
  if (!cart) return res.status(404).json({ error: 'Cart is empty.' });
  cart.items = cart.items.filter((i) => i.productId !== req.params.productId);
  await write('carts', carts);
  res.json(hydrate(cart));
});

router.delete('/', async (req, res) => {
  const cartId = getCartId(req, res);
  const carts = read('carts');
  const cart = carts.find((c) => c.id === cartId);
  if (cart) {
    cart.items = [];
    await write('carts', carts);
  }
  res.json({ items: [], subtotal: 0, count: 0 });
});

module.exports = router;
