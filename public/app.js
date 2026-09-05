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
  const money = (n) => {
    const num = Number(n);
    if (isNaN(num)) return '₹0';
    if (Number.isInteger(num)) {
      return `₹${num.toLocaleString('en-IN')}`;
    }
    return `₹${num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };
  const escapeHtml = (str) =>
    String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  async function api(path, options = {}) {
    const { headers: extraHeaders, ...rest } = options;
    const isForm = typeof FormData !== 'undefined' && rest.body instanceof FormData;
    const headers = { ...(extraHeaders || {}) };
    if (!isForm) headers['Content-Type'] = headers['Content-Type'] || 'application/json';
    const res = await fetch(API + path, {
      credentials: 'include',
      headers,
      ...rest,
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
    if (!stack) return;
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
    $$('video', el).forEach((v) => v.pause());
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
    lightroom: {
      cls: 'cat1',
      blurb: 'Desktop & mobile .xmp / .dng presets',
      logo: '/logos/Adobe_Photoshop_Lightroom_CC_logo.svg.webp',
    },
    photoshop: {
      cls: 'cat2',
      blurb: 'Actions, gradients & retouch panels',
      logo: '/logos/Adobe_Photoshop_CC_icon.svg.webp',
    },
    premiere: {
      cls: 'cat3',
      blurb: 'LUTs, transitions & title templates',
      logo: '/logos/Adobe_Premiere_Pro_CC_icon.svg.webp',
    },
    aftereffects: {
      cls: 'cat4',
      blurb: 'Motion templates & animation presets',
      logo: '/logos/Adobe_After_Effects_CC_icon.svg.webp',
    },
  };

  function renderCategories() {
    const grid = $('#categoryGrid');
    grid.innerHTML = state.categories
      .map((c) => {
        const style = catStyles[c.category] || { cls: 'cat1', blurb: '', logo: '' };
        const active = state.activeCategory === c.category ? 'active' : '';
        return `
          <button class="cat-card ${style.cls} ${active}" data-category="${c.category}">
            <div class="cat-card-top">
              ${style.logo ? `<div class="cat-logo-wrap"><img src="${style.logo}" alt="${escapeHtml(c.label)} logo" class="cat-logo" loading="lazy" /></div>` : ''}
              <span class="count">${c.count} pack${c.count === 1 ? '' : 's'}</span>
            </div>
            <div class="cat-card-bottom">
              <h3 style="color:#ffffff;">${escapeHtml(c.label)}</h3>
              <p>${escapeHtml(style.blurb)}</p>
            </div>
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

  function previewBadgeHtml(p) {
    if (!p.previewUrl) return '';
    return `<span class="preview-available-badge">▶ Preview available</span>`;
  }

  function productCardHtml(p) {
    const isAdmin = Boolean(state.user && state.user.isAdmin);
    return `
      <div class="prod-card" data-id="${p.id}">
        <div class="prod-media" style="background:${p.gradient}" data-quickview="${p.id}">
          ${previewBadgeHtml(p)}
          <span class="badge">${escapeHtml(p.tagline)}</span>
          ${p.bestseller ? '<span class="badge best">Bestseller</span>' : ''}
        </div>
        <div class="prod-body">
          <span class="prod-cat">${escapeHtml(p.categoryLabel)}</span>
          <h4 data-quickview="${p.id}">${escapeHtml(p.name)}</h4>
          <div class="prod-rating"><span class="stars">${starRow(p.rating)}</span> ${p.rating.toFixed(1)} · ${p.reviewCount} reviews</div>
          <div class="prod-foot-stack">
            <div class="prod-foot">
              <span class="price">${money(p.price)}${p.compareAtPrice ? `<small>${money(p.compareAtPrice)}</small>` : ''}</span>
              <button class="add-btn" data-add="${p.id}">Add to cart</button>
            </div>
            <button type="button" class="btn-see-preview ${p.previewUrl ? 'has-video' : ''}" data-see-preview="${p.id}">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              See Preview
            </button>
            ${isAdmin ? `
            <div class="admin-card-bar">
              <span style="color:var(--text-faint);">Admin</span>
              <button type="button" class="admin-card-btn" data-admin-set-preview="${p.id}">🔗 Set Preview Link</button>
            </div>` : ''}
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
      $$('[data-see-preview]', grid).forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          openVideoPreview(btn.dataset.seePreview);
        });
      });
      // Admin: set a YouTube/Drive preview link for a product
      $$('[data-admin-set-preview]', grid).forEach((btn) => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const pid = btn.dataset.adminSetPreview;
          const prod = state.products.find((pr) => pr.id === pid);
          const current = (prod && prod.previewUrl) || '';
          const url = window.prompt('Enter YouTube or Google Drive URL for this product preview:', current);
          if (url === null) return; // cancelled
          try {
            await api(`/products/${pid}/preview`, {
              method: 'POST',
              body: JSON.stringify({ previewUrl: url.trim() }),
            });
            toast('Preview link saved!', 'success');
            await loadProducts();
          } catch (err) {
            toast(err.message, 'error');
          }
        });
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

    const isAdmin = Boolean(state.user && state.user.isAdmin);
    const qvPreviewBtn = p.previewUrl
      ? `<button type="button" class="btn-see-preview has-video" style="margin-top:10px;" id="qvSeePreviewBtn">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          Watch Preview
         </button>`
      : `<button type="button" class="btn-see-preview" style="margin-top:10px; opacity:0.5; cursor:default;" disabled>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          No preview available
         </button>`;

    $('#quickviewBody').innerHTML = `
      <div class="quickview">
        <div class="qv-media" style="background:${p.gradient}">
          <div class="qv-gradient-preview"
               style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:10px;">
            ${p.previewUrl ? `<span style="font-size:32px;">▶</span><span style="font-size:13px;color:rgba(255,255,255,0.7);">Preview on YouTube/Drive</span>` : ''}
          </div>
        </div>
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
          ${qvPreviewBtn}
          ${isAdmin ? `
          <div style="margin-top:12px; padding:10px 12px; background:var(--bg-soft); border:1px dashed var(--line); border-radius:10px; display:flex; justify-content:space-between; align-items:center; font-size:12px;">
            <span style="color:var(--text-faint);">Admin Preview Link:</span>
            <button type="button" style="color:var(--cyan); cursor:pointer; text-decoration:underline; font-family:var(--ff-mono); background:none; border:none; font-size:12px;" id="qvAdminSetPreviewBtn">🔗 ${p.previewUrl ? 'Update Link' : 'Set Link'}</button>
          </div>` : ''}

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

    const qvPreviewBtnEl = $('#qvSeePreviewBtn');
    if (qvPreviewBtnEl && p.previewUrl) {
      qvPreviewBtnEl.addEventListener('click', () => {
        window.open(p.previewUrl, '_blank', 'noopener,noreferrer');
      });
    }

    const qvAdminBtn = $('#qvAdminSetPreviewBtn');
    if (qvAdminBtn) {
      qvAdminBtn.addEventListener('click', async () => {
        const url = window.prompt('Enter YouTube or Google Drive URL for preview:', p.previewUrl || '');
        if (url === null) return;
        try {
          await api(`/products/${p.id}/preview`, {
            method: 'POST',
            body: JSON.stringify({ previewUrl: url.trim() }),
          });
          toast('Preview link saved!', 'success');
          await loadProducts();
          openQuickview(p.id);
        } catch (err) {
          toast(err.message, 'error');
        }
      });
    }

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

  $('#closeQuickview').addEventListener('click', () => {
    $$('video', quickviewModal).forEach((v) => v.pause());
    closeLayer(quickviewModal);
  });

  // ================= DEDICATED VIDEO PREVIEW =================
  // Instead of embedding video, open the YouTube/Google Drive link in a new tab
  async function openVideoPreview(id) {
    let p = state.products.find((item) => item.id === id || item.slug === id);
    if (!p) {
      try {
        const data = await api('/products/' + id);
        p = data.product;
      } catch (_e) {
        toast('Product not found.', 'error');
        return;
      }
    }
    if (!p) return;

    if (p.previewUrl) {
      // Open YouTube or Google Drive link in a new tab
      window.open(p.previewUrl, '_blank', 'noopener,noreferrer');
    } else {
      toast('No preview available for this pack yet.', 'info');
    }
  }

  // ================= CART =================
  const cartDrawer = $('#cartDrawer');
  $('#cartBtn').addEventListener('click', () => { openLayer(cartDrawer); refreshCart(); });
  $('#closeCart').addEventListener('click', () => closeLayer(cartDrawer));

  function renderCartCount() {
    const badge = $('#cartCount');
    const mbBadge = $('#mbCartBadge');
    if (state.cart.count > 0) {
      if (badge) {
        badge.style.display = 'flex';
        badge.textContent = state.cart.count;
      }
      if (mbBadge) {
        mbBadge.style.display = 'flex';
        mbBadge.textContent = state.cart.count;
      }
    } else {
      if (badge) badge.style.display = 'none';
      if (mbBadge) mbBadge.style.display = 'none';
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
          ${item.previewVideo ? `<button type="button" class="preview-link" data-cart-preview="${item.productId}">Watch preview</button>` : ''}
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
    $$('[data-cart-preview]', body).forEach((btn) =>
      btn.addEventListener('click', () => {
        closeLayer(cartDrawer);
        openVideoPreview(btn.dataset.cartPreview);
      })
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
      const [orderData, configData] = await Promise.all([
        api('/razorpay/create-order', { method: 'POST' }),
        api('/config'),
      ]);
      
      if (window.Razorpay) {
        const options = {
          key: configData.razorpayKeyId,
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
    const paymentMethodLabel = order.paymentId ? `Paid via Razorpay (${order.paymentId.slice(-10)})` : 'Paid & Verified';
    const emailNotice = userEmail || (state.user ? state.user.email : '');
    $('#orderBody').innerHTML = `
      <div class="order-success">
        <div class="check">✓</div>
        ${emailNotice ? `<div class="email-sent-badge"><span class="dot"></span><span>Receipt sent to ${escapeHtml(emailNotice)}</span></div>` : ''}
        <h3>Order Confirmed! 🎉</h3>
        <p>Order #${escapeHtml(order.id.slice(-8))} — ${paymentMethodLabel}</p>
        
        <div class="order-drive-box">
          <div class="order-drive-box-head">
            <span>⚡ Instant Google Drive Downloads:</span>
          </div>
          ${order.items
            .map(
              (i) => `
            <div class="order-drive-item">
              <div>
                <div class="order-drive-item-name">${escapeHtml(i.name)}</div>
                <div class="order-drive-item-sub">Qty: ${i.quantity} · ${money(i.lineTotal || i.price)}</div>
              </div>
              <a href="${escapeHtml(i.driveLink || 'https://drive.google.com')}" target="_blank" rel="noopener noreferrer" class="btn-drive-download">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Open Google Drive
              </a>
            </div>`
            )
            .join('')}
        </div>

        <div class="order-items">
          ${order.items
            .map((i) => `<div class="oi-row"><span>${escapeHtml(i.name)} × ${i.quantity}</span><b>${money(i.lineTotal)}</b></div>`)
            .join('')}
          <div class="oi-total"><span>Total Paid</span><span>${money(order.subtotal)}</span></div>
        </div>
        <div style="display:flex; gap:10px; margin-top:14px;">
          <button class="btn btn-ghost" style="flex:1;" id="orderCloseBtn">Back to Store</button>
          <button class="btn btn-primary" style="flex:1;" id="orderViewPurchasesBtn">My Purchases</button>
        </div>
      </div>`;
    openLayer(orderModal);
    $('#orderCloseBtn').addEventListener('click', () => closeLayer(orderModal));
    const viewPurchasesBtn = $('#orderViewPurchasesBtn');
    if (viewPurchasesBtn) {
      viewPurchasesBtn.addEventListener('click', () => {
        closeLayer(orderModal);
        showOrderHistory();
      });
    }
  }

  // ================= AUTH (1-Click Google & Apple) =================
  const authModal = $('#authModal');

  function openAuth() {
    openLayer(authModal);
  }

  $('#closeAuth').addEventListener('click', () => closeLayer(authModal));

  // Social Auth Handlers (Google & Apple)
  const googleBtn = $('#googleSignInBtn');
  const appleBtn = $('#appleSignInBtn');

  if (googleBtn) {
    googleBtn.addEventListener('click', async () => {
      try {
        const cfg = await api('/config');
        if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) {
          toast('Supabase keys not configured in server/.env', 'error');
          return;
        }
        if (!window.supabase || typeof window.supabase.createClient !== 'function') {
          toast('Loading Google Sign-in… please tap again', 'info');
          return;
        }
        const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
        const { error } = await sb.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: window.location.origin,
          },
        });
        if (error) {
          toast(error.message, 'error');
        }
      } catch (err) {
        toast(err.message || 'Google Sign-in error', 'error');
      }
    });
  }

  if (appleBtn) {
    appleBtn.addEventListener('click', async () => {
      try {
        const cfg = await api('/config');
        if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) {
          toast('Supabase keys not configured in server/.env', 'error');
          return;
        }
        if (!window.supabase || typeof window.supabase.createClient !== 'function') {
          toast('Loading Apple Sign-in… please tap again', 'info');
          return;
        }
        const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
        const { error } = await sb.auth.signInWithOAuth({
          provider: 'apple',
          options: {
            redirectTo: window.location.origin,
          },
        });
        if (error) {
          toast(error.message, 'error');
        }
      } catch (err) {
        toast(err.message || 'Apple Sign-in error', 'error');
      }
    });
  }

  function renderAuthArea() {
    const area = $('#authArea');
    const addBtn = $('#openAddProjectBtn');
    const manageBtn = $('#openManagePreviewsBtn');
    const mbAccountLabel = $('#mbAccountLabel');
    const isAdmin = Boolean(state.user && state.user.isAdmin);
    if (addBtn) addBtn.style.display = isAdmin ? 'inline-flex' : 'none';
    if (manageBtn) manageBtn.style.display = isAdmin ? 'inline-flex' : 'none';
    if (!state.user) {
      area.innerHTML = `<button class="btn btn-primary sm" id="signInBtn" style="padding:7px 16px; font-size:13px; border-radius:999px;">Sign in</button>`;
      $('#signInBtn').addEventListener('click', () => openAuth('login'));
      return;
    }
    const firstName = (state.user.name || 'User').split(' ')[0];

    const initials = (state.user.name || 'User')
      .split(' ')
      .map((s) => s[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
    area.innerHTML = `
      <div class="account-menu">
        <button class="account-chip" id="accountChip" title="Account Settings">
          <span class="av">
            <span class="online-dot"></span>
            ${escapeHtml(initials)}
          </span>
          <span>${escapeHtml(firstName)}</span>
        </button>
        <div class="account-dropdown" id="accountDropdown">
          <div class="who"><b>${escapeHtml(state.user.name || 'User')}</b><span>${escapeHtml(state.user.email || '')}</span></div>
          ${isAdmin ? `
          <button id="mbAddPackBtn" style="color:var(--cyan); font-weight:600;">
            <span class="label-wrap">➕ Add New Pack</span>
          </button>
          <button id="mbManagePreviewsBtn" style="color:var(--violet); font-weight:600;">
            <span class="label-wrap">🎞️ Manage Previews</span>
          </button>
          ` : ''}
          <button id="viewCartMenuBtn">
            <span class="label-wrap">🛒 My Cart</span>
            <span style="font-family:var(--ff-mono); font-size:11.5px; background:var(--surface-2); border:1px solid var(--line); padding:2px 8px; border-radius:999px;">${state.cart.count || 0}</span>
          </button>
          <button id="viewOrdersBtn">
            <span class="label-wrap">📦 My Purchases</span>
            <span style="font-size:11.5px; color:var(--emerald); font-weight:600;">✓ Downloads</span>
          </button>
          <button id="signOutBtn" class="signout-btn">
            <span class="label-wrap">🚪 Sign out</span>
          </button>
        </div>
      </div>`;
    const dropdown = $('#accountDropdown');
    $('#accountChip').addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.classList.toggle('open');
    });
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.account-menu') && !e.target.closest('#mbNavAccount')) {
        dropdown.classList.remove('open');
      }
    });

    if (isAdmin) {
      const mbAdd = $('#mbAddPackBtn');
      if (mbAdd) mbAdd.addEventListener('click', () => {
        dropdown.classList.remove('open');
        openLayer($('#addProjectModal'));
      });
      const mbPrev = $('#mbManagePreviewsBtn');
      if (mbPrev) mbPrev.addEventListener('click', () => {
        dropdown.classList.remove('open');
        openManagePreviews();
      });
    }
    
    const cartMenuBtn = $('#viewCartMenuBtn');
    if (cartMenuBtn) {
      cartMenuBtn.addEventListener('click', () => {
        dropdown.classList.remove('open');
        openLayer(cartDrawer);
        refreshCart();
      });
    }
    $('#viewOrdersBtn').addEventListener('click', () => {
      dropdown.classList.remove('open');
      showOrderHistory();
    });
    $('#signOutBtn').addEventListener('click', signOut);
  }

  async function showOrderHistory() {
    try {
      const data = await api('/orders');
      if (data.orders.length === 0) {
        $('#orderBody').innerHTML = `
          <div class="order-success">
            <div style="font-size:38px; margin-bottom:12px;">📦</div>
            <h3>No purchases yet</h3>
            <p>Any preset packs you buy will show up here with permanent Google Drive download access.</p>
            <button class="btn btn-primary" style="width:100%;" id="orderCloseBtn">Explore Presets</button>
          </div>`;
      } else {
        $('#orderBody').innerHTML = `
          <div style="padding:6px 2px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
              <h3 style="font-family:var(--ff-display); font-size:20px; margin:0;">My Purchases & Downloads</h3>
              <span style="font-family:var(--ff-mono); font-size:12px; color:var(--emerald); background:rgba(52,211,153,0.1); border:1px solid rgba(52,211,153,0.25); padding:3px 8px; border-radius:6px;">${data.orders.length} Order${data.orders.length === 1 ? '' : 's'}</span>
            </div>
            ${data.orders
              .map(
                (o) => `
              <div class="order-items" style="margin-bottom:16px; background:var(--surface); border:1px solid var(--line);">
                <div class="oi-row" style="padding-bottom:10px; border-bottom:1px solid var(--line); margin-bottom:8px;">
                  <span><b>Order #${escapeHtml(o.id.slice(-8))}</b></span>
                  <span style="color:var(--text-faint); font-family:var(--ff-mono); font-size:12px;">${new Date(o.createdAt).toLocaleDateString()}</span>
                </div>
                ${o.items
                  .map(
                    (i) => `
                  <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 0; border-bottom:1px dashed rgba(255,255,255,0.06);">
                    <div>
                      <div style="font-weight:600; color:#fff; font-size:14px;">${escapeHtml(i.name)}</div>
                      <div style="font-size:11.5px; color:var(--text-faint); font-family:var(--ff-mono);">Qty: ${i.quantity} · ${money(i.lineTotal || i.price)}</div>
                    </div>
                    <a href="${escapeHtml(i.driveLink || 'https://drive.google.com')}" target="_blank" rel="noopener noreferrer" class="btn-drive-download">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                      Open Drive
                    </a>
                  </div>`
                  )
                  .join('')}
                <div class="oi-total" style="margin-top:10px; padding-top:10px;">
                  <span>Total Paid</span>
                  <span style="color:var(--magenta);">${money(o.subtotal)}</span>
                </div>
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
    if (window.supabase && typeof window.supabase.createClient === 'function') {
      try {
        const cfg = await api('/config');
        if (cfg.supabaseUrl && cfg.supabaseAnonKey) {
          const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
          await sb.auth.signOut();
        }
      } catch (_e) {}
    }
    state.user = null;
    renderAuthArea();
    toast('Signed out', 'info');
    refreshCart();
    loadProducts();
  }

  async function syncOAuthSession(user) {
    if (!user || !user.email) return;
    try {
      const data = await api('/auth/oauth-sync', {
        method: 'POST',
        body: JSON.stringify({
          id: user.id,
          email: user.email,
          name: user.user_metadata?.full_name || user.user_metadata?.name || user.email.split('@')[0],
        }),
      });
      if (data && data.user) {
        state.user = data.user;
        renderAuthArea();
        loadProducts();
        refreshCart();
        if (window.location.hash && (window.location.hash.includes('access_token') || window.location.hash.includes('error'))) {
          window.history.replaceState(null, '', window.location.pathname + window.location.search);
        }
      }
    } catch (_e) {}
  }

  async function loadCurrentUser() {
    // Check if redirected with an OAuth error in query or hash
    const urlParams = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const oauthError = urlParams.get('error_description') || hashParams.get('error_description') || urlParams.get('error') || hashParams.get('error');

    if (oauthError) {
      const decodedErr = decodeURIComponent(oauthError.replace(/\+/g, ' '));
      if (decodedErr.includes('exchange external code')) {
        toast('Google OAuth Error: Google Client Secret is missing or invalid in Supabase Dashboard.', 'error');
      } else {
        toast('Sign in error: ' + decodedErr, 'error');
      }
      // Clean ugly error params from URL
      window.history.replaceState(null, '', window.location.pathname);
    }

    try {
      const data = await api('/auth/me');
      state.user = data.user;
    } catch (_e) {
      state.user = null;
    }

    if (window.supabase && typeof window.supabase.createClient === 'function') {
      try {
        const cfg = await api('/config');
        if (cfg.supabaseUrl && cfg.supabaseAnonKey) {
          const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
          const { data: { session } } = await sb.auth.getSession();
          if (session && session.user && (!state.user || state.user.email !== session.user.email)) {
            await syncOAuthSession(session.user);
          }
          sb.auth.onAuthStateChange(async (_event, newSession) => {
            if (newSession && newSession.user) {
              await syncOAuthSession(newSession.user);
            }
          });
        }
      } catch (_sErr) {}
    }

    renderAuthArea();
    loadProducts();
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

  const managePreviewsModal = $('#managePreviewsModal');
  const openManagePreviewsBtn = $('#openManagePreviewsBtn');
  const closeManagePreviewsBtn = $('#closeManagePreviews');

  function renderManagePreviews(products) {
    const body = $('#managePreviewsBody');
    if (!products.length) {
      body.innerHTML = '<p class="form-note" style="text-align:left;">No packs yet. Add a pack first, then set a preview link.</p>';
      return;
    }
    body.innerHTML = products
      .map(
        (p) => `
      <div class="preview-admin-row" data-id="${p.id}">
        <div class="preview-admin-thumb" style="background:${p.gradient}">
          ${p.previewUrl ? '<span style="font-size:20px;">▶</span>' : ''}
        </div>
        <div class="preview-admin-meta">
          <b>${escapeHtml(p.name)}</b>
          <span>${escapeHtml(p.categoryLabel)} · ${p.previewUrl ? '<a href="' + escapeHtml(p.previewUrl) + '" target="_blank" rel="noopener" style="color:var(--cyan);font-size:11px;">Preview link set ↗</a>' : 'No preview link'}</span>
          <div class="preview-admin-actions">
            <button type="button" class="btn btn-ghost sm" style="font-size:12px; padding:6px 12px; border-radius:8px;" data-preview-set="${p.id}">
              ${p.previewUrl ? 'Update link' : 'Set link'}
            </button>
            ${p.previewUrl ? `<button type="button" class="btn btn-ghost sm" style="font-size:12px; padding:6px 12px; border-radius:8px;" data-preview-remove="${p.id}">Remove</button>` : ''}
          </div>
        </div>
      </div>`
      )
      .join('');

    $$('[data-preview-set]', body).forEach((btn) => {
      btn.addEventListener('click', async () => {
        const pid = btn.dataset.previewSet;
        const prod = state.products.find((pr) => pr.id === pid);
        const current = (prod && prod.previewUrl) || '';
        const url = window.prompt('Enter YouTube or Google Drive URL for preview:\n(e.g. https://youtu.be/... or https://drive.google.com/...)', current);
        if (url === null) return;
        try {
          await api(`/products/${pid}/preview`, {
            method: 'POST',
            body: JSON.stringify({ previewUrl: url.trim() }),
          });
          toast('Preview link saved.', 'success');
          await loadProducts();
          openManagePreviews();
        } catch (err) {
          toast(err.message, 'error');
        }
      });
    });
    $$('[data-preview-remove]', body).forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          await api(`/products/${btn.dataset.previewRemove}/preview`, { method: 'DELETE' });
          toast('Preview link removed.', 'info');
          await loadProducts();
          openManagePreviews();
        } catch (err) {
          toast(err.message, 'error');
        }
      });
    });
  }

  async function openManagePreviews() {
    if (!managePreviewsModal) return;
    $('#managePreviewsBody').innerHTML = '<p class="form-note" style="text-align:left;">Loading packs…</p>';
    openLayer(managePreviewsModal);
    try {
      const data = await api('/products');
      renderManagePreviews(data.products);
    } catch (err) {
      $('#managePreviewsBody').innerHTML = `<p class="form-error show">${escapeHtml(err.message)}</p>`;
    }
  }

  if (openManagePreviewsBtn) {
    openManagePreviewsBtn.addEventListener('click', () => {
      if (!state.user) {
        openAuth('login');
        toast('Sign in as admin to manage preview videos.', 'info');
        return;
      }
      openManagePreviews();
    });
  }
  if (closeManagePreviewsBtn) {
    closeManagePreviewsBtn.addEventListener('click', () => closeLayer(managePreviewsModal));
  }

  const addProjectForm = $('#addProjectForm');
  if (addProjectForm) {
    addProjectForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        name: $('#projName').value.trim(),
        category: $('#projCategory').value,
        price: $('#projPrice').value,
        compareAtPrice: $('#projComparePrice').value,
        tagline: $('#projTagline').value.trim(),
        itemCount: $('#projItemCount').value,
        description: $('#projDescription').value.trim(),
        driveLink: $('#projDriveLink') ? $('#projDriveLink').value.trim() : '',
        previewUrl: $('#projPreviewUrl') ? $('#projPreviewUrl').value.trim() : '',
      };

      try {
        const data = await api('/products', {
          method: 'POST',
          body: JSON.stringify(payload),
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
    // On mobile or reduced-motion, skip tubes canvas
    if (!canvas || window.innerWidth < 768 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    try {
      const module = await import('https://cdn.jsdelivr.net/npm/threejs-components@0.0.19/build/cursors/tubes1.min.js');
      const TubesCursor = module.default;

      const randomColors = (count) => {
        return new Array(count)
          .fill(0)
          .map(() => '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0'));
      };

      // Section-specific tube color palettes
      const sectionPalettes = {
        hero:      { tubes: ['#f967fb', '#6958d5', '#22e5ff'], lights: ['#f967fb', '#6958d5', '#ff3d81', '#22e5ff'] },
        categories:{ tubes: ['#22e5ff', '#8b5cf6', '#ff3d81'], lights: ['#22e5ff', '#8b5cf6', '#ff3d81', '#ffb020'] },
        products:  { tubes: ['#fe8a2e', '#53bc28', '#f967fb'], lights: ['#fe8a2e', '#53bc28', '#ffb020', '#ff3d81'] },
        reviews:   { tubes: ['#60aed5', '#8b5cf6', '#ff3d81'], lights: ['#60aed5', '#8b5cf6', '#22e5ff', '#f967fb'] },
      };
      let currentSection = 'hero';

      const app = TubesCursor(canvas, {
        tubes: {
          colors: sectionPalettes.hero.tubes,
          lights: {
            intensity: 200,
            colors: sectionPalettes.hero.lights
          }
        }
      });

      document.body.addEventListener('click', (e) => {
        if (e.target.closest('button, a, input, select, textarea, .modal, .drawer, .pcard, .cat-card')) return;
        if (app && app.tubes) {
          app.tubes.setColors(randomColors(3));
          app.tubes.setLightsColors(randomColors(4));
        }
      });

      // Scroll-linked: tube fade + section color switch + scroll progress bar
      const wrap = document.getElementById('tubesCanvasWrap');
      const progressBar = document.getElementById('scroll-progress');
      const sectionMap = [
        { id: 'top',       key: 'hero' },
        { id: 'categories',key: 'categories' },
        { id: 'products',  key: 'products' },
        { id: 'reviews',   key: 'reviews' },
      ];

      let ticking = false;
      window.addEventListener('scroll', () => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(() => {
          const scrollY = window.scrollY;
          const docH = document.documentElement.scrollHeight - window.innerHeight;

          // Scroll progress bar
          if (progressBar) progressBar.style.width = (scrollY / docH * 100) + '%';

          // Tube fade: full opacity in hero, dims to 0.25 as user scrolls
          if (wrap) {
            const fade = Math.max(0.22, 1 - scrollY / (window.innerHeight * 1.2));
            wrap.style.opacity = fade;
          }

          // Section color switching
          if (app && app.tubes) {
            let activeKey = 'hero';
            for (const { id, key } of sectionMap) {
              const el = document.getElementById(id) || document.querySelector(`[data-scroll="${id}"]`);
              if (el) {
                const rect = el.getBoundingClientRect();
                if (rect.top <= window.innerHeight * 0.4) activeKey = key;
              }
            }
            if (activeKey !== currentSection) {
              currentSection = activeKey;
              const p = sectionPalettes[activeKey];
              app.tubes.setColors(p.tubes);
              app.tubes.setLightsColors(p.lights);
            }
          }
          ticking = false;
        });
      }, { passive: true });

    } catch (err) {
      console.warn('Could not initialize 3D tubes background:', err);
    }
  }

  // ================= Stat counter animation =================
  function initStatCounters() {
    const stats = document.querySelectorAll('.hstat b');
    if (!stats.length) return;
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const el = entry.target;
        const raw = el.textContent.trim(); // e.g. "1,200+", "40K+", "4.9/5"

        if (raw.includes('/5')) {
          const ratingNum = parseFloat(raw.replace('/5', '')) || 4.9;
          let start = null;
          const duration = 1200;
          const step = (ts) => {
            if (!start) start = ts;
            const progress = Math.min((ts - start) / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            const current = (eased * ratingNum).toFixed(1);
            el.textContent = `${current}/5`;
            if (progress < 1) requestAnimationFrame(step);
          };
          requestAnimationFrame(step);
        } else {
          const suffix = raw.replace(/[0-9,.]/g, ''); // "+", "K+"
          const num = parseFloat(raw.replace(/[^0-9.]/g, ''));
          if (isNaN(num)) return;
          let start = null;
          const duration = 1400;
          const step = (ts) => {
            if (!start) start = ts;
            const progress = Math.min((ts - start) / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            const current = Math.round(eased * num);
            el.textContent = current.toLocaleString() + suffix;
            if (progress < 1) requestAnimationFrame(step);
          };
          requestAnimationFrame(step);
        }
        observer.unobserve(el);
      });
    }, { threshold: 0.5 });
    stats.forEach(el => observer.observe(el));
  }

  // ================= Mobile Navigation Plumbing =================
  function initMobileNavigation() {
    const mbCart = $('#mbNavCart');
    if (mbCart) {
      mbCart.addEventListener('click', () => {
        openLayer(cartDrawer);
        refreshCart();
      });
    }

    // Active bottom navigation item tracking on scroll
    window.addEventListener('scroll', () => {
      const scrollPos = window.scrollY + 200;
      const categoriesEl = document.getElementById('categories');
      const productsEl = document.getElementById('products');
      
      let activeTarget = 'top';
      if (productsEl && scrollPos >= productsEl.offsetTop) {
        activeTarget = 'products';
      } else if (categoriesEl && scrollPos >= categoriesEl.offsetTop) {
        activeTarget = 'categories';
      }

      $$('.mb-nav-item').forEach((item) => {
        if (item.dataset.scroll === activeTarget) {
          item.classList.add('active');
        } else if (item.dataset.scroll) {
          item.classList.remove('active');
        }
      });
    }, { passive: true });
  }

  // ================= boot =================
  (async function init() {
    initTubesBackground();
    initStatCounters();
    initMobileNavigation();
    await Promise.all([loadCurrentUser(), loadCategories(), loadProducts(), refreshCart()]);
  })();
})();
