// db.js — tiny JSON-file datastore.
// On Vercel serverless the filesystem is read-only and ephemeral,
// so ALL file operations are wrapped in try/catch and return safe defaults.
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
try {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
} catch (_e) {
  // read-only filesystem (e.g. Vercel) — ignore
}

const files = {
  products: path.join(DATA_DIR, 'products.json'),
  users: path.join(DATA_DIR, 'users.json'),
  orders: path.join(DATA_DIR, 'orders.json'),
  carts: path.join(DATA_DIR, 'carts.json'),
  reviews: path.join(DATA_DIR, 'reviews.json'),
};

function ensure(file, fallback) {
  try {
    if (!fs.existsSync(file)) {
      fs.writeFileSync(file, JSON.stringify(fallback, null, 2));
    }
  } catch (_e) {
    // read-only filesystem — skip
  }
}

Object.values(files).forEach((f) => ensure(f, []));

// simple write queue per file to avoid concurrent-write corruption
const locks = {};
function withLock(file, fn) {
  const prev = locks[file] || Promise.resolve();
  const next = prev.then(fn, fn);
  locks[file] = next.catch(() => {});
  return next;
}

function read(name) {
  const file = files[name];
  try {
    const raw = fs.readFileSync(file, 'utf-8');
    return raw && raw.trim() ? JSON.parse(raw) : [];
  } catch (_e) {
    // File missing (Vercel) or parse error — return empty array
    return [];
  }
}

function write(name, data) {
  const file = files[name];
  return withLock(file, () =>
    fs.promises.writeFile(file, JSON.stringify(data, null, 2)).catch(() => {
      // Silently swallow write errors on read-only filesystems
    })
  );
}

module.exports = { read, write, files };
