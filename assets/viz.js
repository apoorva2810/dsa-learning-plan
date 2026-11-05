/* DSA Lab visualiser: plays a trace (list of steps, each with views). See content/_lib.py. */
(function () {
  'use strict';
  const esc = s => window.DSA.esc(s);
  const mdInline = s => window.DSA.mdInline(s);
  const SVGNS = 'http://www.w3.org/2000/svg';

  function el(tag, attrs, children) {
    const e = document.createElement(tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') e.className = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k === 'text') e.textContent = v;
      else if (v !== null && v !== undefined) e.setAttribute(k, v);
    }
    (children || []).forEach(c => { if (c) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  function svgEl(tag, attrs, children) {
    const e = document.createElementNS(SVGNS, tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) {
      if (k === 'text') e.textContent = v; else if (v !== null && v !== undefined) e.setAttribute(k, v);
    }
    (children || []).forEach(c => c && e.appendChild(c));
    return e;
  }
  const fmt = v => {
    if (v === null || v === undefined) return 'None';
    if (v === true) return 'True';
    if (v === false) return 'False';
    if (typeof v === 'string') return v === '' ? '""' : (v === ' ' ? '␣' : v);
    if (Array.isArray(v)) return '[' + v.map(fmt).join(', ') + ']';
    if (typeof v === 'object') return '{' + Object.entries(v).map(([k, x]) => k + ': ' + fmt(x)).join(', ') + '}';
    return String(v);
  };
  const markClass = (marks, key) => (marks && marks[key]) ? ' m-' + marks[key] : '';
  const named = (view, body, extraClass) => {
    const w = el('div', { class: 'view view-' + view.type + (extraClass ? ' ' + extraClass : '') });
    if (view.name) w.appendChild(el('div', { class: 'view-name', text: view.name }));
    w.appendChild(body);
    return w;
  };

  // ---------------- renderers ----------------
  const R = {};

  R.array = R.string = function (v) {
    const ptrs = {};
    Object.entries(v.pointers || {}).forEach(([lbl, idx]) => { if (idx !== null && idx !== undefined) (ptrs[idx] = ptrs[idx] || []).push(lbl); });
    const hasPtr = Object.keys(ptrs).length > 0, hasLbl = v.labels && Object.keys(v.labels).length > 0;
    const wrap = el('div', { class: 'cells-wrap' + (hasPtr ? ' has-pointers' : '') + (hasLbl ? ' has-labels' : '') });
    const cells = el('div', { class: 'cells' });
    if (!v.values.length) cells.appendChild(el('div', { class: 'empty', text: '(empty)' }));
    // pointers before the start (e.g. -1) get a null cell on the LEFT
    const leftPtrs = Object.entries(v.pointers || {}).filter(([, idx]) => typeof idx === 'number' && idx < 0);
    if (leftPtrs.length) {
      const c = el('div', { class: 'cell m-dim', text: '∅' });
      c.appendChild(el('span', { class: 'ptr', text: leftPtrs.map(p => p[0]).join(',') }));
      cells.appendChild(c);
    }
    v.values.forEach((x, i) => {
      let cls = 'cell' + markClass(v.marks, i);
      if ((v.highlight || []).includes(i)) cls += ' hl';
      if (v.window && i >= v.window[0] && i <= v.window[1]) cls += ' in-window';
      const c = el('div', { class: cls }, [el('span', { class: 'idx', text: i }), document.createTextNode(fmt(x))]);
      if (ptrs[i]) c.appendChild(el('span', { class: 'ptr', text: ptrs[i].join(',') }));
      if (v.labels && v.labels[i] !== undefined) c.appendChild(el('span', { class: 'lbl' + (ptrs[i] ? ' with-ptr' : ''), text: v.labels[i] }));
      cells.appendChild(c);
    });
    // pointers that are null or past the end get a null cell on the RIGHT
    const nullPtrs = Object.entries(v.pointers || {}).filter(([, idx]) => idx === null || idx === undefined || idx >= v.values.length);
    if (nullPtrs.length) {
      const c = el('div', { class: 'cell m-dim', text: '∅' });
      c.appendChild(el('span', { class: 'ptr', text: nullPtrs.map(p => p[0]).join(',') }));
      cells.appendChild(c);
    }
    wrap.appendChild(cells);
    return named(v, wrap);
  };

  R.set = function (v) {
    const cells = el('div', { class: 'cells' });
    if (!v.values.length) cells.appendChild(el('div', { class: 'empty', text: '{ } empty' }));
    v.values.forEach(x => {
      const key = String(x);
      let cls = 'cell' + markClass(v.marks, key);
      if ((v.highlight || []).some(h => String(h) === key)) cls += ' hl';
      cells.appendChild(el('div', { class: cls, text: fmt(x) }));
    });
    return named(v, cells);
  };

  R.map = function (v) {
    const box = el('div', { class: 'map-view' });
    if (!v.entries.length) box.appendChild(el('div', { class: 'empty', text: '{ } empty' }));
    v.entries.forEach(([k, val]) => {
      const key = String(k);
      let cls = 'kv' + markClass(v.marks, key);
      if ((v.highlight || []).some(h => String(h) === key)) cls += ' hl';
      box.appendChild(el('div', { class: cls }, [el('span', { class: 'k', text: fmt(k) }), el('span', { class: 'v', text: fmt(val) })]));
    });
    return named(v, box);
  };

  R.vars = function (v) {
    const box = el('div', { class: 'vars-view' });
    v.entries.forEach(([k, val]) => box.appendChild(el('div', { class: 'var' }, [el('span', { class: 'k', text: k + ' =' }), el('span', { text: fmt(val) })])));
    return el('div', { class: 'view view-vars' }, [box]);
  };

  R.result = v => el('div', { class: 'view' }, [el('div', { class: 'result-view ' + (v.kind || 'good'), text: (v.label || 'result') + ' = ' + fmt(v.value) })]);
  R.note = v => el('div', { class: 'view' }, [el('div', { class: 'note-view ' + (v.kind || 'info'), html: mdInline(v.text) })]);

  R.stack = function (v) {
    const box = el('div', { class: 'stack-view' });
    box.appendChild(el('div', { class: 'stack-base', text: 'bottom' }));
    if (!v.values.length) box.appendChild(el('div', { class: 'empty', text: 'empty' }));
    v.values.forEach((x, i) => {
      let cls = 'cell' + markClass(v.marks, i) + (i === v.values.length - 1 ? ' top' : '');
      if ((v.highlight || []).includes(i)) cls += ' hl';
      box.appendChild(el('div', { class: cls, text: fmt(x) }));
    });
    if (v.values.length) box.appendChild(el('div', { class: 'stack-top-lbl', text: '▲ top' }));
    return named(v, box);
  };

  R.queue = function (v) {
    const wrap = el('div', { class: 'cells-wrap has-pointers' });
    const cells = el('div', { class: 'cells' });
    if (!v.values.length) cells.appendChild(el('div', { class: 'empty', text: 'empty' }));
    v.values.forEach((x, i) => {
      let cls = 'cell' + markClass(v.marks, i);
      if ((v.highlight || []).includes(i)) cls += ' hl';
      const c = el('div', { class: cls, text: fmt(x) });
      if (i === 0) c.appendChild(el('span', { class: 'ptr', text: 'front' }));
      else if (i === v.values.length - 1) c.appendChild(el('span', { class: 'ptr', text: 'back' }));
      cells.appendChild(c);
    });
    wrap.appendChild(cells);
    return named(v, wrap);
  };

  R.heap = function (v) {
    const box = el('div', { class: 'heap-view' });
    box.appendChild(R.array({ type: 'array', values: v.values, highlight: v.highlight, marks: v.marks, name: 'as list (' + (v.kind || 'min') + '-heap)' }));
    const n = v.values.length;
    if (n && n <= 31) {
      const nodes = v.values.map((x, i) => ({ id: i, val: x, left: 2 * i + 1 < n ? 2 * i + 1 : null, right: 2 * i + 2 < n ? 2 * i + 2 : null }));
      box.appendChild(R.tree({ type: 'tree', name: 'as tree', nodes, highlight: v.highlight, marks: v.marks, labels: {} }));
    }
    return named(v, box);
  };

  R.grid = function (v) {
    const t = el('table', { class: 'grid-view' });
    const hasCol = !!v.col_labels, hasRow = !!v.row_labels;
    const ptrAt = {};
    Object.entries(v.pointers || {}).forEach(([lbl, rc]) => { if (Array.isArray(rc)) { const k = rc[0] + ',' + rc[1]; (ptrAt[k] = ptrAt[k] || []).push(lbl); } });
    if (hasCol) {
      const tr = el('tr');
      if (hasRow) tr.appendChild(el('th'));
      v.col_labels.forEach(c => tr.appendChild(el('th', { text: fmt(c) })));
      t.appendChild(tr);
    }
    v.rows.forEach((row, r) => {
      const tr = el('tr');
      if (hasRow) tr.appendChild(el('th', { text: fmt(v.row_labels[r]) }));
      row.forEach((x, c) => {
        const key = r + ',' + c;
        let cls = 'cell' + markClass(v.marks, key);
        if ((v.highlight || []).some(h => h[0] === r && h[1] === c)) cls += ' hl';
        const cell = el('div', { class: cls, text: fmt(x) });
        if (ptrAt[key]) cell.appendChild(el('span', { class: 'ptr', text: ptrAt[key].join(',') }));
        tr.appendChild(el('td', null, [cell]));
      });
      t.appendChild(tr);
    });
    if (!v.rows.length) return named(v, el('div', { class: 'empty', text: '(empty grid)' }));
    const wrap = el('div', { class: 'table-wrap' + (Object.keys(ptrAt).length ? ' has-pointers' : '') }, [t]);
    return named(v, wrap);
  };

  R.linkedlist = function (v) {
    const n = v.values.length, W = 56, GAP = 34, H = 40, top = 34, bottom = 30;
    const hasNull = v.tail_text !== false && v.cycle_to === null;
    const total = n + (hasNull ? 1 : 0);
    const width = Math.max(120, total * (W + GAP) + 20), height = top + H + bottom + (v.cycle_to !== null && v.cycle_to !== undefined ? 24 : 0);
    const svg = svgEl('svg', { class: 'ds', viewBox: `0 0 ${width} ${height}`, width, height });
    const defs = svgEl('defs');
    defs.innerHTML = '<marker id="ll-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" markerUnits="userSpaceOnUse" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="var(--muted)"/></marker>';
    svg.appendChild(defs);
    const ptrs = {};
    Object.entries(v.pointers || {}).forEach(([lbl, idx]) => { const k = (idx === null || idx === undefined) ? 'null' : idx; (ptrs[k] = ptrs[k] || []).push(lbl); });
    const x0 = 10;
    const xAt = i => x0 + i * (W + GAP);
    if (!n) svg.appendChild(svgEl('text', { x: 10, y: top + 24, class: 'lbl', text: 'empty list (None)' }));
    v.values.forEach((val, i) => {
      const x = xAt(i), y = top;
      let cls = 'node' + markClass(v.marks, i) + ((v.highlight || []).includes(i) ? ' hl' : '');
      const g = svgEl('g', { class: cls });
      g.appendChild(svgEl('rect', { x, y, width: W, height: H, rx: 8 }));
      g.appendChild(svgEl('text', { x: x + W / 2, y: y + H / 2 + 5, 'text-anchor': 'middle', text: fmt(val) }));
      svg.appendChild(g);
      if (i < n - 1 || hasNull) svg.appendChild(svgEl('line', { x1: x + W, y1: y + H / 2, x2: x + W + GAP - 2, y2: y + H / 2, class: 'edge', 'marker-end': 'url(#ll-arrow)' }));
      if (ptrs[i]) svg.appendChild(svgEl('text', { x: x + W / 2, y: y - 10, 'text-anchor': 'middle', class: 'ptr', text: ptrs[i].join(',') + ' ▼' }));
    });
    if (hasNull && n) {
      const x = xAt(n);
      svg.appendChild(svgEl('text', { x: x + 4, y: top + H / 2 + 5, class: 'lbl', text: v.tail_text || 'None' }));
      if (ptrs['null']) svg.appendChild(svgEl('text', { x: x + 14, y: top - 10, 'text-anchor': 'middle', class: 'ptr', text: ptrs['null'].join(',') + ' ▼' }));
    } else if (ptrs['null']) {
      svg.appendChild(svgEl('text', { x: 10, y: top + H + 20, class: 'ptr', text: ptrs['null'].join(',') + ' = None' }));
    }
    if (v.cycle_to !== null && v.cycle_to !== undefined && n) {
      const xs = xAt(n - 1) + W / 2, xe = xAt(v.cycle_to) + W / 2, y = top + H;
      svg.appendChild(svgEl('path', { d: `M${xs},${y} C${xs},${y + 30} ${xe},${y + 30} ${xe},${y + 2}`, class: 'edge', 'marker-end': 'url(#ll-arrow)' }));
    }
    return named(v, el('div', { class: 'table-wrap' }, [svg]));
  };

  R.tree = function (v) {
    const byId = {};
    v.nodes.forEach(nd => { byId[String(nd.id)] = nd; });
    if (!v.nodes.length) return named(v, el('div', { class: 'empty', text: 'empty tree (None)' }));
    const root = v.nodes[0];
    const pos = {}; let counter = 0, maxDepth = 0;
    (function layout(id, depth) {
      if (id === null || id === undefined || !byId[String(id)]) return;
      const nd = byId[String(id)];
      layout(nd.left, depth + 1);
      pos[String(id)] = { x: counter++, y: depth };
      maxDepth = Math.max(maxDepth, depth);
      layout(nd.right, depth + 1);
    })(root.id, 0);
    const SX = 46, SY = 58, R0 = 17, PAD = 26, hasLabels = v.labels && Object.keys(v.labels).length;
    const width = counter * SX + PAD * 2, height = (maxDepth + 1) * SY + PAD + (hasLabels ? 14 : 0);
    const svg = svgEl('svg', { class: 'ds', viewBox: `0 0 ${width} ${height}`, width: Math.min(width, 900), height: Math.min(height, 900 * height / width) });
    const cx = id => PAD + pos[String(id)].x * SX + SX / 2, cy = id => PAD + pos[String(id)].y * SY;
    v.nodes.forEach(nd => {
      if (!pos[String(nd.id)]) return;
      [nd.left, nd.right].forEach(ch => {
        if (ch === null || ch === undefined || !pos[String(ch)]) return;
        svg.appendChild(svgEl('line', { x1: cx(nd.id), y1: cy(nd.id), x2: cx(ch), y2: cy(ch), class: 'edge' }));
      });
    });
    v.nodes.forEach(nd => {
      if (!pos[String(nd.id)]) return;
      const id = String(nd.id);
      let cls = 'node' + markClass(v.marks, id) + ((v.highlight || []).some(h => String(h) === id) ? ' hl' : '');
      const g = svgEl('g', { class: cls });
      g.appendChild(svgEl('circle', { cx: cx(nd.id), cy: cy(nd.id), r: R0 }));
      const txt = fmt(nd.val);
      g.appendChild(svgEl('text', { x: cx(nd.id), y: cy(nd.id) + 5, 'text-anchor': 'middle', text: txt, style: txt.length > 3 ? 'font-size:10px' : '' }));
      if (v.labels && v.labels[id] !== undefined) g.appendChild(svgEl('text', { x: cx(nd.id) + R0 + 3, y: cy(nd.id) + 4, class: 'lbl', text: fmt(v.labels[id]) }));
      svg.appendChild(g);
    });
    return named(v, el('div', { class: 'table-wrap' }, [svg]));
  };

  R.graph = function (v) {
    const nodes = v.nodes, n = nodes.length;
    if (!n) return named(v, el('div', { class: 'empty', text: 'empty graph' }));
    const W = Math.min(520, Math.max(260, n * 48)), H = Math.min(400, Math.max(200, n * 36)), R0 = 16, PAD = 30;
    const pos = {};
    nodes.forEach((nd, i) => {
      const id = String(nd.id);
      if (v.pos && v.pos[id]) pos[id] = { x: PAD + v.pos[id][0] * (W - 2 * PAD), y: PAD + v.pos[id][1] * (H - 2 * PAD) };
      else { const a = -Math.PI / 2 + 2 * Math.PI * i / n; pos[id] = { x: W / 2 + (W / 2 - PAD) * Math.cos(a), y: H / 2 + (H / 2 - PAD) * Math.sin(a) }; }
    });
    const svg = svgEl('svg', { class: 'ds', viewBox: `0 0 ${W} ${H}`, width: W, height: H });
    const defs = svgEl('defs');
    defs.innerHTML = '<marker id="g-arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="9" markerHeight="9" markerUnits="userSpaceOnUse" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="var(--muted)"/></marker><marker id="g-arrow-hl" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="9" markerHeight="9" markerUnits="userSpaceOnUse" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="var(--active)"/></marker>';
    svg.appendChild(defs);
    const hlE = (v.highlight_edges || []).map(e => String(e[0]) + '|' + String(e[1]));
    v.edges.forEach(e => {
      const a = pos[String(e[0])], b = pos[String(e[1])];
      if (!a || !b) return;
      const key1 = String(e[0]) + '|' + String(e[1]), key2 = String(e[1]) + '|' + String(e[0]);
      const hl = hlE.includes(key1) || (!v.directed && hlE.includes(key2));
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
      const x2 = v.directed ? b.x - dx / d * (R0 + 2) : b.x, y2 = v.directed ? b.y - dy / d * (R0 + 2) : b.y;
      const line = svgEl('line', { x1: a.x, y1: a.y, x2, y2, class: 'edge' + (hl ? ' hl' : '') });
      if (v.directed) line.setAttribute('marker-end', hl ? 'url(#g-arrow-hl)' : 'url(#g-arrow)');
      svg.appendChild(line);
      if (e.length > 2) svg.appendChild(svgEl('text', { x: (a.x + b.x) / 2 + 4, y: (a.y + b.y) / 2 - 4, class: 'w', text: fmt(e[2]) }));
    });
    nodes.forEach(nd => {
      const id = String(nd.id), p = pos[id];
      let cls = 'node' + markClass(v.marks, id) + ((v.highlight || []).some(h => String(h) === id) ? ' hl' : '');
      const g = svgEl('g', { class: cls });
      g.appendChild(svgEl('circle', { cx: p.x, cy: p.y, r: R0 }));
      const label = nd.label !== undefined ? String(nd.label) : id;
      g.appendChild(svgEl('text', { x: p.x, y: p.y + 5, 'text-anchor': 'middle', text: label, style: label.length > 3 ? 'font-size:10px' : '' }));
      if (v.labels && v.labels[id] !== undefined) g.appendChild(svgEl('text', { x: p.x + R0 + 2, y: p.y - R0 + 4, class: 'lbl', text: fmt(v.labels[id]) }));
      svg.appendChild(g);
    });
    return named(v, el('div', { class: 'table-wrap' }, [svg]));
  };

  R.intervals = function (v) {
    const items = v.items || [], extra = Object.entries(v.extra || {});
    const all = items.concat(extra.map(e => e[1]));
    if (!all.length) return named(v, el('div', { class: 'empty', text: '(no intervals)' }));
    let lo = Math.min(...all.map(x => x[0])), hi = Math.max(...all.map(x => x[1]));
    if (hi === lo) hi = lo + 1;
    const W = 520, PADL = 10, PADR = 10, ROW = 22, TOP = 20;
    const rows = items.length + extra.length;
    const H = TOP + rows * ROW + 24;
    const sx = x => PADL + (x - lo) / (hi - lo) * (W - PADL - PADR);
    const svg = svgEl('svg', { class: 'ds', viewBox: `0 0 ${W} ${H}`, width: W, height: H });
    // axis ticks
    const span = hi - lo, step = span <= 12 ? 1 : Math.ceil(span / 10);
    for (let t = lo; t <= hi; t += step) {
      svg.appendChild(svgEl('line', { x1: sx(t), y1: TOP - 4, x2: sx(t), y2: H - 18, class: 'edge', style: 'opacity:.25' }));
      svg.appendChild(svgEl('text', { x: sx(t), y: H - 4, 'text-anchor': 'middle', class: 'lbl', text: t }));
    }
    const bar = (iv, row, cls, label) => {
      const x1 = sx(iv[0]), x2 = Math.max(sx(iv[1]), x1 + 3), y = TOP + row * ROW;
      const g = svgEl('g', { class: cls });
      g.appendChild(svgEl('rect', { x: x1, y, width: x2 - x1, height: ROW - 6, rx: 4 }));
      g.appendChild(svgEl('text', { x: x1 + 4, y: y + ROW - 10, class: 'lbl', text: label }));
      svg.appendChild(g);
    };
    items.forEach((iv, i) => {
      let cls = 'node' + markClass(v.marks, i) + ((v.highlight || []).includes(i) ? ' hl' : '');
      bar(iv, i, cls, (v.labels && v.labels[i]) || `[${iv[0]}, ${iv[1]}]`);
    });
    extra.forEach(([name, iv], j) => bar(iv, items.length + j, 'node m-target', name + ' ' + `[${iv[0]}, ${iv[1]}]`));
    return named(v, el('div', { class: 'table-wrap' }, [svg]));
  };

  R.bars = function (v) {
    const base = (typeof v.base === 'number' && isFinite(v.base)) ? v.base : 0;
    const raw = (v.values || []).map(x => (typeof x === 'number' && isFinite(x)) ? x : base);
    const vals = raw.map(x => x - base);           // geometry is in units above the axis start
    const n = vals.length;
    if (!n) return named(v, el('div', { class: 'empty', text: '(no bars)' }));
    const water = (v.water || []).map(w => (typeof w === 'number' && w > 0) ? w : 0);
    const fills = (v.fill || []).map(f => Object.assign({}, f, { level: (+f.level || 0) - base }));
    const levels = (v.levels || []).map(l => Object.assign({}, l, { y: (+l.y || 0) - base }));
    const hasLabels = v.labels && Object.keys(v.labels).length > 0;
    const ptrs = {};
    Object.entries(v.pointers || {}).forEach(([lbl, idx]) => { if (typeof idx === 'number' && idx >= 0 && idx < n) (ptrs[idx] = ptrs[idx] || []).push(lbl); });
    const hasPtrs = Object.keys(ptrs).length > 0;
    // scale
    let maxV = 1, minV = 0;
    vals.forEach((x, i) => { maxV = Math.max(maxV, x + (water[i] || 0)); minV = Math.min(minV, x); });
    fills.forEach(f => { maxV = Math.max(maxV, f.level); });
    levels.forEach(l => { maxV = Math.max(maxV, l.y); });
    const SW = Math.max(18, Math.min(42, Math.floor(620 / n))), BW = Math.round(SW * 0.62), GAP = (SW - BW) / 2;
    const PADL = 8, PADR = 8 + (levels.some(l => l.label) ? Math.min(140, Math.max(...levels.map(l => (l.label || '').length)) * 6.5 + 10) : 0);
    const PADT = 20 + (hasLabels ? 14 : 0), CH = Math.min(170, Math.max(56, Math.round((maxV - minV) * 26))), IDX = 15, PTR = hasPtrs ? 24 : 0, PADB = 6 + (base ? 12 : 0);
    const NEG = minV < 0 ? 14 : 0;                 // room under the lowest negative bar for its value label
    const widestTag = Math.max(0, ...fills.map(f => f.label ? f.label.length * 6.8 + 10 : 0));
    const width = Math.max(PADL + n * SW + PADR, widestTag + 2 * PADL, base ? 300 : 0), height = PADT + CH + NEG + IDX + PTR + PADB;
    const scale = CH / (maxV - minV);
    const y = val => PADT + (maxV - val) * scale;
    const y0 = y(0), bottom = PADT + CH + NEG;
    const slotX = i => PADL + i * SW, barX = i => slotX(i) + GAP, cx = i => slotX(i) + SW / 2;
    const svg = svgEl('svg', { class: 'ds bars', viewBox: `0 0 ${width} ${height}`, width, height });
    // window shading
    if (v.window && v.window.length === 2) {
      const lo = Math.max(0, v.window[0]), hi = Math.min(n - 1, v.window[1]);
      if (hi >= lo) svg.appendChild(svgEl('rect', { x: slotX(lo), y: PADT - 4, width: (hi - lo + 1) * SW, height: CH + NEG + 4, class: 'win', rx: 4 }));
    }
    // fills (water between two lines, or a rectangle covering bars); labels are drawn last, on top of the bars
    const fillLabels = [];
    fills.forEach(f => {
      const lo = Math.max(0, Math.min(f.lo, f.hi)), hi = Math.min(n - 1, Math.max(f.lo, f.hi)), lvl = +f.level || 0;
      if (hi < lo || lvl <= 0) return;
      const between = (f.kind || 'between') === 'between';
      const x1 = between ? cx(lo) : slotX(lo) + 1, x2 = between ? cx(hi) : slotX(hi) + SW - 1;
      const g = svgEl('g', { class: between ? 'fill-water' : 'fill-rect' });
      g.appendChild(svgEl('rect', { x: x1, y: y(lvl), width: Math.max(x2 - x1, 2), height: y0 - y(lvl) }));
      svg.appendChild(g);
      if (f.label) {
        const fits = (x2 - x1) >= f.label.length * 7 + 8 && (y0 - y(lvl)) >= 16;
        fillLabels.push({ x: (x1 + x2) / 2, y: fits ? (y(lvl) + y0) / 2 + 4 : y(lvl) - 6, text: f.label });
      }
    });
    // baseline
    svg.appendChild(svgEl('line', { x1: PADL, y1: y0, x2: PADL + n * SW, y2: y0, class: 'axis' }));
    if (base) svg.appendChild(svgEl('text', { x: PADL, y: height - 3, class: 'lbl', text: `axis starts at ${base}, so bar heights show value − ${base}` }));
    // bars
    vals.forEach((val, i) => {
      let cls = 'bar' + markClass(v.marks, i) + ((v.highlight || []).includes(i) ? ' hl' : '');
      const g = svgEl('g', { class: cls });
      const top = val >= 0 ? y(val) : y0, h = Math.abs(y0 - y(val));
      g.appendChild(svgEl('rect', { x: barX(i), y: h < 2 ? y0 - 2 : top, width: BW, height: Math.max(h, 2), rx: 2, class: h < 2 ? 'zero' : '' }));
      // water sitting on the bar
      if (water[i] > 0) {
        const wy = y(val + water[i]), wh = y(val) - wy;
        const w = svgEl('g', { class: 'water' });
        w.appendChild(svgEl('rect', { x: barX(i), y: wy, width: BW, height: wh }));
        if (wh >= 14 && BW >= 22) w.appendChild(svgEl('text', { x: cx(i), y: wy + wh / 2 + 4, 'text-anchor': 'middle', class: 'water-lbl', text: water[i] }));
        g.appendChild(w);
      }
      const txt = fmt(v.values[i]);
      const valY = (water[i] > 0 ? y(val + water[i]) : (val >= 0 ? top : y0)) - 4;
      g.appendChild(svgEl('text', { x: cx(i), y: val >= 0 ? valY : y(val) + 12, 'text-anchor': 'middle', class: 'val', text: txt, style: txt.length > 3 ? 'font-size:10px' : '' }));
      if (hasLabels && v.labels[i] !== undefined) g.appendChild(svgEl('text', { x: cx(i), y: valY - 12, 'text-anchor': 'middle', class: 'lbl', text: fmt(v.labels[i]) }));
      svg.appendChild(g);
      svg.appendChild(svgEl('text', { x: cx(i), y: bottom + 12, 'text-anchor': 'middle', class: 'idx', text: i + (v.index_from || 0) }));
      if (ptrs[i]) {
        svg.appendChild(svgEl('text', { x: cx(i), y: bottom + IDX + 9, 'text-anchor': 'middle', class: 'ptr', style: 'font-size:8px', text: '▲' }));
        svg.appendChild(svgEl('text', { x: cx(i), y: bottom + IDX + 20, 'text-anchor': 'middle', class: 'ptr', text: ptrs[i].join(',') }));
      }
    });
    // reference levels
    levels.forEach(l => {
      const ly = y(+l.y || 0);
      svg.appendChild(svgEl('line', { x1: PADL, y1: ly, x2: PADL + n * SW, y2: ly, class: 'level' }));
      if (l.label) svg.appendChild(svgEl('text', { x: PADL + n * SW + 4, y: ly + 4, class: 'level-lbl', text: l.label }));
    });
    // fill labels on top of everything, with a backing pill so bars do not hide them
    fillLabels.forEach(l => {
      const w = l.text.length * 6.8 + 10, x = Math.min(Math.max(l.x, w / 2 + 2), width - w / 2 - 2);
      const g = svgEl('g', { class: 'fill-tag' });
      g.appendChild(svgEl('rect', { x: x - w / 2, y: l.y - 11, width: w, height: 15, rx: 4 }));
      g.appendChild(svgEl('text', { x, y: l.y, 'text-anchor': 'middle', class: 'fill-lbl', text: l.text }));
      svg.appendChild(g);
    });
    return named(v, el('div', { class: 'table-wrap' }, [svg]));
  };

  R.bits = function (v) {
    const wrap = el('div', { class: 'cells-wrap' });
    const box = el('div', { class: 'bits-view' });
    const bitsStr = v.bits, w = bitsStr.length;
    for (let i = 0; i < w; i++) {
      const pos = w - 1 - i; // bit index from the right
      let cls = 'cell' + (bitsStr[i] === '1' ? ' one' : '') + markClass(v.marks, pos) + ((v.highlight || []).includes(pos) ? ' hl' : '');
      box.appendChild(el('div', { class: cls }, [el('span', { class: 'idx', text: pos }), document.createTextNode(bitsStr[i])]));
    }
    wrap.appendChild(box);
    wrap.appendChild(el('div', { class: 'bits-val', text: '= ' + v.value + ' (decimal)' }));
    return named(v, wrap);
  };

  R.callstack = function (v) {
    const box = el('div', { class: 'callstack' });
    if (!v.frames.length) box.appendChild(el('div', { class: 'empty', text: '(no active calls)' }));
    v.frames.forEach((f, i) => box.appendChild(el('div', { class: 'frame' + ((v.highlight || []).includes(i) ? ' hl' : ''), text: f })));
    return named(v, box);
  };

  // Architecture view: boxes (components) and arrows. Layout: explicit grid pos, else layered by edges.
  const SYS_ICON = { client: '👤', lb: '⚖️', gateway: '🚪', server: '🖥', service: '⚙️', db: '🗄', cache: '⚡', queue: '📬',
    cdn: '🌐', storage: '🪣', worker: '🔧', dns: '📒', search: '🔎', external: '☁️', box: '' };
  R.system = function (v) {
    const nodes = v.nodes || [], edges = v.edges || [];
    if (!nodes.length) return named(v, el('div', { class: 'empty', text: '(no components)' }));
    const ids = nodes.map(n => n.id);
    let pos = {};
    if (v.pos) nodes.forEach(n => { const p = v.pos[n.id] || [0, 0]; pos[n.id] = { c: p[0], r: p[1] }; });
    else {
      // longest-path layering from sources, left to right; rows = order within a layer
      const indeg = {}, out = {};
      ids.forEach(i => { indeg[i] = 0; out[i] = []; });
      edges.forEach(e => { if (out[e[0]] && indeg[e[1]] !== undefined) { out[e[0]].push(e[1]); indeg[e[1]]++; } });
      const layer = {}; ids.forEach(i => layer[i] = 0);
      const q = ids.filter(i => indeg[i] === 0), seen = new Set(q);
      let guard = 0;
      while (q.length && guard++ < 5000) {
        const u = q.shift();
        out[u].forEach(w => { layer[w] = Math.max(layer[w], layer[u] + 1); if (!seen.has(w)) { seen.add(w); q.push(w); } });
      }
      const rows = {};
      ids.forEach(i => { const L = layer[i]; rows[L] = (rows[L] || 0); pos[i] = { c: L, r: rows[L] }; rows[L]++; });
      // centre shorter columns vertically
      const maxRows = Math.max(...Object.values(rows));
      ids.forEach(i => { const L = layer[i]; pos[i].r += (maxRows - rows[L]) / 2; });
    }
    const cols = Math.max(...Object.values(pos).map(p => p.c)) + 1, rowsN = Math.max(...Object.values(pos).map(p => p.r)) + 1;
    const BW = 128, BH = 54, GX = 70, GY = 34, PAD = 16;
    const hasCounters = v.counters && Object.keys(v.counters).length > 0;
    const PADR = PAD + (hasCounters ? 36 : 0), PADT = PAD + (hasCounters ? 10 : 0);
    const W = PAD + PADR + cols * BW + (cols - 1) * GX, H = PADT + PAD + rowsN * BH + (rowsN - 1) * GY + 14;
    const cx = id => PAD + pos[id].c * (BW + GX) + BW / 2, cy = id => PADT + pos[id].r * (BH + GY) + BH / 2;
    const svg = svgEl('svg', { class: 'ds sys', viewBox: `0 0 ${W} ${H}`, width: Math.min(W, 920), height: Math.min(W, 920) * H / W });
    const defs = svgEl('defs');
    defs.innerHTML = '<marker id="s-arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="9" markerHeight="9" markerUnits="userSpaceOnUse" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="var(--muted)"/></marker><marker id="s-arrow-hl" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="10" markerHeight="10" markerUnits="userSpaceOnUse" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="var(--active)"/></marker>';
    svg.appendChild(defs);
    const act = (v.active_edges || []).map(e => e[0] + '|' + e[1]);
    // edge endpoints on box borders
    function anchor(id, tx, ty) {
      const x = cx(id), y = cy(id), dx = tx - x, dy = ty - y;
      if (Math.abs(dx) * BH >= Math.abs(dy) * BW) return { x: x + Math.sign(dx) * BW / 2, y: y + (dx ? dy * (BW / 2) / Math.abs(dx) : 0) };
      return { x: x + (dy ? dx * (BH / 2) / Math.abs(dy) : 0), y: y + Math.sign(dy) * BH / 2 };
    }
    edges.forEach(e => {
      if (!pos[e[0]] || !pos[e[1]]) return;
      const a = anchor(e[0], cx(e[1]), cy(e[1])), b = anchor(e[1], cx(e[0]), cy(e[0]));
      const hl = act.includes(e[0] + '|' + e[1]);
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
      const x2 = b.x - dx / d * 2, y2 = b.y - dy / d * 2;
      // curve a little when the edge is a back edge (right to left) so the pair doesn't overlap
      const back = pos[e[1]].c < pos[e[0]].c, same = pos[e[1]].c === pos[e[0]].c;
      let path;
      if (back || same) { const k = back ? 28 : 18; path = `M${a.x},${a.y} Q${(a.x + x2) / 2},${(a.y + y2) / 2 + k} ${x2},${y2}`; }
      else path = `M${a.x},${a.y} L${x2},${y2}`;
      const p = svgEl('path', { d: path, class: 'edge' + (hl ? ' hl' : ''), fill: 'none', 'marker-end': hl ? 'url(#s-arrow-hl)' : 'url(#s-arrow)' });
      svg.appendChild(p);
      if (e[2]) {
        const mx = (a.x + x2) / 2, my = (a.y + y2) / 2 + ((back || same) ? 12 : -5);
        const t = svgEl('text', { x: mx, y: my, 'text-anchor': 'middle', class: 'w' + (hl ? ' hl' : ''), text: e[2] });
        svg.appendChild(t);
      }
    });
    nodes.forEach(n => {
      const id = n.id, x = cx(id), y = cy(id);
      const cls = 'node sysnode kind-' + (n.kind || 'box') + markClass(v.marks, id) + ((v.highlight || []).includes(id) ? ' hl' : '');
      const g = svgEl('g', { class: cls });
      g.appendChild(svgEl('rect', { x: x - BW / 2, y: y - BH / 2, width: BW, height: BH, rx: 10 }));
      const icon = SYS_ICON[n.kind] || '';
      const label = String(n.label);
      g.appendChild(svgEl('text', { x: x, y: y + (n.sub ? -2 : 4), 'text-anchor': 'middle', class: 'sys-label', text: (icon ? icon + ' ' : '') + label, style: label.length > 14 ? 'font-size:11px' : '' }));
      if (n.sub) g.appendChild(svgEl('text', { x: x, y: y + 14, 'text-anchor': 'middle', class: 'sys-sub', text: String(n.sub) }));
      if (v.counters && v.counters[id] !== undefined) {
        const bx = x + BW / 2 - 4, by = y - BH / 2 - 4, txt = fmt(v.counters[id]);
        const w = Math.max(20, 8 + 7 * txt.length);
        g.appendChild(svgEl('rect', { x: bx - w / 2, y: by - 9, width: w, height: 18, rx: 9, class: 'sys-counter' }));
        g.appendChild(svgEl('text', { x: bx, y: by + 4, 'text-anchor': 'middle', class: 'sys-counter-t', text: txt }));
      }
      if (v.labels && v.labels[id] !== undefined) g.appendChild(svgEl('text', { x: x, y: y + BH / 2 + 13, 'text-anchor': 'middle', class: 'lbl', text: fmt(v.labels[id]) }));
      svg.appendChild(g);
    });
    return named(v, el('div', { class: 'table-wrap' }, [svg]));
  };

  // Swimlanes over time: events (boxes) per lane, arrows between lanes, a time cursor.
  R.lanes = function (v) {
    const lanesN = v.lanes || [], evs = v.events || [], ars = v.arrows || [];
    if (!lanesN.length) return named(v, el('div', { class: 'empty', text: '(no lanes)' }));
    const end = Math.max(1, v.end || 1);
    const LABEL = Math.min(150, 20 + 7.2 * Math.max(...lanesN.map(s => s.length)));
    const longest = Math.max(4, ...evs.map(e => Math.ceil(String(e.text).length / Math.max(1, e.dur || 1))));
    const UNIT = Math.max(Math.min(34 + 2.2 * longest, 70), Math.min(110, 760 / end)), ROW = 46, TOP = 22, PADR = v.unit ? 14 + 7 * String(v.unit).length + 10 : 14;
    const W = LABEL + end * UNIT + PADR, H = TOP + lanesN.length * ROW + 26;
    const sx = t => LABEL + t * UNIT, sy = l => TOP + l * ROW + ROW / 2;
    const svg = svgEl('svg', { class: 'ds lanes', viewBox: `0 0 ${W} ${H}`, width: Math.min(W, 920), height: Math.min(W, 920) * H / W });
    const defs = svgEl('defs');
    defs.innerHTML = '<marker id="l-arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="8" markerHeight="8" markerUnits="userSpaceOnUse" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="var(--accent)"/></marker><marker id="l-arrow-bad" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="8" markerHeight="8" markerUnits="userSpaceOnUse" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="var(--bad)"/></marker>';
    svg.appendChild(defs);
    // lane bands + names
    lanesN.forEach((nm, i) => {
      svg.appendChild(svgEl('rect', { x: LABEL, y: TOP + i * ROW, width: end * UNIT, height: ROW, class: 'lane-band' + (i % 2 ? ' alt' : '') }));
      svg.appendChild(svgEl('text', { x: LABEL - 8, y: sy(i) + 4, 'text-anchor': 'end', class: 'lane-name', text: nm }));
    });
    // time ticks
    for (let t = 0; t <= end; t++) {
      svg.appendChild(svgEl('line', { x1: sx(t), y1: TOP, x2: sx(t), y2: TOP + lanesN.length * ROW, class: 'tick' }));
      if (end <= 24 || t % Math.ceil(end / 24) === 0) svg.appendChild(svgEl('text', { x: sx(t), y: H - 8, 'text-anchor': 'middle', class: 'idx', text: t }));
    }
    if (v.unit) svg.appendChild(svgEl('text', { x: sx(end) + 12, y: H - 8, 'text-anchor': 'start', class: 'idx', text: v.unit }));
    const now = v.now;
    evs.forEach((e, i) => {
      const x = sx(e.t), w = Math.max(UNIT * (e.dur || 1) - 4, 6), y = sy(e.lane) - 15;
      const future = now !== null && now !== undefined && e.t > now;
      const cls = 'lane-ev' + (e.kind ? ' m-' + e.kind : '') + ((v.highlight || []).includes(i) ? ' hl' : '') + (future ? ' future' : '');
      const g = svgEl('g', { class: cls });
      g.appendChild(svgEl('rect', { x: x + 2, y, width: w, height: 30, rx: 6 }));
      const txt = String(e.text), small = txt.length > 10, cw = small ? 6.0 : 6.6, maxc = Math.max(3, Math.floor(w / cw));
      if (txt.length > maxc && txt.length <= 2 * maxc && /\s/.test(txt)) {
        // two lines: split at the space nearest the middle
        const mid = txt.length / 2; let cut = -1, best = 1e9;
        txt.replace(/\s/g, (m, i) => { if (Math.abs(i - mid) < best) { best = Math.abs(i - mid); cut = i; } return m; });
        const l1 = txt.slice(0, cut), l2 = txt.slice(cut + 1);
        const fit = t => t.length > maxc ? t.slice(0, maxc - 1) + '…' : t;
        g.appendChild(svgEl('text', { x: x + 2 + w / 2, y: y + 13, 'text-anchor': 'middle', text: fit(l1), style: 'font-size:9.5px' }));
        g.appendChild(svgEl('text', { x: x + 2 + w / 2, y: y + 24, 'text-anchor': 'middle', text: fit(l2), style: 'font-size:9.5px' }));
      } else {
        g.appendChild(svgEl('text', { x: x + 2 + w / 2, y: y + 19, 'text-anchor': 'middle', text: txt.length > maxc ? txt.slice(0, maxc - 1) + '…' : txt, style: small ? 'font-size:10.5px' : '' }));
      }
      if (txt.length > maxc) g.appendChild(svgEl('title', { text: txt }));
      svg.appendChild(g);
    });
    ars.forEach(a => {
      const x1 = sx(a.frm[1]) + UNIT / 2, y1 = sy(a.frm[0]), x2 = sx(a.to[1]) + UNIT / 2, y2 = sy(a.to[0]);
      const dy = y2 - y1, dir = Math.sign(dy) || 1;
      const ya = y1 + dir * 16, yb = y2 - dir * 16;
      const future = now !== null && now !== undefined && Math.min(a.frm[1], a.to[1]) > now;
      const bad = a.kind === 'bad';
      svg.appendChild(svgEl('line', { x1, y1: ya, x2, y2: yb, class: 'lane-arrow' + (bad ? ' bad' : '') + (future ? ' future' : ''), 'marker-end': bad ? 'url(#l-arrow-bad)' : 'url(#l-arrow)' }));
      if (a.text) svg.appendChild(svgEl('text', { x: (x1 + x2) / 2 + 5, y: (ya + yb) / 2 + 4, class: 'w' + (future ? ' future' : ''), text: a.text }));
    });
    if (now !== null && now !== undefined) {
      const x = sx(now) + UNIT / 2;
      svg.appendChild(svgEl('line', { x1: x, y1: TOP - 6, x2: x, y2: TOP + lanesN.length * ROW + 4, class: 'lane-now' }));
      svg.appendChild(svgEl('text', { x, y: TOP - 9, 'text-anchor': 'middle', class: 'lane-now-t', text: 'now' }));
    }
    return named(v, el('div', { class: 'table-wrap' }, [svg]));
  };

  function renderView(v) {
    const fn = R[v.type];
    if (!fn) return el('div', { class: 'view', text: '[unknown view ' + v.type + ']' });
    try { return fn(v); } catch (e) { return el('div', { class: 'view empty', text: 'render error: ' + e.message }); }
  }

  // ---------------- player ----------------
  class Player {
    constructor(container, trace, opts) {
      this.c = container; this.opts = opts || {};
      this.i = 0; this.timer = null; this.speed = 1;
      this.c.innerHTML = '';
      this.c.tabIndex = 0;
      this.ctr = el('div', { class: 'viz-controls' });
      const ico = d => `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">${d}</svg>`;
      this.bFirst = el('button', { class: 'btn', type: 'button', title: 'First (Home)', html: ico('<path d="M6 5h2v14H6z"/><path d="M19 5 9 12l10 7z"/>') });
      this.bPrev = el('button', { class: 'btn', type: 'button', title: 'Previous (←)', html: ico('<path d="M17 5 7 12l10 7z"/>') });
      this.bPlay = el('button', { class: 'btn primary', type: 'button', title: 'Play / pause (space)', text: '▶ Play' });
      this.bNext = el('button', { class: 'btn', type: 'button', title: 'Next (→)', html: ico('<path d="M7 5l10 7-10 7z"/>') });
      this.bLast = el('button', { class: 'btn', type: 'button', title: 'Last (End)', html: ico('<path d="M16 5h2v14h-2z"/><path d="M5 5l10 7-10 7z"/>') });
      this.range = el('input', { type: 'range', min: 0, value: 0 });
      this.speedSel = el('select', { title: 'Speed' });
      [[0.5, '0.5×'], [1, '1×'], [2, '2×'], [4, '4×']].forEach(([v, l]) => this.speedSel.appendChild(el('option', { value: v, text: l, selected: v === 1 ? '' : null })));
      this.counter = el('span', { class: 'viz-step' });
      [this.bFirst, this.bPrev, this.bPlay, this.bNext, this.bLast, this.range, this.speedSel, this.counter].forEach(x => this.ctr.appendChild(x));
      this.msg = el('div', { class: 'viz-msg' });
      this.views = el('div', { class: 'viz-views' });
      this.trunc = el('div', { class: 'viz-truncated' });
      this.c.append(this.ctr, this.msg, this.views, this.trunc,
        el('div', { class: 'viz-keys', text: 'Keys: ← → step · space play · Home/End' }));
      this.bFirst.onclick = () => this.go(0);
      this.bPrev.onclick = () => this.go(this.i - 1);
      this.bNext.onclick = () => this.go(this.i + 1);
      this.bLast.onclick = () => this.go(this.steps.length - 1);
      this.bPlay.onclick = () => this.toggle();
      this.range.oninput = () => this.go(+this.range.value);
      this.speedSel.onchange = () => { this.speed = +this.speedSel.value; if (this.timer) { this.stop(); this.play(); } };
      // touch: swipe left/right on the picture steps forward/back (ignored when the finger is on a
      // view that scrolls sideways, so wide arrays can still be panned)
      let tx = null, ty = null, tScroll = false;
      this.views.addEventListener('touchstart', e => {
        const t = e.touches[0]; tx = t.clientX; ty = t.clientY;
        const sc = e.target.closest('.view');
        tScroll = !!(sc && sc.scrollWidth > sc.clientWidth + 2);
      }, { passive: true });
      this.views.addEventListener('touchend', e => {
        if (tx === null || tScroll) { tx = null; return; }
        const t = e.changedTouches[0], dx = t.clientX - tx, dy = t.clientY - ty; tx = null;
        if (Math.abs(dx) > 48 && Math.abs(dx) > 2 * Math.abs(dy)) { this.stop(); this.go(this.i + (dx < 0 ? 1 : -1)); }
      }, { passive: true });
      this.c.addEventListener('keydown', e => {
        if (e.target.tagName === 'SELECT' || e.target.tagName === 'INPUT') return;
        if (e.key === 'ArrowRight') { this.go(this.i + 1); e.preventDefault(); }
        else if (e.key === 'ArrowLeft') { this.go(this.i - 1); e.preventDefault(); }
        else if (e.key === ' ') { this.toggle(); e.preventDefault(); }
        else if (e.key === 'Home') { this.go(0); e.preventDefault(); }
        else if (e.key === 'End') { this.go(this.steps.length - 1); e.preventDefault(); }
      });
      this.load(trace);
    }
    load(trace) {
      this.stop();
      this.steps = (trace && trace.steps) || [];
      this.range.max = Math.max(0, this.steps.length - 1);
      this.trunc.textContent = trace && trace.truncated ? 'Trace was cut short to keep the page small — try a smaller input.' : '';
      this.go(0);
    }
    go(i) {
      if (!this.steps.length) { this.msg.textContent = 'No steps.'; this.views.innerHTML = ''; return; }
      this.i = Math.max(0, Math.min(this.steps.length - 1, i));
      const s = this.steps[this.i];
      this.msg.innerHTML = mdInline(s.msg || '');
      this.views.innerHTML = '';
      (s.views || []).forEach(v => this.views.appendChild(renderView(v)));
      this.range.value = this.i;
      this.counter.textContent = `${this.i + 1} / ${this.steps.length}`;
      this.bPrev.disabled = this.bFirst.disabled = this.i === 0;
      this.bNext.disabled = this.bLast.disabled = this.i === this.steps.length - 1;
      if (this.i === this.steps.length - 1) this.stop();
      if (this.opts.onStep) this.opts.onStep(s, this.i);
    }
    play() {
      if (this.i >= this.steps.length - 1) this.i = -1;
      this.bPlay.textContent = '❚❚ Pause';
      const tick = () => { this.go(this.i + 1); if (this.i < this.steps.length - 1) this.timer = setTimeout(tick, 1100 / this.speed); else this.stop(); };
      this.timer = setTimeout(tick, 150);
    }
    stop() { if (this.timer) clearTimeout(this.timer); this.timer = null; if (this.bPlay) this.bPlay.textContent = '▶ Play'; }
    toggle() { this.timer ? this.stop() : this.play(); }
  }

  window.DSAViz = { Player, renderView, el };
})();
