// db.js — tiny JSON-file datastore. No native bindings, so `npm install`
// works anywhere, but it's still a real, persistent store on disk.
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const files = {
  products: path.join(DATA_DIR, 'products.json'),
  users: path.join(DATA_DIR, 'users.json'),
  orders: path.join(DATA_DIR, 'orders.json'),
  carts: path.join(DATA_DIR, 'carts.json'),
  reviews: path.join(DATA_DIR, 'reviews.json'),
};

function ensure(file, fallback) {
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, JSON.stringify(fallback, null, 2));
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
  const raw = fs.readFileSync(file, 'utf-8');
  return raw.trim() ? JSON.parse(raw) : [];
}

function write(name, data) {
  const file = files[name];
  return withLock(file, () =>
    fs.promises.writeFile(file, JSON.stringify(data, null, 2))
  );
}

module.exports = { read, write, files };
