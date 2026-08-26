const express = require('express');
const bcrypt = require('bcryptjs');
const { read, write } = require('../db');
const {
  signToken,
  setAuthCookie,
  clearAuthCookie,
  requireAuth,
} = require('../auth');

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
  const adminEmail = (process.env.ADMIN_EMAIL || '').toLowerCase();
  const isAdmin = Boolean(
    user.role === 'admin' ||
    user.isAdmin ||
    (adminEmail && user.email.toLowerCase() === adminEmail)
  );
  return { id: user.id, name: user.name, email: user.email, isAdmin };
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

  const users = read('users');
  if (users.some((u) => u.email.toLowerCase() === String(email).toLowerCase())) {
    return res.status(409).json({ error: 'An account with that email already exists.' });
  }

  // Admin determined solely by ADMIN_EMAIL env var — no auto-admin for first user
  const adminEmail = (process.env.ADMIN_EMAIL || '').toLowerCase();
  const isAdmin = Boolean(adminEmail && email.toLowerCase().trim() === adminEmail);

  const passwordHash = await bcrypt.hash(password, 12); // bcrypt cost 12 (was 10)
  const user = {
    id: 'u_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name: String(name).trim(),
    email: String(email).toLowerCase().trim(),
    role: isAdmin ? 'admin' : 'customer',
    isAdmin,
    passwordHash,
    createdAt: new Date().toISOString(),
  };
  users.push(user);
  await write('users', users);

  const token = signToken(user);
  setAuthCookie(res, token);
  // Token is in the httpOnly cookie — don't also return it in the body
  res.status(201).json({ user: formatUser(user) });
});

// ── Login ────────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }
  const users = read('users');
  const user = users.find((u) => u.email.toLowerCase() === String(email).toLowerCase());
  if (!user) return res.status(401).json({ error: 'Incorrect email or password.' });

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: 'Incorrect email or password.' });

  const token = signToken(user);
  setAuthCookie(res, token);
  // Token is in the httpOnly cookie — don't also return it in the body
  res.json({ user: formatUser(user) });
});

// ── Logout ───────────────────────────────────────────────────────────
router.post('/logout', (_req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

// ── Current user ─────────────────────────────────────────────────────
router.get('/me', requireAuth, (req, res) => {
  const users = read('users');
  const user = users.find((u) => u.id === req.user.sub);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  res.json({ user: formatUser(user) });
});

module.exports = router;
