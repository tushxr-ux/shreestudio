# ShreeStudio — full-stack store

A working store for presets, actions, and motion packs: an Express/Node
backend with a small JSON-file database, and the original storefront design
wired up to it (live product catalog, search & filters, cart, accounts,
checkout, and reviews).

## Run it

```bash
cd server
npm install
npm start
```

Then open **http://localhost:4000** — the backend also serves the frontend,
so there's nothing else to start. The product catalog seeds itself
automatically the first time you run it.

Change the port with `PORT=5000 npm start` if 4000 is taken.

## What's included

**Backend** (`server/`)
- `server.js` — Express app, serves the API and the static frontend
- `db.js` — tiny JSON-file datastore (`server/data/*.json`) — no native
  dependencies, so `npm install` works anywhere
- `auth.js` — JWT auth via an httpOnly cookie, `bcryptjs` password hashing
- `routes/products.js` — list/search/filter/sort products, product detail,
  reviews
- `routes/auth.js` — signup, login, logout, current-user
- `routes/cart.js` — cart works for guests (cookie-based) and signed-in
  users, and persists between visits
- `routes/orders.js` — checkout (mock "payment": it always succeeds) and
  order history

**Frontend** (`public/`)
- `index.html` / `styles.css` — the original ShreeStudio visual design,
  extended with a cart drawer, auth modal, quick-view/reviews modal, and
  order-confirmation modal
- `app.js` — fetches everything from the API: live product grid, search
  (debounced), category filters, sorting, add/update/remove cart items,
  sign in/up, checkout, and posting reviews

## API summary

| Method | Path | Notes |
|---|---|---|
| GET | `/api/products` | `?category=&search=&sort=&bestseller=` |
| GET | `/api/products/categories` | counts per category |
| GET | `/api/products/:slugOrId` | product detail + reviews |
| POST | `/api/products/:id/reviews` | auth required |
| POST | `/api/auth/signup` \| `/login` \| `/logout` | |
| GET | `/api/auth/me` | current user |
| GET/POST/PATCH/DELETE | `/api/cart`, `/api/cart/items/:productId` | works signed-out or in |
| POST | `/api/orders` | checkout, auth required |
| GET | `/api/orders` | order history, auth required |

## Notes for taking this further

- Swap `db.js` for a real database (Postgres/SQLite) by keeping the same
  `read(name)` / `write(name, data)` interface — nothing else needs to
  change.
- Checkout is a mock: it marks the order `paid` immediately. Wire in Stripe
  or another processor in `routes/orders.js` before accepting real payments.
- Set a real `JWT_SECRET` environment variable in production
  (`server/auth.js` falls back to a dev-only secret otherwise).
- Downloadable `.zip` files aren't served yet — `order.downloadReady` is a
  placeholder flag for you to hook up to real file storage (S3, etc.).
