/*
 * ui/app.js -- wires the console together.
 *
 * One state object, one way in for frequency changes (setFrequency), and one
 * animation loop that keeps the readouts honest. Everything clever lives in
 * core/ and audio/; this file only connects controls to it.
 */
(function (root) {
  'use strict';

  var SP = root.SP;
  var F = SP.freq, safety = SP.safety, chladni = SP.chladni, disc = SP.disc;
  var color = SP.color, rel = SP.relations;
  var SETTINGS_KEY = 'singing-plate:v1';
  var SIM_SIZE = 160;
  var METER_FLOOR_DB = -48;

  function $(id) { return document.getElementById(id); }

  /* ------------------------------------------------------------ state */

  var state = {
    freq: 440,
    waveform: 'sine',
    volume: safety.DEFAULT_VOLUME,
    ceilingDb: safety.DEFAULT_CEILING_DB,
    lfGuard: true,
    theme: 'dark',
    color: false,            // show frequencies as colours; off keeps the console monochrome
    pulseRate: 7.8,
    mathCap: 0.1,            // microfarads, for the tuned-circuit card
    view: root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'field' : 'sand',
    sort: 'newest',
    sweep: { from: 100, to: 3000, rate: 5 },
    plate: chladni.sanitizePlate(chladni.DEFAULT_PLATE)
  };

  var engine = new SP.Engine();
  var sweep = new SP.sweep.Sweep(state.sweep);
  var store = null;
  var records = [];
  var modes = [];
  var plateC = chladni.plateConstant(state.plate);
  var nearest = null;
  var simDirty = true;
  var simLastCompute = 0;
  var simField = new Float32Array(SIM_SIZE * SIM_SIZE);
  var simVisible = true;
  var ink = { fg: '#f2f2f2', mute: '#8f8f8f', faint: '#5a5a5a', danger: '#e5534b' };

  function loadSettings() {
    try {
      var s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
      if (!s || typeof s !== 'object') return;
      state.freq = F.sanitize(s.freq, state.freq);
      state.waveform = safety.sanitizeWaveform(s.waveform);
      state.ceilingDb = safety.sanitizeCeilingDb(s.ceilingDb === undefined ? state.ceilingDb : s.ceilingDb);
      if (typeof s.lfGuard === 'boolean') state.lfGuard = s.lfGuard;
      if (s.theme === 'light' || s.theme === 'dark') state.theme = s.theme;
      if (typeof s.color === 'boolean') state.color = s.color;
      if (isFinite(Number(s.pulseRate)) && s.pulseRate > 0) state.pulseRate = Math.min(40, Math.max(0.1, Number(s.pulseRate)));
      if (isFinite(Number(s.mathCap)) && s.mathCap > 0) state.mathCap = Number(s.mathCap);
      if (s.view === 'sand' || s.view === 'field') state.view = s.view;
      if (s.sort === 'newest' || s.sort === 'freq') state.sort = s.sort;
      if (s.sweep) { sweep.configure(s.sweep); syncSweepState(); }
      if (s.plate) state.plate = chladni.sanitizePlate(s.plate);
      // Volume is deliberately not restored: every session starts low.
    } catch (e) { /* storage unavailable or corrupt: defaults stand */ }
  }

  var saveTimer = null;
  function saveSettings() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flushSettings, 250);
  }

  /* Write now. Also called as the page is hidden, so a last change is never lost. */
  function flushSettings() {
    clearTimeout(saveTimer);
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({
        freq: state.freq, waveform: state.waveform, ceilingDb: state.ceilingDb,
        lfGuard: state.lfGuard, theme: state.theme, view: state.view, sort: state.sort,
        color: state.color, pulseRate: state.pulseRate, mathCap: state.mathCap,
        sweep: state.sweep, plate: state.plate
      }));
    } catch (e) { /* not fatal */ }
  }

  function syncSweepState() {
    state.sweep = { from: sweep.from, to: sweep.to, rate: sweep.rate };
  }

  /* -------------------------------------------------------- frequency */

  var el = {};
  var dial = null;
  var plateView = null;

  /* The single entry point for any manual frequency change. */
  function setFrequency(value) {
    var f = F.sanitize(value, state.freq);
    if (sweep.state === 'running') lockSweep();   // the operator has taken the controls
    state.freq = f;
    engine.setFrequency(f);
    renderFrequency();
    saveSettings();
  }

  function renderFrequency() {
    var f = state.freq;
    var note = F.noteInfo(f);
    var text = F.formatHz(f);
    el.freqBig.textContent = text;
    el.noteName.textContent = note.label;
    el.noteCents.textContent = F.formatCents(note.cents);
    el.wavelength.textContent = F.formatLength(F.wavelength(f));
    el.period.textContent = formatPeriod(F.periodMs(f));
    el.ripple.textContent = F.formatLength(SP.liquid.rippleWavelength(f));
    if (document.activeElement !== el.freqInput) el.freqInput.value = text;
    dial.set(F.freqToDial(f));
    el.dial.setAttribute('aria-valuenow', text);
    el.dial.setAttribute('aria-valuetext', text + ' hertz, ' + note.label);
    renderCapture();
    renderNearest();
    renderGuard();
    renderToneColour();
    renderMath();
    renderLife();
    simDirty = true;
  }

  function formatPeriod(ms) {
    return ms >= 10 ? ms.toFixed(1) + ' ms' : ms >= 1 ? ms.toFixed(2) + ' ms' : (ms * 1000).toFixed(0) + ' µs';
  }

  function renderGuard() {
    var below = state.freq < safety.LF_KNEE_HZ;
    var note = el.guardNote;
    var high = safety.hfCaution(state.freq);
    if (high) {
      note.textContent = high === 'unheard'
        ? 'You may barely hear this, but children and pets hear it clearly. Do not turn it up because it sounds quiet.'
        : 'Piercing at any useful level, and hard on small speakers. Keep the volume low and the session short.';
      note.hidden = false;
      return;
    }
    var infra = safety.isInfrasound(state.freq);
    el.pulseOffer.hidden = !infra;
    if (!below) { note.hidden = true; return; }
    var guard = state.lfGuard
      ? 'Driver guard is holding level back by ' + Math.abs(safety.linToDb(safety.lfGuardFactor(state.freq, true))).toFixed(1) + ' dB at this frequency.'
      : 'Below 60 Hz with the guard off. Keep it quiet and keep it short: this is where drivers overheat.';
    note.textContent = infra
      ? 'Below 20 Hz is infrasound. You will not hear it as a pitch, and most speakers and many amplifiers cannot produce it at all. On the rig it can still shake the plate. ' + guard
      : guard;
    note.hidden = false;
  }

  /* ----------------------------------------------------------- colour */

  var toneHex = null;        // colour of the current frequency while Colour is on

  /* Called on every frequency change: keeps --tone and the sand in step. */
  function renderToneColour() {
    if (!state.color) { toneHex = null; return; }
    var t = color.tone(state.freq);
    toneHex = t.hex;
    document.documentElement.style.setProperty('--tone', t.hex);
    if (plateView) plateView.setInk(t.rgb);
  }

  /* Switch colour on or off everywhere it applies. Off restores the monochrome console exactly. */
  function applyColor(on) {
    state.color = !!on;
    document.documentElement.dataset.color = state.color ? 'on' : 'off';
    el.colorBtn.setAttribute('aria-pressed', state.color ? 'true' : 'false');
    if (!state.color) {
      document.documentElement.style.removeProperty('--tone');
      toneHex = null;
      if (plateView) plateView.setInk(state.color ? color.tone(state.freq).rgb : parseColor(ink.fg));
    drawLissajous();
    }
    // Each species' band becomes the stretch of spectrum it covers.
    Array.prototype.forEach.call(el.lifeList.children, function (li) {
      var bar = li.querySelector('.life-bar');
      bar.style.background = state.color ? color.gradient(Number(bar.dataset.lo), Number(bar.dataset.hi)) : '';
    });
    renderToneColour();
    renderMath();
    drawLissajous();
    saveSettings();
  }

  /* ------------------------------------------------------------- math */

  var mathBuilt = false;
  var mathInterval = 5;      // the fifth
  var harmonicSet = [];

  function buildMath() {
    // Harmonics: three below, then the note and seven above.
    var frag = document.createDocumentFragment();
    harmonicSet = rel.subharmonics(1, 3).reverse().map(function (h) { return { label: 'f ÷ ' + h.n, k: 1 / h.n }; })
      .concat(rel.harmonics(1, 8).map(function (h) { return { label: h.n === 1 ? 'f' : h.n + ' f', k: h.n }; }));
    harmonicSet.forEach(function (h, i) {
      var chip = make('button', 'chip');
      chip.type = 'button';
      chip.dataset.index = i;
      chip.appendChild(make('span', 'chip-dot'));
      chip.appendChild(make('span', '', h.label + ' '));
      chip.appendChild(make('small'));
      frag.appendChild(chip);
    });
    el.mHarmonics.replaceChildren(frag);
    el.mHarmonics.addEventListener('click', function (e) {
      var chip = e.target.closest('.chip');
      if (!chip || chip.dataset.off === 'true') return;
      setFrequency(state.freq * harmonicSet[Number(chip.dataset.index)].k);
    });

    var ints = document.createDocumentFragment();
    rel.INTERVALS.forEach(function (iv, i) {
      var chip = make('button', 'chip');
      chip.type = 'button';
      chip.dataset.index = i;
      chip.appendChild(make('span', 'chip-dot'));
      chip.appendChild(make('span', '', iv.name + ' '));
      chip.appendChild(make('small', '', iv.a + ':' + iv.b));
      ints.appendChild(chip);
    });
    el.mIntervals.replaceChildren(ints);
    el.mIntervals.addEventListener('click', function (e) {
      var chip = e.target.closest('.chip');
      if (!chip) return;
      mathInterval = Number(chip.dataset.index);
      renderMath();
      drawLissajous();
    });
    el.mIntervalTune.addEventListener('click', function () {
      setFrequency(state.freq * rel.INTERVALS[mathInterval].ratio);
    });

    // The Earth: textbook cavity against what is measured.
    var rows = document.createDocumentFragment();
    rel.EARTH.measured.forEach(function (hz, i) {
      var tr = make('tr');
      tr.appendChild(make('th', '', String(i + 1)));
      tr.querySelector('th').scope = 'row';
      tr.appendChild(make('td', '', rel.EARTH.ideal(i + 1).toFixed(1) + ' Hz'));
      tr.appendChild(make('td', '', hz + ' Hz'));
      var td = make('td');
      var btn = make('button', 'btn', 'Tune');
      btn.type = 'button';
      btn.dataset.tune = hz;
      btn.setAttribute('aria-label', 'Tune to ' + hz + ' hertz, Earth resonance mode ' + (i + 1));
      td.appendChild(btn);
      tr.appendChild(td);
      rows.appendChild(tr);
    });
    el.mEarth.querySelector('tbody').replaceChildren(rows);
    el.mEarth.addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-tune]');
      if (btn) setFrequency(Number(btn.dataset.tune));
    });
    el.mCircuit.textContent = rel.EARTH.circuit.toFixed(2);

    el.mCap.value = state.mathCap;
    el.mCap.addEventListener('change', function () {
      var v = Number(el.mCap.value);
      state.mathCap = isFinite(v) && v > 0 ? v : state.mathCap;
      el.mCap.value = state.mathCap;
      renderMath();
      saveSettings();
    });
    mathBuilt = true;
  }

  /* Called on every frequency change, so it only rewrites text and a few styles. */
  function renderMath() {
    if (!mathBuilt) return;
    var f = state.freq;
    el.mOmega.textContent = rel.formatSI(rel.angular(f), 'rad/s') + ' · one turn every ' + formatPeriod(F.periodMs(f));

    var t = color.tone(f);
    el.mOctaves.textContent = t.octaves;
    el.mLight.textContent = t.thz.toFixed(1) + ' THz · ' + t.nm.toFixed(0) + ' nm · ' + t.name;
    el.mSwatch.style.background = t.hex;

    var em = rel.emWavelength(f);
    el.mEm.textContent = rel.formatSI(em, 'm') + ' long';
    el.mEmNote.textContent = 'The same number of cycles a second, carried by an electromagnetic field and not by air, moves at the speed of light. Each wave is then about ' +
      Math.round(rel.C_LIGHT / rel.C_SOUND).toLocaleString('en-US') + ' times longer than the sound. Radio at this frequency is called ' +
      rel.emBand(f) + ', and a quarter-wave aerial for it would be ' + rel.formatSI(rel.quarterWave(f), 'm') + ' long.';

    el.mCoil.textContent = 'needs a coil of ' + rel.formatSI(rel.lcInductance(f, state.mathCap * 1e-6), 'H');

    Array.prototype.forEach.call(el.mHarmonics.children, function (chip, i) {
      var hz = f * harmonicSet[i].k;
      var ok = hz >= F.F_MIN && hz <= F.F_MAX;
      chip.dataset.off = ok ? 'false' : 'true';
      chip.disabled = !ok;
      chip.lastChild.textContent = (hz >= 1000 ? (hz / 1000).toFixed(2) + ' kHz' : hz.toFixed(1) + ' Hz') + (ok ? ' · ' + F.noteInfo(hz).label : '');
      if (harmonicSet[i].k === 1) chip.setAttribute('aria-current', 'true');
      chip.firstChild.style.background = color.tone(hz).hex;
    });

    var iv = rel.INTERVALS[mathInterval];
    var target = f * iv.ratio;
    Array.prototype.forEach.call(el.mIntervals.children, function (chip, i) {
      if (i === mathInterval) chip.setAttribute('aria-current', 'true'); else chip.removeAttribute('aria-current');
      chip.firstChild.style.background = color.tone(f * rel.INTERVALS[i].ratio).hex;
    });
    el.mIntervalText.textContent = iv.name + ' above ' + F.formatHz(f) + ' Hz is ' + target.toFixed(1) + ' Hz · ' +
      iv.a + ':' + iv.b + ' · ' + Math.round(iv.cents) + ' cents';
    el.mIntervalTune.disabled = target > F.F_MAX || iv.ratio === 1;
  }

  /* The figure for the chosen ratio. Redrawn only when the ratio, theme or colour changes. */
  function drawLissajous() {
    if (!mathBuilt) return;
    var iv = rel.INTERVALS[mathInterval];
    var c = el.mLissajous, ctx = c.getContext('2d');
    var w = c.width, pad = 26, half = w / 2 - pad;
    ctx.clearRect(0, 0, w, w);
    var pts = rel.lissajous(iv.a, iv.b, Math.PI / 2, 900);
    ctx.strokeStyle = toneHex || ink.fg;
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (var i = 0; i < pts.length; i += 2) {
      var x = w / 2 + pts[i] * half, y = w / 2 - pts[i + 1] * half;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    c.setAttribute('aria-label', 'Lissajous figure for the ratio ' + iv.a + ' to ' + iv.b + ', the ' + iv.name.toLowerCase());
  }

  /* ------------------------------------------------------------ pulse */

  function pulseRate() {
    var v = Number(el.pulseRate.value);
    return isFinite(v) && v > 0 ? Math.min(40, Math.max(0.1, Math.round(v * 10) / 10)) : state.pulseRate;
  }

  function applyPulse() {
    state.pulseRate = pulseRate();
    el.pulseRate.value = state.pulseRate;
    engine.setPulse(el.pulseOn.checked ? state.pulseRate : 0);
    saveSettings();
  }

  /* Swap an inaudible tone for an audible one that throbs at the same rate. */
  function hearAsPulse() {
    el.pulseRate.value = Math.min(40, Math.max(0.1, state.freq));
    el.pulseOn.checked = true;
    applyPulse();
    setFrequency(220);
  }

  /* ------------------------------------------------------------- life */

  var lifeActive = null;

  /* Build the species rows once; renderLife() then only moves the cursor and highlights. */
  function buildLife() {
    var life = SP.life;
    var frag = document.createDocumentFragment();
    life.SIGNALS.forEach(function (s) {
      var li = make('li', 'life-row');
      li.dataset.id = s.id;

      var name = make('div');
      name.appendChild(make('div', 'life-who', s.who));
      name.appendChild(make('div', 'life-sub', s.signal + ' · ' + life.formatBand(s)));
      if (s.evidence !== 'documented') name.appendChild(make('div', 'life-tag', life.EVIDENCE[s.evidence]));
      li.appendChild(name);

      var band = life.playable(s);
      var track = make('div', 'life-track');
      var bar = make('div', 'life-bar');
      var left = F.freqToDial(band.lo) * 100, right = F.freqToDial(band.hi) * 100;
      bar.dataset.lo = band.lo;
      bar.dataset.hi = band.hi;
      bar.style.left = left + '%';
      bar.style.width = Math.max(0, right - left) + '%';
      var open = (s.lo < band.lo ? 'lo ' : '') + (s.hi > band.hi ? 'hi' : '');
      if (open.trim()) bar.dataset.open = open.trim();
      track.appendChild(bar);
      li.appendChild(track);

      var tune = make('button', 'btn', 'Tune');
      tune.type = 'button';
      tune.dataset.tune = s.tune;
      tune.setAttribute('aria-label', 'Tune to ' + s.tune + ' hertz, in the band of the ' + s.who);
      li.appendChild(tune);

      li.appendChild(make('p', 'life-note', s.note));
      frag.appendChild(li);
    });
    el.lifeList.replaceChildren(frag);

    var scale = document.createDocumentFragment();
    [[20, '20'], [50, '50'], [100, '100'], [200, '200'], [500, '500'], [1000, '1k'], [2000, '2k'], [5000, '5k'], [10000, '10k'], [20000, '20k']].forEach(function (t) {
      var tick = make('span', '', t[1]);
      tick.style.left = F.freqToDial(t[0]) * 100 + '%';
      scale.appendChild(tick);
    });
    el.lifeScale.replaceChildren(scale);

    var beyond = document.createDocumentFragment();
    life.BEYOND.forEach(function (b) {
      var wrap = make('div');
      var dt = make('dt', '', b.who + ' ');
      dt.appendChild(make('span', '', '· ' + b.band));
      wrap.appendChild(dt);
      var dd = make('dd', '', b.note);
      appendSims(dd, b);
      wrap.appendChild(dd);
      beyond.appendChild(wrap);
    });
    el.lifeBeyond.replaceChildren(beyond);
    buildBeyondEarth();

    // One handler for every Simulate button on the panel.
    el.life.addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-sim]');
      if (!btn) return;
      simActive = { hz: Number(btn.dataset.sim), text: btn.dataset.simText };
      setFrequency(simActive.hz);
    });

    el.lifeList.addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-tune]');
      if (btn) setFrequency(Number(btn.dataset.tune));
    });
  }

  var simActive = null;     // the simulation now playing, if the frequency still matches it

  /* Add a Simulate button for each octave-shifted version an entry offers. */
  function appendSims(parent, entry) {
    if (!entry.sims || !entry.sims.length) return;
    var life = SP.life;
    var row = make('div', 'sim-row');
    entry.sims.forEach(function (sim) {
      var hz = life.simulate(sim);
      var shift = life.describeShift(sim.octaves);
      var btn = make('button', 'btn sim');
      btn.type = 'button';
      btn.appendChild(make('span', '', 'Simulate at ' + hz.toLocaleString('en-US') + ' Hz'));
      btn.appendChild(make('small', '', sim.label + ' · ' + shift));
      btn.dataset.sim = hz;
      btn.dataset.simText = sim.label + ', shifted ' + shift + ' to ' + hz.toLocaleString('en-US') +
        ' Hz. Same note, different register: the real frequency cannot be played by a speaker.';
      btn.setAttribute('aria-label', 'Simulate ' + sim.label + ' at ' + hz + ' hertz, ' + shift);
      row.appendChild(btn);
    });
    parent.appendChild(row);
  }

  /*
   * Beyond Earth: measurements in one list, claims in others. The layout
   * keeps them apart so a claim is never read as a measurement.
   */
  function buildBeyondEarth() {
    var life = SP.life;

    var search = document.createDocumentFragment();
    life.SEARCH.forEach(function (e) {
      var wrap = make('div');
      var dt = make('dt', '', e.what + ' ');
      dt.appendChild(make('span', '', '· ' + e.band));
      dt.appendChild(make('small', '', e.when));
      wrap.appendChild(dt);
      var dd = make('dd', '', e.note);
      appendSims(dd, e);
      wrap.appendChild(dd);
      search.appendChild(wrap);
    });
    el.searchList.replaceChildren(search);

    var reports = document.createDocumentFragment();
    life.REPORTS.forEach(function (r) {
      var li = make('li', 'report');
      li.appendChild(make('div', 'report-who', r.who));
      li.appendChild(make('div', 'life-tag', life.EVIDENCE.claim));
      var dl = make('dl');
      [['Home', r.home], ['Where the account comes from', r.source],
        ['Said to communicate by', r.mode], ['Frequency', r.frequency]].forEach(function (row) {
        var wrap = make('div');
        wrap.appendChild(make('dt', '', row[0]));
        wrap.appendChild(make('dd', '', row[1]));
        dl.appendChild(wrap);
      });
      li.appendChild(dl);
      reports.appendChild(li);
    });
    el.reportList.replaceChildren(reports);

    var accounts = document.createDocumentFragment();
    life.ACCOUNTS.forEach(function (a) {
      var li = make('li', 'account');
      var head = make('div');
      head.appendChild(make('div', 'account-what', a.what));
      head.appendChild(make('div', 'account-freq', a.frequency));
      head.appendChild(make('div', 'life-tag', a.tag || life.EVIDENCE.claim));
      li.appendChild(head);
      if (a.tune !== undefined) {
        var tune = make('button', 'btn', 'Tune to ' + a.tune.toLocaleString('en-US') + ' Hz');
        tune.type = 'button';
        tune.dataset.tune = a.tune;
        li.appendChild(tune);
      } else {
        li.appendChild(make('span'));
      }
      li.appendChild(make('p', 'account-note', a.note));
      appendSims(li, a);
      accounts.appendChild(li);
    });
    el.accountList.replaceChildren(accounts);
    el.accountList.addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-tune]');
      if (btn) setFrequency(Number(btn.dataset.tune));
    });
  }

  /* Called on every frequency change, sweeps included, so it does as little as it can. */
  function renderLife() {
    if (!el.lifeList) return;
    // The simulation note stays only while the console is still on that frequency.
    if (simActive && simActive.hz !== state.freq) simActive = null;
    el.simNote.hidden = !simActive;
    if (simActive) el.simNote.textContent = 'Simulation: ' + simActive.text;
    el.lifeList.style.setProperty('--cursor', (F.freqToDial(state.freq) * 100).toFixed(2) + '%');
    var active = SP.life.activeAt(state.freq);
    var key = active.map(function (s) { return s.id; }).join(',');
    if (key === lifeActive) return;
    lifeActive = key;
    Array.prototype.forEach.call(el.lifeList.children, function (li) {
      li.dataset.active = key.split(',').indexOf(li.dataset.id) !== -1 ? 'true' : 'false';
    });
    el.lifeNow.textContent = active.length
      ? 'This frequency is in the band of: ' + active.map(function (s) { return s.who; }).join(', ') + '.'
      : 'Nobody on this list signals at this frequency. Tune to a band below to see who does.';
  }

  /* ------------------------------------------------------------- tone */

  function startTone() {
    if (!SP.Engine.isSupported()) return;
    engine.start();
    renderTone();
  }

  function stopTone(panic) {
    if (sweep.state === 'running') lockSweep();
    if (panic) engine.panic(); else engine.stop();
    renderTone();
  }

  function toggleTone() {
    if (engine.playing) stopTone(false); else startTone();
  }

  function renderTone() {
    var on = engine.playing;
    el.toneBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    el.toneText.textContent = on ? 'Cease tone' : 'Engage tone';
    el.outState.textContent = on ? 'Live' : 'Silent';
    el.outState.dataset.on = on ? 'true' : 'false';
    renderStatus();
  }

  function renderStatus() {
    var s = 'standby', text = 'Standby';
    if (engine.playing) {
      if (sweep.state === 'running') { s = 'sweep'; text = 'Sweeping'; }
      else if (sweep.state === 'paused') { s = 'locked'; text = 'Locked on'; }
      else { s = 'live'; text = 'Tone live'; }
    }
    el.status.dataset.state = s;
    el.statusText.textContent = text;
  }

  function setVolume(v) {
    state.volume = safety.sanitizeVolume(v);
    engine.setVolume(state.volume);
    el.volume.value = Math.round(state.volume * 100);
    el.volumeOut.textContent = Math.round(state.volume * 100) + '%';
  }

  function setCeiling(db) {
    state.ceilingDb = safety.sanitizeCeilingDb(db);
    engine.setCeilingDb(state.ceilingDb);
    el.ceiling.value = state.ceilingDb;
    el.ceilingOut.textContent = formatDb(state.ceilingDb, 0) + ' dBFS';
    el.meterCeil.style.left = 'calc(' + meterPos(state.ceilingDb) + '% - 2px)';
    saveSettings();
  }

  function formatDb(db, digits) {
    if (!isFinite(db)) return '−∞';
    var d = db.toFixed(digits);
    return Number(d) < 0 ? '−' + d.slice(1) : Number(d) === 0 ? (0).toFixed(digits) : '+' + d;
  }

  function meterPos(db) {
    return Math.min(100, Math.max(0, (db - METER_FLOOR_DB) / -METER_FLOOR_DB * 100));
  }

  function setWaveform(w) {
    state.waveform = safety.sanitizeWaveform(w);
    engine.setWaveform(state.waveform);
    var radio = document.querySelector('input[name="wave"][value="' + state.waveform + '"]');
    if (radio) radio.checked = true;
    renderCapture();
    saveSettings();
  }

  /* ------------------------------------------------------------ sweep */

  function readSweepInputs() {
    sweep.configure({ from: boxValue(el.swFrom), to: boxValue(el.swTo), rate: boxValue(el.swRate) });
    syncSweepState();
    el.swFrom.value = trimNumber(sweep.from);
    el.swTo.value = trimNumber(sweep.to);
    el.swRate.value = trimNumber(sweep.rate);
    saveSettings();
  }

  function trimNumber(n) { return String(Number(n.toFixed(1))); }

  /* A blank number box means "no change", not zero. */
  function boxValue(input) { return input.value.trim() === '' ? NaN : Number(input.value); }

  /* The S key and the main sweep button: start, lock or resume. */
  function sweepGo() {
    if (!SP.Engine.isSupported()) return;
    if (sweep.state === 'running') { lockSweep(); return; }
    readSweepInputs();
    if (!engine.playing) startTone();
    var now = engine.now();
    if (sweep.state === 'paused') sweep.resume(now, state.freq);
    else sweep.start(now);
    var plan = sweep.plan(now);
    engine.sweep(plan.from, plan.to, plan.duration);
    state.freq = F.sanitize(plan.from, state.freq);
    renderFrequency();
    renderSweep();
  }

  /* Freeze the sweep on the frequency sounding right now; the tone holds. */
  function lockSweep() {
    if (sweep.state !== 'running') return;
    var held = sweep.pause(engine.now());
    state.freq = F.sanitize(held, state.freq);
    engine.setFrequency(state.freq);
    renderFrequency();
    renderSweep();
    saveSettings();
  }

  function sweepReset() {
    if (sweep.state === 'running') lockSweep();
    sweep.reset();
    renderSweep();
  }

  /* Sweep settings changed mid-flight: re-plan from where we are. */
  function sweepRetarget() {
    var wasRunning = sweep.state === 'running';
    if (wasRunning) sweep.pause(engine.now());
    readSweepInputs();
    if (wasRunning) {
      var now = engine.now();
      sweep.resume(now);
      var plan = sweep.plan(now);
      engine.sweep(plan.from, plan.to, plan.duration);
    }
    renderSweepTicks();
    renderSweep();
  }

  function renderSweep() {
    var s = sweep.state;
    var labels = { idle: 'Ready', running: 'Sweeping', paused: 'Locked', done: 'Complete' };
    el.swState.textContent = labels[s];
    el.swState.dataset.state = s;
    var go = { idle: 'Start sweep', running: 'Lock on pattern', paused: 'Resume sweep', done: 'Run again' }[s];
    el.swGo.firstChild.nodeValue = go + ' ';
    el.swReset.disabled = s === 'idle';
    el.swSpan.textContent = trimNumber(sweep.from) + ' → ' + trimNumber(sweep.to) + ' Hz';
    el.swHint.hidden = s === 'paused';
    renderSweepProgress();
    renderStatus();
  }

  function renderSweepProgress() {
    var s = sweep.state;
    var f = s === 'idle' ? sweep.from : s === 'done' ? sweep.to : state.freq;
    var pos = sweep.position(f) * 100;
    el.swFill.style.width = pos + '%';
    el.swHead.style.left = 'calc(' + pos + '% - 1px)';
    var left = s === 'idle' ? sweep.duration() : s === 'done' ? 0 : Math.abs(sweep.to - f) / sweep.rate;
    el.swEta.textContent = SP.sweep.formatEta(left);
  }

  /* Mark where the model expects resonances along the sweep's path. */
  function renderSweepTicks() {
    var lo = Math.min(sweep.from, sweep.to), hi = Math.max(sweep.from, sweep.to);
    var frag = document.createDocumentFragment();
    modes.forEach(function (m) {
      if (m.f < lo || m.f > hi) return;
      var tick = document.createElement('span');
      tick.style.left = (sweep.position(m.f) * 100) + '%';
      frag.appendChild(tick);
    });
    el.swTicks.replaceChildren(frag);
  }

  /* -------------------------------------------------------- simulator */

  function isRound() { return state.plate.shape === 'circle'; }

  function rebuildModes() {
    plateC = chladni.plateConstant(state.plate);
    // A centre-driven round plate rings in concentric circles; a square one in the classic figures.
    modes = isRound()
      ? disc.modeTable(state.plate, F.F_MIN, F.F_MAX)
      : chladni.modeTable(plateC, F.F_MIN, F.F_MAX);
    nearest = null;
    el.plShape.value = state.plate.shape;
    el.plSideLabel.textContent = isRound() ? 'Diameter, cm' : 'Side, cm';
    el.plate.parentNode.classList.toggle('round', isRound());
    plateView.setRound(isRound());
    var frag = document.createDocumentFragment();
    modes.forEach(function (m, i) {
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip';
      chip.dataset.index = i;
      chip.append(m.label + ' ');
      var hz = document.createElement('small');
      hz.textContent = m.f.toFixed(0) + ' Hz';
      chip.appendChild(hz);
      chip.setAttribute('aria-label', 'Mode ' + m.label + ', go to ' + m.f.toFixed(1) + ' hertz');
      frag.appendChild(chip);
    });
    el.modeList.replaceChildren(frag);
    el.modeCount.textContent = modes.length ? '· ' + modes.length + ' in range' : '· none in range';
    el.trimOut.textContent = '×' + state.plate.trim.toFixed(3);
    renderSweepTicks();
    renderNearest();
    simDirty = true;
  }

  function renderNearest() {
    var mode = chladni.nearestMode(modes, state.freq);
    if (!mode) {
      el.simMode.textContent = 'None';
      el.simModeHz.textContent = 'in the 1 Hz to 20 kHz range';
      el.simDelta.textContent = '--';
      el.jumpBtn.disabled = el.alignBtn.disabled = true;
      nearest = null;
      return;
    }
    el.jumpBtn.disabled = el.alignBtn.disabled = false;
    el.simMode.textContent = mode.label;
    el.simModeHz.textContent = 'at ' + mode.f.toFixed(1) + ' Hz';
    var delta = state.freq - mode.f;
    el.simDelta.textContent = (Math.abs(delta) < 0.05 ? '±' : delta > 0 ? '+' : '−') + Math.abs(delta).toFixed(1) + ' Hz';
    if (mode !== nearest) {
      var prev = el.modeList.querySelector('[aria-current="true"]');
      if (prev) prev.removeAttribute('aria-current');
      var chip = el.modeList.children[modes.indexOf(mode)];
      if (chip) chip.setAttribute('aria-current', 'true');
      nearest = mode;
    }
  }

  function readPlateInputs() {
    state.plate = chladni.sanitizePlate({
      shape: el.plShape.value,
      sideCm: isFinite(boxValue(el.plSide)) ? boxValue(el.plSide) : state.plate.sideCm,
      thicknessMm: isFinite(boxValue(el.plThick)) ? boxValue(el.plThick) : state.plate.thicknessMm,
      material: el.plMaterial.value,
      trim: state.plate.trim
    });
    el.plSide.value = state.plate.sideCm;
    el.plThick.value = state.plate.thicknessMm;
    rebuildModes();
    saveSettings();
  }

  function setTrim(trim) {
    state.plate = chladni.sanitizePlate({
      shape: state.plate.shape,
      sideCm: state.plate.sideCm, thicknessMm: state.plate.thicknessMm,
      material: state.plate.material, trim: trim
    });
    rebuildModes();
    saveSettings();
  }

  function setView(view) {
    state.view = view === 'field' ? 'field' : 'sand';
    plateView.setMode(state.view);
    var radio = document.querySelector('input[name="view"][value="' + state.view + '"]');
    if (radio) radio.checked = true;
    el.scatterBtn.disabled = state.view !== 'sand';
    saveSettings();
  }

  /* ------------------------------------------------------------ theme */

  function parseColor(str) {
    var m = /^#([0-9a-f]{6})$/i.exec(str.trim());
    if (!m) return [240, 240, 240];
    var n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function applyTheme(theme) {
    state.theme = theme === 'light' ? 'light' : 'dark';
    document.documentElement.dataset.theme = state.theme;
    var next = state.theme === 'dark' ? 'light' : 'dark';
    el.themeBtn.textContent = next === 'light' ? 'Light' : 'Dark';
    el.themeBtn.setAttribute('aria-label', 'Switch to ' + next + ' theme');
    var css = getComputedStyle(document.documentElement);
    ink.fg = css.getPropertyValue('--fg').trim();
    ink.mute = css.getPropertyValue('--mute').trim();
    ink.faint = css.getPropertyValue('--faint').trim();
    ink.danger = css.getPropertyValue('--danger').trim();
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', css.getPropertyValue('--bg').trim());
    if (plateView) plateView.setInk(parseColor(ink.fg));
    saveSettings();
  }

  /* ---------------------------------------------------- scope + meter */

  function drawScope(samples) {
    var c = el.scope, ctx = c.getContext('2d');
    var w = c.width, h = c.height, mid = h / 2;
    ctx.clearRect(0, 0, w, h);

    // Limiter ceiling, top and bottom: the trace can never cross these.
    var ceil = safety.dbToLin(state.ceilingDb) * (mid - 4);
    ctx.strokeStyle = ink.danger;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(0, mid - ceil); ctx.lineTo(w, mid - ceil);
    ctx.moveTo(0, mid + ceil); ctx.lineTo(w, mid + ceil);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    ctx.strokeStyle = samples ? (toneHex || ink.fg) : ink.faint;
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (!samples) {
      ctx.moveTo(0, mid); ctx.lineTo(w, mid);
    } else {
      // Start on a rising zero crossing so the trace stands still.
      var start = 0, half = samples.length >> 1;
      for (var i = 1; i < half; i++) {
        if (samples[i - 1] <= 0 && samples[i] > 0) { start = i; break; }
      }
      var perPeriod = engine.sampleRate() / state.freq;
      var span = Math.round(Math.min(samples.length - start - 1, Math.max(200, perPeriod * 3)));
      for (var k = 0; k <= span; k++) {
        var x = k / span * w;
        var y = mid - samples[start + k] * (mid - 4);
        if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
  }

  function drawMeter(samples) {
    var peak = 0;
    if (samples) {
      for (var i = 0; i < samples.length; i++) {
        var a = samples[i] < 0 ? -samples[i] : samples[i];
        if (a > peak) peak = a;
      }
    }
    var db = safety.linToDb(peak);
    if (db < METER_FLOOR_DB - 12) db = -Infinity;
    el.meterFill.style.width = (isFinite(db) ? meterPos(db) : 0) + '%';
    el.peakOut.textContent = formatDb(db, 1) + ' dBFS';
  }

  /* ------------------------------------------------------------- loop */

  var lastMeter = 0;
  function frame(t) {
    if (sweep.state === 'running') {
      var f = sweep.update(engine.now());
      state.freq = F.sanitize(f, state.freq);
      engine.trackGain();
      if (sweep.state === 'done') {
        engine.setFrequency(state.freq);
        renderSweep();
        saveSettings();
      }
      renderFrequency();
      renderSweepProgress();
    }

    var samples = engine.playing || t - lastMeter < 400 ? engine.samples() : null;
    if (engine.playing) lastMeter = t;
    drawScope(engine.playing ? samples : null);
    drawMeter(samples);

    if (simVisible) {
      if (simDirty && t - simLastCompute > 50) {
        if (isRound()) disc.field(state.freq, state.plate, SIM_SIZE, { out: simField });
        else chladni.field(state.freq, plateC, SIM_SIZE, { out: simField });
        plateView.setField(simField, SIM_SIZE);
        simDirty = false;
        simLastCompute = t;
      }
      plateView.frame();
    }
    root.requestAnimationFrame(frame);
  }

  /* -------------------------------------------------------------- log */

  var MEDIUM_LABEL = { sand: 'Sand', salt: 'Salt', semolina: 'Semolina', water: 'Water', cornflour: 'Cornflour mix', other: 'Other' };
  var lastMedium = 'sand';
  var editingId = null;
  var pendingPhoto = null;     // Blob chosen in the form, not yet saved
  var removePhoto = false;     // editing: operator asked to drop the photo
  var previewUrl = null;
  var photoUrls = [];
  var msgTimer = null;

  function logMessage(text, kind) {
    el.logMsg.textContent = text;
    el.logMsg.className = 'notice ' + (kind || 'ok');
    el.logMsg.hidden = false;
    clearTimeout(msgTimer);
    msgTimer = setTimeout(function () { el.logMsg.hidden = true; }, 6000);
  }

  function renderCapture() {
    var rec = editingId ? findRecord(editingId) : null;
    var f = rec ? rec.freq : state.freq;
    var w = rec ? rec.waveform : state.waveform;
    el.capFreq.textContent = F.formatHz(f) + ' Hz';
    el.capMeta.textContent = F.noteInfo(f).label + ' · ' + w;
  }

  function findRecord(id) {
    for (var i = 0; i < records.length; i++) if (records[i].id === id) return records[i];
    return null;
  }

  function setPreview(blob) {
    if (previewUrl) { URL.revokeObjectURL(previewUrl); previewUrl = null; }
    if (blob) {
      previewUrl = URL.createObjectURL(blob);
      el.pPreview.src = previewUrl;
    } else {
      el.pPreview.removeAttribute('src');
    }
    el.pPreview.hidden = !blob;
    el.photoClear.hidden = !blob;
    el.photoBtnText.textContent = blob ? 'Replace photo' : 'Add photo';
  }

  function resetForm() {
    editingId = null;
    pendingPhoto = null;
    removePhoto = false;
    el.logForm.reset();
    el.pMedium.value = lastMedium;      // a session usually sticks with one medium
    setPreview(null);
    el.formTitle.textContent = 'Log the current pattern';
    el.pSave.textContent = 'Save to log';
    el.pCancel.hidden = true;
    renderCapture();
    markEditing();
  }

  function markEditing() {
    Array.prototype.forEach.call(el.logList.children, function (li) {
      li.dataset.editing = li.dataset.id === editingId ? 'true' : 'false';
    });
  }

  function beginEdit(rec) {
    editingId = rec.id;
    pendingPhoto = null;
    removePhoto = false;
    el.pName.value = rec.name;
    el.pNotes.value = rec.notes;
    el.pMedium.value = rec.medium || 'sand';
    el.pPhoto.value = '';
    setPreview(rec.photo);
    el.formTitle.textContent = 'Edit log entry';
    el.pSave.textContent = 'Update entry';
    el.pCancel.hidden = false;
    renderCapture();
    markEditing();
    el.logForm.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    el.pName.focus({ preventScroll: true });
  }

  function refreshLog() {
    return store.list().then(function (list) {
      records = list;
      renderLog();
    });
  }

  function renderLog() {
    photoUrls.forEach(function (u) { URL.revokeObjectURL(u); });
    photoUrls = [];
    var sorted = records.slice().sort(state.sort === 'freq'
      ? function (a, b) { return a.freq - b.freq; }
      : function (a, b) { return b.createdAt - a.createdAt; });
    var frag = document.createDocumentFragment();
    sorted.forEach(function (rec) { frag.appendChild(entryNode(rec)); });
    el.logList.replaceChildren(frag);
    el.logEmpty.hidden = sorted.length > 0;
    el.sortBtn.textContent = 'Sort: ' + (state.sort === 'freq' ? 'frequency' : 'newest');
    el.exportBtn.disabled = sorted.length === 0;
    markEditing();
  }

  function make(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;   // never innerHTML: log text is user data
    return node;
  }

  function entryNode(rec) {
    var li = make('li', 'entry');
    li.dataset.id = rec.id;

    if (rec.photo) {
      var url = URL.createObjectURL(rec.photo);
      photoUrls.push(url);
      var link = make('a', 'entry-photo-link');
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener';
      link.setAttribute('aria-label', 'Open photo of ' + rec.name);
      var img = make('img', 'entry-photo');
      img.src = url;
      img.alt = 'Plate photo for ' + rec.name;
      img.loading = 'lazy';
      link.appendChild(img);
      li.appendChild(link);
    } else {
      li.appendChild(make('div', 'entry-photo none', 'No photo'));
    }

    var body = make('div', 'entry-body');
    body.appendChild(make('p', 'entry-name', rec.name));
    var note = F.noteInfo(rec.freq);
    body.appendChild(make('p', 'entry-freq',
      F.formatHz(rec.freq) + ' Hz · ' + note.label + ' ' + F.formatCents(note.cents) + ' · ' + rec.waveform));
    if (rec.notes) body.appendChild(make('p', 'entry-notes', rec.notes));
    var when = new Date(rec.createdAt);
    body.appendChild(make('p', 'entry-meta',
      (MEDIUM_LABEL[rec.medium] || 'Sand') + ' · ' +
      (rec.mode ? 'near mode ' + rec.mode + ' · ' : '') +
      when.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })));

    var actions = make('div', 'entry-actions');
    var recall = make('button', 'btn', 'Recall');
    recall.type = 'button';
    recall.dataset.action = 'recall';
    var edit = make('button', 'btn ghost', 'Edit');
    edit.type = 'button';
    edit.dataset.action = 'edit';
    var del = make('button', 'btn ghost', 'Delete');
    del.type = 'button';
    del.dataset.action = 'delete';
    var lab = make('a', 'btn ghost', '3D');
    lab.href = 'lab.html#log=' + encodeURIComponent(rec.id);
    lab.setAttribute('aria-label', 'Open ' + rec.name + ' in the 3D lab');
    actions.append(recall, lab, edit, del);
    body.appendChild(actions);
    li.appendChild(body);
    return li;
  }

  function onLogClick(e) {
    var btn = e.target.closest('button[data-action]');
    if (!btn) return;
    var rec = findRecord(btn.closest('.entry').dataset.id);
    if (!rec) return;
    var action = btn.dataset.action;
    if (action === 'recall') {
      setWaveform(rec.waveform);
      setFrequency(rec.freq);
      logMessage('Recalled "' + rec.name + '" at ' + F.formatHz(rec.freq) + ' Hz.');
    } else if (action === 'edit') {
      beginEdit(rec);
    } else if (action === 'delete') {
      // Two-step delete: first press arms the button, second press fires.
      if (btn.classList.contains('armed')) {
        store.remove(rec.id).then(function () {
          if (editingId === rec.id) resetForm();
          return refreshLog();
        }).catch(function () { logMessage('Could not delete that entry.', 'error'); });
      } else {
        btn.classList.add('armed');
        btn.textContent = 'Confirm delete';
        setTimeout(function () {
          if (btn.isConnected) { btn.classList.remove('armed'); btn.textContent = 'Delete'; }
        }, 3500);
      }
    }
  }

  function onLogSubmit(e) {
    e.preventDefault();
    if (!store) return;
    var existing = editingId ? findRecord(editingId) : null;
    var raw;
    if (existing) {
      raw = {
        id: existing.id, createdAt: existing.createdAt,
        freq: existing.freq, waveform: existing.waveform,
        mode: existing.mode, plate: existing.plate,
        photo: pendingPhoto || (removePhoto ? null : existing.photo)
      };
    } else {
      raw = {
        freq: state.freq, waveform: state.waveform,
        mode: nearest ? nearest.label : null, plate: state.plate,
        photo: pendingPhoto
      };
    }
    raw.name = el.pName.value;
    raw.notes = el.pNotes.value;
    raw.medium = el.pMedium.value;
    if (!existing) lastMedium = raw.medium;
    el.pSave.disabled = true;
    store.save(raw).then(function (rec) {
      resetForm();
      logMessage((existing ? 'Updated "' : 'Logged "') + rec.name + '".');
      return refreshLog();
    }).catch(function (err) {
      logMessage('Could not save: ' + (err && err.message ? err.message : 'storage error') + '.', 'error');
    }).then(function () { el.pSave.disabled = false; });
  }

  function onPhotoChosen() {
    var file = el.pPhoto.files && el.pPhoto.files[0];
    if (!file) return;
    SP.photos.shrink(file).then(function (blob) {
      pendingPhoto = blob;
      removePhoto = false;
      setPreview(blob);
    }).catch(function (err) {
      el.pPhoto.value = '';
      logMessage(err.message + '.', 'error');
    });
  }

  /* ----------------------------------------------------------- camera */

  var cameraStream = null;

  function cameraSupported() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && el.cameraDialog.showModal);
  }

  function stopCamera() {
    if (cameraStream) cameraStream.getTracks().forEach(function (t) { t.stop(); });
    cameraStream = null;
    el.cameraVideo.srcObject = null;
  }

  function cameraError(err) {
    var name = err && err.name;
    el.cameraMsg.textContent = name === 'NotAllowedError'
      ? 'Camera access was refused. Allow it in the browser\'s site settings, or use Add photo instead.'
      : name === 'NotFoundError' || name === 'OverconstrainedError'
        ? 'No camera was found on this device. Use Add photo instead.'
        : 'The camera could not be started. Use Add photo instead.';
    el.cameraMsg.hidden = false;
    el.cameraShoot.disabled = true;
  }

  /* Start, or switch to, a camera. With no id the rear camera is preferred: it faces the plate. */
  function startCamera(deviceId) {
    stopCamera();
    el.cameraMsg.hidden = true;
    el.cameraShoot.disabled = true;
    var video = deviceId
      ? { deviceId: { exact: deviceId }, width: { ideal: 1920 }, height: { ideal: 1440 } }
      : { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1440 } };
    return navigator.mediaDevices.getUserMedia({ video: video, audio: false }).then(function (stream) {
      if (!el.cameraDialog.open) { stream.getTracks().forEach(function (t) { t.stop(); }); return; }
      cameraStream = stream;
      el.cameraVideo.srcObject = stream;
      el.cameraShoot.disabled = false;
      return listCameras(stream);
    }).catch(cameraError);
  }

  /* Offer a choice only when there is one to make. Labels appear once access is granted. */
  function listCameras(stream) {
    if (!navigator.mediaDevices.enumerateDevices) return;
    return navigator.mediaDevices.enumerateDevices().then(function (devices) {
      var cams = devices.filter(function (d) { return d.kind === 'videoinput'; });
      var active = stream.getVideoTracks()[0];
      var activeId = active && active.getSettings ? active.getSettings().deviceId : '';
      el.cameraPick.replaceChildren();
      cams.forEach(function (cam, i) {
        var opt = document.createElement('option');
        opt.value = cam.deviceId;
        opt.textContent = cam.label || 'Camera ' + (i + 1);
        el.cameraPick.appendChild(opt);
      });
      if (activeId) el.cameraPick.value = activeId;
      el.cameraPickField.hidden = cams.length < 2;
    }).catch(function () { el.cameraPickField.hidden = true; });
  }

  function openCamera() {
    el.cameraDialog.showModal();
    startCamera();
  }

  function shootPhoto() {
    var v = el.cameraVideo;
    if (!v.videoWidth) return;
    var canvas = document.createElement('canvas');
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    canvas.getContext('2d').drawImage(v, 0, 0);
    canvas.toBlob(function (blob) {
      if (!blob) { cameraError(); return; }
      SP.photos.shrink(blob).then(function (small) {
        pendingPhoto = small;
        removePhoto = false;
        el.pPhoto.value = '';
        setPreview(small);
        el.cameraDialog.close();
      }).catch(cameraError);
    }, 'image/jpeg', 0.92);
  }

  function exportLog() {
    store.exportJson().then(function (json) {
      var url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      var a = document.createElement('a');
      a.href = url;
      a.download = 'singing-plate-log-' + new Date().toISOString().slice(0, 10) + '.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
      // An embedding page can forbid downloads, and the browser does not tell us.
      if (root.self !== root.top) {
        logMessage('If no file appeared, this embedded view is blocking downloads. Open the app directly to export.');
      }
    }).catch(function () { logMessage('Export failed.', 'error'); });
  }

  function importLog() {
    var file = el.importInput.files && el.importInput.files[0];
    if (!file) return;
    file.text().then(function (text) { return store.importJson(text); })
      .then(function (count) {
        logMessage('Imported ' + count + (count === 1 ? ' entry.' : ' entries.'));
        return refreshLog();
      })
      .catch(function (err) { logMessage(err.message + '.', 'error'); })
      .then(function () { el.importInput.value = ''; });
  }

  function focusLogForm() {
    el.logForm.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el.pName.focus({ preventScroll: true });
  }

  /* ------------------------------------------------------------- keys */

  function isTypingTarget(t) {
    if (!t || !t.tagName) return false;
    if (t.isContentEditable) return true;
    if (t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') return true;
    if (t.tagName !== 'INPUT') return false;
    return ['range', 'radio', 'checkbox', 'button', 'submit'].indexOf(t.type) === -1;
  }

  /* Space is the global tone key, except where it has to do its normal job. */
  function spaceIsGlobal(t) {
    if (isTypingTarget(t)) return false;
    return !(t && t.tagName === 'INPUT' && (t.type === 'checkbox' || t.type === 'radio'));
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') {            // always live, even mid-typing
      if (engine.playing) { stopTone(true); e.preventDefault(); }
      return;
    }
    if (document.querySelector('dialog[open]') || e.metaKey || e.ctrlKey) return;
    var t = e.target;

    if (e.key === ' ' || e.code === 'Space') {
      if (!spaceIsGlobal(t)) return;
      e.preventDefault();
      if (!e.repeat) toggleTone();
      return;
    }
    if (isTypingTarget(t)) return;

    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      if (t.tagName === 'INPUT') return;   // sliders and radios keep their own arrows
      var step = e.altKey ? 0.1 : e.shiftKey ? 10 : 1;
      setFrequency(F.nudge(state.freq, e.key === 'ArrowRight' ? step : -step));
      e.preventDefault();
      return;
    }
    if (e.altKey) return;
    switch (e.key.toLowerCase()) {
      case ',': setFrequency(F.nudge(state.freq, -0.1)); e.preventDefault(); break;
      case '.': setFrequency(F.nudge(state.freq, 0.1)); e.preventDefault(); break;
      case 's': if (!e.repeat) sweepGo(); e.preventDefault(); break;
      case '[': setVolume(state.volume - 0.05); e.preventDefault(); break;
      case ']': setVolume(state.volume + 0.05); e.preventDefault(); break;
      case 'l': focusLogForm(); e.preventDefault(); break;
      case 'r': if (state.view === 'sand') plateView.scatter(); e.preventDefault(); break;
    }
  }

  /* Browsers fire a button's click on Space key-up; swallow it to avoid a double action. */
  function onKeyUp(e) {
    if ((e.key === ' ' || e.code === 'Space') && !document.querySelector('dialog[open]') && spaceIsGlobal(e.target)) e.preventDefault();
  }

  /* ------------------------------------------------------------- init */

  function dialTicks() {
    var labels = { 20: '20', 50: '50', 100: '100', 200: '200', 500: '500', 1000: '1k', 2000: '2k', 5000: '5k', 10000: '10k', 20000: '20k' };
    var ticks = [];
    [10, 100, 1000, 10000].forEach(function (decade) {
      for (var k = 1; k <= 9; k++) {
        var f = decade * k;
        if (f < F.F_MIN || f > F.F_MAX) continue;
        ticks.push({ t: F.freqToDial(f), label: labels[f] });
      }
    });
    return ticks;
  }

  function init() {
    ['colorBtn', 'toneSwatch', 'pulseOffer', 'pulseOn', 'pulseRate', 'mOmega', 'mOctaves', 'mLight', 'mSwatch',
      'mEm', 'mEmNote', 'mCoil', 'mCap', 'mHarmonics', 'mIntervals', 'mIntervalText', 'mIntervalTune',
      'mLissajous', 'mEarth', 'mCircuit',
      'status', 'statusText', 'themeBtn', 'keysBtn', 'keysDialog', 'keysClose',
      'freqBig', 'noteName', 'noteCents', 'wavelength', 'period', 'ripple', 'dial', 'freqInput',
      'fineTrim', 'fineOut', 'scope', 'toneBtn', 'toneText', 'outState', 'volume', 'volumeOut',
      'ceiling', 'ceilingOut', 'meterFill', 'meterCeil', 'peakOut', 'lfGuard', 'guardNote',
      'swFrom', 'swTo', 'swRate', 'swGo', 'swReset', 'swFill', 'swHead', 'swTicks', 'swEta',
      'swState', 'swSpan', 'swHint', 'plate', 'simMode', 'simModeHz', 'simDelta', 'scatterBtn',
      'jumpBtn', 'plShape', 'plSideLabel', 'plSide', 'plThick', 'plMaterial', 'alignBtn', 'trimReset', 'trimOut',
      'life', 'lifeNow', 'lifeList', 'lifeScale', 'lifeBeyond', 'searchList', 'reportList', 'accountList', 'simNote',
      'pMedium', 'cameraBtn', 'cameraDialog', 'cameraClose', 'cameraVideo', 'cameraPick', 'cameraPickField',
      'cameraMsg', 'cameraShoot',
      'modeList', 'modeCount', 'sortBtn', 'exportBtn', 'importInput', 'logForm', 'formTitle',
      'capFreq', 'capMeta', 'pName', 'pNotes', 'pPhoto', 'photoBtnText', 'photoClear',
      'pPreview', 'pSave', 'pCancel', 'logMsg', 'storeNote', 'logEmpty', 'logList'
    ].forEach(function (id) { el[id] = $(id); });

    loadSettings();

    engine.params.freq = state.freq;
    engine.params.waveform = state.waveform;
    engine.params.volume = state.volume;
    engine.params.ceilingDb = state.ceilingDb;
    engine.params.lfGuard = state.lfGuard;

    dial = new SP.Dial(el.dial, {
      ticks: dialTicks(),
      onInput: function (t) { setFrequency(F.dialSnap(t)); },
      onStep: function (dir, big) { setFrequency(F.nudge(state.freq, dir * (big ? 10 : 1))); }
    });
    plateView = new SP.PlateView(el.plate);

    Object.keys(chladni.MATERIALS).forEach(function (key) {
      var opt = document.createElement('option');
      opt.value = key;
      opt.textContent = chladni.MATERIALS[key].label;
      el.plMaterial.appendChild(opt);
    });
    el.plSide.value = state.plate.sideCm;
    el.plThick.value = state.plate.thicknessMm;
    el.plMaterial.value = state.plate.material;
    el.swFrom.value = trimNumber(sweep.from);
    el.swTo.value = trimNumber(sweep.to);
    el.swRate.value = trimNumber(sweep.rate);
    el.lfGuard.checked = state.lfGuard;

    buildLife();
    buildMath();
    el.pulseRate.value = state.pulseRate;
    applyTheme(state.theme);
    applyColor(state.color);
    setView(state.view);
    setVolume(state.volume);
    setCeiling(state.ceilingDb);
    setWaveform(state.waveform);
    rebuildModes();
    renderFrequency();
    renderTone();
    renderSweep();

    /* frequency controls */
    el.freqInput.addEventListener('change', function () {
      setFrequency(el.freqInput.value);
      el.freqInput.value = F.formatHz(state.freq);
    });
    el.freqInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { setFrequency(el.freqInput.value); el.freqInput.value = F.formatHz(state.freq); el.freqInput.select(); }
    });
    document.querySelectorAll('[data-nudge]').forEach(function (btn) {
      btn.addEventListener('click', function () { setFrequency(F.nudge(state.freq, Number(btn.dataset.nudge))); });
    });

    var fineBase = null;
    el.fineTrim.addEventListener('input', function () {
      if (fineBase === null) fineBase = state.freq;
      var offset = Number(el.fineTrim.value);
      setFrequency(fineBase + offset);
      el.fineOut.textContent = (offset === 0 ? '±' : offset > 0 ? '+' : '−') + Math.abs(offset).toFixed(1) + ' Hz';
    });
    el.fineTrim.addEventListener('change', function () {
      fineBase = null;
      el.fineTrim.value = 0;
      el.fineOut.textContent = '±0.0 Hz';
    });

    document.querySelectorAll('input[name="wave"]').forEach(function (r) {
      r.addEventListener('change', function () { if (r.checked) setWaveform(r.value); });
    });

    /* output */
    el.toneBtn.addEventListener('click', toggleTone);
    el.volume.addEventListener('input', function () { setVolume(Number(el.volume.value) / 100); });
    el.ceiling.addEventListener('input', function () { setCeiling(Number(el.ceiling.value)); });
    el.lfGuard.addEventListener('change', function () {
      state.lfGuard = el.lfGuard.checked;
      engine.setLfGuard(state.lfGuard);
      renderGuard();
      saveSettings();
    });

    /* sweep */
    el.swGo.addEventListener('click', sweepGo);
    el.swReset.addEventListener('click', sweepReset);
    [el.swFrom, el.swTo, el.swRate].forEach(function (input) {
      input.addEventListener('change', sweepRetarget);
    });

    /* simulator */
    document.querySelectorAll('input[name="view"]').forEach(function (r) {
      r.addEventListener('change', function () { if (r.checked) setView(r.value); });
    });
    el.scatterBtn.addEventListener('click', function () { plateView.scatter(); });
    el.jumpBtn.addEventListener('click', function () { if (nearest) setFrequency(nearest.f); });
    el.modeList.addEventListener('click', function (e) {
      var chip = e.target.closest('.chip');
      if (chip) setFrequency(modes[Number(chip.dataset.index)].f);
    });
    [el.plShape, el.plSide, el.plThick, el.plMaterial].forEach(function (input) {
      input.addEventListener('change', readPlateInputs);
    });
    el.alignBtn.addEventListener('click', function () {
      if (nearest) setTrim(chladni.trimToAlign(state.plate, nearest, state.freq));
    });
    el.trimReset.addEventListener('click', function () { setTrim(1); });

    if (root.IntersectionObserver) {
      new IntersectionObserver(function (entries) {
        simVisible = entries[entries.length - 1].isIntersecting;
      }).observe(el.plate);
    }

    /* chrome */
    el.themeBtn.addEventListener('click', function () { applyTheme(state.theme === 'dark' ? 'light' : 'dark'); });
    el.colorBtn.addEventListener('click', function () { applyColor(!state.color); });
    el.pulseOn.addEventListener('change', applyPulse);
    el.pulseRate.addEventListener('change', applyPulse);
    el.pulseOffer.addEventListener('click', hearAsPulse);
    el.keysBtn.addEventListener('click', function () {
      if (el.keysDialog.showModal) el.keysDialog.showModal(); else el.keysDialog.setAttribute('open', '');
    });
    el.keysClose.addEventListener('click', function () {
      if (el.keysDialog.close) el.keysDialog.close(); else el.keysDialog.removeAttribute('open');
    });
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    root.addEventListener('pagehide', flushSettings);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') flushSettings();
    });

    if (!SP.Engine.isSupported()) {
      el.toneBtn.disabled = true;
      el.swGo.disabled = true;
      el.guardNote.textContent = 'This browser has no Web Audio support, so the console cannot make sound here.';
      el.guardNote.hidden = false;
    }

    /* log */
    el.logForm.addEventListener('submit', onLogSubmit);
    el.pCancel.addEventListener('click', resetForm);
    el.pPhoto.addEventListener('change', onPhotoChosen);
    el.photoClear.addEventListener('click', function () {
      pendingPhoto = null;
      removePhoto = true;
      el.pPhoto.value = '';
      setPreview(null);
    });
    el.logList.addEventListener('click', onLogClick);

    if (cameraSupported()) {
      el.cameraBtn.hidden = false;
      el.cameraBtn.addEventListener('click', openCamera);
      el.cameraShoot.addEventListener('click', shootPhoto);
      el.cameraClose.addEventListener('click', function () { el.cameraDialog.close(); });
      el.cameraPick.addEventListener('change', function () { startCamera(el.cameraPick.value); });
      // Whatever closes the dialog, the camera light must go out.
      el.cameraDialog.addEventListener('close', stopCamera);
    }
    el.sortBtn.addEventListener('click', function () {
      state.sort = state.sort === 'freq' ? 'newest' : 'freq';
      renderLog();
      saveSettings();
    });
    el.exportBtn.addEventListener('click', exportLog);
    el.importInput.addEventListener('change', importLog);

    SP.Store.open().then(function (s) {
      store = s;
      el.storeNote.hidden = store.persistent;
      return refreshLog();
    });

    root.requestAnimationFrame(frame);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  // Exposed for debugging from the browser console; not a public API.
  SP.app = { state: state, engine: engine, sweep: sweep };
})(typeof self !== 'undefined' ? self : this);
