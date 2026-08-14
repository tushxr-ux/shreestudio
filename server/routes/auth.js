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

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function formatUser(user) {
  const adminEmail = (process.env.ADMIN_EMAIL || 'admin@shreestudio.com').toLowerCase();
  const users = read('users');
  const isFirstUser = users.length > 0 && users[0].id === user.id;
  const isAdmin = Boolean(
    user.role === 'admin' ||
    user.isAdmin ||
    isFirstUser ||
    (adminEmail && user.email.toLowerCase() === adminEmail)
  );
  return { id: user.id, name: user.name, email: user.email, isAdmin };
}

router.post('/signup', async (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email, and password are all required.' });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ error: 'Enter a valid email address.' });
  }
  if (String(password).length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }

  const users = read('users');
  if (users.some((u) => u.email.toLowerCase() === String(email).toLowerCase())) {
    return res.status(409).json({ error: 'An account with that email already exists.' });
  }

  const adminEmail = (process.env.ADMIN_EMAIL || 'admin@shreestudio.com').toLowerCase();
  const isFirstUser = users.length === 0;
  const isAdmin = isFirstUser || (email.toLowerCase() === adminEmail);

  const passwordHash = await bcrypt.hash(password, 10);
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
  res.status(201).json({ user: formatUser(user), token });
});

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
  res.json({ user: formatUser(user), token });
});

router.post('/logout', (_req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  const users = read('users');
  const user = users.find((u) => u.id === req.user.sub);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  res.json({ user: formatUser(user) });
});

module.exports = router;
