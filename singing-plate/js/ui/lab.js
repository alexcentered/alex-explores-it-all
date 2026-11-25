/*
 * ui/lab.js -- wires the 3D form lab together.
 *
 * Flow: controls -> state -> resolveWave() works out which standing wave is
 * meant -> a builder from core/mesh.js turns it into a solid -> the viewer
 * shows it. The same builder, at a higher resolution, makes the print file,
 * so what is on screen is what gets exported.
 */
(function (root) {
  'use strict';

  var SP = root.SP;
  var F = SP.freq, safety = SP.safety, chladni = SP.chladni, disc = SP.disc, forms = SP.forms, meshes = SP.mesh;
  var SHAPES = ['plate', 'disc', 'sphere', 'room', 'torus'];
  var color = SP.color;
  var DISC_SEGS = 3;              // a disc has this many segments round per ring outward
  var CONSOLE_KEY = 'singing-plate:v1';
  var LAB_KEY = 'singing-plate:lab:v1';
  var FLAT_SIZE = 160;
  var WAVE_PERIOD = 2.6;          // seconds per animated cycle: slowed far down to be visible
  var RIDGE_WIDTH = 0.42;         // width of the raised sand lines, in RMS units
  var RIDGE_HEIGHT = 0.4;         // sand lines are low ridges, not walls

  // Preview stays light enough to animate; export is a separate, finer build.
  // For the torus the figure is steps round the ring; the tube gets half as many.
  var PREVIEW = { plate: [64, 112, 176], disc: [24, 40, 64], sphere: [32, 56, 88], room: [40, 64, 88], torus: [64, 96, 144] };
  var EXPORT = { plate: [160, 256, 384], disc: [64, 112, 176], sphere: [96, 160, 256], room: [48, 72, 96], torus: [160, 256, 384] };

  function $(id) { return document.getElementById(id); }
  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
  function num(v, fallback, lo, hi) {
    var n = typeof v === 'string' && v.trim() === '' ? NaN : Number(v);
    return isFinite(n) ? clamp(n, lo, hi) : fallback;
  }

  /* ------------------------------------------------------------ state */

  var reducedMotion = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var state = {
    shape: 'plate',
    source: 'freq',
    freq: 843.2,
    plate: { m: 4, n: 2, sign: 1 },
    disc: { n: 3, s: 1 },
    sphere: { l: 5, m: 3, radiusMm: 1 },
    room: { n: [2, 1, 0], blend: true, sideCm: 34.3 },
    torus: { m: 2, n: 5, rotating: true, ringCm: 20 },
    relief: 'wave',
    amp: 0.5,
    detail: 1,
    slice: 0.5,
    exportDetail: 1,
    print: {
      plate: { size: 80, base: 2, wall: 2 },
      disc: { size: 80, base: 2, wall: 2 },
      sphere: { size: 60, base: 6, wall: 2 },
      room: { size: 60, base: 2, wall: 2.4 },
      torus: { size: 80, base: 3, wall: 2 }
    }
  };

  var consoleSettings = {};
  var plateSetup = chladni.sanitizePlate(chladni.DEFAULT_PLATE);
  var theme = 'dark';
  var el = {};
  var viewer = null, flat = null, store = null;
  var engine = new SP.Engine();

  var wave = null;            // what resolveWave() decided
  var preview = null;         // { mesh, res, data } currently on screen
  var built = null;           // { mesh, name } ready to download
  var phase = 0;
  var animating = !reducedMotion;
  var atPeak = true;          // a frozen form follows its peak until frozen by hand
  var dirty = true;           // preview needs rebuilding
  var refit = true;           // and the camera refitting
  var lastTime = 0;

  function readJson(key) {
    try {
      var v = JSON.parse(localStorage.getItem(key) || '{}');
      return v && typeof v === 'object' ? v : {};
    } catch (e) { return {}; }
  }

  function loadState() {
    consoleSettings = readJson(CONSOLE_KEY);
    if (consoleSettings.plate) plateSetup = chladni.sanitizePlate(consoleSettings.plate);
    if (consoleSettings.theme === 'light') theme = 'light';
    colourOn = consoleSettings.color === true;
    state.freq = F.sanitize(consoleSettings.freq, state.freq);

    var s = readJson(LAB_KEY);
    if (SHAPES.indexOf(s.shape) !== -1) state.shape = s.shape;
    // a link such as lab.html#torus opens that shape
    var linked = (root.location.hash || '').slice(1);
    if (SHAPES.indexOf(linked) !== -1) state.shape = linked;
    if (s.disc) state.disc = disc.sanitizeMode(s.disc.n, s.disc.s);
    if (s.source === 'freq' || s.source === 'mode') state.source = s.source;
    if (s.freq !== undefined) state.freq = F.sanitize(s.freq, state.freq);
    if (s.plate) {
      state.plate.m = num(s.plate.m, 4, 0, 12) | 0;
      state.plate.n = num(s.plate.n, 2, 0, 12) | 0;
      state.plate.sign = s.plate.sign < 0 ? -1 : 1;
    }
    if (s.sphere) {
      state.sphere.l = num(s.sphere.l, 5, forms.DEGREE_MIN, forms.DEGREE_MAX) | 0;
      state.sphere.m = num(s.sphere.m, 3, 0, state.sphere.l) | 0;
      state.sphere.radiusMm = num(s.sphere.radiusMm, 1, 0.2, 20);
    }
    if (s.torus) {
      var tm = forms.sanitizeTorusMode(s.torus.m, s.torus.n);
      state.torus.m = tm.m; state.torus.n = tm.n;
      state.torus.rotating = s.torus.rotating !== false;
      state.torus.ringCm = num(s.torus.ringCm, 20, 2, 500);
    }
    if (s.room) {
      state.room.n = forms.sanitizeRoomMode(s.room.n);
      state.room.blend = s.room.blend !== false;
      state.room.sideCm = num(s.room.sideCm, 34.3, 5, 500);
    }
    if (s.relief === 'wave' || s.relief === 'lines') state.relief = s.relief;
    state.amp = num(s.amp, 0.5, 0.05, 1);
    state.detail = num(s.detail, 1, 0, 2) | 0;
    state.slice = num(s.slice, 0.5, 0, 1);
    state.exportDetail = num(s.exportDetail, 1, 0, 2) | 0;
    SHAPES.forEach(function (shape) {
      var src = s.print && s.print[shape];
      if (!src) return;
      var dst = state.print[shape];
      dst.size = num(src.size, dst.size, 10, 400);
      dst.base = num(src.base, dst.base, 0, 50);
      dst.wall = num(src.wall, dst.wall, 0.2, 20);
    });
  }

  var saveTimer = null;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, 250);
  }
  function flush() {
    clearTimeout(saveTimer);
    try { localStorage.setItem(LAB_KEY, JSON.stringify(state)); } catch (e) { /* not fatal */ }
  }

  /* ------------------------------------------------- which wave is it */

  function plateC() { return chladni.plateConstant(plateSetup); }

  /* The console's plate, read as a round one of the same size, thickness and metal. */
  function roundPlate() {
    return chladni.sanitizePlate({
      shape: 'circle', sideCm: plateSetup.sideCm, thicknessMm: plateSetup.thicknessMm,
      material: plateSetup.material, trim: plateSetup.trim
    });
  }

  function isFlat(shape) { return shape === 'plate' || shape === 'disc'; }

  /*
   * Decide the standing wave from the controls. In frequency mode the
   * physical model picks the mode numbers; in mode-number mode the numbers
   * pick the frequency.
   */
  function resolveWave() {
    var w = { shape: state.shape, freq: state.freq, empty: false };
    var byFreq = state.source === 'freq';

    if (state.shape === 'plate') {
      var C = plateC();
      if (byFreq) {
        var mode = chladni.nearestMode(chladni.modeTable(C, 1, 1e9), state.freq);
        w.numbers = mode ? [mode.m, mode.n] : [state.plate.m, state.plate.n];
        w.caption = 'Plate driven at ' + F.formatHz(state.freq) + ' Hz' +
          (mode ? ' · nearest mode ' + mode.label + ' at ' + mode.f.toFixed(0) + ' Hz' : '');
      } else {
        w.numbers = [state.plate.m, state.plate.n];
        w.sign = state.plate.sign;
        w.freq = chladni.modeFrequency(C, state.plate.m, state.plate.n);
        w.empty = (state.plate.sign < 0 && state.plate.m === state.plate.n) ||
          (state.plate.m === 0 && state.plate.n === 0);
        w.caption = w.empty
          ? 'These numbers cancel out to a flat plate. Change m or n, or choose Symmetric.'
          : 'Plate mode (' + state.plate.m + ',' + state.plate.n + '), ' +
            (state.plate.sign < 0 ? 'antisymmetric' : 'symmetric') +
            ' · resonates near ' + w.freq.toFixed(0) + ' Hz on your plate';
      }
    } else if (state.shape === 'disc') {
      var round = roundPlate();
      if (byFreq) {
        // A driver at the centre can only raise rings, so frequency picks a ring count.
        var ring = chladni.nearestMode(disc.modeTable(round, 1, 20000), state.freq);
        w.numbers = [0, ring ? ring.s : 1];
        w.caption = 'Round plate driven at ' + F.formatHz(state.freq) + ' Hz' +
          (ring ? ' · nearest mode: ' + ring.label + ' at ' + ring.f.toFixed(0) + ' Hz' : '');
      } else {
        var dm = disc.findMode(round, state.disc.n, state.disc.s);
        w.discMode = dm;
        w.numbers = dm ? [dm.n, dm.s] : [state.disc.n, state.disc.s];
        w.empty = !dm;
        if (dm) w.freq = dm.f;
        w.caption = dm
          ? 'Round plate mode: ' + plural(dm.n, 'nodal diameter') + ', ' + plural(dm.s, 'nodal circle') +
            ' · resonates near ' + dm.f.toFixed(0) + ' Hz on your plate'
          : 'That mode is out of range for this plate.';
      }
    } else if (state.shape === 'sphere') {
      var R = state.sphere.radiusMm;
      var l = byFreq ? forms.dropletDegree(state.freq, R) : state.sphere.l;
      var h = forms.sanitizeHarmonic(l, state.sphere.m);
      w.numbers = [h.l, h.m];
      var ring = forms.dropletFrequency(h.l, R);
      if (!byFreq) w.freq = ring;
      w.caption = 'Degree ' + h.l + ', order ' + h.m + ' · a ' + trim(R) + ' mm water drop rings at ' + ring.toFixed(0) + ' Hz';
    } else if (state.shape === 'torus') {
      var ringCm = state.torus.ringCm;
      var tmode = byFreq ? forms.torusModeFor(state.freq, ringCm) : forms.sanitizeTorusMode(state.torus.m, state.torus.n);
      w.numbers = [tmode.m, tmode.n];
      w.rotating = state.torus.rotating;
      var tf = forms.torusFrequency(tmode.m, tmode.n, ringCm);
      if (!byFreq) w.freq = tf;
      w.caption = (w.rotating ? 'Rotating wave' : 'Standing wave') + ' on a torus: ' + plural(tmode.m, 'wave') + ' round the tube, ' +
        tmode.n + ' round the ring · a ' + trim(ringCm) + ' cm ring of air rings at ' + tf.toFixed(0) + ' Hz';
    } else {
      var side = state.room.sideCm;
      var n = byFreq ? forms.roomModeFor(state.freq, side) : forms.sanitizeRoomMode(state.room.n);
      w.numbers = n;
      w.blend = state.room.blend;
      var f = forms.roomFrequency(n, side);
      if (!byFreq) w.freq = f;
      w.caption = 'Room mode (' + n.join(',') + ')' + (w.blend ? ', axes blended' : '') +
        ' · a ' + trim(side) + ' cm cube rings at ' + f.toFixed(0) + ' Hz';
    }
    w.audible = w.freq >= F.F_MIN && w.freq <= F.F_MAX;
    return w;
  }

  function trim(n) { return String(Number(Number(n).toFixed(1))); }
  function plural(n, word) { return n + ' ' + word + (n === 1 ? '' : 's'); }

  /* --------------------------------------------------------- geometry */

  /* Sample the current wave at a resolution. Cached on the preview. */
  function sampleWave(res) {
    if (wave.shape === 'plate') {
      var re, im = null;
      if (state.source === 'freq') {
        var cf = chladni.complexField(wave.freq, plateC(), res);
        if (cf) { re = cf.re; im = cf.im; } else re = new Float32Array(res * res);
      } else {
        re = chladni.modeShape(wave.numbers[0], wave.numbers[1], wave.sign, res);
      }
      var peak = 0, sumSq = 0;
      for (var i = 0; i < re.length; i++) {
        var m2 = re[i] * re[i] + (im ? im[i] * im[i] : 0);
        sumSq += m2;
        if (m2 > peak) peak = m2;
      }
      return { re: re, im: im, peak: Math.sqrt(peak) || 1, rms: Math.sqrt(sumSq / re.length) || 1,
        heights: new Float32Array(res * res) };
    }
    if (wave.shape === 'disc') return sampleDisc(res);
    if (wave.shape === 'sphere') {
      return { values: forms.sphereHarmonic(wave.numbers[0], wave.numbers[1], res, res * 2) };
    }
    // A torus wave is cheap to compute, and a rotating one changes with every moment, so it is sampled when the mesh is built.
    if (wave.shape === 'torus') return { m: wave.numbers[0], n: wave.numbers[1], rotating: wave.rotating };
    return { field: forms.roomField(wave.numbers, wave.blend, res) };
  }

  function buildTorusMesh(data, ringSeg, ph) {
    var tubeSeg = Math.max(12, Math.round(ringSeg / 2));
    var p = printSettings();
    return meshes.buildTorus(forms.torusValues(data.m, data.n, data.rotating, ph, ringSeg, tubeSeg), ringSeg, tubeSeg,
      { diameter: p.size, aspect: forms.TORUS_ASPECT, amplitude: state.amp * 0.5, cut: p.base });
  }

  /*
   * A round plate's wave is a profile from centre to rim, times cos(n theta).
   * Sampled here once per ring; the angle is applied when heights are made.
   */
  function sampleDisc(rings) {
    var n = wave.numbers[0];
    var re, im = null;
    if (state.source === 'freq') {
      var resp = disc.radialResponse(wave.freq, roundPlate());
      re = resp ? resp.re : new Float32Array(disc.PROFILE_SAMPLES);
      im = resp ? resp.im : null;
    } else {
      re = wave.discMode ? disc.modeProfile(wave.discMode) : new Float32Array(disc.PROFILE_SAMPLES);
    }
    var ringRe = new Float32Array(rings + 1), ringIm = im ? new Float32Array(rings + 1) : null;
    var peak = 0, sum = 0, area = 0;
    for (var r = 0; r <= rings; r++) {
      var rho = r / rings;
      ringRe[r] = disc.sampleProfile(re, rho);
      if (im) ringIm[r] = disc.sampleProfile(im, rho);
      var m2 = ringRe[r] * ringRe[r] + (im ? ringIm[r] * ringIm[r] : 0);
      if (m2 > peak) peak = m2;
      sum += m2 * rho; area += rho;
    }
    // Round the plate, cos^2(n theta) averages to a half (or to one when n = 0).
    var rms = Math.sqrt(sum / area * (n > 0 ? 0.5 : 1)) || 1;
    return { n: n, re: ringRe, im: ringIm, profile: re, profileIm: im, peak: Math.sqrt(peak) || 1, rms: rms,
      heights: new Float32Array(1 + rings * rings * DISC_SEGS) };
  }

  /* Disc heights in 0..1: centre first, then ring by ring outward. */
  function discHeights(data, ph, rings) {
    var segs = rings * DISC_SEGS;
    var h = data.heights, n = data.n;
    var lines = state.relief === 'lines';
    var c = Math.cos(ph) / data.peak, s = Math.sin(ph) / data.peak, w = RIDGE_WIDTH * data.rms;
    var cosN = new Float32Array(segs);
    for (var k = 0; k < segs; k++) cosN[k] = Math.cos(n * 2 * Math.PI * k / segs);
    for (var r = 0; r <= rings; r++) {
      var re = data.re[r], im = data.im ? data.im[r] : 0;
      var count = r === 0 ? 1 : segs;
      var start = r === 0 ? 0 : 1 + (r - 1) * segs;
      for (k = 0; k < count; k++) {
        var a = r === 0 ? (n === 0 ? 1 : 0) : cosN[k];
        if (lines) {
          var mag = Math.sqrt(re * re + im * im) * Math.abs(a) / w;
          h[start + k] = Math.exp(-mag * mag);
        } else {
          h[start + k] = 0.5 + 0.5 * a * (re * c - im * s);
        }
      }
    }
    return h;
  }

  /* Plate heights in 0..1 for the current relief style and phase. */
  function plateHeights(data, ph) {
    var h = data.heights, re = data.re, im = data.im, i;
    if (state.relief === 'lines') {
      var w = RIDGE_WIDTH * data.rms;
      for (i = 0; i < h.length; i++) {
        var mag = Math.sqrt(re[i] * re[i] + (im ? im[i] * im[i] : 0)) / w;
        h[i] = Math.exp(-mag * mag);
      }
    } else {
      var c = Math.cos(ph) / data.peak, s = Math.sin(ph) / data.peak;
      for (i = 0; i < h.length; i++) h[i] = 0.5 + 0.5 * (re[i] * c - (im ? im[i] * s : 0));
    }
    return h;
  }

  function printSettings() { return state.print[state.shape]; }

  function plateOptions() {
    var p = printSettings();
    var relief = state.amp * 0.2 * p.size * (state.relief === 'lines' ? RIDGE_HEIGHT : 1);
    return { width: p.size, base: p.base, relief: Math.max(0.01, relief) };
  }

  function discOptions() {
    var o = plateOptions();
    return { diameter: o.width, base: o.base, relief: o.relief };
  }

  function sphereOptions(ph) {
    var p = printSettings();
    return { diameter: p.size, amplitude: state.amp * 0.45 * Math.cos(ph), cut: p.base };
  }

  /*
   * forPrint = false is the on-screen preview. A wall thinner than two grid
   * steps cannot be drawn cleanly, so the preview thickens it just enough to
   * stay readable; the print build always uses the wall exactly as asked.
   */
  function buildMesh(data, res, ph, forPrint) {
    if (wave.shape === 'plate') return meshes.buildPlate(plateHeights(data, ph), res, plateOptions());
    if (wave.shape === 'disc') return meshes.buildDisc(discHeights(data, ph, res), res, res * DISC_SEGS, discOptions());
    if (wave.shape === 'sphere') return meshes.buildSphere(data.values, res, res * 2, sphereOptions(ph));
    if (wave.shape === 'torus') return buildTorusMesh(data, res, ph);
    var p = printSettings();
    var wall = forPrint ? p.wall : Math.max(p.wall, 2 * p.size / res);
    return meshes.buildRoom(data.field, res, { size: p.size, wall: wall, base: p.base });
  }

  /* Does this form move? Node sheets and sand lines are exactly what stays still. */
  function canAnimate() {
    return wave && !wave.empty && (wave.shape === 'sphere' || wave.shape === 'torus' || (isFlat(wave.shape) && state.relief === 'wave'));
  }

  function peakPhaseNow() {
    if (isFlat(wave.shape) && preview && preview.data.im) return forms.peakPhase(preview.data.re, preview.data.im);
    return 0;
  }

  function rebuildPreview() {
    wave = resolveWave();
    var res = PREVIEW[wave.shape][state.detail];
    var data = sampleWave(res);
    preview = { res: res, data: data, mesh: null };
    // A still form is shown, and printed, at its most pronounced, unless the
    // operator froze it at a moment of their own choosing.
    if (!canAnimate() || (!animating && atPeak)) phase = peakPhaseNow();
    preview.mesh = buildMesh(data, res, phase, false);
    if (viewer.ok) viewer.setMesh(preview.mesh, refit);
    refit = false;
    dirty = false;
    renderFlat();
    renderReadouts();
  }
  function stepAnimation(dt) {
    if (!animating || !canAnimate() || !preview || !viewer.ok) return;
    phase = (phase + dt * 2 * Math.PI / WAVE_PERIOD) % (2 * Math.PI);
    if (wave.shape === 'plate') {
      meshes.updatePlate(preview.mesh, plateHeights(preview.data, phase), preview.res, plateOptions());
      viewer.updatePositions(preview.mesh.positions);
    } else if (wave.shape === 'disc') {
      meshes.updateDisc(preview.mesh, discHeights(preview.data, phase, preview.res), preview.res, preview.res * DISC_SEGS, discOptions());
      viewer.updatePositions(preview.mesh.positions);
    } else {
      var m = wave.shape === 'torus'
        ? buildTorusMesh(preview.data, preview.res, phase)
        : meshes.buildSphere(preview.data.values, preview.res, preview.res * 2, sphereOptions(phase));
      preview.mesh.positions.set(m.positions);
      viewer.updatePositions(preview.mesh.positions);
    }
  }

  /* ------------------------------------------------------- 2D pattern */

  function renderFlat() {
    var map, caption;
    if (wave.shape === 'plate') {
      if (state.source === 'freq') map = chladni.field(wave.freq, plateC(), FLAT_SIZE);
      else map = forms.magnitudeMap(chladni.modeShape(wave.numbers[0], wave.numbers[1], wave.sign, FLAT_SIZE));
      caption = 'Nodal lines on the plate: where the sand settles on the real rig.';
    } else if (wave.shape === 'disc') {
      var d = preview.data, lineWidth = d.rms;
      map = disc.rasterize(function (r, theta) {
        var re = disc.sampleProfile(d.profile, r), im = d.profileIm ? disc.sampleProfile(d.profileIm, r) : 0;
        return Math.sqrt(re * re + im * im) * Math.abs(Math.cos(d.n * theta)) / lineWidth;
      }, FLAT_SIZE, null, d.n > 0);
      caption = 'Nodal lines on the round plate: rings from a centre drive, plus spokes when a mode has nodal diameters.';
    } else if (wave.shape === 'sphere') {
      map = forms.sphereMap(wave.numbers[0], wave.numbers[1], FLAT_SIZE);
    } else if (wave.shape === 'torus') {
      map = forms.torusMap(wave.numbers[0], wave.numbers[1], wave.rotating, phase, FLAT_SIZE);
      caption = wave.rotating
        ? 'The torus unrolled flat: round the ring across, round the tube down. A rotating wave is a set of slanted stripes, like the turns of a coil, and they slide as it turns.'
        : 'The torus unrolled flat: round the ring across, round the tube down. A standing wave is a chequer of still lines.';
      el.flatFrame.classList.toggle('round', false);
      flat.setField(map, FLAT_SIZE);
      flat.frame();
      el.flatCaption.textContent = caption;
      return;
      caption = 'The still lines on the ball, unrolled like a world map: once round the axis across, pole to pole down.';
    } else {
      map = forms.roomSlice(wave.numbers, wave.blend, FLAT_SIZE, state.slice);
      caption = 'Still lines on a horizontal slice through the room. Move the slice to walk up through the node sheets.';
    }
    el.flatFrame.classList.toggle('round', wave.shape === 'disc');
    flat.setField(map, FLAT_SIZE);
    flat.frame();
    el.flatCaption.textContent = caption;
  }

  /* ---------------------------------------------------------- readouts */

  var SHAPE_HINT = {
    plate: 'The Chladni pattern of a square plate, lifted into relief.',
    disc: 'A round plate: rings from the centre drive, stars when it has nodal diameters.',
    sphere: 'Standing waves on a ball, the shapes a vibrating droplet takes.',
    room: 'Standing waves inside a box, drawn as the surfaces where the air stays still.',
    torus: 'Waves on a ring-shaped tube. Standing, they chequer it; rotating, their crests wind round it like the turns of a coil.'
  };

  function setChecked(name, value) {
    var r = document.querySelector('input[name="' + name + '"][value="' + value + '"]');
    if (r) r.checked = true;
  }

  /* Push the whole state into the controls: labels, limits, visibility, values. */
  function syncControls() {
    var shape = state.shape, byFreq = state.source === 'freq';
    setChecked('shape', shape);
    setChecked('source', state.source);
    setChecked('relief', state.relief);
    setChecked('detail', state.detail);
    el.shapeHint.textContent = SHAPE_HINT[shape];

    el.labFreq.disabled = el.labFreqRange.disabled = !byFreq;
    el.presetSelect.disabled = !byFreq || el.presetSelect.options.length < 2;

    // Mode numbers: what they are called, how many, and which are yours to set.
    var labels = { plate: ['m', 'n', ''], disc: ['Diameters', 'Circles', ''], sphere: ['Degree', 'Order', ''], room: ['nx', 'ny', 'nz'], torus: ['Round tube', 'Round ring', ''] }[shape];
    el.modeALabel.textContent = labels[0];
    el.modeBLabel.textContent = labels[1];
    el.modeCLabel.textContent = labels[2];
    el.modeCField.hidden = shape !== 'room';
    el.modeGrid.className = 'form-grid ' + (shape === 'room' ? 'three' : '');
    el.modeA.min = shape === 'sphere' ? forms.DEGREE_MIN : 0;
    el.modeA.max = shape === 'sphere' ? forms.DEGREE_MAX : 12;
    el.modeB.max = shape === 'sphere' ? forms.DEGREE_MAX : shape === 'disc' ? disc.S_MAX : 12;
    el.modeA.disabled = byFreq;
    el.modeB.disabled = byFreq && shape !== 'sphere';
    el.modeC.disabled = byFreq;
    el.modeHint.textContent = !byFreq
      ? (shape === 'sphere' ? 'Degree sets how many ripples; order sets how many times they repeat round the axis.'
        : shape === 'disc' ? 'Diameters are straight still lines through the centre; circles are still rings.'
        : shape === 'torus' ? 'How many whole waves fit round the tube, and how many round the ring.'
        : 'Whole numbers: how many half-waves fit along each direction.')
      : (shape === 'sphere' ? 'Degree follows the frequency. Order is yours: how many times the pattern repeats round the axis.'
        : shape === 'disc' ? 'Set by the frequency. A centre drive raises rings only; choose Mode numbers for the star shapes.'
        : 'Set by the frequency.');

    // Symmetry means something different for each shape.
    el.symmetryField.hidden = shape === 'sphere' || shape === 'disc' || (shape === 'plate' && byFreq);
    if (shape === 'plate') {
      el.symALabel.textContent = 'Symmetric';
      el.symBLabel.textContent = 'Antisymmetric';
      setChecked('symmetry', state.plate.sign < 0 ? 'b' : 'a');
      el.symmetryHint.textContent = 'Adds or subtracts the same wave turned a quarter turn. The two give different figures.';
    } else if (shape === 'torus') {
      el.symALabel.textContent = 'Rotating';
      el.symBLabel.textContent = 'Standing';
      setChecked('symmetry', state.torus.rotating ? 'a' : 'b');
      el.symmetryHint.textContent = 'Two waves running opposite ways stand still as a chequer. One wave alone keeps moving, its crests winding round the ring: the rotating field at the heart of Tesla\'s motor.';
    } else if (shape === 'room') {
      el.symALabel.textContent = 'Blend axes';
      el.symBLabel.textContent = 'Single';
      setChecked('symmetry', state.room.blend ? 'a' : 'b');
      el.symmetryHint.textContent = 'A cube rings at the same pitch whichever way the wave is turned. Blending those turns bends the flat node planes into curved sheets.';
    }

    el.physField.hidden = isFlat(shape);
    if (shape === 'sphere') {
      el.physLabel.textContent = 'Drop radius, mm';
      el.physInput.min = 0.2; el.physInput.max = 20; el.physInput.step = 0.1;
      el.physInput.value = trim(state.sphere.radiusMm);
      el.physHint.textContent = 'Links frequency to shape: smaller drops ring higher.';
    } else if (shape === 'torus') {
      el.physLabel.textContent = 'Ring radius, cm';
      el.physInput.min = 2; el.physInput.max = 500; el.physInput.step = 0.1;
      el.physInput.value = trim(state.torus.ringCm);
      el.physHint.textContent = 'Links frequency to shape: one wave round the ring is c / (2π R). The 2π is the ring being a circle.';
    } else if (shape === 'room') {
      el.physLabel.textContent = 'Cube side, cm';
      el.physInput.min = 5; el.physInput.max = 500; el.physInput.step = 0.1;
      el.physInput.value = trim(state.room.sideCm);
      el.physHint.textContent = 'Links frequency to shape: smaller rooms ring higher.';
    }

    el.reliefField.hidden = !isFlat(shape);
    el.reliefHint.textContent = state.relief === 'lines'
      ? 'Raises the lines where sand gathers: the Chladni figure itself, as a ridge.'
      : 'The plate caught mid-swing: hills and hollows either side of the still lines.';
    el.ampField.hidden = shape === 'room';
    el.amp.value = Math.round(state.amp * 100);
    el.ampOut.textContent = Math.round(state.amp * 100) + '%';

    el.sliceField.hidden = shape !== 'room';
    el.slice.value = Math.round(state.slice * 100);
    el.sliceOut.textContent = Math.round(state.slice * 100) + '%';

    // Print panel
    var p = printSettings();
    el.pSizeLabel.textContent = { plate: 'Width, mm', disc: 'Diameter, mm', sphere: 'Diameter, mm', room: 'Side, mm', torus: 'Outer diameter, mm' }[shape];
    el.pBaseLabel.textContent = shape === 'sphere' || shape === 'torus' ? 'Flat base, mm' : 'Base, mm';
    el.pWallField.hidden = shape !== 'room';
    el.pSize.value = trim(p.size);
    el.pBase.value = trim(p.base);
    el.pWall.value = trim(p.wall);
    el.pDetail.value = state.exportDetail;
    el.printHint.textContent = {
      plate: 'The base is the slab under the pattern. Relief adds ' + plateOptions().relief.toFixed(1) + ' mm on top, set by Amplitude.',
      disc: 'The base is the slab under the pattern. Relief adds ' + plateOptions().relief.toFixed(1) + ' mm on top, set by Amplitude.',
      sphere: 'Flat base trims this much off the bottom so the ball stands on the print bed. 0 leaves it round.',
      room: 'Node sheets have no thickness of their own, so the wall gives them one. The base is a slab that ties loose sheets together.',
      torus: 'Flat base trims this much off the underside so the ring lies steady on the print bed. 0 leaves it round.'
    }[shape];
  }

  /* The parts of the display that follow from the resolved wave. */
  /* ----------------------------------------------- predicted resonances */

  var resTable = [], resKey = '';

  /* Every resonance the model predicts for the current shape, lowest first. */
  function resonanceTable() {
    var shape = state.shape, out = [];
    if (shape === 'plate') {
      out = chladni.modeTable(plateC(), F.F_MIN, F.F_MAX).map(function (m) { return { numbers: [m.m, m.n], f: m.f, label: m.label }; });
    } else if (shape === 'disc') {
      var round = roundPlate();
      for (var n = 0; n <= 6; n++) {
        for (var s = n < 2 ? 1 : 0; s <= 4; s++) {
          var dm = disc.findMode(round, n, s);
          if (dm && dm.f <= F.F_MAX) out.push({ numbers: [n, s], f: dm.f, label: '(' + n + ',' + s + ')' });
        }
      }
    } else if (shape === 'sphere') {
      for (var l = forms.DEGREE_MIN; l <= forms.DEGREE_MAX; l++) {
        var sf = forms.dropletFrequency(l, state.sphere.radiusMm);
        if (sf <= F.F_MAX) out.push({ numbers: [l, Math.min(state.sphere.m, l)], f: sf, label: 'degree ' + l });
      }
    } else if (shape === 'room') {
      for (var a = 1; a <= forms.ROOM_INDEX_MAX; a++) for (var b = 0; b <= a; b++) for (var c = 0; c <= b; c++) {
        var rf = forms.roomFrequency([a, b, c], state.room.sideCm);
        if (rf <= F.F_MAX) out.push({ numbers: [a, b, c], f: rf, label: '(' + a + ',' + b + ',' + c + ')' });
      }
    } else {
      out = forms.torusTable(state.torus.ringCm, F.F_MAX).map(function (t) { return { numbers: [t.m, t.n], f: t.f, label: '(' + t.m + ',' + t.n + ')' }; });
    }
    out.sort(function (x, y) { return x.f - y.f; });
    return out.slice(0, 48);
  }

  var RES_HINT = {
    plate: 'Modes a driver at the centre can raise on your plate, as on the console. The pair of numbers counts half-waves each way.',
    disc: 'Modes of the round plate: (nodal diameters, nodal circles). Those starting with 0 are the rings a centre drive raises.',
    sphere: 'One resonance per degree. The order does not change the pitch on a perfect drop, only the pattern.',
    room: 'Modes of the cube, lowest first: (nx, ny, nz) half-waves along each side.',
    torus: 'Modes of the ring: (waves round the tube, waves round the ring).'
  };

  function sameNumbers(a, b) {
    if (state.shape === 'sphere') return a[0] === b[0];
    if (state.shape === 'room') return a.slice().sort().join() === b.slice().sort().join();
    return a.join() === b.join();
  }

  function renderResonances() {
    var key = state.shape + '|' + JSON.stringify([plateSetup, state.sphere.radiusMm, state.room.sideCm, state.torus.ringCm]);
    if (key !== resKey) {
      resKey = key;
      resTable = resonanceTable();
      var frag = document.createDocumentFragment(), ticks = document.createDocumentFragment();
      resTable.forEach(function (r, i) {
        var chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'chip';
        chip.dataset.index = i;
        chip.append(r.label + ' ');
        var hz = document.createElement('small');
        hz.textContent = r.f >= 1000 ? (r.f / 1000).toFixed(2) + ' kHz' : r.f.toFixed(0) + ' Hz';
        chip.appendChild(hz);
        chip.setAttribute('aria-label', 'Resonance ' + r.label + ' at ' + r.f.toFixed(1) + ' hertz');
        frag.appendChild(chip);
        var tick = document.createElement('span');
        tick.style.left = F.freqToDial(r.f) * 100 + '%';
        ticks.appendChild(tick);
      });
      el.resList.replaceChildren(frag);
      el.resTicks.replaceChildren(ticks);
      el.resCount.textContent = '· ' + (resTable.length === 48 ? 'lowest 48' : resTable.length + ' in range');
      el.resHint.textContent = RES_HINT[state.shape];
    }
    Array.prototype.forEach.call(el.resList.children, function (chip, i) {
      if (sameNumbers(resTable[i].numbers, wave.numbers)) chip.setAttribute('aria-current', 'true');
      else chip.removeAttribute('aria-current');
    });
    el.resHead.style.left = 'calc(' + F.freqToDial(Math.min(F.F_MAX, Math.max(F.F_MIN, wave.freq))) * 100 + '% - 1px)';
  }

  /* Go to a predicted resonance exactly, by its mode numbers. */
  function chooseResonance(r) {
    var n = r.numbers;
    if (state.shape === 'plate') { state.plate.m = n[0]; state.plate.n = n[1]; state.plate.sign = 1; }
    else if (state.shape === 'disc') state.disc = disc.sanitizeMode(n[0], n[1]);
    else if (state.shape === 'sphere') state.sphere.l = n[0];
    else if (state.shape === 'room') state.room.n = n.slice();
    else { state.torus.m = n[0]; state.torus.n = n[1]; }
    state.source = 'mode';
    syncControls();
    changed(false);
  }

  /* ------------------------------------------------------------ colour */

  var colourOn = false;

  /* With Colour on, the form and its 2D pattern take the colour of the frequency. */
  function renderColour() {
    document.documentElement.dataset.color = colourOn ? 'on' : 'off';
    el.colorBtn.setAttribute('aria-pressed', colourOn ? 'true' : 'false');
    var t = colourOn && wave ? color.tone(wave.freq) : null;
    if (t) {
      document.documentElement.style.setProperty('--tone', t.hex);
      viewer.setTint(t.hex);
      flat.setInk(t.rgb);
    } else {
      document.documentElement.style.removeProperty('--tone');
      viewer.setTint(null);
      flat.setInk(themeInk());
    }
    flat.frame();
  }

  function themeInk() {
    var m = /^#([0-9a-f]{6})$/i.exec(getComputedStyle(document.documentElement).getPropertyValue('--fg').trim());
    var v = m ? parseInt(m[1], 16) : 0xf0f0f0;
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  }

  function renderReadouts() {
    renderResonances();
    renderColour();
    var byFreq = state.source === 'freq';
    el.formCaption.textContent = wave.caption;

    if (document.activeElement !== el.labFreq) el.labFreq.value = wave.freq >= 100000 ? wave.freq.toFixed(0) : F.formatHz(wave.freq);
    el.labFreqRange.value = Math.round(F.freqToDial(clamp(wave.freq, F.F_MIN, F.F_MAX)) * 1000);
    el.labNote.textContent = wave.audible ? F.noteInfo(wave.freq).label + ' ' + F.formatCents(F.noteInfo(wave.freq).cents) : '';
    el.freqHint.hidden = byFreq || wave.audible;
    el.freqHint.textContent = 'Outside the 1 Hz to 20 kHz the console can play.';

    var n = wave.numbers;
    if (document.activeElement !== el.modeA) el.modeA.value = n[0];
    if (document.activeElement !== el.modeB) el.modeB.value = n[1];
    if (document.activeElement !== el.modeC) el.modeC.value = n.length > 2 ? n[2] : 0;

    var moves = canAnimate();
    el.animBtn.disabled = el.peakBtn.disabled = !moves;
    el.animBtn.textContent = animating && moves ? 'Freeze' : 'Animate';
    el.animBtn.setAttribute('aria-pressed', animating && moves ? 'true' : 'false');
    el.animHint.hidden = moves || wave.empty;
    el.animHint.textContent = wave.shape === 'room'
      ? 'Nothing to animate here: node sheets are exactly the places where the air does not move.'
      : 'Nothing to animate here: sand lines mark exactly the places where the plate does not move.';

    el.hearBtn.disabled = !wave.audible || !SP.Engine.isSupported();
    if (engine.playing) {
      if (wave.audible) engine.setFrequency(F.sanitize(wave.freq)); else stopTone(false);
    }
  }

  /* --------------------------------------------------------- changes */

  /* Any change to the form: redraw the preview and forget the old print file. */
  function changed(needsRefit) {
    if (needsRefit) refit = true;
    dirty = true;
    invalidateBuild();
    save();
  }

  function invalidateBuild() {
    built = null;
    el.stlBtn.disabled = true;
    el.printState.textContent = 'Not built';
    el.printState.dataset.state = '';
    el.checks.replaceChildren();
    el.printFacts.hidden = true;
    el.printMsg.hidden = true;
  }

  function setFrequency(value) {
    state.freq = F.sanitize(value, state.freq);
    changed(false);
  }

  /* ------------------------------------------------------------ print */

  function exportTitle() {
    var n = wave.numbers.join('-');
    return wave.shape + '-' + n + (wave.audible ? '-' + wave.freq.toFixed(0) + 'Hz' : '');
  }

  function buildForPrint() {
    if (wave.empty) {
      showPrintMessage('There is no form to build: these mode numbers cancel out.', 'error');
      return;
    }
    // Freeze first: the file must match what is on screen.
    if (animating && canAnimate()) { animating = false; atPeak = false; renderReadouts(); }
    el.buildBtn.disabled = true;
    el.printState.textContent = 'Building';
    // Yield once so the "Building" state paints before the heavy work starts.
    setTimeout(function () {
      try {
        var res = EXPORT[wave.shape][state.exportDetail];
        var mesh = buildMesh(sampleWave(res), res, phase, true);
        var ins = meshes.inspect(mesh);
        var p = printSettings();
        var facts = {};
        if (isFlat(wave.shape)) facts.thinnest = { mm: p.base, label: 'The base slab' };
        if (wave.shape === 'room') { facts.thinnest = { mm: p.wall, label: 'The wall' }; facts.cellMm = p.size / res; }
        var verdict = meshes.printChecks(ins, facts);
        renderChecks(verdict, ins);
        built = ins.watertight ? { mesh: mesh, name: exportTitle() } : null;
        el.stlBtn.disabled = !built;
        el.printState.textContent = verdict.ok ? 'Ready to print' : 'Needs attention';
        el.printState.dataset.state = verdict.ok ? 'ok' : 'bad';
        if (!verdict.ok && built) {
          showPrintMessage('The file can be downloaded, but fix the failed checks first unless you mean to print it this way.', '');
        }
      } catch (e) {
        el.printState.textContent = 'Failed';
        showPrintMessage('Could not build this form: ' + (e && e.message ? e.message : 'unknown error') + '. Try a lower export detail.', 'error');
      }
      el.buildBtn.disabled = false;
    }, 30);
  }

  function renderChecks(verdict, ins) {
    var frag = document.createDocumentFragment();
    verdict.checks.forEach(function (c) {
      var li = document.createElement('li');
      li.className = 'check-row';
      li.dataset.status = c.status;
      var tag = document.createElement('span');
      tag.className = 'check-tag';
      tag.textContent = { pass: 'Pass', warn: 'Note', fail: 'Fail' }[c.status];
      var body = document.createElement('span');
      var name = document.createElement('b');
      name.textContent = c.name + '. ';
      body.append(name, c.detail);
      li.append(tag, body);
      frag.appendChild(li);
    });
    el.checks.replaceChildren(frag);

    el.factSize.textContent = ins.size.map(function (v) { return v.toFixed(1); }).join(' × ') + ' mm';
    el.factVolume.textContent = (Math.abs(ins.volume) / 1000).toFixed(1) + ' cm³';
    el.factTris.textContent = ins.triangles.toLocaleString();
    el.factFile.textContent = ((84 + ins.triangles * 50) / 1048576).toFixed(1) + ' MB';
    el.printFacts.hidden = false;
  }

  function showPrintMessage(text, kind) {
    el.printMsg.textContent = text;
    el.printMsg.className = 'notice ' + (kind || '');
    el.printMsg.hidden = false;
  }

  function downloadStl() {
    if (!built) return;
    var blob = new Blob([meshes.toBinaryStl(built.mesh, built.name)], { type: 'model/stl' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'singing-plate-' + built.name + '.stl';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
    // An embedding page can forbid downloads, and the browser does not tell us.
    if (root.self !== root.top) {
      showPrintMessage('If no file appeared, this embedded view is blocking downloads. Open the app directly to export.', '');
    }
  }

  /* ------------------------------------------------------------- tone */

  function startTone() {
    if (!wave.audible || !SP.Engine.isSupported()) return;
    engine.params.freq = F.sanitize(wave.freq);
    engine.start();
    renderTone();
  }

  function stopTone(panic) {
    if (panic) engine.panic(); else engine.stop();
    renderTone();
  }

  function renderTone() {
    var on = engine.playing;
    el.hearBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    el.hearBtn.textContent = on ? 'Stop the tone' : 'Hear this frequency';
    el.status.dataset.state = on ? 'live' : 'standby';
    el.statusText.textContent = on ? 'Tone live' : 'Standby';
  }

  /* ------------------------------------------------------ pattern log */

  var records = [];

  function fillPresets() {
    var sel = el.presetSelect;
    sel.replaceChildren();
    var first = document.createElement('option');
    first.value = '';
    first.textContent = records.length ? 'Choose a logged pattern' : 'No patterns logged yet';
    sel.appendChild(first);
    records.slice().sort(function (a, b) { return a.freq - b.freq; }).forEach(function (r) {
      var opt = document.createElement('option');
      opt.value = r.id;
      opt.textContent = F.formatHz(r.freq) + ' Hz · ' + r.name;     // textContent: names are user data
      sel.appendChild(opt);
    });
    sel.disabled = state.source !== 'freq' || !records.length;
  }

  function openPreset(id) {
    for (var i = 0; i < records.length; i++) {
      if (records[i].id !== id) continue;
      state.source = 'freq';
      state.freq = records[i].freq;
      // A pattern logged on a round plate opens as a disc, any other as a square plate.
      state.shape = records[i].plate && records[i].plate.shape === 'circle' ? 'disc' : 'plate';
      refit = true;
      el.presetSelect.value = id;
      syncControls();
      changed(false);
      return true;
    }
    return false;
  }

  /* ------------------------------------------------------------ theme */

  function applyTheme(next) {
    theme = next === 'light' ? 'light' : 'dark';
    document.documentElement.dataset.theme = theme;
    var other = theme === 'dark' ? 'light' : 'dark';
    el.themeBtn.textContent = other === 'light' ? 'Light' : 'Dark';
    el.themeBtn.setAttribute('aria-label', 'Switch to ' + other + ' theme');
    var css = getComputedStyle(document.documentElement);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', css.getPropertyValue('--bg').trim());
    viewer.setTheme(theme);
    if (wave) renderColour(); else { flat.setInk(themeInk()); flat.frame(); }
  }

  function saveTheme() {
    // The theme is shared with the console, so merge it into the console's settings.
    try {
      var s = readJson(CONSOLE_KEY);
      s.theme = theme;
      localStorage.setItem(CONSOLE_KEY, JSON.stringify(s));
    } catch (e) { /* not fatal */ }
  }

  /* ------------------------------------------------------------- loop */

  function frame(t) {
    var dt = Math.min(0.1, (t - lastTime) / 1000 || 0);
    lastTime = t;
    if (dirty) rebuildPreview();
    else stepAnimation(dt);
    viewer.render();
    root.requestAnimationFrame(frame);
  }

  /* ------------------------------------------------------------- init */

  function onRadio(name, handler) {
    document.querySelectorAll('input[name="' + name + '"]').forEach(function (r) {
      r.addEventListener('change', function () { if (r.checked) handler(r.value); });
    });
  }

  function init() {
    ['status', 'statusText', 'themeBtn', 'shapeHint', 'labFreq', 'labFreqRange', 'labNote', 'freqHint',
      'presetSelect', 'modeGrid', 'modeA', 'modeB', 'modeC', 'modeALabel', 'modeBLabel', 'modeCLabel',
      'modeCField', 'modeHint', 'symmetryField', 'symALabel', 'symBLabel', 'symmetryHint', 'physField',
      'physLabel', 'physInput', 'physHint', 'reliefField', 'reliefHint', 'ampField', 'amp', 'ampOut',
      'hearBtn', 'labVolume', 'labVolumeOut', 'stage', 'stageMsg', 'formCaption', 'animBtn', 'peakBtn',
      'colorBtn', 'resList', 'resTicks', 'resHead', 'resCount', 'resHint',
      'viewReset', 'animHint', 'flat', 'flatFrame', 'flatCaption', 'sliceField', 'slice', 'sliceOut', 'pSize',
      'pSizeLabel', 'pBase', 'pBaseLabel', 'pWall', 'pWallField', 'printHint', 'pDetail', 'buildBtn',
      'stlBtn', 'checks', 'printFacts', 'factSize', 'factVolume', 'factTris', 'factFile', 'printMsg',
      'printState'
    ].forEach(function (id) { el[id] = $(id); });

    loadState();

    viewer = new SP.Viewer(el.stage);
    if (!viewer.ok) {
      el.stageMsg.textContent = 'This browser cannot show 3D here (no WebGL). The 2D pattern, the printability check and the STL export all still work.';
      el.stageMsg.hidden = false;
    }
    flat = new SP.PlateView(el.flat);
    flat.setMode('field');

    engine.params.waveform = 'sine';
    engine.params.volume = safety.DEFAULT_VOLUME;
    engine.params.ceilingDb = safety.sanitizeCeilingDb(consoleSettings.ceilingDb === undefined ? safety.DEFAULT_CEILING_DB : consoleSettings.ceilingDb);
    engine.params.lfGuard = consoleSettings.lfGuard !== false;

    applyTheme(theme);
    syncControls();
    wave = resolveWave();
    renderTone();

    /* form */
    onRadio('shape', function (v) { state.shape = v; syncControls(); changed(true); });
    onRadio('source', function (v) {
      // Carry the current wave across, so switching mode never jumps the form.
      if (v === 'mode' && wave) {
        if (state.shape === 'plate') { state.plate.m = wave.numbers[0]; state.plate.n = wave.numbers[1]; state.plate.sign = 1; }
        if (state.shape === 'disc') state.disc = disc.sanitizeMode(wave.numbers[0], wave.numbers[1]);
        if (state.shape === 'sphere') { state.sphere.l = wave.numbers[0]; state.sphere.m = wave.numbers[1]; }
        if (state.shape === 'room') state.room.n = wave.numbers.slice();
        if (state.shape === 'torus') { state.torus.m = wave.numbers[0]; state.torus.n = wave.numbers[1]; }
      } else if (v === 'freq' && wave && wave.audible) {
        state.freq = F.sanitize(wave.freq, state.freq);
      }
      state.source = v;
      syncControls();
      changed(false);
    });
    onRadio('relief', function (v) { state.relief = v; syncControls(); changed(false); });
    onRadio('detail', function (v) { state.detail = Number(v) | 0; changed(false); });
    onRadio('symmetry', function (v) {
      if (state.shape === 'plate') state.plate.sign = v === 'b' ? -1 : 1;
      else if (state.shape === 'torus') state.torus.rotating = v === 'a';
      else state.room.blend = v === 'a';
      changed(false);
    });

    el.labFreq.addEventListener('change', function () { setFrequency(el.labFreq.value); });
    el.labFreqRange.addEventListener('input', function () {
      setFrequency(Math.round(F.dialToFreq(Number(el.labFreqRange.value) / 1000)));
    });
    el.presetSelect.addEventListener('change', function () { if (el.presetSelect.value) openPreset(el.presetSelect.value); });

    function readModes() {
      var a = el.modeA.value, b = el.modeB.value, c = el.modeC.value;
      if (state.shape === 'plate') {
        state.plate.m = num(a, state.plate.m, 0, 12) | 0;
        state.plate.n = num(b, state.plate.n, 0, 12) | 0;
      } else if (state.shape === 'disc') {
        state.disc = disc.sanitizeMode(num(a, state.disc.n, 0, disc.N_MAX), num(b, state.disc.s, 0, disc.S_MAX));
      } else if (state.shape === 'sphere') {
        if (state.source === 'mode') state.sphere.l = num(a, state.sphere.l, forms.DEGREE_MIN, forms.DEGREE_MAX) | 0;
        state.sphere.m = num(b, state.sphere.m, 0, forms.DEGREE_MAX) | 0;
      } else if (state.shape === 'torus') {
        var tm = forms.sanitizeTorusMode(num(a, state.torus.m, 0, 12), num(b, state.torus.n, 0, 12));
        state.torus.m = tm.m; state.torus.n = tm.n;
      } else {
        state.room.n = forms.sanitizeRoomMode([num(a, 0, 0, 12), num(b, 0, 0, 12), num(c, 0, 0, 12)]);
      }
      changed(false);
    }
    [el.modeA, el.modeB, el.modeC].forEach(function (input) { input.addEventListener('change', readModes); });

    el.physInput.addEventListener('change', function () {
      if (state.shape === 'sphere') state.sphere.radiusMm = num(el.physInput.value, state.sphere.radiusMm, 0.2, 20);
      else if (state.shape === 'room') state.room.sideCm = num(el.physInput.value, state.room.sideCm, 5, 500);
      else if (state.shape === 'torus') state.torus.ringCm = num(el.physInput.value, state.torus.ringCm, 2, 500);
      syncControls();
      changed(false);
    });
    el.amp.addEventListener('input', function () {
      state.amp = Number(el.amp.value) / 100;
      syncControls();
      changed(false);
    });
    el.slice.addEventListener('input', function () {
      state.slice = Number(el.slice.value) / 100;
      el.sliceOut.textContent = el.slice.value + '%';
      renderFlat();
      save();
    });

    /* viewer */
    el.animBtn.addEventListener('click', function () {
      animating = !animating;
      if (!animating) atPeak = false;
      invalidateBuild();
      renderReadouts();
    });
    el.peakBtn.addEventListener('click', function () {
      animating = false;
      atPeak = true;
      changed(false);
    });
    el.viewReset.addEventListener('click', function () { viewer.resetView(); });
    el.resList.addEventListener('click', function (e) {
      var chip = e.target.closest('.chip');
      if (chip) chooseResonance(resTable[Number(chip.dataset.index)]);
    });
    el.colorBtn.addEventListener('click', function () {
      colourOn = !colourOn;
      renderColour();
      // Colour is one setting shared with the console.
      try {
        var s = readJson(CONSOLE_KEY);
        s.color = colourOn;
        localStorage.setItem(CONSOLE_KEY, JSON.stringify(s));
      } catch (e) { /* not fatal */ }
    });

    /* print */
    function readPrint() {
      var p = printSettings();
      p.size = num(el.pSize.value, p.size, 10, 400);
      p.base = num(el.pBase.value, p.base, 0, 50);
      p.wall = num(el.pWall.value, p.wall, 0.2, 20);
      syncControls();
      changed(true);
    }
    [el.pSize, el.pBase, el.pWall].forEach(function (input) { input.addEventListener('change', readPrint); });
    el.pDetail.addEventListener('change', function () {
      state.exportDetail = Number(el.pDetail.value) | 0;
      invalidateBuild();
      save();
    });
    el.buildBtn.addEventListener('click', buildForPrint);
    el.stlBtn.addEventListener('click', downloadStl);

    /* tone */
    el.hearBtn.addEventListener('click', function () { if (engine.playing) stopTone(false); else startTone(); });
    el.labVolume.addEventListener('input', function () {
      engine.setVolume(Number(el.labVolume.value) / 100);
      el.labVolumeOut.textContent = el.labVolume.value + '%';
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && engine.playing) { stopTone(true); e.preventDefault(); }
    });

    /* chrome */
    el.themeBtn.addEventListener('click', function () {
      applyTheme(theme === 'dark' ? 'light' : 'dark');
      saveTheme();
    });
    root.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') flush();
    });

    /* pattern log: fill the picker, and honour a link from the console */
    SP.Store.open().then(function (s) {
      store = s;
      return store.list();
    }).then(function (list) {
      records = list;
      fillPresets();
      var m = /^#log=(.+)$/.exec(root.location.hash);
      if (m) openPreset(decodeURIComponent(m[1]));
      // The link has done its job: drop it so a reload keeps the current form.
      if (m && root.history && root.history.replaceState) {
        try { root.history.replaceState(null, '', root.location.pathname + root.location.search); } catch (e) { /* not fatal */ }
      }
    }).catch(function () { fillPresets(); });

    root.requestAnimationFrame(frame);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  // Exposed for debugging from the browser console; not a public API.
  SP.lab = {
    state: state,
    engine: engine,
    current: function () { return { wave: wave, preview: preview, built: built, phase: phase, animating: animating }; }
  };
})(typeof self !== 'undefined' ? self : this);
