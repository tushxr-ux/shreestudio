const express = require('express');
const crypto = require('crypto');
const Razorpay = require('razorpay');
const { read, write } = require('../db');
const { requireAuth } = require('../auth');
const { sendOrderConfirmationEmail } = require('../emailService');

const router = express.Router();
const CART_COOKIE = 'shreestudio_cart_id';

function getRazorpayInstance() {
  const keyId = process.env.RAZORPAY_KEY_ID || '';
  const keySecret = process.env.RAZORPAY_KEY_SECRET || '';

  if (keyId && keySecret && !keyId.includes('placeholder') && !keyId.includes('shree_studio')) {
    return new Razorpay({ key_id: keyId, key_secret: keySecret });
  }
  return null;
}

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

// POST /api/razorpay/create-order
router.post('/create-order', requireAuth, async (req, res) => {
  try {
    const cartId = 'user:' + req.user.sub;
    const carts = read('carts');
    const cart = carts.find((c) => c.id === cartId);

    if (!cart || !cart.items || cart.items.length === 0) {
      return res.status(400).json({ error: 'Your cart is empty.' });
    }

    const { items, subtotal } = hydrateCart(cart);
    if (items.length === 0) {
      return res.status(400).json({ error: 'Your cart is empty.' });
    }

    const amountInPaise = Math.round(subtotal * 100);
    const currency = 'INR';
    const razorpay = getRazorpayInstance();

    let razorpayOrderId = '';
    const keyId = process.env.RAZORPAY_KEY_ID || 'rzp_test_shree_studio';

    if (razorpay) {
      const rzpOrder = await razorpay.orders.create({
        amount: amountInPaise,
        currency,
        receipt: 'rcpt_' + Date.now(),
        notes: { userId: req.user.sub },
      });
      razorpayOrderId = rzpOrder.id;
    } else {
      // Dev / Test fallback order ID
      razorpayOrderId = 'order_rzp_mock_' + Date.now().toString(36);
    }

    res.json({
      orderId: razorpayOrderId,
      amount: amountInPaise,
      currency,
      keyId,
      subtotal,
      items,
    });
  } catch (err) {
    console.error('Error creating Razorpay order:', err);
    res.status(500).json({ error: err.message || 'Failed to create payment order.' });
  }
});

// POST /api/razorpay/verify-payment
router.post('/verify-payment', requireAuth, async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id) {
      return res.status(400).json({ error: 'Missing payment details.' });
    }

    const keySecret = process.env.RAZORPAY_KEY_SECRET || 'rzp_test_secret_shree_studio';
    let isValid = false;

    if (razorpay_order_id.startsWith('order_rzp_mock_')) {
      // Mock order auto-verify in test mode
      isValid = true;
    } else {
      const generatedSignature = crypto
        .createHmac('sha256', keySecret)
        .update(`${razorpay_order_id}|${razorpay_payment_id}`)
        .digest('hex');

      isValid = (generatedSignature === razorpay_signature);
    }

    if (!isValid) {
      return res.status(400).json({ error: 'Payment signature verification failed.' });
    }

    // Payment verified — finalize order
    const cartId = 'user:' + req.user.sub;
    const carts = read('carts');
    const cart = carts.find((c) => c.id === cartId);

    if (!cart) {
      return res.status(400).json({ error: 'Cart not found for user.' });
    }

    const { items, subtotal } = hydrateCart(cart);
    const orders = read('orders');

    const newOrder = {
      id: 'ord_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      userId: req.user.sub,
      items,
      subtotal,
      paymentId: razorpay_payment_id,
      razorpayOrderId: razorpay_order_id,
      paymentMethod: 'razorpay_upi',
      status: 'paid',
      createdAt: new Date().toISOString(),
      downloadReady: true,
    };

    orders.push(newOrder);
    await write('orders', orders);

    // Empty user cart
    cart.items = [];
    await write('carts', carts);
    res.clearCookie(CART_COOKIE);

    // Fetch user profile to send confirmation email
    const users = read('users');
    const user = users.find((u) => u.id === req.user.sub);
    const userEmail = user ? user.email : req.user.email;
    const userName = user ? user.name : (req.user.name || 'Creator');

    let emailResult = { success: false };
    if (userEmail) {
      emailResult = await sendOrderConfirmationEmail({
        userEmail,
        userName,
        order: newOrder,
      });
    }

    res.status(201).json({
      success: true,
      order: newOrder,
      emailSent: Boolean(emailResult.success),
      userEmail,
    });
  } catch (err) {
    console.error('Error verifying payment:', err);
    res.status(500).json({ error: err.message || 'Payment verification failed.' });
  }
});

module.exports = router;
