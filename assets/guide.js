/* DSA Lab guides: Mermaid diagrams (+ step-through), simulations, quizzes, flashcards, calculators,
   checklists, practice timers, story builder, question drills, matrices, chapter progress. */
(function () {
  'use strict';
  const D = window.DSA, esc = D.esc, store = D.store;
  // inline markdown + [text](relative-url) links (step messages, drill notes)
  const mdInline = s => D.mdInline(s).replace(/\[([^\]]+)\]\((\.\.\/[^)\s]+|[\w./-]+\.html(?:#[\w-]+)?)\)/g, '<a href="$2">$1</a>');
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const dataNode = $('#guide-data');
  const DATA = dataNode ? JSON.parse(dataNode.textContent) : {};
  const article = $('article.guide');
  const CHAPTER = article ? article.dataset.chapter : null;
  const el = (tag, attrs, children) => {
    const e = document.createElement(tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') e.className = v; else if (k === 'html') e.innerHTML = v; else if (k === 'text') e.textContent = v;
      else if (v !== null && v !== undefined && v !== false) e.setAttribute(k, v === true ? '' : v);
    }
    (children || []).forEach(c => { if (c !== null && c !== undefined && c !== false) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  };
  const isDark = () => (document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')) === 'dark';
  const key = (...parts) => 'dsa.guide.' + parts.join('.');

  // ---------------- chapter progress ----------------
  const Done = {
    KEY: 'dsa.guides.done',
    all() { return store.get(this.KEY, {}); },
    is(slug) { return !!this.all()[slug]; },
    toggle(slug) { const a = this.all(); if (a[slug]) delete a[slug]; else a[slug] = Date.now(); store.set(this.KEY, a); refreshProgress(); },
  };
  function refreshProgress() {
    const done = Done.all(), guides = window.DSA_GUIDES || [];
    $$('.mark-done[data-chapter]').forEach(b => { const on = !!done[b.dataset.chapter]; b.textContent = on ? '✓ Done (click to undo)' : '✓ Mark chapter done'; b.classList.toggle('primary', on); });
    $$('.chk[data-chk]').forEach(c => c.classList.toggle('done', !!done[c.dataset.chk]));
    const byTrack = {};
    guides.forEach(g => { const t = byTrack[g.track] || (byTrack[g.track] = { total: 0, done: 0 }); t.total++; if (done[g.slug]) t.done++; });
    $$('[data-track-bar]').forEach(b => { const t = byTrack[b.dataset.trackBar]; if (t) b.style.width = (100 * t.done / t.total) + '%'; });
    $$('.tk-progress[data-track]').forEach(s => { const t = byTrack[s.dataset.track]; if (t) s.textContent = `${t.done}/${t.total} read`; });
  }
  document.addEventListener('click', e => { const b = e.target.closest('.mark-done[data-chapter]'); if (b) Done.toggle(b.dataset.chapter); });
  refreshProgress();
  if (CHAPTER) store.set('dsa.guide.last', { slug: CHAPTER, title: document.title.replace(/ · DSA Lab$/, ''), url: location.pathname.split('/').slice(-3).join('/') });

  // ---------------- TOC highlighting ----------------
  (function toc() {
    const links = $$('.guide-toc a'); if (!links.length) return;
    const targets = links.map(a => $(a.getAttribute('href'))).filter(Boolean);
    const setActive = id => links.forEach(a => a.classList.toggle('active', a.getAttribute('href') === '#' + id));
    if ('IntersectionObserver' in window) {
      let current = null;
      const io = new IntersectionObserver(entries => {
        entries.forEach(en => { if (en.isIntersecting) { current = en.target.id; setActive(current); } });
      }, { rootMargin: '-70px 0px -70% 0px', threshold: 0 });
      targets.forEach(t => io.observe(t));
    }
  })();

  // ---------------- Mermaid ----------------
  const M = window.mermaid;
  let mermaidReady = false;
  function initMermaid() {
    if (!M) return false;
    M.initialize({ startOnLoad: false, securityLevel: 'strict', theme: isDark() ? 'dark' : 'neutral',
      fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif', flowchart: { useMaxWidth: true, htmlLabels: true, curve: 'basis' },
      sequence: { useMaxWidth: true, mirrorActors: false, showSequenceNumbers: false }, themeVariables: isDark() ? { primaryColor: '#1f2742', primaryTextColor: '#e6e8ef', lineColor: '#98a0b3', primaryBorderColor: '#7c93ff' } : { primaryColor: '#e7ecfd', primaryBorderColor: '#3b5bdb', lineColor: '#5d6478' } });
    mermaidReady = true;
    return true;
  }
  let mid = 0;
  async function renderMermaid(box, text) {
    const out = $('.mermaid-out', box);
    if (!M) { out.innerHTML = '<div class="mermaid-err">Mermaid is not loaded (assets/mermaid.min.js missing).</div>'; return; }
    try {
      const { svg } = await M.render('mm-' + (++mid), text);
      out.innerHTML = svg;
      const s = $('svg', out);
      if (s) {
        // keep mermaid's natural width (its inline max-width), shrink only when the container is narrower
        const natural = parseFloat((s.style.maxWidth || '').replace('px', '')) || s.viewBox.baseVal.width || 0;
        s.removeAttribute('height'); s.style.height = 'auto';
        if (natural) { s.style.width = Math.min(natural * (d_scale(s)), 1400) + 'px'; }
        s.style.maxWidth = '100%';
      }
    } catch (e) {
      out.innerHTML = '<div class="mermaid-err">Diagram failed to render: ' + esc(e.message || e) + '</div>';
    }
  }
  function d_scale(svg) {
    // mermaid picks its own font size; scale small diagrams up a little so labels stay readable
    const w = svg.viewBox.baseVal.width || 600;
    return w < 420 ? 1.25 : 1;
  }
  function decorate(text, kind, highlight, edges) {
    const extra = [];
    if (kind === 'flowchart') {
      extra.push('classDef dsaHL fill:#fde68a,stroke:#d97706,stroke-width:3px,color:#1b1f2a;');
      if (highlight.length) extra.push('class ' + highlight.join(',') + ' dsaHL;');
      if (edges.length) extra.push('linkStyle ' + edges.join(',') + ' stroke:#d97706,stroke-width:3px;');
    } else if (kind === 'class') {
      highlight.forEach(h => extra.push('style ' + h + ' fill:#fde68a,stroke:#d97706,stroke-width:3px'));
    } else if (kind === 'state') {
      extra.push('classDef dsaHL fill:#fde68a,stroke:#d97706,stroke-width:3px,color:#1b1f2a');
      if (highlight.length) extra.push('class ' + highlight.join(',') + ' dsaHL');
    }
    return text.replace(/\n+$/, '') + '\n' + extra.join('\n') + '\n';
  }
  const steppers = [];
  function setupDiagram(box) {
    const d = DATA[box.dataset.blk]; if (!d) return;
    const zoom = $('.zoom', box);
    if (zoom) zoom.onclick = () => openLightbox($('.mermaid-out', box));
    if (!d.steps) { box._render = () => renderMermaid(box, d.mermaid); box._render(); return; }
    const ctl = $('.step-ctl', box), msg = $('.step-msg', box);
    ctl.hidden = false; msg.hidden = false;
    let i = 0;
    const bPrev = el('button', { class: 'btn', type: 'button', text: '◀ Prev' }), bNext = el('button', { class: 'btn primary', type: 'button', text: 'Next ▶' });
    const range = el('input', { type: 'range', min: 0, max: d.steps.length - 1, value: 0 }), cnt = el('span', { class: 'cnt' });
    const bAll = el('button', { class: 'btn small', type: 'button', text: 'Show all', title: 'Show the full diagram without highlights' });
    ctl.append(bPrev, bNext, range, cnt, bAll);
    const textFor = k => {
      const s = d.steps[k];
      if (d.kind === 'sequence') return s.partial;
      return decorate(d.mermaid, d.kind, s.highlight || [], s.edges || []);
    };
    const go = k => {
      i = Math.max(0, Math.min(d.steps.length - 1, k));
      range.value = i; cnt.textContent = `step ${i + 1} / ${d.steps.length}`;
      msg.innerHTML = mdInline(d.steps[i].msg || '');
      bPrev.disabled = i === 0; bNext.disabled = i === d.steps.length - 1;
      renderMermaid(box, textFor(i));
    };
    bPrev.onclick = () => go(i - 1); bNext.onclick = () => go(i + 1); range.oninput = () => go(+range.value);
    bAll.onclick = () => { msg.innerHTML = '<span class="muted">Full diagram.</span>'; renderMermaid(box, d.mermaid); };
    box.tabIndex = 0;
    box.addEventListener('keydown', e => { if (e.key === 'ArrowRight') { go(i + 1); e.preventDefault(); } else if (e.key === 'ArrowLeft') { go(i - 1); e.preventDefault(); } });
    box._render = () => go(i);
    steppers.push(box);
    go(0);
  }
  function openLightbox(outEl) {
    const svg = $('svg', outEl); if (!svg) return;
    let dlg = $('#dsa-lightbox');
    if (!dlg) {
      dlg = el('dialog', { id: 'dsa-lightbox', style: 'max-width:96vw;max-height:94vh;border:1px solid var(--border);border-radius:12px;background:var(--bg2);color:var(--fg);padding:1rem' });
      dlg.innerHTML = '<div style="display:flex;justify-content:flex-end;margin-bottom:.4rem"><button class="btn small" type="button" id="lb-close">Close ✕</button></div><div id="lb-body" style="overflow:auto;max-height:84vh"></div>';
      document.body.appendChild(dlg);
      $('#lb-close', dlg).onclick = () => dlg.close();
      dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
    }
    const body = $('#lb-body', dlg); body.innerHTML = '';
    const c = svg.cloneNode(true); c.style.width = '92vw'; c.style.height = 'auto'; c.style.maxWidth = 'none'; c.removeAttribute('height');
    body.appendChild(c);
    dlg.showModal();
  }
  // shared with lesson.js (video lessons re-render chapter diagrams on their own stage)
  window.DSAGuide = { DATA, decorate, renderMermaid, initMermaid };
  if (initMermaid()) {
    $$('.mermaid-box[data-blk]').forEach(setupDiagram);
    new MutationObserver(() => { initMermaid(); $$('.mermaid-box[data-blk]').forEach(b => b._render && b._render()); })
      .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  } else {
    $$('.mermaid-box[data-blk]').forEach(b => { $('.mermaid-out', b).innerHTML = '<pre class="code"><code>' + esc(DATA[b.dataset.blk].mermaid) + '</code></pre>'; });
  }

  // ---------------- simulations ----------------
  $$('.sim[data-blk]').forEach(sec => {
    const d = DATA[sec.dataset.blk]; if (!d || !window.DSAViz) return;
    const player = new window.DSAViz.Player($('.viz-player', sec), d.traces[0]);
    const sel = $('.sim-input', sec);
    if (sel) sel.onchange = () => player.load(d.traces[+sel.value]);
  });

  // ---------------- tabs ----------------
  $$('.gtabs').forEach(g => {
    $$('.tabs button', g).forEach(b => b.onclick = () => {
      $$('.tabs button', g).forEach(x => x.classList.toggle('active', x === b));
      $$('.tab-panel', g).forEach(p => p.classList.toggle('active', p.dataset.panel === b.dataset.tab));
    });
  });

  // ---------------- quiz ----------------
  function buildQuiz(root, d) {
    root.innerHTML = '';
    let answered = 0, correct = 0;
    const score = el('div', { class: 'score' });
    d.questions.forEach((qq, qi) => {
      const multi = Array.isArray(qq.answer);
      const right = new Set(multi ? qq.answer : [qq.answer]);
      const box = el('div', { class: 'q' });
      box.appendChild(el('p', { class: 'qt', html: `${qi + 1}. ${qq.q}` + (multi ? ' <span class="muted small">(select all that apply)</span>' : '') }));
      const chosen = new Set();
      const opts = qq.options.map((o, oi) => {
        const row = el('div', { class: 'opt', role: 'button', tabindex: 0 }, [el('span', { class: 'k', text: String.fromCharCode(65 + oi) }), el('span', { html: o })]);
        const pick = () => {
          if (box.classList.contains('answered')) return;
          if (multi) { if (chosen.has(oi)) { chosen.delete(oi); row.classList.remove('m-active'); } else { chosen.add(oi); row.classList.add('m-active'); } return; }
          chosen.add(oi); finish();
        };
        row.onclick = pick; row.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { pick(); e.preventDefault(); } };
        return row;
      });
      opts.forEach(o => box.appendChild(o));
      const why = el('div', { class: 'why' });
      let check = null;
      if (multi) { check = el('button', { class: 'btn small', type: 'button', text: 'Check answer' }); check.onclick = () => chosen.size && finish(); box.appendChild(check); }
      box.appendChild(why);
      function finish() {
        box.classList.add('answered'); if (check) check.disabled = true;
        let ok = true;
        opts.forEach((row, oi) => {
          row.classList.remove('m-active');
          if (right.has(oi) && chosen.has(oi)) row.classList.add('right');
          else if (chosen.has(oi)) { row.classList.add('wrong'); ok = false; }
          else if (right.has(oi)) { row.classList.add('missed'); ok = false; }
          if (qq.feedback && qq.feedback[oi] && (chosen.has(oi) || right.has(oi))) row.appendChild(el('span', { class: 'muted small', html: ' — ' + qq.feedback[oi] }));
        });
        why.innerHTML = (ok ? '<b style="color:var(--good)">Correct.</b> ' : '<b style="color:var(--bad)">Not quite.</b> ') + qq.why;
        answered++; if (ok) correct++;
        score.firstChild.innerHTML = `Score: <b>${correct}/${answered}</b> answered` + (answered === d.questions.length ? (correct === answered ? ' · 🎉 all correct' : ' · review the explanations above') : '');
      }
      root.appendChild(box);
    });
    const reset = el('button', { class: 'btn small', type: 'button', text: 'Retry quiz' });
    reset.onclick = () => buildQuiz(root, d);
    score.append(el('span', { text: `${d.questions.length} questions` }), reset);
    root.appendChild(score);
  }
  $$('.quiz[data-blk]').forEach(root => { const d = DATA[root.dataset.blk]; if (d) buildQuiz(root, d); });

  // ---------------- flashcards ----------------
  $$('.flashcards[data-blk]').forEach(root => {
    const d = DATA[root.dataset.blk]; if (!d) return;
    const tools = el('div', { class: 'cards-tools' });
    const bShuffle = el('button', { class: 'btn small', type: 'button', text: '🔀 Shuffle' }), bFlip = el('button', { class: 'btn small', type: 'button', text: 'Flip all' });
    tools.append(bShuffle, bFlip, el('span', { text: `${d.cards.length} cards · click to flip` }));
    const grid = el('div', { class: 'cards' });
    root.append(tools, grid);
    let order = d.cards.map((_, i) => i);
    const draw = () => {
      grid.innerHTML = '';
      order.forEach(i => {
        const c = d.cards[i];
        const card = el('div', { class: 'fcard', role: 'button', tabindex: 0, 'aria-label': 'flashcard' }, [el('div', { class: 'inner' }, [
          el('div', { class: 'face front' }, [el('span', { class: 'tag', text: c.tag || 'Q' }), el('div', { html: c.front })]),
          el('div', { class: 'face back' }, [el('span', { class: 'tag', text: 'A' }), el('div', { html: c.back })])])]);
        const flip = () => card.classList.toggle('flipped');
        card.onclick = flip; card.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { flip(); e.preventDefault(); } };
        grid.appendChild(card);
      });
    };
    bShuffle.onclick = () => { for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; } draw(); };
    bFlip.onclick = () => { const any = $$('.fcard', grid).some(c => !c.classList.contains('flipped')); $$('.fcard', grid).forEach(c => c.classList.toggle('flipped', any)); };
    draw();
  });

  // ---------------- calculator ----------------
  const CONSTS = { K: 1e3, M: 1e6, G: 1e9, T: 1e12, KiB: 1024, MiB: 1024 ** 2, GiB: 1024 ** 3, TiB: 1024 ** 4, DAY: 86400, HOUR: 3600, MIN: 60 };
  const FUNCS = { ceil: Math.ceil, floor: Math.floor, round: Math.round, sqrt: Math.sqrt, log2: Math.log2, log10: Math.log10, min: Math.min, max: Math.max, pow: Math.pow, abs: Math.abs };
  function evaluate(expr, env) {
    const toks = expr.match(/\d+\.?\d*(?:e[+-]?\d+)?|[A-Za-z_]\w*|\*\*|[-+*/^(),%]/g) || [];
    let p = 0;
    const peek = () => toks[p], next = () => toks[p++];
    function primary() {
      const t = next();
      if (t === undefined) throw new Error('unexpected end');
      if (t === '(') { const v = sum(); if (next() !== ')') throw new Error('missing )'); return v; }
      if (t === '-') return -unary();
      if (t === '+') return unary();
      if (/^\d/.test(t)) return parseFloat(t);
      if (/^[A-Za-z_]/.test(t)) {
        if (peek() === '(') {
          next(); const args = [];
          if (peek() !== ')') { args.push(sum()); while (peek() === ',') { next(); args.push(sum()); } }
          if (next() !== ')') throw new Error('missing )');
          if (!FUNCS[t]) throw new Error('unknown function ' + t);
          return FUNCS[t](...args);
        }
        if (t in env) return env[t];
        if (t in CONSTS) return CONSTS[t];
        throw new Error('unknown name ' + t);
      }
      throw new Error('unexpected ' + t);
    }
    function power() { const b = primary(); if (peek() === '^' || peek() === '**') { next(); return Math.pow(b, unary()); } return b; }
    function unary() { if (peek() === '-') { next(); return -unary(); } if (peek() === '+') { next(); return unary(); } return power(); }
    function product() { let v = unary(); while (peek() === '*' || peek() === '/' || peek() === '%') { const op = next(); const r = unary(); v = op === '*' ? v * r : op === '/' ? v / r : v % r; } return v; }
    function sum() { let v = product(); while (peek() === '+' || peek() === '-') { const op = next(); const r = product(); v = op === '+' ? v + r : v - r; } return v; }
    const v = sum();
    if (p !== toks.length) throw new Error('unexpected ' + toks[p]);
    return v;
  }
  // 3 significant digits, trailing zeros removed only after a decimal point (150 stays 150, 1.50 -> 1.5)
  const sig3 = x => { const t = (+x).toPrecision(3); return t.includes('.') && !/e/.test(t) ? t.replace(/\.?0+$/, '') : String(+t); };
  function human(v) {
    if (!isFinite(v)) return String(v);
    const a = Math.abs(v);
    if (a >= 1e12) return sig3(v / 1e12) + ' T';
    if (a >= 1e9) return sig3(v / 1e9) + ' B';
    if (a >= 1e6) return sig3(v / 1e6) + ' M';
    if (a >= 1e3) return sig3(v / 1e3) + ' k';
    if (a === 0) return '0';
    return sig3(v);
  }
  function fmtOut(v, f) {
    if (f === 'int') return Math.round(v).toLocaleString();
    if (f === 'fixed2') return v.toFixed(2);
    if (f === 'percent') return (100 * v).toFixed(1) + ' %';
    if (f === 'raw') return String(v);
    if (f === 'bytes') { const u = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB']; let i = 0, x = v; while (Math.abs(x) >= 1000 && i < u.length - 1) { x /= 1000; i++; } return (i ? sig3(x) : Math.round(x)) + ' ' + u[i]; }
    if (f === 'bytes2') { const u = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB']; let i = 0, x = v; while (Math.abs(x) >= 1024 && i < u.length - 1) { x /= 1024; i++; } return (i ? sig3(x) : Math.round(x)) + ' ' + u[i]; }
    if (f === 'seconds') { const a = Math.abs(v); if (a < 1e-3) return (v * 1e6).toFixed(1) + ' µs'; if (a < 1) return (v * 1e3).toFixed(1) + ' ms'; if (a < 60) return v.toFixed(2) + ' s'; if (a < 3600) return (v / 60).toFixed(1) + ' min'; if (a < 86400) return (v / 3600).toFixed(1) + ' h'; return (v / 86400).toFixed(1) + ' days'; }
    return human(v);
  }
  $$('.calc[data-blk]').forEach(root => {
    const d = DATA[root.dataset.blk]; if (!d) return;
    const left = el('div'), right = el('div');
    left.appendChild(el('h4', { text: 'Inputs (edit me)' })); right.appendChild(el('h4', { text: 'Results' }));
    const fields = {};
    d.inputs.forEach(i => {
      const input = el('input', { type: 'number', value: i.default, step: i.step || 'any' });
      fields[i.name] = input;
      left.appendChild(el('label', {}, [el('span', { text: i.label }), el('span', { style: 'display:flex;gap:.4rem;align-items:center' }, [input, el('span', { class: 'unit', text: i.unit || '' })])]));
      input.addEventListener('input', recompute);
    });
    const outs = d.outputs.map(o => { const row = el('div', { class: 'out' }, [el('span', { html: esc(o.label) + (o.show_expr !== false ? `<span class="expr">${esc(o.expr)}</span>` : '') }), el('b')]); right.appendChild(row); return row; });
    function recompute() {
      const env = {}; d.inputs.forEach(i => env[i.name] = parseFloat(fields[i.name].value) || 0);
      d.outputs.forEach((o, k) => { const b = $('b', outs[k]); try { b.textContent = fmtOut(evaluate(o.expr, env), o.fmt || 'auto') + (o.unit ? ' ' + o.unit : ''); b.classList.remove('err'); } catch (e) { b.textContent = '?'; b.title = e.message; } });
    }
    const reset = el('button', { class: 'btn small', type: 'button', text: 'Reset defaults' });
    reset.onclick = () => { d.inputs.forEach(i => fields[i.name].value = i.default); recompute(); };
    left.appendChild(reset);
    root.append(left, right);
    recompute();
  });

  // ---------------- checklists (persisted) ----------------
  $$('ul.checklist[data-key]').forEach(ul => {
    const k = key('check', CHAPTER || 'x', ul.dataset.key);
    const saved = new Set(store.get(k, []));
    const meta = ul.dataset.blk ? $(`.checklist-meta[data-for="${ul.dataset.blk}"]`) : null;
    const boxes = $$('input[type=checkbox]', ul);
    const refresh = () => {
      boxes.forEach(b => b.closest('li').classList.toggle('done', b.checked));
      const n = boxes.filter(b => b.checked).length;
      if (meta) { meta.innerHTML = `<span>${n}/${boxes.length} done</span>`; const r = el('button', { class: 'btn small', type: 'button', text: 'Clear' }); r.onclick = () => { boxes.forEach(b => b.checked = false); save(); }; meta.appendChild(r); }
    };
    const save = () => { store.set(k, boxes.filter(b => b.checked).map(b => b.dataset.i)); refresh(); };
    boxes.forEach(b => { b.checked = saved.has(b.dataset.i); b.addEventListener('change', save); });
    refresh();
  });

  // ---------------- practice timer ----------------
  function countdown(clockEl, totalSec, onDone) {
    let left = totalSec, timer = null;
    const draw = () => { const m = Math.floor(left / 60), s = left % 60; clockEl.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`; clockEl.classList.toggle('low', left <= 300 && left > 0); };
    draw();
    return {
      start() { if (timer) return; timer = setInterval(() => { left--; draw(); if (left <= 0) { this.stop(); clockEl.textContent = "Time's up"; onDone && onDone(); } }, 1000); },
      stop() { clearInterval(timer); timer = null; },
      reset(sec) { this.stop(); left = sec === undefined ? totalSec : sec; draw(); },
      running: () => !!timer,
    };
  }
  $$('.practice[data-blk]').forEach(root => {
    const d = DATA[root.dataset.blk]; if (!d) return;
    const clock = $('.clock', root), bStart = $('.start', root), bReset = $('.reset', root), ta = $('.scratch', root);
    const cd = countdown(clock, d.minutes * 60, () => { try { navigator.vibrate && navigator.vibrate(200); } catch (e) { /* ignore */ } });
    bStart.onclick = () => { if (cd.running()) { cd.stop(); bStart.textContent = '▶ Resume'; } else { cd.start(); bStart.textContent = '❚❚ Pause'; } };
    bReset.onclick = () => { cd.reset(); bStart.textContent = '▶ Start'; };
    const k = key('practice', CHAPTER || 'x', d.key);
    ta.value = store.get(k, '');
    let t; ta.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => store.set(k, ta.value), 300); });
  });

  // ---------------- story builder (STAR / CARL) ----------------
  const FIELDS = {
    STAR: [['situation', 'Situation', '1-2 sentences: where, when, the stakes. No company jargon.'],
      ['task', 'Task', 'What YOU were responsible for (not the team). The goal and the constraint.'],
      ['action', 'Action', '60% of the answer: the specific things you did, decisions and why, who you pulled in. "I", not "we".'],
      ['result', 'Result', 'Numbers if you have them (latency, %, money, time saved). What changed because of you.']],
    CARL: [['context', 'Context', 'The setting and the problem, in 1-2 sentences.'],
      ['action', 'Action', 'What you did, step by step, and why you chose it over alternatives.'],
      ['result', 'Result', 'Measurable outcome. Be honest if it was mixed.'],
      ['learning', 'Learning', 'What you took away and how you have applied it since (this is what makes CARL land).']],
  };
  const Stories = {
    KEY: 'dsa.stories',
    all() { return store.get(this.KEY, []); },
    save(s) { const a = this.all().filter(x => x.id !== s.id); s.updated = Date.now(); if (!s.created) s.created = s.updated; a.push(s); a.sort((x, y) => y.updated - x.updated); store.set(this.KEY, a); document.dispatchEvent(new CustomEvent('dsa:stories')); },
    remove(id) { store.set(this.KEY, this.all().filter(x => x.id !== id)); document.dispatchEvent(new CustomEvent('dsa:stories')); },
    toMarkdown(s) {
      const f = FIELDS[s.framework] || FIELDS.STAR;
      return `## ${s.title || 'Untitled story'}\n_${s.framework}${s.tags && s.tags.length ? ' · ' + s.tags.join(', ') : ''}_\n\n` + f.map(([k, label]) => `**${label}**\n${(s.fields && s.fields[k]) || ''}\n`).join('\n');
    },
  };
  $$('.story[data-blk]').forEach(root => {
    const d = DATA[root.dataset.blk]; if (!d) return;
    const fw = d.framework || 'STAR';
    let cur = { id: 's' + Date.now().toString(36), framework: fw, title: '', fields: {}, tags: [] };
    const head = el('div', { class: 'st-head' });
    const sel = el('select', { title: 'Load a saved story' });
    const title = el('input', { type: 'text', placeholder: 'Story title, e.g. "Migrated payments retries without downtime"', maxlength: 120 });
    const bNew = el('button', { class: 'btn small', type: 'button', text: '+ New' });
    head.append(el('b', { text: fw }), sel, title, bNew);
    root.appendChild(head);
    const chipsWrap = d.tags.length ? el('div', { class: 'lp-chips' }) : null;
    if (chipsWrap) { root.appendChild(el('div', { class: 'muted small', text: 'Tag the themes / principles this story shows:' })); root.appendChild(chipsWrap); }
    const areas = {};
    FIELDS[fw].forEach(([k, label, hint]) => {
      const ta = el('textarea', { placeholder: 'Write the ' + label.toLowerCase() + ' here…' });
      const count = el('div', { class: 'count' });
      areas[k] = ta;
      const f = el('div', { class: 'field' }, [el('label', {}, [el('span', { text: label }), el('span', { class: 'hint', text: d.prompts[k] || hint })]), ta, count]);
      ta.addEventListener('input', () => { const w = ta.value.trim().split(/\s+/).filter(Boolean).length; count.textContent = w + ' words' + (k === 'action' && w && w < 60 ? ' · actions usually need more detail' : ''); count.classList.toggle('over', w > 160); schedule(); });
      root.appendChild(f);
    });
    const tools = el('div', { class: 'st-tools' });
    const bSave = el('button', { class: 'btn small primary', type: 'button', text: 'Save' }), bCopy = el('button', { class: 'btn small', type: 'button', text: 'Copy as markdown' }),
      bDl = el('button', { class: 'btn small', type: 'button', text: 'Download all stories (.md)' }), bDel = el('button', { class: 'btn small danger', type: 'button', text: 'Delete' }), saved = el('span', { class: 'saved' });
    tools.append(bSave, bCopy, bDl, bDel, saved);
    root.appendChild(tools);
    const bank = el('div', { class: 'story-bank' });
    root.appendChild(bank);
    function drawChips() { if (!chipsWrap) return; chipsWrap.innerHTML = ''; d.tags.forEach(t => { const b = el('button', { type: 'button', class: cur.tags.includes(t) ? 'on' : '', text: t }); b.onclick = () => { cur.tags = cur.tags.includes(t) ? cur.tags.filter(x => x !== t) : cur.tags.concat(t); drawChips(); save(); }; chipsWrap.appendChild(b); }); }
    function load(s) { cur = s; title.value = s.title || ''; FIELDS[fw].forEach(([k]) => { areas[k].value = (s.fields && s.fields[k]) || ''; areas[k].dispatchEvent(new Event('input')); }); drawChips(); saved.textContent = ''; }
    function collect() { cur.title = title.value.trim(); cur.fields = {}; FIELDS[fw].forEach(([k]) => cur.fields[k] = areas[k].value); return cur; }
    function save() { const s = collect(); if (!s.title && !Object.values(s.fields).some(v => v.trim())) return; Stories.save(s); saved.textContent = 'Saved ✓'; setTimeout(() => saved.textContent = '', 1500); drawSelect(); drawBank(); }
    let t; function schedule() { clearTimeout(t); t = setTimeout(save, 600); }
    title.addEventListener('input', schedule);
    function drawSelect() {
      const all = Stories.all().filter(s => s.framework === fw);
      sel.innerHTML = '<option value="">Load saved…</option>' + all.map(s => `<option value="${s.id}" ${s.id === cur.id ? 'selected' : ''}>${esc(s.title || 'Untitled')}</option>`).join('');
    }
    function drawBank() {
      const all = Stories.all();
      if (!all.length) { bank.innerHTML = '<p class="empty-bank">Your story bank is empty. Stories you save here are available in every behavioural chapter.</p>'; return; }
      bank.innerHTML = `<h4>Your story bank (${all.length})</h4>` + '<div class="table-wrap"><table><thead><tr><th>Story</th><th>Framework</th><th>Tags</th><th>Words</th></tr></thead><tbody>' +
        all.map(s => `<tr><td><a href="#" data-load="${s.id}">${esc(s.title || 'Untitled')}</a></td><td>${s.framework}</td><td>${(s.tags || []).map(esc).join(', ') || '<span class="muted">—</span>'}</td><td>${Object.values(s.fields || {}).join(' ').trim().split(/\s+/).filter(Boolean).length}</td></tr>`).join('') + '</tbody></table></div>';
      $$('a[data-load]', bank).forEach(a => a.onclick = e => { e.preventDefault(); const s = Stories.all().find(x => x.id === a.dataset.load); if (s && s.framework === fw) load(s); else if (s) alert('That story uses ' + s.framework + '; open it in a ' + s.framework + ' builder.'); });
    }
    sel.onchange = () => { const s = Stories.all().find(x => x.id === sel.value); if (s) load(s); };
    bNew.onclick = () => load({ id: 's' + Date.now().toString(36), framework: fw, title: '', fields: {}, tags: [] });
    bSave.onclick = save;
    bCopy.onclick = async () => { const md = Stories.toMarkdown(collect()); try { await navigator.clipboard.writeText(md); saved.textContent = 'Copied ✓'; } catch (e) { prompt('Copy:', md); } };
    bDl.onclick = () => { const md = '# My interview stories\n\n' + Stories.all().map(Stories.toMarkdown).join('\n---\n\n'); const a = el('a', { href: URL.createObjectURL(new Blob([md], { type: 'text/markdown' })), download: 'interview-stories.md' }); document.body.appendChild(a); a.click(); a.remove(); };
    bDel.onclick = () => { if (confirm('Delete this story?')) { Stories.remove(cur.id); bNew.onclick(); drawSelect(); drawBank(); } };
    document.addEventListener('dsa:stories', () => { drawSelect(); drawBank(); });
    drawChips(); drawSelect(); drawBank();
  });

  // ---------------- question drill ----------------
  $$('.drill[data-blk]').forEach(root => {
    const d = DATA[root.dataset.blk]; if (!d) return;
    let pool = [], curQ = null;
    const tags = el('div', { class: 'dtags' }), q = el('div', { class: 'dq', text: 'Press "Next question" to start.' }), clock = el('span', { class: 'clock', style: 'font-family:var(--mono);font-size:1.3rem' });
    const bNext = el('button', { class: 'btn primary small', type: 'button', text: 'Next question ▶' }), bTimer = el('button', { class: 'btn small', type: 'button', text: `▶ ${d.minutes} min` }), bReveal = el('button', { class: 'btn small', type: 'button', text: 'Show follow-ups & notes' });
    const follow = el('div', { class: 'follow' }), seen = el('span', { class: 'muted small' });
    const tools = el('div', { class: 'dtools' }, [bNext, bTimer, clock, bReveal, seen]);
    root.append(tags, q, tools, follow);
    const cd = countdown(clock, d.minutes * 60);
    let done = 0;
    function nextQ() {
      if (!pool.length) pool = d.questions.map((_, i) => i).sort(() => Math.random() - 0.5);
      curQ = d.questions[pool.pop()];
      q.textContent = curQ.q; tags.innerHTML = curQ.tags.map(t => `<span>${esc(t)}</span>`).join('');
      follow.classList.remove('show'); follow.innerHTML = '';
      cd.reset(); bTimer.textContent = `▶ ${d.minutes} min`;
      seen.textContent = `${++done} drawn · ${d.questions.length} in bank`;
    }
    bNext.onclick = nextQ;
    bTimer.onclick = () => { if (cd.running()) { cd.stop(); bTimer.textContent = '▶ Resume'; } else { cd.start(); bTimer.textContent = '❚❚ Pause'; } };
    bReveal.onclick = () => { if (!curQ) return; follow.classList.add('show'); follow.innerHTML = (curQ.followups.length ? '<b>Likely follow-ups</b><ul>' + curQ.followups.map(f => `<li>${esc(f)}</li>`).join('') + '</ul>' : '') + (curQ.notes ? `<p><b>A strong answer has:</b> ${mdInline(curQ.notes)}</p>` : '') || '<p class="muted">No follow-ups listed for this one. Ask yourself: what would you do differently, and what did it cost?</p>'; };
  });

  // ---------------- matrix (toggle grid) ----------------
  $$('.matrix-wrap[data-blk]').forEach(root => {
    const d = DATA[root.dataset.blk]; if (!d) return;
    const k = key('matrix', CHAPTER || 'x', d.key);
    const dynamic = d.cols.length === 1 && d.cols[0] === '@stories';
    const draw = () => {
      // dynamic columns are stories; their ticks are keyed by story id so re-ordering/deleting stories cannot move a tick
      const stories = dynamic ? Stories.all().slice().sort((a, b) => (a.created || 0) - (b.created || 0) || String(a.id).localeCompare(String(b.id))) : null;
      const cols = dynamic ? stories.map(s => s.title || 'Untitled') : d.cols;
      const colKey = ci => dynamic ? stories[ci].id : String(ci);
      const state = Object.assign({}, dynamic ? {} : d.cells, store.get(k, {}));
      const cellOn = (ri, ci) => { const v = state[ri + ',' + colKey(ci)]; return v !== undefined && v !== false && v !== ''; };
      const tbl = el('table', { class: 'matrix' });
      const thead = el('thead'); const hr = el('tr'); hr.appendChild(el('th', { text: '' })); cols.forEach(c => hr.appendChild(el('th', { text: c }))); thead.appendChild(hr); tbl.appendChild(thead);
      const tb = el('tbody');
      d.rows.forEach((r, ri) => {
        const tr = el('tr'); tr.appendChild(el('td', { html: mdInline(r) }));
        cols.forEach((c, ci) => {
          const on = cellOn(ri, ci), v = state[ri + ',' + colKey(ci)];
          const td = el('td', { class: (on ? 'hit ' : '') + (d.editable ? 'cell-btn' : ''), text: on ? (v === true || v === 'true' ? '✓' : v) : '' });
          if (d.editable) td.onclick = () => { const st = store.get(k, {}); const id = ri + ',' + colKey(ci); if (cellOn(ri, ci)) st[id] = false; else st[id] = '✓'; store.set(k, st); draw(); };
          tr.appendChild(td);
        });
        tb.appendChild(tr);
      });
      tbl.appendChild(tb);
      root.innerHTML = '';
      if (dynamic && !cols.length) root.appendChild(el('p', { class: 'muted', text: 'Save a few stories in the story builder first; they become the columns here.' }));
      root.appendChild(tbl);
      if (d.editable) root.appendChild(el('p', { class: 'muted small', text: 'Click a cell to toggle. Rows with no ticks are gaps to fill.' }));
      if (d.editable && cols.length) {
        const gaps = d.rows.filter((r, ri) => !cols.some((c, ci) => cellOn(ri, ci)));
        if (gaps.length) root.appendChild(el('p', { class: 'small', html: '<b>Gaps:</b> ' + gaps.map(mdInline).join(' · ') }));
      }
    };
    document.addEventListener('dsa:stories', draw);
    draw();
  });

  // ---------------- "continue" on guides index ----------------
  (function () {
    const last = store.get('dsa.guide.last', null);
    const page = $('.tracks-page'); if (!page || !last) return;
    page.insertBefore(el('p', {}, [el('a', { class: 'btn', href: last.url, text: '↩ Continue: ' + last.title })]), page.children[2] || null);
  })();
})();
