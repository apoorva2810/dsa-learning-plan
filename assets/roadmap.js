/* Roadmap page: by-topic / ladder toggle and filters. */
(function () {
  'use strict';
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  $$('.view-toggle .tab').forEach(t => t.addEventListener('click', () => {
    $$('.view-toggle .tab').forEach(x => x.classList.toggle('active', x === t));
    $('#view-topics').hidden = t.dataset.view !== 'topics';
    $('#view-ladder').hidden = t.dataset.view !== 'ladder';
  }));
  function applyFilters() {
    const diffs = new Set($$('.f-diff:checked').map(c => c.value));
    const hideSolved = $('#f-hide-solved').checked;
    const all = window.DSA.Progress.all();
    const byslug = {}; (window.DSA_INDEX || []).forEach(p => { byslug[p.slug] = p; });
    $$('.prow[data-slug]').forEach(row => {
      const p = byslug[row.dataset.slug]; if (!p) return;
      const solved = (all[p.slug] || {}).status === 'solved';
      row.classList.toggle('hidden', !diffs.has(p.difficulty) || (hideSolved && solved));
    });
  }
  $$('.f-diff, #f-hide-solved').forEach(c => c.addEventListener('change', applyFilters));
  document.addEventListener('dsa:progress', applyFilters);
  applyFilters();
})();
