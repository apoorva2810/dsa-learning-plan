/* Progress page: summary, review list, export / import / reset. */
(function () {
  'use strict';
  const { Progress, store, esc, REL } = window.DSA;
  const $ = s => document.querySelector(s);
  const index = window.DSA_INDEX || [];
  function render() {
    const all = Progress.all();
    const byTopic = {};
    index.forEach(p => {
      const t = byTopic[p.topicTitle] || (byTopic[p.topicTitle] = { total: 0, solved: 0, attempted: 0, review: 0 });
      t.total++; const st = (all[p.slug] || {}).status; if (st) t[st]++;
    });
    const rows = Object.entries(byTopic).map(([name, t]) =>
      `<tr><td>${esc(name)}</td><td>${t.solved}/${t.total}</td><td>${t.attempted}</td><td>${t.review}</td>
       <td style="min-width:120px"><div class="bar"><i style="width:${100 * t.solved / t.total}%"></i></div></td></tr>`).join('');
    const solved = Object.values(all).filter(x => x.status === 'solved').length;
    $('#progress-summary').innerHTML = `<p><b>${solved}</b> of ${index.length} solved.</p>
      <div class="table-wrap"><table><thead><tr><th>Topic</th><th>Solved</th><th>Attempted</th><th>Review</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`;
    const li = p => `<li class="prow" data-slug="${p.slug}"><span class="status-dot" data-slug="${p.slug}"></span><a href="${REL}${p.url}">${esc(p.title)}</a><span class="badge ${p.difficulty.toLowerCase()}">${p.difficulty}</span></li>`;
    const review = index.filter(p => (all[p.slug] || {}).status === 'review');
    $('#review-list').innerHTML = review.map(li).join('') || '<li class="muted">Nothing marked for review. Use the status dropdown on a problem page.</li>';
    const byslug = {}; index.forEach(p => { byslug[p.slug] = p; });
    const recent = (store.get('dsa.recent', []) || []).map(r => byslug[r.slug]).filter(Boolean).slice(0, 15);
    $('#recent-list').innerHTML = recent.map(li).join('') || '<li class="muted">No problems opened yet.</li>';
    window.DSA.refreshStatusWidgets();
  }
  $('#export-btn').addEventListener('click', () => {
    const blob = new Blob([Progress.export()], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = 'dsa-lab-progress-' + new Date().toISOString().slice(0, 10) + '.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });
  $('#import-file').addEventListener('change', e => {
    const f = e.target.files[0]; if (!f) return;
    f.text().then(txt => { try { Progress.import(txt); render(); } catch (err) { alert('Could not import: ' + err.message); } });
  });
  $('#reset-btn').addEventListener('click', () => { if (confirm('Clear all progress on this browser? Export first if you want a backup.')) { Progress.reset(); render(); } });
  document.addEventListener('dsa:progress', render);
  render();
})();
