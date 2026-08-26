const crypto = require('crypto');
const jwt = require('jsonwebtoken');

// ── JWT secret ──────────────────────────────────────────────────────
// In production, ALWAYS set a strong JWT_SECRET env var (64+ random chars).
// The fallback generates a random secret per process so tokens don't
// survive restarts — this is intentional for dev safety.
const JWT_SECRET = process.env.JWT_SECRET && process.env.JWT_SECRET !== 'CHANGE_ME_use_a_64char_random_string'
  ? process.env.JWT_SECRET
  : (() => {
      const fallback = crypto.randomBytes(48).toString('hex');
      console.warn(
        '⚠️  JWT_SECRET is not set — using a random per-process secret.\n' +
        '   Tokens will NOT survive server restarts.\n' +
        '   Set JWT_SECRET in server/.env for production.'
      );
      return fallback;
    })();

const COOKIE_NAME = 'shreestudio_token';
const IS_PROD = process.env.NODE_ENV === 'production';

// ── Token helpers ───────────────────────────────────────────────────
function signToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, name: user.name },
    JWT_SECRET,
    { expiresIn: '7d' } // 7 days (was 30d — reduced attack window)
  );
}

function setAuthCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: IS_PROD,            // HTTPS-only in production
    sameSite: IS_PROD ? 'strict' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // match JWT expiry
  });
}

function clearAuthCookie(res) {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: IS_PROD ? 'strict' : 'lax',
  });
}

function getToken(req) {
  if (req.cookies && req.cookies[COOKIE_NAME]) return req.cookies[COOKIE_NAME];
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7);
  return null;
}

// Attaches req.user if a valid token is present; never blocks the request.
function optionalAuth(req, _res, next) {
  const token = getToken(req);
  if (token) {
    try {
      req.user = jwt.verify(token, JWT_SECRET);
    } catch (_e) {
      // invalid/expired token — treat as logged out
    }
  }
  next();
}

// Blocks the request with 401 if not authenticated.
function requireAuth(req, res, next) {
  const token = getToken(req);
  if (!token) return res.status(401).json({ error: 'Not signed in.' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (_e) {
    return res.status(401).json({ error: 'Session expired. Please sign in again.' });
  }
}

// Blocks the request with 403 if user is not an administrator.
// Admin is determined by: explicit role/flag in DB, or matching ADMIN_EMAIL.
// The old "isFirstUser" auto-admin logic has been removed for security.
async function requireAdmin(req, res, next) {
  requireAuth(req, res, async () => {
    const { getUserById, getUserByEmail } = require('./supabaseDb');
    let user = null;
    if (req.user.sub) user = await getUserById(req.user.sub);
    if (!user && req.user.email) user = await getUserByEmail(req.user.email);

    const isUserAdmin = Boolean(
      user && (user.role === 'admin' || user.isAdmin)
    );

    if (!isUserAdmin) {
      return res.status(403).json({ error: 'Access denied: Only store administrators can perform this action.' });
    }
    req.user.role = 'admin';
    req.user.isAdmin = true;
    next();
  });
}

module.exports = {
  signToken,
  setAuthCookie,
  clearAuthCookie,
  optionalAuth,
  requireAuth,
  requireAdmin,
  COOKIE_NAME,
};
