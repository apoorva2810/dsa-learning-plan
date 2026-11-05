/* Problem page: tabs, hints, scratchpad, visualisers, in-browser Python playground. */
(function () {
  'use strict';
  const data = JSON.parse(document.getElementById('problem-data').textContent);
  const { store, REL, esc } = window.DSA;
  const { Player, el, renderView } = window.DSAViz;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  // remember where the learner is
  store.set('dsa.last', { slug: data.slug, title: data.title });
  const recent = (store.get('dsa.recent', []) || []).filter(r => r.slug !== data.slug);
  recent.unshift({ slug: data.slug, title: data.title, ts: Date.now() });
  store.set('dsa.recent', recent.slice(0, 25));

  // ---------- tabs ----------
  const tabs = $$('.tabs .tab'), panels = $$('.panel');
  function activate(i, animate) {
    tabs.forEach((t, j) => t.classList.toggle('active', j === i));
    panels.forEach((p, j) => { p.hidden = j !== i; p.classList.toggle('animate', !!animate && j === i); });
    history.replaceState(null, '', '#approach-' + (i + 1));
  }
  tabs.forEach((t, i) => t.addEventListener('click', () => activate(i, true)));
  const m = location.hash.match(/approach-(\d+)/);
  activate(m ? Math.min(tabs.length - 1, Math.max(0, +m[1] - 1)) : 0);

  // ---------- hints ----------
  $$('.hint-box .reveal').forEach(btn => btn.addEventListener('click', () => {
    const box = btn.closest('.hint-box');
    $('.hint-text', box).hidden = false; btn.hidden = true;
  }));

  // ---------- scratchpad ----------
  const pad = $('.scratchpad');
  if (pad) {
    const key = 'dsa.scratch.' + data.slug;
    pad.value = store.get(key, '') || '';
    if (pad.value) pad.closest('details').open = true;
    pad.addEventListener('input', () => store.set(key, pad.value));
    tabKey(pad);
  }
  function tabKey(ta) {
    ta.addEventListener('keydown', e => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const s = ta.selectionStart, en = ta.selectionEnd;
        ta.value = ta.value.slice(0, s) + '    ' + ta.value.slice(en);
        ta.selectionStart = ta.selectionEnd = s + 4;
        ta.dispatchEvent(new Event('input'));
      }
    });
  }

  // ---------- visualisers ----------
  const players = {};
  $$('.viz[data-approach]').forEach(viz => {
    const ai = +viz.dataset.approach;
    const sel = $('.viz-input', viz);
    const traces = data.traces[ai] || [];
    const first = traces.findIndex(t => t);
    const player = new Player($('.viz-player', viz), traces[sel ? +sel.value : first]);
    players[ai] = player;
    if (sel) sel.addEventListener('change', () => player.load(traces[+sel.value]));
    if (data.pyodide && data.trace_inputs.length) addCustomInput(viz, ai, player);
  });

  // ---------- example figures (final state of the optimal trace on each example) ----------
  (data.figures || []).forEach(f => {
    const box = $(`.example-figure[data-figure="${f.example}"] .figure-views`);
    if (!box) return;
    (f.views || []).forEach(v => box.appendChild(renderView(v)));
  });
  $$('.watch-link').forEach(a => a.addEventListener('click', e => {
    e.preventDefault();
    const ai = +a.dataset.approach, ii = +a.dataset.input;
    activate(ai, true);
    const viz = $(`.viz[data-approach="${ai}"]`);
    if (!viz) return;
    const sel = $('.viz-input', viz);
    if (sel && Array.from(sel.options).some(o => +o.value === ii)) { sel.value = String(ii); sel.dispatchEvent(new Event('change')); }
    else if (players[ai]) players[ai].load((data.traces[ai] || [])[ii]);
    viz.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const pl = $('.viz-player', viz);
    if (pl) pl.focus({ preventScroll: true });
  }));

  // ---------- Pyodide ----------
  const IS_FILE = location.protocol === 'file:';
  const FILE_HINT = 'Running Python in the page needs the site served over http (browsers block the WebAssembly runtime on file:// pages). Serve the site folder with any static server, e.g. `python3 serve.py` or `npx serve site`, then reload. Everything else on this page works as is.';
  let pyodideP = null;
  function loadPy(onStatus) {
    if (pyodideP) return pyodideP;
    pyodideP = new Promise((resolve, reject) => {
      if (location.protocol === 'file:') {
        reject(new Error(FILE_HINT));
        return;
      }
      onStatus && onStatus('Loading Python runtime (first time ~10 MB, cached afterwards)…');
      const s = document.createElement('script');
      s.src = REL + 'assets/pyodide/pyodide.js';
      s.onload = async () => {
        try {
          const py = await window.loadPyodide({ indexURL: REL + 'assets/pyodide/' });
          const lib = await (await fetch(REL + 'assets/pyodide/_lib.py')).text();
          py.FS.writeFile('/home/pyodide/_lib.py', lib);
          py.runPython('import sys; sys.path.insert(0, "/home/pyodide"); import _lib');
          resolve(py);
        } catch (e) { pyodideP = null; reject(e); }
      };
      s.onerror = () => { pyodideP = null; reject(new Error('Could not load assets/pyodide/pyodide.js')); };
      document.head.appendChild(s);
    });
    return pyodideP;
  }
  async function pyCall(script, cfg, onStatus) {
    const py = await loadPy(onStatus);
    py.globals.set('__cfg_json', JSON.stringify(cfg));
    return JSON.parse(py.runPython('import json\ncfg = json.loads(__cfg_json)\n' + script));
  }

  const RUN_TESTS = `
import _lib
_r = _lib.run_tests(cfg['code'], cfg['tests'], fn=cfg.get('fn'), cls=cfg.get('cls'))
json.dumps(_r, default=str)
`;
  const RUN_TRACE = `
import _lib, ast, traceback
_ns = {'__name__': '__problem__'}
try:
    exec(cfg['module_source'], _ns)
    _tr = _ns['APPROACHES'][cfg['ai']]['trace']
    _kw = {}
    for _k, _v in cfg['inputs'].items():
        try:
            _kw[_k] = ast.literal_eval(_v)
        except Exception:
            _kw[_k] = json.loads(_v)
    _out = {'ok': True, 'trace': _lib.trace_to_json(_tr(**_kw))}
except Exception:
    _out = {'ok': False, 'error': traceback.format_exc(limit=3)}
json.dumps(_out, default=str)
`;

  function addCustomInput(viz, ai, player) {
    const slot = $('.viz-custom-slot', viz);
    const btn = el('button', { class: 'btn small', type: 'button', text: 'Try your own input' });
    slot.appendChild(btn);
    let form = null;
    btn.addEventListener('click', () => {
      if (form) { form.hidden = !form.hidden; return; }
      form = el('div', { class: 'custom-form' });
      const fields = {};
      Object.entries(data.trace_inputs[0]).forEach(([k, v]) => {
        const inp = el('input', { type: 'text', value: JSON.stringify(v), spellcheck: 'false', style: 'min-width:260px;font-family:var(--mono)' });
        fields[k] = inp;
        form.appendChild(el('label', { style: 'display:flex;gap:.5rem;align-items:center;margin:.3rem 0' }, [el('code', { text: k + ' =' }), inp]));
      });
      const run = el('button', { class: 'btn small primary', type: 'button', text: '▶ Trace this input' });
      const status = el('span', { class: 'muted small', style: 'margin-left:.6rem' });
      form.appendChild(el('div', null, [run, status]));
      viz.insertBefore(form, $('.viz-player', viz));
      run.addEventListener('click', async () => {
        run.disabled = true; status.textContent = 'Running…';
        try {
          const inputs = {}; Object.entries(fields).forEach(([k, inp]) => { inputs[k] = inp.value; });
          const out = await pyCall(RUN_TRACE, { module_source: data.module_source, ai, inputs }, s => { status.textContent = s; });
          if (out.ok) { player.load(out.trace); status.textContent = `${out.trace.steps.length} steps`; }
          else { status.textContent = 'Trace failed: ' + out.error.split('\n').filter(Boolean).pop(); }
        } catch (e) { status.textContent = e.message; }
        run.disabled = false;
      });
    });
  }

  // ---------- playground ----------
  const pg = $('#playground');
  if (pg) {
    const code = $('#pg-code'), sel = $('#pg-approach'), runBtn = $('#pg-run'), status = $('#pg-status'), results = $('#pg-results');
    const key = 'dsa.pg.' + data.slug;
    tabKey(code);
    const saved = store.get(key, null);
    code.value = saved !== null && saved !== '' ? saved : data.approaches[0].code;
    if (IS_FILE) { status.textContent = FILE_HINT; status.classList.add('small'); }
    code.addEventListener('input', () => store.set(key, code.value));
    sel.addEventListener('change', () => {
      if (sel.value === 'scratch') code.value = store.get('dsa.scratch.' + data.slug, '') || '# paste your class Solution here\n';
      else code.value = data.approaches[+sel.value].code;
      store.set(key, code.value);
      results.innerHTML = '';
    });
    code.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') runBtn.click(); });
    runBtn.addEventListener('click', async () => {
      runBtn.disabled = true; results.innerHTML = ''; status.textContent = 'Running…';
      // which entry point? use the approach's fn/cls; for scratch, fall back to approach 0
      const a = data.approaches[sel.value === 'scratch' ? 0 : +sel.value];
      try {
        const out = await pyCall(RUN_TESTS, { code: code.value, tests: data.tests, fn: a.fn, cls: a.cls }, s => { status.textContent = s; });
        status.textContent = '';
        renderResults(out, results);
      } catch (e) {
        status.textContent = '';
        results.innerHTML = `<div class="pg-error">${esc(e.message)}</div>`;
      }
      runBtn.disabled = false;
    });
  }
  function renderResults(out, box) {
    box.innerHTML = '';
    if (out.error) { box.appendChild(el('div', { class: 'pg-error', text: out.error })); return; }
    const ok = out.passed === out.total;
    box.appendChild(el('div', { class: 'pg-summary ' + (ok ? 'ok' : 'ko'), text: `${out.passed} / ${out.total} tests passed${ok ? ' 🎉' : ''}` }));
    out.results.forEach(r => {
      const detail = el('div');
      detail.appendChild(el('div', null, [el('b', { text: r.name })]));
      detail.appendChild(el('pre', { text: `input:    ${r.input}\nexpected: ${r.expected}\ngot:      ${r.actual}` }));
      box.appendChild(el('div', { class: 'tr ' + (r.ok ? 'ok' : 'ko') }, [el('span', { class: 'mark', text: r.ok ? '✓' : '✗' }), detail]));
    });
    if (ok) {
      const slug = data.slug;
      if (!window.DSA.Progress.get(slug)) {
        const hint = el('div', { class: 'muted small', text: 'All green. Mark it as solved?' });
        const b = el('button', { class: 'btn small', type: 'button', text: 'Mark solved' });
        b.onclick = () => { window.DSA.Progress.set(slug, 'solved'); hint.remove(); };
        hint.appendChild(b); box.appendChild(hint);
      }
    }
  }

  // keyboard: [ and ] to move between problems
  document.addEventListener('keydown', e => {
    if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
    if (e.key === ']') { const a = $('.nav-next'); if (a) location.href = a.href; }
    if (e.key === '[') { const a = $('.nav-prev'); if (a) location.href = a.href; }
  });
})();
