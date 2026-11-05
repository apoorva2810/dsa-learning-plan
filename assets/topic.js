/* Topic page: play the concept demo trace. */
(function () {
  'use strict';
  const node = document.getElementById('topic-data');
  if (!node) return;
  const data = JSON.parse(node.textContent);
  document.querySelectorAll('.viz[data-demo]').forEach(viz => {
    const t = data.demo_traces[+viz.dataset.demo];
    if (t) new window.DSAViz.Player(viz.querySelector('.viz-player'), t);
  });
})();
