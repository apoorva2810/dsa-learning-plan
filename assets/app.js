/* DSA Lab shared behaviour: theme, progress (localStorage), search palette, code blocks. */
(function () {
  'use strict';
  const REL = document.body.dataset.rel || '';
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  // ---------- storage ----------
  const store = {
    get(key, fallback) {
      try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); }
      catch (e) { return fallback; }
    },
    set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* ignore */ } },
    del(key) { try { localStorage.removeItem(key); } catch (e) { /* ignore */ } },
  };

  const Progress = {
    KEY: 'dsa.progress',
    all() { return store.get(this.KEY, {}); },
    get(slug) { return (this.all()[slug] || {}).status || ''; },
    set(slug, status) {
      const all = this.all();
      if (!status) delete all[slug];
      else all[slug] = { status, updated: Date.now() };
      store.set(this.KEY, all);
      document.dispatchEvent(new CustomEvent('dsa:progress', { detail: { slug, status } }));
    },
    export() { return JSON.stringify({ progress: this.all(), scratch: scratchAll(), exported: new Date().toISOString() }, null, 2); },
    import(json) {
      const data = JSON.parse(json);
      if (data.progress) store.set(this.KEY, data.progress);
      if (data.scratch) Object.entries(data.scratch).forEach(([k, v]) => store.set(k, v));
      document.dispatchEvent(new CustomEvent('dsa:progress', { detail: {} }));
    },
    reset() { store.del(this.KEY); document.dispatchEvent(new CustomEvent('dsa:progress', { detail: {} })); },
  };
  function scratchAll() {
    const out = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('dsa.scratch.')) out[k] = store.get(k, '');
    }
    return out;
  }

  // ---------- theme ----------
  function currentTheme() {
    const t = document.documentElement.dataset.theme;
    if (t) return t;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  const themeBtn = $('#theme-btn');
  if (themeBtn) themeBtn.addEventListener('click', () => {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    store.set('dsa.theme', next);
  });
  // narrow screens: the nav collapses behind a menu button
  const navBtn = $('#nav-btn'), top = $('header.top');
  if (navBtn && top) {
    navBtn.addEventListener('click', () => { const open = top.classList.toggle('nav-open'); navBtn.setAttribute('aria-expanded', String(open)); });
    document.addEventListener('click', e => { if (!top.contains(e.target)) { top.classList.remove('nav-open'); navBtn.setAttribute('aria-expanded', 'false'); } });
  }
  // ---------- phone / app environment ----------
  const TOUCH = matchMedia('(pointer: coarse)').matches;
  const IN_APP = /DSALabApp/.test(navigator.userAgent);
  document.body.classList.toggle('touch', TOUCH);
  document.body.classList.toggle('in-app', IN_APP);
  if (IN_APP) $$('.app-hide').forEach(e => { e.hidden = true; });
  // bottom tab bar: mark the tab for the current page (problems/topics count as Roadmap, chapters as Guides)
  (function tabs() {
    const path = location.pathname.replace(/\\/g, '/');
    const file = path.split('/').pop() || 'index.html';
    let active = file;
    if (/\/problems\/|\/topics\//.test(path)) active = 'roadmap.html';
    else if (/\/guides\//.test(path)) active = 'guides.html';
    else if (file === 'cheatsheet.html' || file === 'big-o.html') active = 'guides.html';
    $$('.tabbar a').forEach(a => a.classList.toggle('active', a.dataset.tab === active));
  })();
  // collapsible chapter table of contents on phones
  $$('.guide-toc .toc-title').forEach(t => t.addEventListener('click', () => t.parentElement.classList.toggle('open')));
  $$('.guide-toc ol a').forEach(a => a.addEventListener('click', () => a.closest('.guide-toc').classList.remove('open')));

  // ---------- status widgets ----------
  function refreshStatusWidgets() {
    const all = Progress.all();
    $$('.status-dot[data-slug]').forEach(d => {
      const st = (all[d.dataset.slug] || {}).status || '';
      d.className = 'status-dot' + (st ? ' ' + st : '');
      d.title = st || 'not started';
    });
    $$('.status-select').forEach(sel => {
      const slug = sel.closest('[data-slug]').dataset.slug;
      sel.value = (all[slug] || {}).status || '';
    });
    const index = window.DSA_INDEX || [];
    const byTopic = {};
    index.forEach(p => {
      const t = byTopic[p.topic] || (byTopic[p.topic] = { total: 0, solved: 0 });
      t.total++;
      if ((all[p.slug] || {}).status === 'solved') t.solved++;
    });
    $$('.tc-progress[data-topic]').forEach(e => {
      const t = byTopic[e.dataset.topic]; if (t) e.textContent = `${t.solved}/${t.total} solved`;
    });
    $$('[data-topic-bar]').forEach(e => {
      const t = byTopic[e.dataset.topicBar]; if (t) e.style.width = (100 * t.solved / t.total) + '%';
    });
    $$('.roadmap [data-progress]').forEach(e => {
      const t = byTopic[e.dataset.progress]; if (!t) return;
      e.textContent = `${t.solved}/${t.total}`;
      const g = e.closest('.node'); if (g) g.classList.toggle('done', t.solved === t.total);
    });
    const solved = index.filter(p => (all[p.slug] || {}).status === 'solved');
    const sc = $('#solved-count'); if (sc) sc.textContent = solved.length;
    const sb = $('#solved-bar'); if (sb) sb.style.width = (100 * solved.length / Math.max(1, index.length)) + '%';
    const bd = $('#by-diff');
    if (bd) bd.innerHTML = ['Easy', 'Medium', 'Hard'].map(d => {
      const tot = index.filter(p => p.difficulty === d).length;
      const got = solved.filter(p => p.difficulty === d).length;
      return `<span><span class="badge ${d.toLowerCase()}">${d}</span> ${got}/${tot}</span>`;
    }).join('');
  }
  document.addEventListener('change', e => {
    if (e.target.classList.contains('status-select')) {
      const slug = e.target.closest('[data-slug]').dataset.slug;
      Progress.set(slug, e.target.value);
    }
  });
  document.addEventListener('dsa:progress', refreshStatusWidgets);

  // continue button (home)
  const cont = $('#continue-btn');
  if (cont) {
    const last = store.get('dsa.last', null);
    if (last && last.slug) { cont.hidden = false; cont.href = REL + 'problems/' + last.slug + '.html'; cont.textContent = 'Continue: ' + last.title; }
  }

  // ---------- code blocks ----------
  function setupCode() {
    $$('.code').forEach(block => {
      const pre = $('pre', block);
      const code = $('code', pre);
      if (!code) return;
      if (block.classList.contains('numbered') && !$('.gutter', block)) {
        const n = code.textContent.replace(/\n$/, '').split('\n').length;
        const g = document.createElement('div');
        g.className = 'gutter';
        g.setAttribute('aria-hidden', 'true');
        g.textContent = Array.from({ length: n }, (_, i) => i + 1).join('\n');
        block.appendChild(g);
      }
      const btn = $('.copy', block);
      if (btn) btn.addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(code.textContent); }
        catch (e) {
          const ta = document.createElement('textarea'); ta.value = code.textContent; document.body.appendChild(ta); ta.select();
          try { document.execCommand('copy'); } catch (e2) { /* ignore */ } ta.remove();
        }
        btn.textContent = 'Copied'; btn.classList.add('done');
        setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('done'); }, 1200);
      });
    });
  }

  // ---------- search palette ----------
  const modal = $('#search-modal'), input = $('#search-input'), results = $('#search-results');
  let active = 0, hits = [];
  function openSearch() { if (!modal) return; modal.hidden = false; input.value = ''; render(''); input.focus(); }
  function closeSearch() { if (modal) modal.hidden = true; }
  function render(q) {
    const index = window.DSA_INDEX || [], topics = window.DSA_TOPICS || [];
    q = q.trim().toLowerCase();
    const score = s => {
      s = s.toLowerCase();
      if (!q) return 1;
      if (s.startsWith(q)) return 3;
      if (s.includes(q)) return 2;
      return q.split(/\s+/).every(w => s.includes(w)) ? 1 : 0;
    };
    hits = [];
    topics.forEach(t => { const sc = score(t.title); if (sc) hits.push({ sc: sc + 0.5, label: t.title, sub: 'Topic', url: t.url }); });
    (window.DSA_GUIDES || []).forEach(g => {
      const sc = Math.max(score(g.title), score(g.trackTitle) * 0.6);
      if (sc) hits.push({ sc: sc + 0.4, label: g.title, sub: 'Guide · ' + g.trackTitle, url: g.url, icon: '🧭' });
    });
    (window.DSA_LESSONS || []).forEach(l => {
      const sc = Math.max(score(l.title), score('video ' + l.title) * 0.9);
      if (sc) hits.push({ sc: sc + 0.2, label: l.title, sub: 'Video lesson · ' + Math.round(l.duration / 60000) + ' min', url: l.url, icon: '▶' });
    });
    index.forEach(p => {
      const sc = Math.max(score(p.title), score('lc ' + p.lc), score(String(p.lc)));
      if (sc) hits.push({ sc, label: p.title, sub: `${p.topicTitle} · LC ${p.lc}`, badge: p.difficulty, url: p.url, slug: p.slug });
    });
    hits.sort((a, b) => b.sc - a.sc || a.label.localeCompare(b.label));
    hits = hits.slice(0, 12);
    active = 0;
    const all = Progress.all();
    results.innerHTML = hits.map((h, i) => `<li class="${i === 0 ? 'active' : ''}" data-i="${i}">` +
      (h.slug ? `<span class="status-dot ${(all[h.slug] || {}).status || ''}"></span>` : `<span>${h.icon || '📚'}</span>`) +
      `<span class="t">${esc(h.label)} <span class="muted small">${esc(h.sub)}</span></span>` +
      (h.badge ? `<span class="badge ${h.badge.toLowerCase()}">${h.badge}</span>` : '') + '</li>').join('') ||
      '<li class="muted">No matches</li>';
  }
  function go(i) { const h = hits[i]; if (h) location.href = REL + h.url; }
  if (modal) {
    $('#search-btn').addEventListener('click', openSearch);
    modal.addEventListener('click', e => { if (e.target === modal) closeSearch(); });
    input.addEventListener('input', () => render(input.value));
    input.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { active = Math.min(hits.length - 1, active + 1); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { active = Math.max(0, active - 1); e.preventDefault(); }
      else if (e.key === 'Enter') { go(active); return; }
      else if (e.key === 'Escape') { closeSearch(); return; }
      else return;
      $$('li', results).forEach((li, i) => li.classList.toggle('active', i === active));
    });
    results.addEventListener('click', e => { const li = e.target.closest('li[data-i]'); if (li) go(+li.dataset.i); });
    document.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openSearch(); }
      else if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { e.preventDefault(); openSearch(); }
      else if (e.key === 'Escape' && !modal.hidden) closeSearch();
    });
  }

  function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function mdInline(s) {
    // tiny inline markdown for visualiser messages: `code`, **bold**
    const codes = [];
    s = String(s).replace(/`([^`]+)`/g, (m, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; });
    s = esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/(^|[^\w*])\*(?!\s)([^*\n]+?)(?<!\s)\*(?![\w*])/g, '$1<em>$2</em>');
    return s.replace(/\u0000(\d+)\u0000/g, (m, i) => `<code>${esc(codes[+i])}</code>`);
  }

  // links to problems whose content is not written yet (partial builds)
  (function markPending() {
    const pending = new Set((window.DSA_INDEX || []).filter(p => p.pending).map(p => p.slug));
    if (!pending.size) return;
    $$('.prow[data-slug]').forEach(row => { if (pending.has(row.dataset.slug)) row.classList.add('pending'); });
    const note = $('.how'); if (note) note.insertAdjacentHTML('beforeend', `<p class="muted small">⏳ ${pending.size} problem pages are still being generated; they are greyed out in the lists.</p>`);
  })();

  window.DSA = { store, Progress, esc, mdInline, REL, refreshStatusWidgets };
  setupCode();
  refreshStatusWidgets();
})();
