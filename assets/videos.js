/* Video lessons index: watched marks, hide-watched filter, counts. */
(function () {
  'use strict';
  const store = window.DSA.store;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const watched = store.get('dsa.lessons', {});
  const items = $$('.vid[data-lesson]');
  let done = 0;
  items.forEach(li => { const w = watched[li.dataset.lesson]; if (w && w.done) { li.classList.add('done'); done++; } else if (w && w.pos > 10000) li.classList.add('partial'); });
  const count = $('#vid-count');
  if (count) count.textContent = `${done} of ${items.length} watched`;
  const hide = $('#vid-hide-done');
  const apply = () => {
    document.body.classList.toggle('hide-done', hide.checked);
    $$('.videos-group, .videos-chapter').forEach(g => { g.hidden = hide.checked && !$$('.vid:not(.done)', g).length; });
  };
  if (hide) { hide.checked = !!store.get('dsa.videos.hideDone', false); hide.onchange = () => { store.set('dsa.videos.hideDone', hide.checked); apply(); }; apply(); }
})();
