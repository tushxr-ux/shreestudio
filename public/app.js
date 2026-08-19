(() => {
  'use strict';

  const API = '/api';
  const state = {
    user: null,
    products: [],
    categories: [],
    activeCategory: 'all',
    search: '',
    sort: '',
    cart: { items: [], subtotal: 0, count: 0 },
  };

  // ---------- tiny helpers ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const money = (n) => `$${Number(n).toFixed(2).replace(/\.00$/, '')}`;
  const escapeHtml = (str) =>
    String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  async function api(path, options = {}) {
    const res = await fetch(API + path, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options,
    });
    let data = null;
    try { data = await res.json(); } catch (_e) { /* no body */ }
    if (!res.ok) {
      const message = (data && data.error) || `Request failed (${res.status})`;
      throw new Error(message);
    }
    return data;
  }

  function toast(message, type = 'info') {
    const stack = $('#toastStack');
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `<span class="dot"></span><span>${escapeHtml(message)}</span>`;
    stack.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transition = 'opacity .25s ease';
      setTimeout(() => el.remove(), 260);
    }, 2600);
  }

  // ---------- overlay / modal plumbing ----------
  const overlay = $('#overlay');
  const openLayers = new Set();

  function openLayer(el) {
    overlay.classList.add('open');
    el.classList.add('open');
    openLayers.add(el);
  }
  function closeLayer(el) {
    el.classList.remove('open');
    openLayers.delete(el);
    if (openLayers.size === 0) overlay.classList.remove('open');
  }
  function closeAllLayers() {
    openLayers.forEach((el) => el.classList.remove('open'));
    openLayers.clear();
    overlay.classList.remove('open');
  }
  overlay.addEventListener('click', closeAllLayers);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeAllLayers();
  });

  // ---------- scroll helpers ----------
  $$('[data-scroll]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.scroll;
      if (target === 'top') { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
      const el = document.getElementById(target);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  $('#freePacksBtn').addEventListener('click', () => {
    toast('Free packs are being curated — check back soon!', 'info');
  });

  // ================= CATEGORIES =================
  const catStyles = {
    lightroom: { cls: 'cat1', blurb: 'Desktop & mobile .xmp / .dng presets' },
    photoshop: { cls: 'cat2', blurb: 'Actions, gradients & retouch panels' },
    premiere: { cls: 'cat3', blurb: 'LUTs, transitions & title templates' },
    aftereffects: { cls: 'cat4', blurb: 'Motion templates & animation presets' },
  };

  function renderCategories() {
    const grid = $('#categoryGrid');
    grid.innerHTML = state.categories
      .map((c) => {
        const style = catStyles[c.category] || { cls: 'cat1', blurb: '' };
        const active = state.activeCategory === c.category ? 'active' : '';
        return `
          <button class="cat-card ${style.cls} ${active}" data-category="${c.category}">
            <span class="count">${c.count} pack${c.count === 1 ? '' : 's'}</span>
            <h3>${escapeHtml(c.label)}</h3>
            <p>${escapeHtml(style.blurb)}</p>
          </button>`;
      })
      .join('');

    $$('.cat-card', grid).forEach((card) => {
      card.addEventListener('click', () => {
        setCategory(card.dataset.category);
        document.getElementById('products').scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }

  function renderChips() {
    const row = $('#chipRow');
    const chips = [{ category: 'all', label: 'All' }, ...state.categories.map((c) => ({ category: c.category, label: c.label }))];
    row.innerHTML = chips
      .map(
        (c) =>
          `<button class="chip ${state.activeCategory === c.category ? 'active' : ''}" data-category="${c.category}">${escapeHtml(c.label)}</button>`
      )
      .join('');
    $$('.chip', row).forEach((chip) => {
      chip.addEventListener('click', () => setCategory(chip.dataset.category));
    });
  }

  function setCategory(category) {
    state.activeCategory = category;
    renderChips();
    renderCategories();
    loadProducts();
  }

  $$('[data-filter-category]').forEach((btn) => {
    btn.addEventListener('click', () => {
      setCategory(btn.dataset.filterCategory);
      document.getElementById('products').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  // ================= PRODUCTS =================
  let searchDebounce;
  $('#searchInput').addEventListener('input', (e) => {
    clearTimeout(searchDebounce);
    const value = e.target.value;
    searchDebounce = setTimeout(() => {
      state.search = value;
      loadProducts();
    }, 300);
  });
  $('#sortSelect').addEventListener('change', (e) => {
    state.sort = e.target.value;
    loadProducts();
  });

  function starRow(rating) {
    const full = Math.round(rating);
    return '★'.repeat(full) + '☆'.repeat(5 - full);
  }

  function productCardHtml(p) {
    return `
      <div class="prod-card" data-id="${p.id}">
        <div class="prod-media" style="background:${p.gradient}" data-quickview="${p.id}">
          <span class="badge">${escapeHtml(p.tagline)}</span>
          ${p.bestseller ? '<span class="badge best">Bestseller</span>' : ''}
        </div>
        <div class="prod-body">
          <span class="prod-cat">${escapeHtml(p.categoryLabel)}</span>
          <h4 data-quickview="${p.id}">${escapeHtml(p.name)}</h4>
          <div class="prod-rating"><span class="stars">${starRow(p.rating)}</span> ${p.rating.toFixed(1)} · ${p.reviewCount} reviews</div>
          <div class="prod-foot">
            <span class="price">${money(p.price)}${p.compareAtPrice ? `<small>${money(p.compareAtPrice)}</small>` : ''}</span>
            <button class="add-btn" data-add="${p.id}">Add to cart</button>
          </div>
        </div>
      </div>`;
  }

  async function loadProducts() {
    const grid = $('#productGrid');
    grid.innerHTML = '<div class="empty-state">Loading packs…</div>';
    const params = new URLSearchParams();
    if (state.activeCategory !== 'all') params.set('category', state.activeCategory);
    if (state.search) params.set('search', state.search);
    if (state.sort) params.set('sort', state.sort);

    try {
      const data = await api('/products?' + params.toString());
      state.products = data.products;
      $('#productsHeading').textContent =
        state.activeCategory === 'all' && !state.search ? 'Featured packs this week' : `${data.count} pack${data.count === 1 ? '' : 's'} found`;

      if (data.products.length === 0) {
        grid.innerHTML = '<div class="empty-state">No packs match that search yet. Try a different keyword or category.</div>';
        return;
      }
      grid.innerHTML = data.products.map(productCardHtml).join('');

      $$('[data-add]', grid).forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          addToCart(btn.dataset.add, 1);
        });
      });
      $$('[data-quickview]', grid).forEach((el) => {
        el.addEventListener('click', () => openQuickview(el.dataset.quickview));
      });
    } catch (err) {
      grid.innerHTML = `<div class="empty-state">Couldn't load products: ${escapeHtml(err.message)}</div>`;
    }
  }

  async function loadCategories() {
    try {
      const data = await api('/products/categories');
      state.categories = data.categories;
      renderCategories();
      renderChips();
    } catch (err) {
      toast("Couldn't load categories: " + err.message, 'error');
    }
  }

  // hero stage quickview shortcuts
  $$('[data-quickview]').forEach((el) => {
    if (el.closest('#productGrid')) return; // handled after render
    el.addEventListener('click', () => openQuickview(el.dataset.quickview));
  });

  // ================= QUICK VIEW =================
  const quickviewModal = $('#quickviewModal');
  async function openQuickview(idOrSlug) {
    quickviewModal.dataset.productId = '';
    $('#quickviewBody').innerHTML = '<div style="padding:60px;text-align:center;color:var(--text-dim);">Loading…</div>';
    openLayer(quickviewModal);
    try {
      const data = await api('/products/' + encodeURIComponent(idOrSlug));
      renderQuickview(data.product, data.reviews);
    } catch (err) {
      $('#quickviewBody').innerHTML = `<div style="padding:60px;text-align:center;color:var(--text-dim);">${escapeHtml(err.message)}</div>`;
    }
  }

  function renderQuickview(p, reviews) {
    quickviewModal.dataset.productId = p.id;
    const reviewsHtml = reviews.length
      ? reviews
          .slice()
          .reverse()
          .map(
            (r) => `
        <div class="review-item">
          <span class="rname">${escapeHtml(r.userName)}</span><span class="stars">${starRow(r.rating)}</span>
          <p>${escapeHtml(r.comment || '')}</p>
        </div>`
          )
          .join('')
      : '<p style="color:var(--text-faint); font-size:13px;">No reviews yet — be the first to leave one.</p>';

    $('#quickviewBody').innerHTML = `
      <div class="quickview">
        <div class="qv-media" style="background:${p.gradient}"></div>
        <div class="qv-info">
          <span class="qv-cat">${escapeHtml(p.categoryLabel)}</span>
          <h3>${escapeHtml(p.name)}</h3>
          <p class="qv-desc">${escapeHtml(p.description)}</p>
          <div class="qv-meta">
            <span><b>${p.itemCount}</b> items</span>
            <span><b>${escapeHtml(p.format)}</b> format</span>
            <span><span class="stars" style="color:var(--amber);">${starRow(p.rating)}</span> ${p.rating.toFixed(1)} (${p.reviewCount})</span>
          </div>
          <div class="qv-price-row">
            <span class="price" style="font-size:24px;">${money(p.price)}</span>
            ${p.compareAtPrice ? `<small style="color:var(--text-faint); text-decoration:line-through; font-family:var(--ff-mono);">${money(p.compareAtPrice)}</small>` : ''}
          </div>
          <div class="qv-qty">
            <button class="qty-btn" id="qvMinus">−</button>
            <span class="qty-val" id="qvQty">1</span>
            <button class="qty-btn" id="qvPlus">+</button>
          </div>
          <button class="btn btn-primary" style="width:100%;" id="qvAdd">Add to cart</button>

          <div class="reviews-list">${reviewsHtml}</div>
          <form id="reviewForm" style="margin-top:16px;">
            <div class="field">
              <label>Your rating</label>
              <select id="reviewRating" style="width:100%; background:var(--bg-soft); border:1px solid var(--line); border-radius:10px; padding:10px 12px; color:var(--text);">
                <option value="5">★★★★★ Excellent</option>
                <option value="4">★★★★☆ Good</option>
                <option value="3">★★★☆☆ Okay</option>
                <option value="2">★★☆☆☆ Poor</option>
                <option value="1">★☆☆☆☆ Bad</option>
              </select>
            </div>
            <div class="field"><textarea id="reviewComment" placeholder="Share what worked for your shoot or edit…" maxlength="500"></textarea></div>
            <button type="submit" class="btn btn-ghost" style="width:100%;">Post review</button>
          </form>
        </div>
      </div>`;

    let qty = 1;
    const qtyEl = $('#qvQty');
    $('#qvMinus').addEventListener('click', () => { qty = Math.max(1, qty - 1); qtyEl.textContent = qty; });
    $('#qvPlus').addEventListener('click', () => { qty = Math.min(20, qty + 1); qtyEl.textContent = qty; });
    $('#qvAdd').addEventListener('click', () => addToCart(p.id, qty));

    $('#reviewForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!state.user) {
        closeLayer(quickviewModal);
        openAuth('login');
        toast('Sign in to leave a review.', 'info');
        return;
      }
      const rating = Number($('#reviewRating').value);
      const comment = $('#reviewComment').value.trim();
      try {
        await api(`/products/${p.id}/reviews`, { method: 'POST', body: JSON.stringify({ rating, comment }) });
        toast('Review posted — thanks!', 'success');
        openQuickview(p.id);
        loadProducts();
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  }

  $('#closeQuickview').addEventListener('click', () => closeLayer(quickviewModal));

  // ================= CART =================
  const cartDrawer = $('#cartDrawer');
  $('#cartBtn').addEventListener('click', () => { openLayer(cartDrawer); refreshCart(); });
  $('#closeCart').addEventListener('click', () => closeLayer(cartDrawer));

  function renderCartCount() {
    const badge = $('#cartCount');
    if (state.cart.count > 0) {
      badge.style.display = 'flex';
      badge.textContent = state.cart.count;
    } else {
      badge.style.display = 'none';
    }
  }

  function renderCart() {
    const body = $('#cartBody');
    const foot = $('#cartFoot');
    if (state.cart.items.length === 0) {
      body.innerHTML = `<div class="cart-empty"><div class="big">🛒</div><p>Your cart is empty.<br>Browse the catalog to find your next grade.</p></div>`;
      foot.innerHTML = `<button class="btn btn-ghost" style="width:100%;" id="cartBrowseBtn">Browse packs</button>`;
      $('#cartBrowseBtn').addEventListener('click', () => {
        closeLayer(cartDrawer);
        document.getElementById('products').scrollIntoView({ behavior: 'smooth' });
      });
      return;
    }

    body.innerHTML = state.cart.items
      .map(
        (item) => `
      <div class="cart-item" data-id="${item.productId}">
        <div class="cart-thumb" style="background:${item.gradient}"></div>
        <div class="cart-item-info">
          <span class="cat">${escapeHtml(item.categoryLabel)}</span>
          <h5>${escapeHtml(item.name)}</h5>
          <div class="qty-row">
            <button class="qty-btn" data-qty-minus="${item.productId}">−</button>
            <span class="qty-val">${item.quantity}</span>
            <button class="qty-btn" data-qty-plus="${item.productId}">+</button>
            <span class="remove-link" data-remove="${item.productId}">Remove</span>
          </div>
        </div>
        <div class="cart-item-price">${money(item.lineTotal)}</div>
      </div>`
      )
      .join('');

    foot.innerHTML = `
      <div class="subtotal-row"><span>Subtotal</span><b>${money(state.cart.subtotal)}</b></div>
      <button class="btn btn-primary" id="checkoutBtn">Checkout</button>
      <p class="foot-note">Instant download after checkout · Demo store, no real payment</p>`;

    $$('[data-qty-minus]', body).forEach((btn) =>
      btn.addEventListener('click', () => updateCartQty(btn.dataset.qtyMinus, -1))
    );
    $$('[data-qty-plus]', body).forEach((btn) =>
      btn.addEventListener('click', () => updateCartQty(btn.dataset.qtyPlus, 1))
    );
    $$('[data-remove]', body).forEach((btn) =>
      btn.addEventListener('click', () => removeFromCart(btn.dataset.remove))
    );
    $('#checkoutBtn').addEventListener('click', checkout);
  }

  async function refreshCart() {
    try {
      state.cart = await api('/cart');
      renderCartCount();
      renderCart();
    } catch (err) {
      toast("Couldn't load your cart: " + err.message, 'error');
    }
  }

  async function addToCart(productId, quantity) {
    try {
      state.cart = await api('/cart/items', { method: 'POST', body: JSON.stringify({ productId, quantity }) });
      renderCartCount();
      renderCart();
      toast('Added to cart', 'success');
      openLayer(cartDrawer);
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  async function updateCartQty(productId, delta) {
    const item = state.cart.items.find((i) => i.productId === productId);
    if (!item) return;
    const nextQty = item.quantity + delta;
    try {
      state.cart = await api(`/cart/items/${productId}`, { method: 'PATCH', body: JSON.stringify({ quantity: nextQty }) });
      renderCartCount();
      renderCart();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  async function removeFromCart(productId) {
    try {
      state.cart = await api(`/cart/items/${productId}`, { method: 'DELETE' });
      renderCartCount();
      renderCart();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  async function checkout() {
    if (!state.user) {
      closeLayer(cartDrawer);
      openAuth('login');
      toast('Sign in to check out with Razorpay.', 'info');
      return;
    }
    const btn = $('#checkoutBtn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Preparing Razorpay…'; }
    try {
      const orderData = await api('/razorpay/create-order', { method: 'POST' });
      
      if (window.Razorpay) {
        const options = {
          key: orderData.keyId,
          amount: orderData.amount,
          currency: orderData.currency,
          name: 'ShreeStudio',
          description: 'Presets & Motion Packs Order',
          order_id: orderData.orderId.startsWith('order_rzp_mock_') ? undefined : orderData.orderId,
          prefill: {
            name: state.user.name || '',
            email: state.user.email || '',
          },
          theme: {
            color: '#e535ab',
          },
          handler: async function (response) {
            try {
              const verifyRes = await api('/razorpay/verify-payment', {
                method: 'POST',
                body: JSON.stringify({
                  razorpay_order_id: response.razorpay_order_id || orderData.orderId,
                  razorpay_payment_id: response.razorpay_payment_id || ('pay_' + Date.now()),
                  razorpay_signature: response.razorpay_signature || 'mock_sig',
                }),
              });
              state.cart = { items: [], subtotal: 0, count: 0 };
              renderCartCount();
              renderCart();
              closeLayer(cartDrawer);
              showOrderSuccess(verifyRes.order, verifyRes.emailSent, verifyRes.userEmail);
            } catch (vErr) {
              toast(vErr.message, 'error');
            }
          },
          modal: {
            ondismiss: function () {
              if (btn) { btn.disabled = false; btn.textContent = 'Checkout'; }
              toast('Payment cancelled.', 'info');
            }
          }
        };

        if (orderData.orderId.startsWith('order_rzp_mock_')) {
          // Dev test mode direct verification prompt
          const confirmPayment = confirm(`[Razorpay Test Mode]\n\nPay ${money(orderData.subtotal)} via Razorpay UPI / Card?`);
          if (confirmPayment) {
            options.handler({
              razorpay_order_id: orderData.orderId,
              razorpay_payment_id: 'pay_rzp_mock_' + Date.now().toString(36),
              razorpay_signature: 'mock_signature',
            });
          } else {
            if (btn) { btn.disabled = false; btn.textContent = 'Checkout'; }
          }
          return;
        }

        const rzp = new window.Razorpay(options);
        rzp.open();
      } else {
        const data = await api('/orders', { method: 'POST' });
        state.cart = { items: [], subtotal: 0, count: 0 };
        renderCartCount();
        renderCart();
        closeLayer(cartDrawer);
        showOrderSuccess(data.order, true, state.user ? state.user.email : '');
      }
    } catch (err) {
      toast(err.message, 'error');
      if (btn) { btn.disabled = false; btn.textContent = 'Checkout'; }
    }
  }

  const orderModal = $('#orderModal');
  function showOrderSuccess(order, emailSent = true, userEmail = '') {
    const paymentMethodLabel = order.paymentId ? `Paid via Razorpay (${order.paymentId.slice(-10)})` : 'Paid';
    const emailNotice = userEmail || (state.user ? state.user.email : '');
    $('#orderBody').innerHTML = `
      <div class="order-success">
        <div class="check">✓</div>
        ${emailNotice ? `<div class="email-sent-badge"><span class="dot"></span><span>Receipt sent to ${escapeHtml(emailNotice)}</span></div>` : ''}
        <h3>Order confirmed</h3>
        <p>Order #${escapeHtml(order.id.slice(-8))} — ${paymentMethodLabel}</p>
        <div class="order-items">
          ${order.items
            .map((i) => `<div class="oi-row"><span>${escapeHtml(i.name)} × ${i.quantity}</span><b>${money(i.lineTotal)}</b></div>`)
            .join('')}
          <div class="oi-total"><span>Total</span><span>${money(order.subtotal)}</span></div>
        </div>
        <button class="btn btn-primary" style="width:100%;" id="orderCloseBtn">Download Presets Now</button>
      </div>`;
    openLayer(orderModal);
    $('#orderCloseBtn').addEventListener('click', () => closeLayer(orderModal));
  }

  // ================= AUTH =================
  const authModal = $('#authModal');
  let authMode = 'login';

  function setAuthMode(mode) {
    authMode = mode;
    const tabLogin = $('#tabLoginBtn');
    const tabSignup = $('#tabSignupBtn');
    const nameField = $('#nameField');
    const title = $('#authTitle');
    const submitBtn = $('#authSubmitBtn');
    const errEl = $('#authError');
    if (errEl) { errEl.textContent = ''; errEl.classList.remove('show'); }

    if (mode === 'signup') {
      if (tabLogin) tabLogin.classList.remove('active');
      if (tabSignup) tabSignup.classList.add('active');
      if (nameField) nameField.style.display = 'block';
      if (title) title.textContent = 'Create a ShreeStudio account';
      if (submitBtn) submitBtn.textContent = 'Create account';
    } else {
      if (tabSignup) tabSignup.classList.remove('active');
      if (tabLogin) tabLogin.classList.add('active');
      if (nameField) nameField.style.display = 'none';
      if (title) title.textContent = 'Sign in to ShreeStudio';
      if (submitBtn) submitBtn.textContent = 'Sign in';
    }
  }

  function openAuth(mode = 'login') {
    setAuthMode(mode);
    openLayer(authModal);
  }

  const tabLoginBtn = $('#tabLoginBtn');
  const tabSignupBtn = $('#tabSignupBtn');
  if (tabLoginBtn) tabLoginBtn.addEventListener('click', () => setAuthMode('login'));
  if (tabSignupBtn) tabSignupBtn.addEventListener('click', () => setAuthMode('signup'));
  $('#closeAuth').addEventListener('click', () => closeLayer(authModal));

  const authForm = $('#authForm');
  if (authForm) {
    authForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const errEl = $('#authError');
      const submitBtn = $('#authSubmitBtn');
      if (errEl) errEl.classList.remove('show');

      const email = $('#authEmail').value.trim();
      const password = $('#authPassword').value;
      const name = $('#authName').value.trim();

      if (authMode === 'signup' && !name) {
        if (errEl) { errEl.textContent = 'Please enter your full name.'; errEl.classList.add('show'); }
        return;
      }

      if (submitBtn) { submitBtn.disabled = true; submitBtn.innerHTML = '<span class="spinner"></span> Processing…'; }

      try {
        const endpoint = authMode === 'signup' ? '/auth/signup' : '/auth/login';
        const body = authMode === 'signup' ? { name, email, password } : { email, password };
        const data = await api(endpoint, { method: 'POST', body: JSON.stringify(body) });

        state.user = data.user;
        renderAuthArea();
        closeLayer(authModal);
        authForm.reset();
        toast(authMode === 'signup' ? `Welcome, ${data.user.name.split(' ')[0]}!` : `Signed in as ${data.user.name}`, 'success');
        refreshCart();
      } catch (err) {
        if (errEl) {
          if (authMode === 'login') {
            errEl.innerHTML = `${escapeHtml(err.message || 'Incorrect email or password.')}<br><button type="button" id="autoSwitchSignup" style="background:none; border:none; color:var(--cyan); text-decoration:underline; font-size:12.5px; cursor:pointer; margin-top:6px; display:inline-block;">New here? Click to Create Account</button>`;
            const switchBtn = $('#autoSwitchSignup', errEl);
            if (switchBtn) {
              switchBtn.addEventListener('click', () => setAuthMode('signup'));
            }
          } else {
            errEl.textContent = err.message || 'Authentication failed.';
          }
          errEl.classList.add('show');
        }
      } finally {
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = authMode === 'signup' ? 'Create account' : 'Sign in'; }
      }
    });
  }

  // Social Auth Handlers (Google & Apple)
  const googleBtn = $('#googleSignInBtn');
  const appleBtn = $('#appleSignInBtn');

  if (googleBtn) {
    googleBtn.addEventListener('click', async () => {
      if (window.supabase && typeof window.supabase.createClient === 'function') {
        toast('Redirecting to Google OAuth via Supabase…', 'info');
        try {
          const supabase = window.supabase.createClient(
            'https://osrafnvccspnhwcuhkxn.supabase.co',
            'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9zcmFmbnZjY3Nwbmh3Y3Voa3huIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY2ODA0OTAsImV4cCI6MjEwMjI1NjQ5MH0.rKZchKwD7W-DhbVbHQUiGpARRU2hPMLZQZOddEjpkQc'
          );
          await supabase.auth.signInWithOAuth({ provider: 'google' });
        } catch (_e) {
          toast('Supabase Google OAuth setup ready. Add keys in server/.env', 'info');
        }
      } else {
        toast('Google Sign in ready via Supabase OAuth', 'info');
      }
    });
  }

  if (appleBtn) {
    appleBtn.addEventListener('click', async () => {
      if (window.supabase && typeof window.supabase.createClient === 'function') {
        toast('Redirecting to Apple (iOS) OAuth via Supabase…', 'info');
        try {
          const supabase = window.supabase.createClient(
            'https://osrafnvccspnhwcuhkxn.supabase.co',
            'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9zcmFmbnZjY3Nwbmh3Y3Voa3huIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY2ODA0OTAsImV4cCI6MjEwMjI1NjQ5MH0.rKZchKwD7W-DhbVbHQUiGpARRU2hPMLZQZOddEjpkQc'
          );
          await supabase.auth.signInWithOAuth({ provider: 'apple' });
        } catch (_e) {
          toast('Supabase Apple OAuth setup ready. Add keys in server/.env', 'info');
        }
      } else {
        toast('Apple (iOS) Sign in ready via Supabase OAuth', 'info');
      }
    });
  }

  function renderAuthArea() {
    const area = $('#authArea');
    const addBtn = $('#openAddProjectBtn');
    if (addBtn) {
      addBtn.style.display = (state.user && state.user.isAdmin) ? 'inline-flex' : 'none';
    }
    if (!state.user) {
      area.innerHTML = `<button class="link-btn" id="signInBtn">Sign in</button>`;
      $('#signInBtn').addEventListener('click', () => openAuth('login'));
      return;
    }
    const initials = state.user.name
      .split(' ')
      .map((s) => s[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
    area.innerHTML = `
      <div class="account-menu">
        <button class="account-chip" id="accountChip">
          <span class="av">${escapeHtml(initials)}</span>
          <span>${escapeHtml(state.user.name.split(' ')[0])}</span>
        </button>
        <div class="account-dropdown" id="accountDropdown">
          <div class="who"><b>${escapeHtml(state.user.name)}</b><span>${escapeHtml(state.user.email)}</span></div>
          <button id="viewOrdersBtn">Order history</button>
          <button id="signOutBtn">Sign out</button>
        </div>
      </div>`;
    const dropdown = $('#accountDropdown');
    $('#accountChip').addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.classList.toggle('open');
    });
    document.addEventListener('click', () => dropdown.classList.remove('open'), { once: true });
    $('#viewOrdersBtn').addEventListener('click', showOrderHistory);
    $('#signOutBtn').addEventListener('click', signOut);
  }

  async function showOrderHistory() {
    try {
      const data = await api('/orders');
      if (data.orders.length === 0) {
        $('#orderBody').innerHTML = `<div class="order-success"><h3>No orders yet</h3><p>Anything you buy will show up here with instant download access.</p><button class="btn btn-primary" style="width:100%;" id="orderCloseBtn">Close</button></div>`;
      } else {
        $('#orderBody').innerHTML = `
          <div style="padding:6px 2px;">
            <h3 style="font-family:var(--ff-display); font-size:19px; margin-bottom:16px;">Order history</h3>
            ${data.orders
              .map(
                (o) => `
              <div class="order-items" style="margin-bottom:14px;">
                <div class="oi-row"><span>Order #${escapeHtml(o.id.slice(-8))}</span><b>${new Date(o.createdAt).toLocaleDateString()}</b></div>
                ${o.items.map((i) => `<div class="oi-row"><span>${escapeHtml(i.name)} × ${i.quantity}</span><b>${money(i.lineTotal)}</b></div>`).join('')}
                <div class="oi-total"><span>Total</span><span>${money(o.subtotal)}</span></div>
              </div>`
              )
              .join('')}
            <button class="btn btn-ghost" style="width:100%;" id="orderCloseBtn">Close</button>
          </div>`;
      }
      openLayer(orderModal);
      $('#orderCloseBtn').addEventListener('click', () => closeLayer(orderModal));
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  async function signOut() {
    try {
      await api('/auth/logout', { method: 'POST' });
    } catch (_e) { /* ignore */ }
    state.user = null;
    renderAuthArea();
    toast('Signed out', 'info');
    refreshCart();
  }

  async function loadCurrentUser() {
    try {
      const data = await api('/auth/me');
      state.user = data.user;
    } catch (_e) {
      state.user = null;
    }
    renderAuthArea();
  }

  // ================= ADD PROJECT / PACK =================
  const addProjectModal = $('#addProjectModal');
  const openAddProjectBtn = $('#openAddProjectBtn');
  const closeAddProjectBtn = $('#closeAddProject');

  if (openAddProjectBtn) {
    openAddProjectBtn.addEventListener('click', () => {
      if (!state.user) {
        openAuth('login');
        toast('Sign in to publish presets or projects to the store.', 'info');
        return;
      }
      openLayer(addProjectModal);
    });
  }
  if (closeAddProjectBtn) {
    closeAddProjectBtn.addEventListener('click', () => closeLayer(addProjectModal));
  }

  const addProjectForm = $('#addProjectForm');
  if (addProjectForm) {
    addProjectForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = $('#projName').value.trim();
      const category = $('#projCategory').value;
      const price = $('#projPrice').value;
      const compareAtPrice = $('#projComparePrice').value;
      const tagline = $('#projTagline').value.trim();
      const itemCount = $('#projItemCount').value;
      const description = $('#projDescription').value.trim();

      try {
        const data = await api('/products', {
          method: 'POST',
          body: JSON.stringify({
            name,
            category,
            price,
            compareAtPrice,
            tagline,
            itemCount,
            description,
          }),
        });
        toast(`Published "${data.product.name}" to storefront!`, 'success');
        closeLayer(addProjectModal);
        addProjectForm.reset();
        await loadCategories();
        await loadProducts();
        const prodSection = document.getElementById('products');
        if (prodSection) prodSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  }

  // ================= hero 3D tilt (from original design) =================
  const stage = document.getElementById('stage');
  const inner = document.getElementById('stageInner');
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches === false && stage) {
    stage.addEventListener('mousemove', (e) => {
      const rect = stage.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = (e.clientY - rect.top) / rect.height - 0.5;
      inner.style.transform = `rotateX(${8 - y * 16}deg) rotateY(${-14 + x * 20}deg)`;
    });
    stage.addEventListener('mouseleave', () => {
      inner.style.transform = 'rotateX(8deg) rotateY(-14deg)';
    });
  }

  // ================= 3D Interactive Neon Tubes Cursor Background =================
  async function initTubesBackground() {
    const canvas = document.getElementById('tubesCanvas');
    if (!canvas || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    try {
      const module = await import('https://cdn.jsdelivr.net/npm/threejs-components@0.0.19/build/cursors/tubes1.min.js');
      const TubesCursor = module.default;

      const randomColors = (count) => {
        return new Array(count)
          .fill(0)
          .map(() => '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0'));
      };

      const app = TubesCursor(canvas, {
        size: "window",
        tubes: {
          colors: ["#f967fb", "#53bc28", "#6958d5"],
          lights: {
            intensity: 200,
            colors: ["#83f36e", "#fe8a2e", "#ff008a", "#60aed5"]
          }
        }
      });

      // Forward cursor movements from window to canvas element
      const forwardPointer = (e) => {
        canvas.dispatchEvent(new PointerEvent('pointerenter', { clientX: e.clientX, clientY: e.clientY, bubbles: true }));
        canvas.dispatchEvent(new PointerEvent('pointerover', { clientX: e.clientX, clientY: e.clientY, bubbles: true }));
        canvas.dispatchEvent(new PointerEvent('pointermove', { clientX: e.clientX, clientY: e.clientY, bubbles: true }));
      };
      window.addEventListener('pointermove', forwardPointer);
      window.addEventListener('mousemove', forwardPointer);

      document.body.addEventListener('click', (e) => {
        if (e.target.closest('button, a, input, select, textarea, .modal, .drawer, .pcard, .cat-card')) return;
        if (app && app.tubes) {
          app.tubes.setColors(randomColors(3));
          app.tubes.setLightsColors(randomColors(4));
        }
      });
    } catch (err) {
      console.warn('Could not initialize 3D tubes background:', err);
    }
  }

  // ================= boot =================
  (async function init() {
    initTubesBackground();
    await Promise.all([loadCurrentUser(), loadCategories(), loadProducts(), refreshCart()]);
  })();
})();
