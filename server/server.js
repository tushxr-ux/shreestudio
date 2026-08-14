require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');

const { read } = require('./db');
require('./supabaseClient');

const app = express();
const PORT = process.env.PORT || 4000;

// --- middleware ---
app.use(morgan('dev'));
app.use(express.json());
app.use(cookieParser());
app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN || true, // reflect request origin in dev
    credentials: true,
  })
);

// --- seed products on first boot if the store is empty ---
if (read('products').length === 0) {
  require('./data/seed.js');
}

// --- API routes ---
app.use('/api/products', require('./routes/products'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/cart', require('./routes/cart'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/razorpay', require('./routes/razorpay'));

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'shreestudio-api',
    supabaseConfigured: Boolean(process.env.SUPABASE_URL && !process.env.SUPABASE_URL.includes('your-supabase')),
    razorpayConfigured: Boolean(process.env.RAZORPAY_KEY_ID && !process.env.RAZORPAY_KEY_ID.includes('placeholder')),
    time: new Date().toISOString(),
  });
});

// --- serve the frontend (public/) ---
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
app.use(express.static(PUBLIC_DIR));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

// --- error handler ---
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Something went wrong.' });
});

app.listen(PORT, () => {
  console.log(`ShreeStudio server running at http://localhost:${PORT}`);
});
