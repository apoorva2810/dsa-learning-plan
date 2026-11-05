/* DSA Lab video lessons: narrated scenes synchronised with the page's visualisers.
   A lesson = scenes (slide, trace, code, diagram, sim, figure, table, think, callout) + sentences with
   start times. The audio clock (or a timer when there is no audio) drives which sentence is current;
   each sentence may carry an action (`at`) applied when it starts. Pausing hands the embedded
   visualiser back to the learner; resuming re-syncs it. */
(function () {
  'use strict';
  const D = window.DSA, esc = D.esc, store = D.store;
  const mdInline = s => D.mdInline(s);
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const REL = document.body.dataset.rel || '';
  const TOUCH = matchMedia('(pointer: coarse)').matches;
  const node = (tag, attrs, children) => {
    const e = document.createElement(tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') e.className = v; else if (k === 'html') e.innerHTML = v; else if (k === 'text') e.textContent = v;
      else if (v !== null && v !== undefined && v !== false) e.setAttribute(k, v === true ? '' : v);
    }
    (children || []).forEach(c => { if (c !== null && c !== undefined && c !== false) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  };
  const pd = $('#problem-data'), gd = $('#guide-data');
  const PD = pd ? JSON.parse(pd.textContent) : null;
  const GD = gd ? JSON.parse(gd.textContent) : null;
  const V = window.DSAViz || null;
  const G = window.DSAGuide || null;
  const fmt = ms => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  const KEY = 'dsa.lessons';
  const svg = d => `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const ICON = {
    sound: svg('<path d="M11 5 6 9H2v6h4l5 4z" fill="currentColor"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/>'),
    muted: svg('<path d="M11 5 6 9H2v6h4l5 4z" fill="currentColor"/><path d="m22 9-6 6"/><path d="m16 9 6 6"/>'),
    full: svg('<path d="M8 3H3v5"/><path d="M16 3h5v5"/><path d="M8 21H3v-5"/><path d="M16 21h5v-5"/>'),
    list: svg('<path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h16"/>'),
  };
  const Watched = {
    all() { return store.get(KEY, {}); },
    get(id) { return this.all()[id] || null; },
    set(id, patch) { const a = this.all(); a[id] = Object.assign(a[id] || {}, patch, { ts: Date.now() }); store.set(KEY, a); },
  };

  class LessonPlayer {
    constructor(root, data) {
      this.root = root; this.d = data; this.scenes = data.scenes || [];
      // A sentence in a trace/sim scene that is followed by a sentence several steps ahead stands in for all the
      // steps in between: walk them while it plays, so the picture moves with the voice instead of freezing.
      // (computed on the scene's sentences BEFORE they are copied into this.sents below)
      this.scenes.forEach(sc => {
        if (sc.type !== 'trace' && sc.type !== 'sim') return;
        const ss = sc.sentences || [];
        ss.forEach((s, k) => {
          if (!Number.isInteger(s.at) || s.hold) { s.walkTo = null; return; }
          const nxt = ss.slice(k + 1).find(x => Number.isInteger(x.at));
          const end = nxt ? nxt.at - 1 : s.at;         // last step this sentence owns
          s.walkTo = end > s.at ? end : null;
        });
      });
      this.sents = [];
      this.scenes.forEach((sc, si) => (sc.sentences || []).forEach((s, k) => this.sents.push(Object.assign({}, s, { si, k }))));
      this.duration = data.duration || (this.sents.length ? this.sents[this.sents.length - 1].t + this.sents[this.sents.length - 1].d + 600 : 1000);
      this.pos = 0; this.playing = false; this.cur = -1; this.curScene = -1; this.speed = 1; this.waitingAt = -1; this.resumedFrom = -1;
      this.captions = store.get('dsa.lessons.cc', true);
      this.audio = null; this.audioOk = false; this.lastClock = 0; this.raf = null; this.lastSave = 0; this.ended = false;
      this.build();
      if (data.audio) this.setupAudio(REL + data.audio);
      this.renderScene(0, true);
      this.updateBar();
      const w = Watched.get(this.d.id);
      if (w && w.done) this.root.classList.add('is-done');
      if (w && !w.done && w.pos > 10000 && w.pos < this.duration - 5000) {
        this.resumeBtn.hidden = false; this.resumeBtn.textContent = `▶ Resume from ${fmt(w.pos)}`;
      }
    }
    build() {
      const r = this.root; r.innerHTML = ''; r.tabIndex = 0; r.classList.add('ls-ready');
      this.stage = node('div', { class: 'ls-stage' });
      this.sceneBox = node('div', { class: 'ls-scene' });
      this.capBox = node('div', { class: 'ls-caption' + (this.captions ? '' : ' off') }, [node('div', { class: 'ls-cap-text' })]);
      this.waitBox = node('div', { class: 'ls-wait', hidden: true }, [
        node('div', { class: 'ls-wait-text', text: 'Take a moment to think about it.' }),
        node('button', { class: 'btn primary', type: 'button', text: 'Continue ▶' })]);
      $('button', this.waitBox).onclick = () => this.continueAfterPause();
      this.poster = node('div', { class: 'ls-poster' }, [
        node('div', { class: 'ls-poster-kicker', text: 'Video lesson' }),
        node('div', { class: 'ls-poster-title', text: this.d.title }),
        node('div', { class: 'ls-poster-meta', text: `${fmt(this.duration)} · ${this.scenes.length} scenes · ${this.d.audio ? 'narrated' : 'timed captions (no audio yet)'}` }),
        node('div', { class: 'ls-poster-btns' }, [
          node('button', { class: 'btn primary ls-big-play', type: 'button', text: '▶ Play' }),
          node('button', { class: 'btn ls-resume', type: 'button', hidden: true })]),
        node('div', { class: 'ls-poster-hint muted small', text: TOUCH ? 'Tap the picture to pause. While paused you can step through it yourself, then tap Resume.' : 'Space pauses. While paused you can click through the picture yourself; press space again to continue.' })]);
      this.resumeBtn = $('.ls-resume', this.poster);
      $('.ls-big-play', this.poster).onclick = () => { this.hidePoster(); this.play(); };
      this.resumeBtn.onclick = () => { const w = Watched.get(this.d.id); this.hidePoster(); this.seek(w ? w.pos : 0); this.play(); };
      this.endBox = node('div', { class: 'ls-end', hidden: true }, [
        node('div', { class: 'ls-end-title', text: 'That’s the lesson.' }),
        node('div', { class: 'ls-end-btns' }, [node('button', { class: 'btn primary', type: 'button', text: '↻ Watch again' }),
          node('button', { class: 'btn', type: 'button', text: 'Scenes' })])]);
      $$('button', this.endBox)[0].onclick = () => { this.endBox.hidden = true; this.seek(0); this.play(); };
      $$('button', this.endBox)[1].onclick = () => { this.endBox.hidden = true; this.chapters.hidden = false; this.chapters.scrollIntoView({ block: 'nearest' }); };
      this.stage.append(this.sceneBox, this.capBox, this.waitBox, this.endBox, this.poster);
      // control bar
      this.bPlay = node('button', { class: 'btn primary ls-play', type: 'button', title: 'Play / pause (space)', text: '▶' });
      this.bPrev = node('button', { class: 'btn ls-skip', type: 'button', title: 'Previous scene (K)', text: '◀◀' });
      this.bNext = node('button', { class: 'btn ls-skip', type: 'button', title: 'Next scene (J)', text: '▶▶' });
      this.time = node('span', { class: 'ls-time', text: `0:00 / ${fmt(this.duration)}` });
      this.range = node('input', { type: 'range', min: 0, max: Math.round(this.duration), value: 0, class: 'ls-range', title: 'Seek' });
      this.marks = node('div', { class: 'ls-marks' });
      this.scenes.forEach((sc, si) => {
        const t0 = sc.sentences && sc.sentences.length ? sc.sentences[0].t : 0;
        const m = node('span', { class: 'ls-mark', style: `left:${(100 * t0 / this.duration).toFixed(2)}%`, title: sc.title || sc.type });
        this.marks.appendChild(m);
      });
      this.speedSel = node('select', { class: 'ls-speed', title: 'Speed' });
      [[0.75, '0.75×'], [1, '1×'], [1.25, '1.25×'], [1.5, '1.5×'], [2, '2×']].forEach(([v, l]) => this.speedSel.appendChild(node('option', { value: v, text: l, selected: v === 1 ? '' : null })));
      this.bCC = node('button', { class: 'btn ls-cc' + (this.captions ? ' on' : ''), type: 'button', title: 'Captions (C)', text: 'CC' });
      this.bMute = node('button', { class: 'btn ls-mute', type: 'button', title: 'Mute (M)', html: ICON.sound });
      this.bFull = node('button', { class: 'btn ls-full', type: 'button', title: 'Full screen (F)', html: ICON.full });
      this.bList = node('button', { class: 'btn ls-list', type: 'button', title: 'Scenes', html: ICON.list });
      const seekWrap = node('div', { class: 'ls-seek' }, [this.range, this.marks]);
      this.bar = node('div', { class: 'ls-bar' }, [
        node('div', { class: 'ls-row primary' }, [this.bPlay, this.bPrev, this.bNext, seekWrap]),
        node('div', { class: 'ls-row secondary' }, [this.time, this.speedSel, this.bCC, this.bMute, this.bFull, this.bList])]);
      // floating Resume pill for touch screens (tap on the stage pauses; this resumes)
      this.pill = node('button', { class: 'btn primary ls-resume-pill', type: 'button', text: '▶ Resume' });
      this.pill.onclick = e => { e.stopPropagation(); this.play(); };
      this.stage.appendChild(this.pill);
      // tap on the stage while playing = pause (controls, links and buttons excluded)
      this.stage.addEventListener('click', e => {
        if (!this.playing) return;
        if (e.target.closest('button, a, select, input, .viz-controls, .ls-wait, .ls-end, .ls-poster')) return;
        this.pause();
      });
      // swipe left/right on the stage while playing = next/previous scene
      let sx = null, sy = null;
      this.stage.addEventListener('touchstart', e => { const t = e.touches[0]; sx = t.clientX; sy = t.clientY; }, { passive: true });
      this.stage.addEventListener('touchend', e => {
        if (sx === null) return;
        const t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy; sx = null;
        if (!this.playing || Math.abs(dx) < 60 || Math.abs(dx) < 2 * Math.abs(dy)) return;
        this.skipScene(dx < 0 ? 1 : -1);
      }, { passive: true });
      if (!this.d.audio) this.bMute.hidden = true;
      // scene list
      this.chapters = node('ol', { class: 'ls-chapters', hidden: true });
      this.scenes.forEach((sc, si) => {
        const t0 = sc.sentences && sc.sentences.length ? sc.sentences[0].t : 0;
        const li = node('li', { 'data-scene': si }, [node('span', { class: 'ls-ch-time', text: fmt(t0) }), node('span', { class: 'ls-ch-title', text: sc.title || this.sceneLabel(sc) })]);
        li.onclick = () => { this.hidePoster(); this.seek(t0); if (!this.playing) this.play(); };
        this.chapters.appendChild(li);
      });
      r.append(this.stage, this.bar, this.chapters);
      // wiring
      this.bPlay.onclick = () => this.toggle();
      this.bPrev.onclick = () => this.skipScene(-1);
      this.bNext.onclick = () => this.skipScene(1);
      this.range.oninput = () => { this.hidePoster(); this.seek(+this.range.value); };
      this.speedSel.onchange = () => this.setSpeed(+this.speedSel.value);
      this.bCC.onclick = () => this.toggleCaptions();
      this.bMute.onclick = () => this.toggleMute();
      this.bFull.onclick = () => this.toggleFull();
      this.bList.onclick = () => { this.chapters.hidden = !this.chapters.hidden; };
      r.addEventListener('keydown', e => {
        if (e.target.tagName === 'SELECT' || e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        const k = e.key;
        if (k === ' ') { this.hidePoster(); this.toggle(); e.preventDefault(); }
        else if (k === 'ArrowRight' && this.playing) { this.seek(this.pos + 5000); e.preventDefault(); }
        else if (k === 'ArrowLeft' && this.playing) { this.seek(this.pos - 5000); e.preventDefault(); }
        else if (k === 'j' || k === 'J') { this.skipScene(1); e.preventDefault(); }
        else if (k === 'k' || k === 'K') { this.skipScene(-1); e.preventDefault(); }
        else if (k === 'c' || k === 'C') { this.toggleCaptions(); }
        else if (k === 'm' || k === 'M') { this.toggleMute(); }
        else if (k === 'f' || k === 'F') { this.toggleFull(); }
        else if (k === 'Escape' && this.root.classList.contains('is-full-fallback')) { this.exitFallbackFull(); }
      });
      document.addEventListener('fullscreenchange', () => r.classList.toggle('is-full', document.fullscreenElement === r));
    }
    sceneLabel(sc) {
      return { slide: 'Slide', trace: 'Watch it run', code: 'The code', diagram: 'Diagram', sim: 'Simulation', figure: 'Example',
        table: 'Table', complexity: 'Approaches compared', think: 'Think first', callout: 'Key point' }[sc.type] || sc.type;
    }
    setupAudio(src) {
      const a = new Audio();
      a.preload = 'auto';
      // Load the whole clip as a blob when we can: that keeps seeking exact even behind servers or
      // proxies without HTTP Range support. On file:// (fetch refused) the direct src is seekable anyway.
      if (location.protocol === 'file:') a.src = src;
      else fetch(src).then(r => { if (!r.ok) throw new Error(r.status); return r.blob(); })
        .then(b => { a.src = URL.createObjectURL(b); })
        .catch(() => { a.src = src; });
      a.addEventListener('canplay', () => { this.audioOk = true; });
      a.addEventListener('error', () => { this.audioOk = false; this.audio = null; this.root.classList.add('no-audio'); this.bMute.hidden = true; if (this.playing) { this.lastClock = performance.now(); } });
      a.addEventListener('ended', () => { this.pos = this.duration; this.finish(); });
      a.addEventListener('seeked', () => { this.seeking = false; });
      this.seeking = false; this.pendingSeek = null;
      this.audio = a;
    }
    seekAudio(ms) {
      const a = this.audio; if (!a) return;
      this.pendingSeek = ms;
      const apply = () => { this.seeking = true; try { a.currentTime = this.pendingSeek / 1000; } catch (e) { this.seeking = false; } };
      if (a.readyState >= 1) apply(); else a.addEventListener('loadedmetadata', apply, { once: true });
    }
    hidePoster() { this.poster.hidden = true; this.root.classList.add('started'); }
    // ---------- clock ----------
    now() {
      if (this.audio && this.audioOk) return this.audio.currentTime * 1000;
      return this.pos;
    }
    play() {
      if (this.ended) { this.ended = false; this.endBox.hidden = true; if (this.pos >= this.duration - 50) this.seek(0); }
      this.hidePoster();
      this.waitBox.hidden = true;
      this.playing = true; this.root.classList.add('playing'); this.bPlay.textContent = '❚❚';
      if (this.audio) {
        this.audio.playbackRate = this.speed;
        if (!this.seeking && Math.abs(this.audio.currentTime * 1000 - this.pos) > 150) this.seekAudio(this.pos);
        const p = this.audio.play();
        if (p && p.catch) p.catch(() => { this.audioOk = false; this.audio = null; this.root.classList.add('no-audio'); });
      }
      this.lastClock = performance.now();
      if (this.cur >= 0) this.applyUpTo(this.cur, true);   // re-sync the picture after the learner explored
      this.loop();
    }
    pause(silent) {
      this.playing = false; this.root.classList.remove('playing'); this.bPlay.textContent = '▶';
      if (this.audio) this.audio.pause();
      if (this.raf) cancelAnimationFrame(this.raf); this.raf = null;
      if (!silent) Watched.set(this.d.id, { pos: Math.round(this.pos) });
    }
    toggle() { this.playing ? this.pause() : this.play(); }
    loop() {
      if (!this.playing) return;
      const t = performance.now();
      if (!(this.audio && this.audioOk)) { this.pos += (t - this.lastClock) * this.speed; }
      else if (!this.seeking) { this.pos = this.audio.currentTime * 1000; }
      this.lastClock = t;
      if (this.pos >= this.duration) { this.pos = this.duration; this.finish(); return; }
      this.sync();
      this.walk();
      if (t - this.lastSave > 5000) { this.lastSave = t; Watched.set(this.d.id, { pos: Math.round(this.pos) }); }
      this.raf = requestAnimationFrame(() => this.loop());
    }
    finish() {
      this.pause(true);
      this.ended = true;
      this.updateBar();
      Watched.set(this.d.id, { pos: 0, done: true });
      this.root.classList.add('is-done');
      this.endBox.hidden = false;
      this.root.dispatchEvent(new CustomEvent('lesson-done', { bubbles: true, detail: { id: this.d.id } }));
    }
    setSpeed(v) { this.speed = v; if (this.audio) this.audio.playbackRate = v; this.speedSel.value = String(v); }
    toggleCaptions() { this.captions = !this.captions; store.set('dsa.lessons.cc', this.captions); this.capBox.classList.toggle('off', !this.captions); this.bCC.classList.toggle('on', this.captions); }
    toggleMute() { if (!this.audio) return; this.audio.muted = !this.audio.muted; this.bMute.innerHTML = this.audio.muted ? ICON.muted : ICON.sound; this.bMute.classList.toggle('on', this.audio.muted); }
    toggleFull() {
      if (this.root.classList.contains('is-full-fallback')) { this.exitFallbackFull(); return; }
      if (document.fullscreenElement === this.root) { document.exitFullscreen(); return; }
      if (document.fullscreenEnabled && this.root.requestFullscreen) {
        const p = this.root.requestFullscreen();
        if (p && p.catch) p.catch(() => this.enterFallbackFull());
      } else this.enterFallbackFull();
    }
    // where the Fullscreen API is unavailable (some WebViews, iOS Safari): pin the lesson over the page instead
    enterFallbackFull() { this.root.classList.add('is-full', 'is-full-fallback'); document.body.classList.add('ls-lock'); this.root.focus({ preventScroll: true }); }
    exitFallbackFull() { this.root.classList.remove('is-full', 'is-full-fallback'); document.body.classList.remove('ls-lock'); }
    skipScene(dir) {
      const si = Math.max(0, Math.min(this.scenes.length - 1, (this.curScene < 0 ? 0 : this.curScene) + dir));
      const sc = this.scenes[si];
      this.hidePoster();
      this.seek(sc.sentences && sc.sentences.length ? sc.sentences[0].t : 0);
    }
    seek(ms) {
      ms = Math.max(0, Math.min(this.duration, ms));
      this.pos = ms; this.waitingAt = -1; this.resumedFrom = -1; this.ended = false; this.endBox.hidden = true; this.waitBox.hidden = true;
      this.seekAudio(ms);
      this.cur = -1; this.curScene = -1;
      this.sync(true);
      this.updateBar();
    }
    // ---------- sync ----------
    indexAt(pos) {
      let i = -1;
      for (let k = 0; k < this.sents.length; k++) { if (this.sents[k].t <= pos) i = k; else break; }
      return i;
    }
    sync(force) {
      const i = this.indexAt(this.pos);
      if (i !== this.cur || force) {
        if (i < 0) { if (this.curScene !== 0) this.renderScene(0, true); this.cur = -1; this.caption(null); }
        else this.applyUpTo(i, force);
      }
      // pause-after-sentence (think scenes)
      if (this.playing && i >= 0) {
        const s = this.sents[i];
        if (s.pause && this.resumedFrom !== i && this.pos >= s.t + s.d && (i === this.sents.length - 1 || this.pos < this.sents[i + 1].t)) {
          this.waitingAt = i;
          this.pause(true);
          this.waitBox.hidden = false;
        }
      }
      this.updateBar(i);
    }
    // Spread the steps a sentence owns (s.at .. s.walkTo) evenly across the sentence, holding the first step
    // for a beat so the listener hears the setup before the picture moves on.
    walk() {
      const i = this.cur; if (i < 0 || !this.player) return;
      const s = this.sents[i]; if (!s || s.walkTo === null || s.walkTo === undefined) return;
      const sc = this.scenes[s.si]; if (sc.type !== 'trace' && sc.type !== 'sim') return;
      const n = s.walkTo - s.at + 1;                      // steps to show during this sentence
      const hold = Math.min(0.35, 1 / n);                 // first step gets at least its share, at most 35 %
      const frac = Math.max(0, Math.min(1, (this.pos - s.t) / Math.max(1, s.d)));
      const k = frac <= hold ? 0 : Math.min(n - 1, 1 + Math.floor((frac - hold) / (1 - hold) * (n - 1)));
      const want = s.at + k;
      if (this.player.i !== want) this.player.go(want);
    }
    continueAfterPause() {
      const i = this.waitingAt; this.waitBox.hidden = true;
      if (i >= 0) {
        this.resumedFrom = i;
        const next = this.sents[i + 1];
        this.pos = next ? next.t : this.duration;
        this.seekAudio(this.pos);
        if (next && next.reveal) this.applyUpTo(i + 1, true);
      }
      this.play();
    }
    applyUpTo(i, force) {
      const s = this.sents[i];
      if (s.si !== this.curScene || force) {
        this.renderScene(s.si);
        // apply every action of this scene up to k, so the picture matches mid-scene seeks
        for (let k = 0; k <= s.k; k++) this.applyAction(this.scenes[s.si], this.scenes[s.si].sentences[k]);
      } else {
        for (let k = this.cur + 1; k <= i; k++) { const x = this.sents[k]; if (x.si === s.si) this.applyAction(this.scenes[s.si], x); }
      }
      this.cur = i;
      this.caption(s);
      $$('.ls-chapters li', this.root).forEach(li => li.classList.toggle('now', +li.dataset.scene === s.si));
    }
    caption(s) {
      const t = $('.ls-cap-text', this.capBox);
      t.textContent = s ? s.text : '';
      this.capBox.classList.toggle('empty', !s);
    }
    updateBar(i) {
      this.range.value = Math.round(this.pos);
      this.time.textContent = `${fmt(this.pos)} / ${fmt(this.duration)}`;
    }
    // ---------- scenes ----------
    renderScene(si, initial) {
      const sc = this.scenes[si]; if (!sc) return;
      this.curScene = si;
      const box = this.sceneBox; box.innerHTML = ''; box.dataset.type = sc.type;
      this.player = null; this.diagramBox = null;
      const head = sc.title && !['slide', 'callout', 'think'].includes(sc.type) ? node('div', { class: 'ls-head', text: sc.title }) : null;
      if (head) box.appendChild(head);
      const fn = this['scene_' + sc.type];
      if (fn) fn.call(this, sc, box); else box.appendChild(node('div', { class: 'muted', text: 'Unknown scene type ' + sc.type }));
      if (initial) { (sc.sentences || []).slice(0, 1).forEach(s => this.applyAction(sc, s, true)); }
    }
    applyAction(sc, s, quiet) {
      if (!s) return;
      const at = s.at;
      if (sc.type === 'slide') {
        if (at === null || at === undefined) return;
        $$('.ls-bullets li', this.sceneBox).forEach((li, k) => { li.classList.toggle('shown', k <= at); li.classList.toggle('now', k === at); });
      } else if (sc.type === 'trace' || sc.type === 'sim') {
        if (this.player && at !== null && at !== undefined) this.player.go(at);
      } else if (sc.type === 'code') {
        if (at === null || at === undefined) return;
        const lines = Array.isArray(at) ? at : [at];
        let first = null;
        $$('.cl', this.sceneBox).forEach(l => { const on = lines.includes(+l.dataset.l); l.classList.toggle('hl', on); if (on && !first) first = l; });
        if (first && !quiet) { const pre = first.closest('pre'); const top = first.offsetTop - pre.clientHeight / 2 + 12; pre.scrollTo({ top: Math.max(0, top), behavior: 'smooth' }); }
      } else if (sc.type === 'table' || sc.type === 'complexity') {
        if (at === null || at === undefined) return;
        $$('tbody tr', this.sceneBox).forEach((tr, k) => tr.classList.toggle('hl', k === at));
      } else if (sc.type === 'diagram') {
        this.renderDiagram(sc, at);
      } else if (sc.type === 'think') {
        if (s.reveal) { const a = $('.ls-answer', this.sceneBox); if (a) a.hidden = false; }
      }
    }
    scene_slide(sc, box) {
      const slide = node('div', { class: 'ls-slide' }, [node('h3', { html: mdInline(sc.title || '') })]);
      if (sc.bullets && sc.bullets.length) slide.appendChild(node('ul', { class: 'ls-bullets' }, sc.bullets.map(b => node('li', { html: mdInline(b) }))));
      if (sc.note) slide.appendChild(node('p', { class: 'ls-note muted', html: mdInline(sc.note) }));
      box.appendChild(slide);
    }
    scene_callout(sc, box) {
      box.appendChild(node('div', { class: 'ls-callout k-' + (sc.kind || 'info') }, [sc.title ? node('div', { class: 'ls-callout-title', text: sc.title }) : null, node('div', { class: 'ls-big', html: mdInline(sc.text || '') })]));
    }
    scene_think(sc, box) {
      box.appendChild(node('div', { class: 'ls-think' }, [
        node('div', { class: 'ls-think-kicker', text: sc.title || 'Think first' }),
        node('div', { class: 'ls-q', html: mdInline(sc.question || '') }),
        sc.answer ? node('div', { class: 'ls-answer', hidden: true, html: mdInline(sc.answer) }) : null]));
    }
    scene_figure(sc, box) {
      const f = PD && (PD.figures || []).find(x => x.example === sc.example);
      if (!f || !V) { box.appendChild(node('div', { class: 'muted', text: 'Figure not available on this page.' })); return; }
      const views = node('div', { class: 'viz-views ls-views' });
      (f.views || []).forEach(v => views.appendChild(V.renderView(v)));
      box.appendChild(views);
      if (f.caption) box.appendChild(node('div', { class: 'ls-figcap muted', html: mdInline(f.caption) }));
    }
    scene_trace(sc, box) {
      if (!PD || !V) { box.appendChild(node('div', { class: 'muted', text: 'Visualiser not available on this page.' })); return; }
      const tr = ((PD.traces || [])[sc.approach] || [])[sc.input];
      if (!tr) { box.appendChild(node('div', { class: 'muted', text: 'Trace missing.' })); return; }
      const holder = node('div', { class: 'viz-player ls-player' });
      box.appendChild(holder);
      this.player = new V.Player(holder, tr);
      this.player.stop();
      if (sc.title === null || sc.title === undefined) { const label = (PD.approaches[sc.approach] || {}).name; if (label) box.insertBefore(node('div', { class: 'ls-head', text: label }), holder); }
    }
    scene_sim(sc, box) {
      const d = GD && GD[sc.block];
      if (!d || !V) { box.appendChild(node('div', { class: 'muted', text: 'Simulation not available on this page.' })); return; }
      const holder = node('div', { class: 'viz-player ls-player' });
      box.appendChild(holder);
      this.player = new V.Player(holder, d.traces[sc.input || 0]);
      this.player.stop();
    }
    scene_code(sc, box) {
      if (sc.label && !sc.title) box.appendChild(node('div', { class: 'ls-head', text: sc.label }));
      const wrap = node('div', { class: 'ls-codewrap', html: sc.html || '' });
      box.appendChild(wrap);
      $$('.copy', wrap).forEach(b => b.remove());
    }
    scene_table(sc, box) {
      const t = node('table', { class: 'ls-table' });
      t.appendChild(node('thead', {}, [node('tr', {}, sc.headers.map(h => node('th', { html: mdInline(h) })))]));
      t.appendChild(node('tbody', {}, sc.rows.map(r => node('tr', {}, r.map(c => node('td', { html: mdInline(c) }))))));
      box.appendChild(t);
    }
    scene_complexity(sc, box) {
      const t = node('table', { class: 'ls-table' });
      t.appendChild(node('thead', {}, [node('tr', {}, ['Approach', 'Time', 'Space'].map(h => node('th', { text: h })))]));
      t.appendChild(node('tbody', {}, (sc.rows || []).map(r => node('tr', {}, [
        node('td', {}, [node('span', { class: 'kind ' + r.kind, text: r.kind }), ' ', node('span', { text: r.name })]),
        node('td', { html: mdInline(r.time) }), node('td', { html: mdInline(r.space) })]))));
      box.appendChild(t);
    }
    scene_diagram(sc, box) {
      const d = GD && GD[sc.block];
      if (!d || !G) { box.appendChild(node('div', { class: 'muted', text: 'Diagram not available on this page.' })); return; }
      this.diagramBox = node('div', { class: 'mermaid-box ls-mermaid' }, [node('div', { class: 'mermaid-out' })]);
      box.appendChild(this.diagramBox);
      this.renderDiagram(sc, null);
    }
    renderDiagram(sc, at) {
      const d = GD && GD[sc.block]; if (!d || !G || !this.diagramBox) return;
      let text = d.mermaid;
      if (d.steps && at !== null && at !== undefined && d.steps[at]) {
        const st = d.steps[at];
        text = d.kind === 'sequence' ? st.partial : G.decorate(d.mermaid, d.kind, st.highlight || [], st.edges || []);
      }
      if (this._lastDiagram === text) return;
      this._lastDiagram = text;
      G.renderMermaid(this.diagramBox, text);
    }
    // deterministic rendering for QA / frame capture: show the picture at time ms without playing
    renderAt(ms) { this.hidePoster(); this.pause(true); this.seek(ms); }
  }

  const players = {};
  $$('.lesson[data-lesson]').forEach(root => {
    const id = root.dataset.lesson;
    const dn = $(`script.lesson-data[data-for="${id}"]`);
    if (!dn) return;
    let data;
    try { data = JSON.parse(dn.textContent); } catch (e) { root.textContent = 'Lesson data unreadable.'; return; }
    players[id] = new LessonPlayer(root, data);
  });
  // `#lesson-<id>` in the URL: scroll to and focus that lesson
  if (location.hash.startsWith('#lesson-')) {
    const id = location.hash.slice(8);
    const p = players[id];
    if (p) setTimeout(() => { p.root.scrollIntoView({ block: 'start' }); p.root.focus({ preventScroll: true }); }, 50);
  }
  const q = new URLSearchParams(location.search);
  if (q.has('lesson') && q.has('t') && players[q.get('lesson')]) players[q.get('lesson')].renderAt(+q.get('t'));
  window.DSALesson = { players, LessonPlayer, Watched };
})();
