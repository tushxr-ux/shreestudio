const express = require('express');
const { read, write } = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();
const CART_COOKIE = 'shreestudio_cart_id';

function hydrateCart(cart) {
  const products = read('products');
  const items = cart.items
    .map((item) => {
      const product = products.find((p) => p.id === item.productId);
      if (!product) return null;
      return {
        productId: product.id,
        name: product.name,
        price: product.price,
        quantity: item.quantity,
        lineTotal: Math.round(product.price * item.quantity * 100) / 100,
      };
    })
    .filter(Boolean);
  const subtotal = Math.round(items.reduce((sum, i) => sum + i.lineTotal, 0) * 100) / 100;
  return { items, subtotal };
}

// POST /api/orders — checkout (mock payment: instant "success")
router.post('/', requireAuth, async (req, res) => {
  const cartId = 'user:' + req.user.sub;
  const carts = read('carts');
  const cart = carts.find((c) => c.id === cartId);
  if (!cart || cart.items.length === 0) {
    return res.status(400).json({ error: 'Your cart is empty.' });
  }

  const { items, subtotal } = hydrateCart(cart);
  if (items.length === 0) {
    return res.status(400).json({ error: 'Your cart is empty.' });
  }

  const orders = read('orders');
  const order = {
    id: 'ord_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    userId: req.user.sub,
    items,
    subtotal,
    status: 'paid', // this is a demo store — no real payment processor is wired up
    createdAt: new Date().toISOString(),
    downloadReady: true,
  };
  orders.push(order);
  await write('orders', orders);

  // clear the cart (both guest cookie cart and user cart, to be safe)
  cart.items = [];
  await write('carts', carts);
  res.clearCookie(CART_COOKIE);

  res.status(201).json({ order });
});

// GET /api/orders — order history for the signed-in user
router.get('/', requireAuth, (req, res) => {
  const orders = read('orders')
    .filter((o) => o.userId === req.user.sub)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ orders });
});

module.exports = router;
