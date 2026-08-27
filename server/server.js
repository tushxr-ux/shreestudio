require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const { read } = require('./db');
require('./supabaseClient');

const app = express();
const PORT = process.env.PORT || 4000;
const IS_PROD = process.env.NODE_ENV === 'production';

// --- security middleware ---
app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: false, // CSP can break inline scripts; enable when ready
  crossOriginEmbedderPolicy: false,
}));
app.use(morgan('dev'));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

// --- CORS ---
const allowedOrigin = process.env.CLIENT_ORIGIN || (IS_PROD ? false : true);
app.use(
  cors({
    origin: allowedOrigin,
    credentials: true,
  })
);

// --- rate limiters ---
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 60,                   // 60 attempts per 15 minutes
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again in a few minutes.' },
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 600,            // 600 requests per minute per IP (generous for seamless browsing)
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down.' },
});

app.use('/api/', apiLimiter);

// --- seed products on first boot if the store is empty ---
// On Vercel (serverless/read-only fs), skip the seed entirely — Supabase is the source of truth.
try {
  const IS_VERCEL = process.env.VERCEL === '1' || process.env.VERCEL_ENV !== undefined;
  if (!IS_VERCEL && read('products').length === 0) {
    require('./data/seed.js');
  }
} catch (_seedErr) {
  // Silently skip seeding if filesystem is unavailable
}

// --- public config endpoint (no secrets!) ---
app.get('/api/config', (_req, res) => {
  const razorpayKeyId = process.env.RAZORPAY_KEY_ID || '';
  const supabaseUrl = process.env.SUPABASE_URL || '';
  const supabaseAnonKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '';

  res.json({
    razorpayKeyId: razorpayKeyId.includes('placeholder') ? '' : razorpayKeyId,
    supabaseUrl: supabaseUrl.includes('your-supabase') ? '' : supabaseUrl,
    supabaseAnonKey: supabaseAnonKey.includes('your-supabase') ? '' : supabaseAnonKey,
  });
});

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

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`ShreeStudio server running at http://localhost:${PORT}`);
  });
}

module.exports = app;
