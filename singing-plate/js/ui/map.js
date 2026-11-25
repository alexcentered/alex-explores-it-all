/*
 * ui/map.js -- runs the Map page.
 *
 * Most of the page is plain text and links. This file runs the one
 * interactive part: a size slider and, for each of seven things, the note
 * it would sound at that size. The rules come from core/scale.js.
 */
(function (root) {
  'use strict';

  var SP = root.SP;
  var scale = SP.scale, freq = SP.freq, safety = SP.safety;
  var CONSOLE_KEY = 'singing-plate:v1';
  var KEY = 'singing-plate:map:v1';
  var NOTE_MS = 1100;            // each of the two notes, when a row is heard

  function $(id) { return document.getElementById(id); }

  var el = {};
  var theme = 'dark';
  var ceilingDb = safety.DEFAULT_CEILING_DB;
  var state = { size: 2, volume: 0.25 };
  var duo = new SP.Duo();
  var sounding = '', timers = [];

  function readJson(key) {
    try { return JSON.parse(localStorage.getItem(key) || 'null') || {}; } catch (e) { return {}; }
  }

  function num(v, lo, hi, fallback) {
    v = Number(v);
    return isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;
  }

  function load() {
    var s = readJson(KEY), c = readJson(CONSOLE_KEY);
    if (s.size !== undefined) state.size = scale.sanitizeScale(s.size);
    state.volume = num(s.volume, 0, 1, state.volume);
    theme = c.theme === 'light' ? 'light' : 'dark';
    if (c.ceilingDb !== undefined) ceilingDb = safety.sanitizeCeilingDb(c.ceilingDb);
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* not fatal */ }
  }

  function make(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  /* The slider is logarithmic: equal travel for halving and for doubling. */
  function sliderToSize(v) { return Math.pow(2, v / 100); }
  function sizeToSlider(s) { return 100 * Math.log2(s); }

  function hz(f) {
    if (f >= 1000) return (f / 1000).toFixed(f >= 10000 ? 1 : 2) + ' kHz';
    return (f >= 100 ? f.toFixed(0) : f >= 10 ? f.toFixed(1) : f.toFixed(2)) + ' Hz';
  }

  /*
   * Whole octaves to move a pair of notes so both can be heard comfortably:
   * up until the lower reaches 100 Hz, or down until the higher is under 4 kHz.
   */
  function shiftFor(a, b) {
    var lo = Math.min(a, b), hi = Math.max(a, b), k = 0;
    while (lo * Math.pow(2, k) < 100) k++;
    while (hi * Math.pow(2, k) > 4000) k--;
    return k;
  }

  /* ------------------------------------------------------------- sound */

  function stopSound() {
    timers.forEach(clearTimeout);
    timers = [];
    if (duo.playing) duo.stop();
    sounding = '';
    renderButtons();
  }

  /* The note at the example size, then the note at the new size. */
  function hear(thing) {
    if (sounding === thing.id) { stopSound(); return; }
    stopSound();
    if (!SP.Duo.isSupported()) return;
    var a = thing.base, b = scale.frequency(thing, state.size), k = Math.pow(2, shiftFor(a, b));
    duo.start({ base: a * k, spacing: 0, volume: state.volume, ceilingDb: ceilingDb });
    sounding = thing.id;
    renderButtons();
    timers.push(setTimeout(function () {
      duo.stop();
      timers.push(setTimeout(function () {
        duo.start({ base: b * k, spacing: 0, volume: state.volume, ceilingDb: ceilingDb });
        timers.push(setTimeout(stopSound, NOTE_MS));
      }, 260));
    }, NOTE_MS));
  }

  function renderButtons() {
    document.querySelectorAll('[data-hear]').forEach(function (b) {
      var on = b.dataset.hear === sounding;
      b.textContent = on ? 'Stop' : 'Hear';
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  /* -------------------------------------------------------------- size */

  function renderSize() {
    var s = state.size;
    el.size.value = sizeToSlider(s);
    el.sizeOut.textContent = '× ' + (Math.abs(s - Math.round(s)) < 0.005 ? Math.round(s) : s.toFixed(2));
    el.sizeState.textContent = Math.abs(s - 1) < 0.005 ? 'Example size' : s > 1 ? 'Larger' : 'Smaller';
    el.sizeList.textContent = '';
    scale.THINGS.forEach(function (t) {
      var f = scale.frequency(t, s), oct = scale.octaves(t, s), k = shiftFor(t.base, f);
      var row = make('div', 'size-row');
      row.dataset.id = t.id;

      var head = make('div', 'size-head');
      head.appendChild(make('p', 'size-name', t.name));
      var rule = make('span', 'tag', scale.rule(t));
      rule.dataset.status = t.power === -1 ? 'computed' : 'measured';
      head.appendChild(rule);
      row.appendChild(head);

      row.appendChild(make('p', 'hint', t.example + '. Scaling ' + t.scaled + '.'));

      var line = make('div', 'size-line');
      line.appendChild(make('p', 'size-value', hz(t.base) + '  →  ' + hz(f)));
      line.appendChild(make('p', 'size-shift', scale.describeShift(oct)));
      var b = make('button', 'btn', 'Hear');
      b.type = 'button';
      b.dataset.hear = t.id;
      b.setAttribute('aria-label', 'Hear ' + t.name + ' at the example size and at the new size');
      b.addEventListener('click', function () { hear(t); });
      line.appendChild(b);
      row.appendChild(line);

      // a bar whose length is the size of the shift, so the three rules can be compared at a glance
      var bar = make('div', 'size-bar');
      var fill = make('div');
      fill.style.width = Math.min(100, Math.abs(oct) / 4 * 100) + '%';
      bar.appendChild(fill);
      row.appendChild(bar);

      row.appendChild(make('p', 'size-why', t.why));
      if (k !== 0) row.appendChild(make('p', 'hint', 'Too ' + (k > 0 ? 'low' : 'high') + ' to hear as it is: Hear plays both notes ' + Math.abs(k) + (Math.abs(k) === 1 ? ' octave ' : ' octaves ') + (k > 0 ? 'up.' : 'down.')));
      el.sizeList.appendChild(row);
    });
    renderButtons();
  }

  function setSize(s) {
    stopSound();
    state.size = scale.sanitizeScale(s);
    renderSize();
    save();
  }

  /* ------------------------------------------------------------- theme */

  function applyTheme(next) {
    theme = next === 'light' ? 'light' : 'dark';
    document.documentElement.dataset.theme = theme;
    var other = theme === 'dark' ? 'light' : 'dark';
    el.themeBtn.textContent = other === 'light' ? 'Light' : 'Dark';
    el.themeBtn.setAttribute('aria-label', 'Switch to ' + other + ' theme');
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', getComputedStyle(document.documentElement).getPropertyValue('--bg').trim());
  }

  /* -------------------------------------------------------------- init */

  function init() {
    ['themeBtn', 'size', 'sizeOut', 'sizeState', 'sizeHalf', 'sizeSame', 'sizeDouble', 'sizeList', 'volume', 'volumeOut'
    ].forEach(function (id) { el[id] = $(id); });

    load();
    el.volume.value = Math.round(state.volume * 100);
    el.volumeOut.textContent = Math.round(state.volume * 100) + '%';
    applyTheme(theme);
    renderSize();

    el.size.addEventListener('input', function () { setSize(sliderToSize(Number(el.size.value))); });
    el.sizeHalf.addEventListener('click', function () { setSize(0.5); });
    el.sizeSame.addEventListener('click', function () { setSize(1); });
    el.sizeDouble.addEventListener('click', function () { setSize(2); });
    el.volume.addEventListener('input', function () {
      state.volume = num(Number(el.volume.value) / 100, 0, 1, state.volume);
      el.volumeOut.textContent = Math.round(state.volume * 100) + '%';
      if (duo.playing) duo.setVolume(state.volume, ceilingDb);
      save();
    });
    el.themeBtn.addEventListener('click', function () {
      applyTheme(theme === 'dark' ? 'light' : 'dark');
      try {
        var s = readJson(CONSOLE_KEY);
        s.theme = theme;
        localStorage.setItem(CONSOLE_KEY, JSON.stringify(s));
      } catch (e) { /* not fatal */ }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && sounding) { stopSound(); e.preventDefault(); }
    });
    root.addEventListener('pagehide', stopSound);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  // Exposed for debugging from the browser console; not a public API.
  SP.mapPage = { current: function () { return { state: state, sounding: sounding }; }, duo: duo };
})(typeof self !== 'undefined' ? self : this);
