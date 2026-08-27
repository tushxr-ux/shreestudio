const express = require('express');
const bcrypt = require('bcryptjs');
const {
  signToken,
  setAuthCookie,
  clearAuthCookie,
  requireAuth,
} = require('../auth');
const {
  getUserByEmail,
  getUserById,
  upsertUser,
} = require('../supabaseDb');

const router = express.Router();

// ── Validation helpers ──────────────────────────────────────────────
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isStrongPassword(password) {
  // At least 8 chars, 1 uppercase, 1 lowercase, 1 digit
  return (
    typeof password === 'string' &&
    password.length >= 8 &&
    /[A-Z]/.test(password) &&
    /[a-z]/.test(password) &&
    /[0-9]/.test(password)
  );
}

function formatUser(user) {
  const cleanEmail = String(user.email || '').toLowerCase().trim();
  const adminEmails = (process.env.ADMIN_EMAIL || '')
    .toLowerCase()
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const matchesEnvAdmin = adminEmails.includes(cleanEmail);
  const isAdmin = Boolean(user.role === 'admin' || user.isAdmin || user.is_admin || matchesEnvAdmin);
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: isAdmin ? 'admin' : (user.role || 'customer'),
    isAdmin,
  };
}

// ── Signup ───────────────────────────────────────────────────────────
router.post('/signup', async (req, res) => {
  const { name, email, password } = req.body || {};

  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: 'Name is required.' });
  }
  if (!email || !isValidEmail(email)) {
    return res.status(400).json({ error: 'Enter a valid email address.' });
  }
  if (!isStrongPassword(password)) {
    return res.status(400).json({
      error: 'Password must be at least 8 characters and contain 1 uppercase letter, 1 lowercase letter, and 1 digit.',
    });
  }

  const existing = await getUserByEmail(email);
  if (existing) {
    return res.status(409).json({ error: 'An account with that email already exists.' });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const newUser = await upsertUser({
    id: 'u_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name: String(name).trim(),
    email: String(email).toLowerCase().trim(),
    role: 'customer',
    isAdmin: false,
    passwordHash,
    createdAt: new Date().toISOString(),
  });

  const token = signToken(newUser);
  setAuthCookie(res, token);
  res.status(201).json({ user: formatUser(newUser) });
});

// ── Login ────────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const user = await getUserByEmail(email);
  if (!user || !user.passwordHash) return res.status(401).json({ error: 'Incorrect email or password.' });

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: 'Incorrect email or password.' });

  const token = signToken(user);
  setAuthCookie(res, token);
  res.json({ user: formatUser(user) });
});

// ── Logout ───────────────────────────────────────────────────────────
router.post('/logout', (_req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

// ── Current user ─────────────────────────────────────────────────────
router.get('/me', requireAuth, async (req, res) => {
  let user = null;
  if (req.user.sub) user = await getUserById(req.user.sub);
  if (!user && req.user.email) user = await getUserByEmail(req.user.email);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  res.json({ user: formatUser(user) });
});

// ── OAuth Session Sync (Google / Apple via Supabase) ─────────────────
router.post('/oauth-sync', async (req, res) => {
  const { email, name, id: oauthId } = req.body || {};
  if (!email || !String(email).trim()) {
    return res.status(400).json({ error: 'Email is required for OAuth sync.' });
  }

  const cleanEmail = String(email).toLowerCase().trim();
  const cleanName = String(name || cleanEmail.split('@')[0]).trim();

  // upsertUser checks Supabase database for any existing role/is_admin
  const user = await upsertUser({
    id: oauthId || ('u_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)),
    name: cleanName,
    email: cleanEmail,
    role: 'customer', // default if brand new
    isAdmin: false,
  });

  const token = signToken(user);
  setAuthCookie(res, token);
  res.json({ user: formatUser(user) });
});

module.exports = router;
