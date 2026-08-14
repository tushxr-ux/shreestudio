const jwt = require('jsonwebtoken');

// In production, set JWT_SECRET as a real environment variable/secret.
// A dev fallback is provided so the app runs out of the box.
const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-insecure-secret-change-me';
const COOKIE_NAME = 'shreestudio_token';

function signToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, name: user.name },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
}

function setAuthCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
}

function clearAuthCookie(res) {
  res.clearCookie(COOKIE_NAME);
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
function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    const adminEmail = (process.env.ADMIN_EMAIL || '').toLowerCase();
    const isUserAdmin = req.user.email && (
      (adminEmail && req.user.email.toLowerCase() === adminEmail) ||
      req.user.role === 'admin' ||
      req.user.isAdmin === true
    );
    if (!isUserAdmin) {
      return res.status(403).json({ error: 'Access denied: Only store administrators can perform this action.' });
    }
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
