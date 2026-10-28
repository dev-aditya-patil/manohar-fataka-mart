/* Manohar Enterprises — Product & Price Finder
   Vanilla JS, no dependencies. Data comes from products.json (generated from Product_list_2k26.xlsx). */
(function () {
  'use strict';

  var DATA_URL = 'products.json';
  var PAGE_SIZE = 60;           // cards rendered per batch; more are appended while scrolling
  var ALL = '__all__';

  var el = {
    search: document.getElementById('search'),
    clear: document.getElementById('clearSearch'),
    chips: document.getElementById('chips'),
    count: document.getElementById('count'),
    reset: document.getElementById('resetFilters'),
    sort: document.getElementById('sort'),
    sortLabel: document.getElementById('sortLabel'),
    results: document.getElementById('results'),
    empty: document.getElementById('empty'),
    sentinel: document.getElementById('sentinel'),
    toTop: document.getElementById('toTop'),
    contactToggle: document.getElementById('contactToggle'),
    contactPanel: document.getElementById('contactPanel'),
    dataNote: document.getElementById('dataNote')
  };

  var state = { query: '', category: ALL, sort: 'default' };
  var products = [];      // immutable catalogue, in Excel order
  var categories = [];    // [{ name, count }] in first-seen order
  var view = [];          // current filtered + sorted list
  var rendered = 0;
  var terms = [];         // current normalised search terms (for highlighting)
  var chipEls = {};

  var priceFmt = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });

  /* ---------------- Text helpers ---------------- */

  function str(v) {
    return v === null || v === undefined ? '' : String(v).replace(/\s+/g, ' ').trim();
  }

  // Lower-case, unify inch marks and spelling variants, split "10pc" into "10 pc", strip punctuation.
  function normalize(s) {
    return str(s).toLowerCase()
      .replace(/(\d)\s*(''|"|”|″|inch(es)?\b)/g, '$1 inch ')
      .replace(/colour/g, 'color')
      .replace(/(\d)(\p{L})/gu, '$1 $2')
      .replace(/(\p{L})(\d)/gu, '$1 $2')
      .replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ')
      .trim();
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  // Optimal string alignment distance, capped: returns max+1 as soon as it is exceeded.
  function editDistance(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    var prev2 = null, prev = [], cur, i, j;
    for (j = 0; j <= b.length; j++) prev[j] = j;
    for (i = 1; i <= a.length; i++) {
      cur = [i];
      var rowMin = i;
      for (j = 1; j <= b.length; j++) {
        var cost = a[i - 1] === b[j - 1] ? 0 : 1;
        var v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
        if (prev2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
        cur[j] = v;
        if (v < rowMin) rowMin = v;
      }
      if (rowMin > max) return max + 1;
      prev2 = prev; prev = cur;
    }
    return prev[b.length];
  }

  /* ---------------- Data loading ---------------- */

  var FIELD_WEIGHTS = { product: 3, brand: 2.5, category: 2, section: 1.5, function: 1, pack: 1 };

  function prepare(raw, index) {
    var rate = typeof raw.rate === 'number' && isFinite(raw.rate) ? raw.rate : null;
    var p = {
      index: index,
      sr: str(raw.sr),
      category: str(raw.category),
      product: str(raw.product),
      brand: str(raw.brand),
      pack: str(raw.pack),
      function: str(raw.function),
      section: str(raw.section),
      rate: rate,
      rateUnit: str(raw.rateUnit),
      fields: []
    };
    Object.keys(FIELD_WEIGHTS).forEach(function (key) {
      var text = normalize(p[key]);
      if (text) p.fields.push({ weight: FIELD_WEIGHTS[key], text: ' ' + text + ' ', words: text.split(' ') });
    });
    p.nameKey = p.product.toLowerCase();
    return p;
  }

  function load() {
    el.count.textContent = 'Loading products…';
    fetch(DATA_URL, { cache: 'no-cache' })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(init)
      .catch(function (err) {
        console.error(err);
        showLoadError();
      });
  }

  function showLoadError() {
    el.count.textContent = 'Products could not be loaded';
    el.results.innerHTML = '';
    el.empty.hidden = false;
    el.empty.innerHTML =
      '<h3>Product list could not be loaded</h3>' +
      '<p>Check the internet connection and try again. If you opened index.html directly from a folder, open the website link instead.</p>' +
      '<div class="actions"><button class="primary" type="button" data-action="retry">Try again</button></div>';
  }

  function init(data) {
    var list = Array.isArray(data) ? data : (data && Array.isArray(data.products) ? data.products : null);
    if (!list) { showLoadError(); return; }

    products = list
      .filter(function (r) { return r && (str(r.product) || str(r.brand)); })
      .map(prepare);

    var seen = {};
    products.forEach(function (p) {
      if (!p.category) return;
      if (!seen[p.category]) { seen[p.category] = { name: p.category, count: 0 }; categories.push(seen[p.category]); }
      seen[p.category].count++;
    });

    if (data && data.note) el.dataNote.textContent = str(data.note);
    buildChips();
    readUrl();
    update();
    revealActiveChip();
  }

  // Scroll the chip row (not the page) so the selected category is visible.
  function revealActiveChip() {
    var chip = chipEls[state.category];
    if (!chip) return;
    var row = el.chips, left = chip.offsetLeft - row.offsetLeft;
    if (left < row.scrollLeft || left + chip.offsetWidth > row.scrollLeft + row.clientWidth) {
      row.scrollLeft = Math.max(0, left - 16);
    }
  }

  /* ---------------- Search ---------------- */

  // Score one term against a product; 0 means no match.
  // Typo tolerance is only used for terms that match nothing exactly, so it never adds noise.
  function termScore(p, term, fuzzy) {
    var best = 0, numeric = /^\d+$/.test(term);
    for (var f = 0; f < p.fields.length; f++) {
      var field = p.fields[f], s = 0;
      var at = field.text.indexOf(term);
      if (numeric) {
        if (field.text.indexOf(' ' + term + ' ') !== -1) s = 3;        // numbers match whole numbers only ("5" ≠ "15")
      } else if (at !== -1) {
        if (field.text.indexOf(' ' + term + ' ') !== -1) s = 3;        // whole word
        else if (field.text.indexOf(' ' + term) !== -1) s = 2;         // word prefix
        else s = 1;                                                    // inside a word
      } else if (fuzzy && term.length >= 4) {
        var max = term.length >= 7 ? 2 : 1;                            // tolerate typos / spelling variants
        for (var w = 0; w < field.words.length; w++) {
          var word = field.words[w];
          if (word.length >= 3 && editDistance(term, word, max) <= max) { s = 0.6; break; }
          if (word.length > term.length && editDistance(term, word.slice(0, term.length), 1) <= 1 && term.length >= 5) { s = 0.5; break; }
        }
      }
      if (s) best = Math.max(best, s * field.weight);
    }
    if (!best && term === p.sr.toLowerCase()) best = 0.5;              // match by Sr. No.
    return best;
  }

  function search(query) {
    terms = normalize(query).split(' ').filter(Boolean);
    if (!terms.length) return products.map(function (p) { return { p: p, score: 0 }; });
    var fuzzy = terms.map(function (t) {
      return /\p{L}/u.test(t) && !products.some(function (p) {
        return p.fields.some(function (f) { return f.text.indexOf(t) !== -1; });
      });
    });
    var out = [];
    for (var i = 0; i < products.length; i++) {
      var total = 0;
      for (var t = 0; t < terms.length; t++) {
        var s = termScore(products[i], terms[t], fuzzy[t]);
        if (!s) { total = 0; break; }
        total += s;
      }
      if (total) out.push({ p: products[i], score: total });
    }
    return out;
  }

  var SORTERS = {
    'default': function (a, b) { return (b.score - a.score) || (a.p.index - b.p.index); },
    'name': function (a, b) { return collator.compare(a.p.nameKey, b.p.nameKey) || (a.p.index - b.p.index); },
    'price-asc': function (a, b) { return priceCmp(a, b, 1); },
    'price-desc': function (a, b) { return priceCmp(a, b, -1); }
  };
  var collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
  var SORT_LABELS = { 'default': 'Sort', 'name': 'A–Z', 'price-asc': 'Price ↑', 'price-desc': 'Price ↓' };

  // Products without a listed rate always go last.
  function priceCmp(a, b, dir) {
    var x = a.p.rate, y = b.p.rate;
    if (x === null && y === null) return a.p.index - b.p.index;
    if (x === null) return 1;
    if (y === null) return -1;
    return (x - y) * dir || (a.p.index - b.p.index);
  }

  /* ---------------- Rendering ---------------- */

  var highlightRe = null;

  function setHighlightTerms() {
    var parts = terms.filter(function (t) { return t !== 'inch'; })
      .sort(function (a, b) { return b.length - a.length; })
      .map(escapeRe);
    highlightRe = parts.length ? new RegExp('(' + parts.join('|') + ')', 'giu') : null;
  }

  // Split on the raw text first, then escape each piece, so marks never break HTML entities.
  function highlight(text) {
    if (!highlightRe || !text) return escapeHtml(text);
    return text.split(highlightRe).map(function (piece, i) {
      return i % 2 ? '<mark>' + escapeHtml(piece) + '</mark>' : escapeHtml(piece);
    }).join('');
  }

  function row(label, value) {
    return value ? '<dt>' + label + '</dt><dd>' + highlight(value) + '</dd>' : '';
  }

  function cardHtml(p) {
    var price = p.rate === null
      ? '<div class="price na"><strong>Rate not listed</strong></div>'
      : '<div class="price"><strong>₹' + priceFmt.format(p.rate) + '</strong>' +
        (p.rateUnit ? '<small>per ' + escapeHtml(p.rateUnit) + '</small>' : '') + '</div>';
    return '<li class="card">' +
      '<h3>' + highlight(p.product || p.brand) + (p.sr ? '<span class="sr">#' + escapeHtml(p.sr) + '</span>' : '') + '</h3>' +
      price +
      '<dl class="meta">' +
        row('Brand', p.brand) +
        row('Category', p.category) +
        row('Pack', p.pack) +
        row('Function', p.function) +
      '</dl></li>';
  }

  function renderMore() {
    if (rendered >= view.length) return;
    var end = Math.min(rendered + PAGE_SIZE, view.length), html = '';
    for (var i = rendered; i < end; i++) html += cardHtml(view[i].p);
    el.results.insertAdjacentHTML('beforeend', html);
    rendered = end;
    // On tall screens the sentinel may still be in range; keep filling without waiting for a scroll.
    if (rendered < view.length && el.sentinel.getBoundingClientRect().top < window.innerHeight + 800) {
      requestAnimationFrame(renderMore);
    }
  }

  function buildChips() {
    var html = chipHtml(ALL, 'All Products');
    categories.forEach(function (c) { html += chipHtml(c.name, c.name); });
    el.chips.innerHTML = html;
    Array.prototype.forEach.call(el.chips.children, function (b) { chipEls[b.getAttribute('data-cat')] = b; });
  }

  function chipHtml(value, label) {
    return '<button class="chip" type="button" aria-pressed="false" data-cat="' + escapeHtml(value) + '">' +
      escapeHtml(label) + ' <b></b></button>';
  }

  function update() {
    var matches = search(state.query);
    setHighlightTerms();

    // Per-category counts for the current search, shown on the chips.
    var counts = {};
    matches.forEach(function (m) { counts[m.p.category] = (counts[m.p.category] || 0) + 1; });
    Object.keys(chipEls).forEach(function (cat) {
      var n = cat === ALL ? matches.length : (counts[cat] || 0);
      var chip = chipEls[cat];
      chip.lastElementChild.textContent = n;
      chip.classList.toggle('zero', n === 0 && cat !== state.category);
      chip.setAttribute('aria-pressed', String(cat === state.category));
    });

    var inCategory = state.category === ALL ? matches
      : matches.filter(function (m) { return m.p.category === state.category; });

    view = inCategory.slice().sort(SORTERS[state.sort] || SORTERS['default']);

    el.results.innerHTML = '';
    rendered = 0;
    renderMore();

    var n = view.length;
    el.count.innerHTML = '<strong>' + n + '</strong> ' + (n === 1 ? 'product' : 'products') + ' found';
    el.sortLabel.textContent = SORT_LABELS[state.sort];
    el.sortLabel.parentNode.classList.toggle('active', state.sort !== 'default');
    el.clear.hidden = !state.query;
    el.reset.hidden = !(state.query || state.category !== ALL || state.sort !== 'default');
    renderEmpty(n, matches.length);
    writeUrl();
  }

  function renderEmpty(n, totalMatches) {
    if (n) { el.empty.hidden = true; el.empty.innerHTML = ''; return; }
    var q = escapeHtml(state.query.trim());
    var html;
    if (state.category !== ALL && totalMatches) {
      html = '<h3>No “' + q + '” in ' + escapeHtml(state.category) + '</h3>' +
        '<p>' + totalMatches + ' matching ' + (totalMatches === 1 ? 'product' : 'products') + ' in other categories.</p>' +
        '<div class="actions"><button class="primary" type="button" data-action="all">Show all categories</button></div>';
    } else {
      html = '<h3>No products match “' + q + '”</h3>' +
        '<p>Try a shorter word, a brand name, or check the spelling.</p>' +
        '<div class="actions"><button class="primary" type="button" data-action="clear">Clear search</button></div>';
    }
    el.empty.innerHTML = html;
    el.empty.hidden = false;
  }

  /* ---------------- URL state (keeps results on reload / shareable) ---------------- */

  function readUrl() {
    var params = new URLSearchParams(location.search);
    state.query = params.get('q') || '';
    var cat = params.get('cat');
    state.category = cat && chipEls[cat] ? cat : ALL;
    var sort = params.get('sort');
    state.sort = SORTERS[sort] ? sort : 'default';
    el.search.value = state.query;
    el.sort.value = state.sort;
  }

  function writeUrl() {
    var params = new URLSearchParams();
    if (state.query.trim()) params.set('q', state.query.trim());
    if (state.category !== ALL) params.set('cat', state.category);
    if (state.sort !== 'default') params.set('sort', state.sort);
    var qs = params.toString();
    try { history.replaceState(null, '', qs ? '?' + qs : location.pathname); } catch (e) { /* ignore */ }
  }

  /* ---------------- Events ---------------- */

  var pending = false;
  function scheduleUpdate() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(function () { pending = false; update(); });
  }

  function scrollResultsTop() {
    var top = el.results.getBoundingClientRect().top + window.pageYOffset - document.getElementById('controls').offsetHeight - 10;
    if (window.pageYOffset > top) window.scrollTo(0, Math.max(0, top));
  }

  el.search.addEventListener('input', function () {
    state.query = el.search.value;
    scheduleUpdate();
  });

  el.search.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { el.search.blur(); }          // hide the phone keyboard so results are visible
    if (e.key === 'Escape') { clearSearch(); }
  });

  function clearSearch() {
    el.search.value = '';
    state.query = '';
    update();
    el.search.focus();
  }

  el.clear.addEventListener('click', clearSearch);

  el.chips.addEventListener('click', function (e) {
    var chip = e.target.closest('.chip');
    if (!chip) return;
    state.category = chip.getAttribute('data-cat');
    update();
    revealActiveChip();
    scrollResultsTop();
  });

  el.sort.addEventListener('change', function () {
    state.sort = el.sort.value;
    update();
    scrollResultsTop();
  });

  el.reset.addEventListener('click', function () {
    state = { query: '', category: ALL, sort: 'default' };
    el.search.value = '';
    el.sort.value = 'default';
    update();
    revealActiveChip();
  });

  el.empty.addEventListener('click', function (e) {
    var action = e.target.getAttribute('data-action');
    if (action === 'retry') load();
    if (action === 'clear') clearSearch();
    if (action === 'all') { state.category = ALL; update(); revealActiveChip(); }
  });

  el.contactToggle.addEventListener('click', function () {
    var open = el.contactPanel.hidden;
    el.contactPanel.hidden = !open;
    el.contactToggle.setAttribute('aria-expanded', String(open));
    el.contactToggle.setAttribute('aria-label', open ? 'Hide contact numbers' : 'Show contact numbers');
  });

  el.toTop.addEventListener('click', function () { window.scrollTo(0, 0); });

  // "/" focuses the search box on desktop keyboards.
  document.addEventListener('keydown', function (e) {
    if (e.key === '/' && document.activeElement !== el.search && !/input|select|textarea/i.test(document.activeElement.tagName)) {
      e.preventDefault();
      el.search.focus();
    }
  });

  var ticking = false;
  window.addEventListener('scroll', function () {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      ticking = false;
      el.toTop.hidden = window.pageYOffset < 700;
      // Fallback for browsers without IntersectionObserver.
      if (!('IntersectionObserver' in window) &&
          window.innerHeight + window.pageYOffset > document.body.offsetHeight - 800) renderMore();
    });
  }, { passive: true });

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting) renderMore();
    }, { rootMargin: '800px 0px' }).observe(el.sentinel);
  }

  /* ---------------- Offline support (optional) ---------------- */

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || /^(localhost|127\.0\.0\.1)$/.test(location.hostname))) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('service-worker.js').catch(function () { /* app still works online */ });
    });
  }

  load();
})();
