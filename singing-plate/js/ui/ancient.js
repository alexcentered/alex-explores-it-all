/*
 * ui/ancient.js -- runs the Ancient forms page.
 *
 * Everything shown comes from core/ancient.js: the shapes, the ratios and
 * the statements about sound, each with its status. This file lays them
 * out, drives the 3D view and plays the Hear buttons.
 */
(function (root) {
  'use strict';

  var SP = root.SP;
  var ancient = SP.ancient, freq = SP.freq, safety = SP.safety;
  var CONSOLE_KEY = 'singing-plate:v1';
  var KEY = 'singing-plate:ancient:v1';
  var HEAR_MS = 3000;
  var BASE_HZ = 220;             // the lower note when a ratio is played as two tones
  var MODE_COUNT = 10;
  // How long each step shows when the sequence is played. Tests set SP_STEP_MS to run it quickly.
  var STEP_MS = Number(root.SP_STEP_MS) > 0 ? Number(root.SP_STEP_MS) : 2600;

  function $(id) { return document.getElementById(id); }

  var el = {};
  var theme = 'dark';
  var ceilingDb = safety.DEFAULT_CEILING_DB;
  var state = { id: 'kings-chamber', mode: 0, sheet: 0.29, volume: 0.25, close: false };   // mode -1: no sheet shown
  var viewer = null, view = null;
  var duo = new SP.Duo();
  var sounding = '', soundTimer = null;
  var structure = null, modes = [];
  var step = 0;                  // step of the build sequence on show; not saved, a page always opens on the finished structure
  var playTimer = null;

  /* ----------------------------------------------------------- storage */

  function readJson(key) {
    try { return JSON.parse(localStorage.getItem(key) || 'null') || {}; } catch (e) { return {}; }
  }

  function num(v, lo, hi, fallback) {
    v = Number(v);
    return isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;
  }

  function load() {
    var s = readJson(KEY), c = readJson(CONSOLE_KEY);
    if (ancient.find(s.id)) state.id = s.id;
    state.mode = Math.round(num(s.mode, -1, MODE_COUNT - 1, state.mode));
    state.sheet = num(s.sheet, 0, 1, state.sheet);
    state.volume = num(s.volume, 0, 1, state.volume);
    state.close = s.close === true;
    theme = c.theme === 'light' ? 'light' : 'dark';
    if (c.ceilingDb !== undefined) ceilingDb = safety.sanitizeCeilingDb(c.ceilingDb);
    // a link such as ancient.html#osireion opens that structure
    var hash = (root.location.hash || '').slice(1);
    if (ancient.find(hash)) state.id = hash;
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* not fatal */ }
  }

  /* ------------------------------------------------------------- small */

  function make(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function trim(v) {
    var r = Math.round(v * 100) / 100;
    return String(r);
  }

  function tag(status) {
    var t = make('span', 'tag', status.charAt(0).toUpperCase() + status.slice(1));
    t.dataset.status = status;
    return t;
  }

  /* ------------------------------------------------------------- sound */

  function stopSound() {
    clearTimeout(soundTimer);
    if (duo.playing) duo.stop();
    sounding = '';
    renderSoundButtons();
  }

  /* Play one tone, or two together, for a few seconds. key identifies the button that asked. */
  function hear(key, base, second) {
    if (sounding === key) { stopSound(); return; }
    stopSound();
    if (!SP.Duo.isSupported()) return;
    duo.start({ base: base, spacing: Math.max(0, (second || base) - base), volume: state.volume, ceilingDb: ceilingDb });
    sounding = key;
    renderSoundButtons();
    soundTimer = setTimeout(stopSound, HEAR_MS);
  }

  function renderSoundButtons() {
    document.querySelectorAll('[data-hear]').forEach(function (b) {
      var on = b.dataset.hear === sounding;
      b.textContent = on ? 'Stop' : b.dataset.label;
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  /* ---------------------------------------------------------- structure */

  function renderPicker() {
    el.pickList.textContent = '';
    ancient.STRUCTURES.forEach(function (s) {
      var b = make('button', 'pick');
      b.type = 'button';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', s.id === state.id ? 'true' : 'false');
      b.dataset.id = s.id;
      b.appendChild(make('span', 'pick-name', s.name));
      b.appendChild(make('span', 'pick-place', s.place));
      b.addEventListener('click', function () { choose(s.id); });
      el.pickList.appendChild(b);
    });
  }

  function choose(id) {
    if (!ancient.find(id) || id === state.id) return;
    stopSound();
    state.id = id;
    renderStructure();
    save();
  }

  function renderStructure() {
    structure = ancient.find(state.id);
    document.querySelectorAll('.pick').forEach(function (b) {
      b.setAttribute('aria-checked', b.dataset.id === state.id ? 'true' : 'false');
    });
    el.factPlace.textContent = structure.place;
    el.factDate.textContent = structure.date;
    el.factMaterial.textContent = structure.material;
    el.factSize.textContent = structure.size;

    while (el.builtText.children.length > 1) el.builtText.removeChild(el.builtText.lastChild);
    structure.built.forEach(function (p) { el.builtText.appendChild(make('p', '', p)); });

    el.sourceList.textContent = '';
    structure.sources.forEach(function (s) { el.sourceList.appendChild(make('li', '', s)); });

    el.viewTitle.textContent = structure.name;
    stopPlay();
    step = structure.steps.length;
    el.stepRange.max = structure.steps.length;
    renderModel(true);
    renderStep();
    renderRatios();
    renderSound();
    renderModes();
  }

  /* A structure with a close-up can be shown whole, or with its surroundings left out. */
  function renderModel(resetCamera) {
    el.closeBtn.hidden = !structure.closeUp;
    var close = !!structure.closeUp && state.close;
    el.closeBtn.textContent = close ? 'Whole site' : 'Close up';
    el.closeBtn.setAttribute('aria-pressed', close ? 'true' : 'false');
    if (structure.closeUp) el.closeBtn.title = structure.closeUp;
    if (view && view.ok) {
      view.show(ancient.model(structure.id, close, step));
      if (resetCamera) viewer.resetView();
    }
  }

  /* ---------------------------------------------------- build sequence */

  var BASIS = {
    evidence: { text: 'From the remains or records', status: 'measured' },
    inferred: { text: 'Inferred', status: 'computed' },
    debated: { text: 'Debated', status: 'claimed' }
  };

  function finished() { return step >= structure.steps.length; }

  function renderStep() {
    var n = structure.steps.length, s = structure.steps[step - 1];
    el.stepRange.value = step;
    el.stepCount.textContent = 'Step ' + step + ' of ' + n + (finished() ? ' · finished' : '');
    el.stepTitle.textContent = s.title;
    el.stepText.textContent = s.text;
    el.stepBasis.textContent = BASIS[s.basis].text;
    el.stepBasis.dataset.status = BASIS[s.basis].status;
    el.stepPrev.disabled = step <= 1;
    el.stepNext.disabled = finished();
    el.stepPlay.textContent = playTimer ? 'Stop' : 'Play from the start';
    el.stepPlay.setAttribute('aria-pressed', playTimer ? 'true' : 'false');
  }

  function goToStep(next) {
    var n = structure.steps.length;
    next = Math.min(n, Math.max(1, Math.round(next)));
    if (next === step) { renderStep(); return; }
    step = next;
    renderModel(false);
    renderStep();
    renderModes();          // standing waves belong to the finished room
  }

  function stopPlay() {
    clearInterval(playTimer);
    playTimer = null;
  }

  function play() {
    if (playTimer) { stopPlay(); renderStep(); return; }
    goToStep(1);
    playTimer = setInterval(function () {
      if (finished()) { stopPlay(); renderStep(); return; }
      goToStep(step + 1);
      if (finished()) { stopPlay(); renderStep(); }
    }, STEP_MS);
    renderStep();
  }

  /* -------------------------------------------------------- proportions */

  function intervalText(i) {
    var name = i.name;
    if (i.octaves === 1) name = i.name === 'Octave' ? 'Two octaves' : 'An octave and a ' + i.name.toLowerCase();
    else if (i.octaves > 1) name = i.octaves + ' octaves and a ' + i.name.toLowerCase();
    var off = Math.abs(i.off) < 0.05 ? 'exact' : freq.formatCents(i.off) + ' from pure';
    return { name: name, off: off };
  }

  function renderRatios() {
    var list = ancient.analyse(structure);
    el.ratioList.textContent = '';
    el.ratioCount.textContent = list.length ? list.length + (list.length === 1 ? ' ratio' : ' ratios') : 'None offered';
    list.forEach(function (r, index) {
      var card = make('div', 'ratio-card');
      card.appendChild(make('p', 'label', r.label));
      card.appendChild(make('p', 'ratio-value', trim(r.a) + ' : ' + trim(r.b) + ' ' + r.unit + '  =  ' + r.value.toFixed(3)));

      var t = intervalText(r.interval);
      var line = make('p', 'ratio-interval');
      line.appendChild(make('b', '', r.interval.close ? t.name : 'No simple interval'));
      line.appendChild(document.createTextNode(r.interval.close
        ? ' · ' + t.off + ' · as a fraction ' + r.fraction.a + ' : ' + r.fraction.b
        : ' · nearest is ' + t.name.toLowerCase() + ', ' + t.off));
      card.appendChild(line);

      var foot = make('div', 'ratio-foot');
      var kind = make('span', 'tag', r.whole ? 'Whole numbers in the builders\' units'
        : r.unit === 'cubits' ? 'Not a whole number of cubits' : 'Modern measurement');
      kind.dataset.status = r.whole ? 'measured' : 'computed';
      foot.appendChild(kind);
      var b = make('button', 'btn', 'Hear');
      b.type = 'button';
      b.dataset.hear = 'ratio-' + index;
      b.dataset.label = 'Hear';
      b.setAttribute('aria-label', 'Hear ' + r.label + ' as two tones');
      b.addEventListener('click', function () {
        // fold very wide ratios down by octaves so both tones stay in a comfortable range
        var v = r.value;
        while (v > 4) v /= 2;
        hear('ratio-' + index, BASE_HZ, BASE_HZ * v);
      });
      foot.appendChild(b);
      card.appendChild(foot);
      if (r.note) card.appendChild(make('p', 'hint', r.note));
      el.ratioList.appendChild(card);
    });
    el.ratioNote.textContent = structure.ratioNote;
  }

  /* ------------------------------------------------------------- sound */

  function renderSound() {
    el.soundList.textContent = '';
    structure.acoustics.forEach(function (a) {
      var li = make('li', 'sound-item');
      li.appendChild(tag(a.status));
      li.appendChild(make('p', '', a.text));
      el.soundList.appendChild(li);
    });
    el.volumeOut.textContent = Math.round(state.volume * 100) + '%';
  }

  /* ------------------------------------------------------- room modes */

  var AXES = ['along the length', 'across the width', 'up the height'];

  function describeMode(n) {
    var parts = [];
    for (var a = 0; a < 3; a++) if (n[a]) parts.push(n[a] + ' ' + AXES[a]);
    return 'Half wavelengths that fit: ' + parts.join(', ') + '.';
  }

  function renderModes() {
    var room = structure.room && finished() ? structure.room : null;
    el.modeBlock.hidden = !room;
    if (!room) { modes = []; if (view) view.setSheet(null); return; }
    modes = ancient.boxModes(room.L, room.W, room.H, MODE_COUNT);
    el.modeCount.textContent = 'Lowest ' + modes.length;
    el.modeList.textContent = '';
    var none = make('button', 'chip', 'No sheet');
    none.type = 'button';
    none.dataset.mode = '-1';
    el.modeList.appendChild(none);
    modes.forEach(function (m, i) {
      var chip = make('button', 'chip');
      chip.type = 'button';
      chip.dataset.mode = String(i);
      chip.appendChild(document.createTextNode(m.freq.toFixed(1) + ' Hz '));
      chip.appendChild(make('small', '', m.n.join(' ')));
      el.modeList.appendChild(chip);
    });
    el.modeList.querySelectorAll('.chip').forEach(function (chip) {
      chip.addEventListener('click', function () {
        state.mode = Number(chip.dataset.mode);
        stopSound();
        renderMode();
        save();
      });
    });
    renderMode();
  }

  function renderMode() {
    var room = structure.room;
    if (!room || !finished()) return;
    el.modeList.querySelectorAll('.chip').forEach(function (chip) {
      chip.setAttribute('aria-current', Number(chip.dataset.mode) === state.mode ? 'true' : 'false');
    });
    var m = modes[state.mode];
    el.sheetField.hidden = !m;
    el.modeHear.hidden = !m;
    el.modeHearNote.hidden = !m;
    if (!m) {
      el.modeText.textContent = 'Choose a note to see where in the room it is loud and where it is quiet.';
      if (view) view.setSheet(null);
      return;
    }
    var note = freq.noteInfo(m.freq);
    el.modeText.textContent = m.freq.toFixed(1) + ' Hz, ' + note.label + ' ' + freq.formatCents(note.cents) + '. ' + describeMode(m.n);
    el.sheetOut.textContent = (state.sheet * room.H).toFixed(2) + ' m above the floor';
    var heard = ancient.audible(m.freq);
    el.modeHearNote.textContent = heard.octaves > 0
      ? 'Too low to hear as it is: played ' + heard.octaves + (heard.octaves === 1 ? ' octave' : ' octaves') + ' up, at ' + heard.freq.toFixed(1) + ' Hz.'
      : 'Played at its own pitch.';
    if (view) view.setSheet(ancient.modeSlice(room, m.n, state.sheet, 48));
  }

  /* -------------------------------------------------------------- loop */

  function frame() {
    if (viewer && viewer.ok) viewer.render();
    root.requestAnimationFrame(frame);
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
    if (viewer) viewer.setTheme(theme);
    if (view) view.setTheme(theme);
    // loud places are drawn in the theme's ink, so the wording follows the theme
    el.sheetHint.textContent = 'Computed for an empty box with hard walls. The sheet shows how loud the note is at each place: stand where it is '
      + (theme === 'light' ? 'dark' : 'bright') + ' and the note is strong; where it is '
      + (theme === 'light' ? 'pale' : 'dark') + ', it nearly vanishes.';
  }

  /* -------------------------------------------------------------- init */

  function init() {
    ['themeBtn', 'pickList', 'factPlace', 'factDate', 'factMaterial', 'factSize', 'builtText', 'sourceList',
      'viewTitle', 'viewReset', 'closeBtn', 'stepRange', 'stepCount', 'stepPrev', 'stepNext', 'stepPlay', 'stepTitle', 'stepBasis', 'stepText', 'stage', 'stageMsg', 'modeBlock', 'modeCount', 'modeList', 'modeText', 'sheetField',
      'sheetHeight', 'sheetOut', 'sheetHint', 'modeHear', 'modeHearNote', 'ratioCount', 'ratioList', 'ratioNote', 'soundList',
      'volume', 'volumeOut'
    ].forEach(function (id) { el[id] = $(id); });

    load();

    viewer = new SP.Viewer(el.stage);
    view = new SP.AncientView(viewer);
    if (!viewer.ok) {
      el.stageMsg.hidden = false;
      el.stageMsg.textContent = 'This browser cannot show 3D here. The proportions and the notes on sound below still work.';
    }

    el.sheetHeight.value = Math.round(state.sheet * 100);
    el.volume.value = Math.round(state.volume * 100);
    el.modeHear.dataset.hear = 'mode';
    el.modeHear.dataset.label = 'Hear it';

    applyTheme(theme);
    renderPicker();
    renderStructure();

    el.viewReset.addEventListener('click', function () { viewer.resetView(); });
    el.closeBtn.addEventListener('click', function () {
      state.close = !state.close;
      renderModel(true);
      if (structure.room) renderMode();
      save();
    });
    el.stepRange.addEventListener('input', function () { stopPlay(); goToStep(Number(el.stepRange.value)); });
    el.stepPrev.addEventListener('click', function () { stopPlay(); goToStep(step - 1); });
    el.stepNext.addEventListener('click', function () { stopPlay(); goToStep(step + 1); });
    el.stepPlay.addEventListener('click', play);
    el.sheetHeight.addEventListener('input', function () {
      state.sheet = num(Number(el.sheetHeight.value) / 100, 0, 1, state.sheet);
      renderMode(); save();
    });
    el.modeHear.addEventListener('click', function () {
      var m = modes[state.mode];
      if (m) hear('mode', ancient.audible(m.freq).freq);
    });
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
    root.addEventListener('pagehide', function () { stopSound(); stopPlay(); });
    root.addEventListener('hashchange', function () {
      var id = (root.location.hash || '').slice(1);
      if (ancient.find(id)) choose(id);
    });

    root.requestAnimationFrame(frame);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  // Exposed for debugging from the browser console; not a public API.
  SP.ancientPage = {
    current: function () {
      return { state: state, step: step, playing: !!playTimer, sounding: sounding, modes: modes, webgl: !!(viewer && viewer.ok), shapes: view && view.ok ? view.group.children.length : 0,
        scale: view && view.ok ? view.group.scale.x : 0 };
    },
    duo: duo
  };
})(typeof self !== 'undefined' ? self : this);
