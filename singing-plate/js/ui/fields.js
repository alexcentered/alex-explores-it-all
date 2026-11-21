/*
 * ui/fields.js -- runs the Fields page.
 *
 * Four displays, each fed by core/fields.js: field lines in 3D, the
 * rotating field of two or three coils, the resonance curve, and a pair of
 * coupled tuned circuits. The only sound is the Strike buttons, which play
 * a resonator's ring through the same limited output as the console.
 */
(function (root) {
  'use strict';

  var SP = root.SP;
  var fields = SP.fields, freq = SP.freq, safety = SP.safety;
  var CONSOLE_KEY = 'singing-plate:v1';
  var KEY = 'singing-plate:fields:v1';
  var TURN_SECONDS = 4;          // one turn of the field on screen
  var RATIO_SPAN = 4;            // the curve runs from 1/4 to 4 times the natural frequency
  var Q_MAX = 1000;
  var K_MIN = 0.002, K_MAX = 0.5;
  var PAIR_SPAN = 2;             // the pair's curve runs from half to twice the natural frequency
  var MAX_SOUND_S = 6;

  function $(id) { return document.getElementById(id); }

  var el = {};
  var theme = 'dark';
  var ink = { fg: '#f2f2f2', soft: '#cfcfcf', mute: '#8a8a8a', faint: '#5a5a5a', line: 'rgba(255,255,255,0.12)' };
  var reducedMotion = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var state = {
    kind: 'both', twist: 0.3, flow: !reducedMotion,
    phases: 3, turning: !reducedMotion, supplyHz: 60, poles: 2,
    f0: 440, q: 30, drive: 0,           // drive: position on the slider, -1000 .. 1000
    k: 0.1, volume: 0.25
  };
  var strike = new SP.Strike();
  var sounding = '';              // which Strike button is playing: '', 'one' or 'pair'
  var ceilingDb = safety.DEFAULT_CEILING_DB;
  var viewer = null, view = null;
  var flowTime = 0, turnAngle = 0.6, last = 0;
  var linesDirty = true, plotsDirty = true;

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
    if (s.kind === 'ring' || s.kind === 'coil' || s.kind === 'both') state.kind = s.kind;
    state.twist = num(s.twist, 0.05, 1.5, state.twist);
    if (s.phases === 1 || s.phases === 2 || s.phases === 3) state.phases = s.phases;
    state.supplyHz = num(s.supplyHz, 1, 1000, state.supplyHz);
    if ([2, 4, 6, 8].indexOf(s.poles) >= 0) state.poles = s.poles;
    // The natural frequency starts at whatever the console was last tuned to.
    state.f0 = num(s.f0 !== undefined ? s.f0 : c.freq, freq.F_MIN, freq.F_MAX, state.f0);
    state.fromConsole = s.f0 === undefined && c.freq !== undefined;
    state.q = num(s.q, 1, Q_MAX, state.q);
    state.drive = num(s.drive, -1000, 1000, state.drive);
    state.k = num(s.k, K_MIN, K_MAX, state.k);
    state.volume = num(s.volume, 0, 1, state.volume);
    if (c.ceilingDb !== undefined) ceilingDb = safety.sanitizeCeilingDb(c.ceilingDb);
    theme = c.theme === 'light' ? 'light' : 'dark';
  }

  var saveTimer = null;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, 250);
  }
  function flush() {
    clearTimeout(saveTimer);
    try {
      localStorage.setItem(KEY, JSON.stringify({
        kind: state.kind, twist: state.twist, phases: state.phases, supplyHz: state.supplyHz,
        poles: state.poles, q: state.q, drive: state.drive, k: state.k, volume: state.volume,
        // until a natural frequency is typed here, keep following the console's
        f0: state.fromConsole ? undefined : state.f0
      }));
    } catch (e) { /* not fatal */ }
  }

  /* ------------------------------------------------------------ canvas */

  /* Size a canvas's bitmap to its box and return a context in CSS pixels. */
  function prepare(canvas) {
    var dpr = Math.min(root.devicePixelRatio || 1, 2);
    var w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.font = '11px "JetBrains Mono", ui-monospace, monospace';
    ctx.lineJoin = ctx.lineCap = 'round';
    ctx.setLineDash([]);
    return { ctx: ctx, w: w, h: h };
  }

  function arrow(ctx, x0, y0, x1, y1, head) {
    var dx = x1 - x0, dy = y1 - y0, len = Math.sqrt(dx * dx + dy * dy);
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    if (len < head * 0.8) return;
    var ux = dx / len, uy = dy / len;
    ctx.save();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x1 - head * ux + head * 0.45 * uy, y1 - head * uy - head * 0.45 * ux);
    ctx.lineTo(x1 - head * ux - head * 0.45 * uy, y1 - head * uy + head * 0.45 * ux);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  /* ------------------------------------------------------- field lines */

  var KIND_TEXT = {
    ring: {
      caption: 'A current round one ring. The lines go up through the hole and back round the outside.',
      hint: 'The solid ring is the wire. Lines close to it are tight loops; the one through the centre runs straight along the axis. Lines that leave the picture come back from the other side.'
    },
    coil: {
      caption: 'Wire wound round a ring-shaped former. The field stays inside and runs round the ring.',
      hint: 'The grey spiral is the winding and the faint shell is the former. Every line is a circle inside it, and there is no field in the hole or outside.'
    },
    both: {
      caption: 'Coil and ring current together. Each line is a helix on its own ring-shaped surface.',
      hint: 'Three nested surfaces are shown, two lines on each. Raise the ring current and the lines wind round the tube more tightly; lower it and they straighten toward the coil\'s circles.'
    }
  };

  function renderKind() {
    var t = KIND_TEXT[state.kind];
    el.kindCaption.textContent = t.caption;
    el.kindHint.textContent = t.hint;
    el.twistField.hidden = state.kind !== 'both';
    el.twistOut.textContent = state.twist.toFixed(2) + ' : 1';
    linesDirty = true;
  }

  function buildLines() {
    linesDirty = false;
    if (!view || !view.ok) return;
    view.show(state.kind, fields.fieldLines(state.kind, state.twist), fields.TUBE);
  }

  function renderFlow() {
    el.flowBtn.textContent = state.flow ? 'Freeze' : 'Flow';
    el.flowBtn.setAttribute('aria-pressed', state.flow ? 'true' : 'false');
  }

  /* ---------------------------------------------------- rotating field */

  var DASH = [[], [7, 5], [2, 5]];
  var NAMES = ['A', 'B', 'C'];

  function drawTurn() {
    var c = prepare(el.turnCanvas), ctx = c.ctx;
    var cx = c.w / 2, cy = c.h / 2, R = Math.min(c.w, c.h) * 0.4;
    var f = fields.rotatingField(state.phases, turnAngle);
    var unit = R * 0.56;

    // the stator, and the path the tip of the total field follows
    ctx.strokeStyle = ink.line; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, 2 * Math.PI); ctx.stroke();
    ctx.strokeStyle = ink.faint;
    ctx.setLineDash([2, 4]);
    ctx.beginPath();
    if (state.phases === 1) { ctx.moveTo(cx - unit, cy); ctx.lineTo(cx + unit, cy); }
    else ctx.arc(cx, cy, unit * state.phases / 2, 0, 2 * Math.PI);
    ctx.stroke();
    ctx.setLineDash([]);

    // each coil: two blocks facing each other across the circle, and its own field along the line between them
    f.parts.forEach(function (part, k) {
      var ax = Math.cos(part.axis), ay = -Math.sin(part.axis);
      var level = Math.abs(part.value);
      ctx.fillStyle = ink.fg;
      [1, -1].forEach(function (side) {
        ctx.save();
        ctx.translate(cx + side * ax * R, cy + side * ay * R);
        ctx.rotate(Math.atan2(ay, ax));
        ctx.globalAlpha = 0.25 + 0.75 * level;
        ctx.fillRect(-5, -15, 10, 30);
        ctx.restore();
      });
      ctx.fillStyle = ink.mute;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(NAMES[k], cx + ax * (R + 18), cy + ay * (R + 18));

      ctx.strokeStyle = ctx.fillStyle = ink.mute;
      ctx.lineWidth = 1.5;
      ctx.setLineDash(DASH[k]);
      arrow(ctx, cx, cy, cx + ax * part.value * unit, cy + ay * part.value * unit, 7);
      ctx.setLineDash([]);
    });

    // the sum
    ctx.strokeStyle = ctx.fillStyle = ink.fg;
    ctx.lineWidth = 3.5;
    arrow(ctx, cx, cy, cx + f.x * unit, cy - f.y * unit, 13);
    ctx.beginPath(); ctx.arc(cx, cy, 3.5, 0, 2 * Math.PI); ctx.fill();

    renderStrength();
  }

  function renderStrength() {
    el.strength.textContent = fields.rotatingField(state.phases, turnAngle).strength.toFixed(2) + ' × one coil';
  }

  function drawPhases() {
    var c = prepare(el.phaseCanvas), ctx = c.ctx;
    var pad = 12, mid = c.h / 2, amp = c.h / 2 - 12, w = c.w - 2 * pad;
    var cycle = turnAngle / (2 * Math.PI);
    cycle -= Math.floor(cycle);
    var f = fields.rotatingField(state.phases, 0);

    ctx.strokeStyle = ink.line; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(pad, mid); ctx.lineTo(pad + w, mid); ctx.stroke();

    f.parts.forEach(function (part, k) {
      ctx.strokeStyle = k === 0 ? ink.fg : ink.soft;
      ctx.lineWidth = 1.6;
      ctx.setLineDash(DASH[k]);
      ctx.beginPath();
      for (var x = 0; x <= w; x += 3) {
        var y = mid - amp * Math.cos(x / w * 2 * Math.PI - part.axis);
        if (x === 0) ctx.moveTo(pad + x, y); else ctx.lineTo(pad + x, y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = ink.fg;
      ctx.beginPath();
      ctx.arc(pad + cycle * w, mid - amp * Math.cos(cycle * 2 * Math.PI - part.axis), 3.5, 0, 2 * Math.PI);
      ctx.fill();
    });

    ctx.strokeStyle = ink.mute; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(pad + cycle * w, 4); ctx.lineTo(pad + cycle * w, c.h - 4); ctx.stroke();
  }

  var TURN_TEXT = {
    1: 'One coil: the field pulses back and forth along one line and never turns.',
    2: 'Two coils at right angles, a quarter cycle apart: steady strength, turning.',
    3: 'Three coils 120° apart, a third of a cycle apart: steady strength, turning.'
  };

  function renderTurn() {
    el.turnCaption.textContent = TURN_TEXT[state.phases];
    renderStrength();
    el.turnBtn.textContent = state.turning ? 'Pause' : 'Run';
    el.turnBtn.setAttribute('aria-pressed', state.turning ? 'true' : 'false');
    var rpm = fields.synchronousRpm(state.supplyHz, state.poles);
    var rps = rpm / 60;
    if (state.phases === 1) {
      el.rpm.textContent = 'Not turning';
      el.rps.textContent = '--';
      el.slowed.textContent = Math.round(state.supplyHz * TURN_SECONDS).toLocaleString('en-US') + ' ×';
    } else {
      el.rpm.textContent = (Math.round(rpm * 10) / 10).toLocaleString('en-US') + ' rpm';
      el.rps.textContent = (Math.round(rps * 100) / 100).toLocaleString('en-US');
      // On screen one supply cycle takes TURN_SECONDS, whatever the number of poles.
      el.slowed.textContent = Math.round(state.supplyHz * TURN_SECONDS).toLocaleString('en-US') + ' ×';
    }
  }

  /* --------------------------------------------------------- resonance */

  function sliderToQ(v) { return Math.pow(Q_MAX, v / 300); }
  function qToSlider(q) { return 300 * Math.log(q) / Math.log(Q_MAX); }
  function driveRatio() { return Math.pow(RATIO_SPAN, state.drive / 1000); }
  function ratioToDrive(r) { return 1000 * Math.log(r) / Math.log(RATIO_SPAN); }

  function drawResonance() {
    var c = prepare(el.resCanvas), ctx = c.ctx;
    var padL = 46, padR = 12, padT = 12, padB = 24;
    var w = c.w - padL - padR, h = c.h - padT - padB;
    var lo = Math.log10(0.03), hi = Math.log10(Q_MAX * 2);        // gain axis, logarithmic
    var span = Math.log(RATIO_SPAN);
    function px(r) { return padL + (Math.log(r) / span + 1) / 2 * w; }
    function py(g) { return padT + (1 - (Math.log10(g) - lo) / (hi - lo)) * h; }

    ctx.textBaseline = 'middle';
    [0.1, 1, 10, 100, 1000].forEach(function (g) {
      ctx.strokeStyle = ink.line; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(padL, py(g)); ctx.lineTo(padL + w, py(g)); ctx.stroke();
      ctx.fillStyle = ink.mute; ctx.textAlign = 'right';
      ctx.fillText('×' + g, padL - 8, py(g));
    });
    ctx.textBaseline = 'alphabetic';
    [0.25, 0.5, 1, 2, 4].forEach(function (r, i) {
      ctx.textAlign = i === 0 ? 'left' : i === 4 ? 'right' : 'center';
      ctx.strokeStyle = ink.line;
      ctx.beginPath(); ctx.moveTo(px(r), padT); ctx.lineTo(px(r), padT + h); ctx.stroke();
      ctx.fillStyle = ink.mute;
      ctx.fillText(fixed(state.f0 * r) + (i === 4 ? ' Hz' : ''), px(r), c.h - 7);
    });

    // the band between the half-power points
    var half = 1 / (2 * state.q);
    var bx0 = px(Math.max(1 / RATIO_SPAN, 1 - half)), bx1 = px(Math.min(RATIO_SPAN, 1 + half));
    ctx.fillStyle = ink.line;
    ctx.fillRect(bx0, padT, Math.max(1, bx1 - bx0), h);

    // the curve, with the exact peak put in so a sharp one is not missed between pixels
    ctx.strokeStyle = ink.fg; ctx.lineWidth = 2;
    ctx.beginPath();
    var peakAt = px(1), donePeak = false;
    for (var x = 0; x <= w; x += 1) {
      var X = padL + x;
      if (!donePeak && X >= peakAt) {
        ctx.lineTo(peakAt, py(fields.response(state.f0, state.f0, state.q).gain));
        donePeak = true;
      }
      var r = Math.exp((x / w * 2 - 1) * span);
      var y = py(Math.max(0.03, fields.response(state.f0 * r, state.f0, state.q).gain));
      if (x === 0) ctx.moveTo(X, y); else ctx.lineTo(X, y);
    }
    ctx.stroke();

    // where the drive is now
    var dr = driveRatio();
    var g = fields.response(state.f0 * dr, state.f0, state.q).gain;
    ctx.strokeStyle = ink.mute; ctx.lineWidth = 1;
    ctx.setLineDash([3, 4]);
    ctx.beginPath(); ctx.moveTo(px(dr), padT); ctx.lineTo(px(dr), padT + h); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = ink.fg;
    ctx.beginPath(); ctx.arc(px(dr), py(Math.max(0.03, g)), 5, 0, 2 * Math.PI); ctx.fill();
  }

  function drawLag() {
    var c = prepare(el.lagCanvas), ctx = c.ctx;
    var pad = 12, mid = c.h / 2, amp = c.h / 2 - 10, w = c.w - 2 * pad;
    var res = fields.response(state.f0 * driveRatio(), state.f0, state.q);
    var lag = res.lag * Math.PI / 180;
    var size = Math.max(0.012, res.gain / state.q);       // against its own peak
    var cycles = 3;

    ctx.strokeStyle = ink.line; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(pad, mid); ctx.lineTo(pad + w, mid); ctx.stroke();

    ctx.strokeStyle = ink.mute; ctx.lineWidth = 1.4;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    var x, y;
    for (x = 0; x <= w; x += 2) {
      y = mid - amp * 0.45 * Math.sin(x / w * cycles * 2 * Math.PI);
      if (x === 0) ctx.moveTo(pad + x, y); else ctx.lineTo(pad + x, y);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.strokeStyle = ink.fg; ctx.lineWidth = 2.2;
    ctx.beginPath();
    for (x = 0; x <= w; x += 2) {
      y = mid - amp * size * Math.sin(x / w * cycles * 2 * Math.PI - lag);
      if (x === 0) ctx.moveTo(pad + x, y); else ctx.lineTo(pad + x, y);
    }
    ctx.stroke();
  }

  function fixed(v) {
    return v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v >= 0.1 ? v.toFixed(2) : v.toPrecision(2);
  }

  function seconds(s) {
    if (s >= 1) return fixed(s) + ' s';
    if (s >= 0.001) return fixed(s * 1000) + ' ms';
    return fixed(s * 1e6) + ' µs';
  }

  function renderResonance() {
    var q = state.q, f0 = state.f0;
    var hz = f0 * driveRatio();
    var res = fields.response(hz, f0, q);
    el.qOut.textContent = q >= 100 ? q.toFixed(0) : q.toFixed(1);
    el.driveOut.textContent = freq.formatHz(hz) + ' Hz';
    el.gain.textContent = '× ' + fixed(res.gain);
    el.lag.textContent = res.lag.toFixed(0) + '°';
    el.bw.textContent = fixed(fields.bandwidth(f0, q)) + ' Hz';
    el.ring.textContent = seconds(fields.ringTime(f0, q));
    el.cycles.textContent = fixed(q / Math.PI);
    var off = Math.abs(hz / f0 - 1);
    el.resState.textContent = off < 1e-4 ? 'At resonance'
      : off <= 1 / (2 * q) ? 'Inside the band'
      : hz < f0 ? 'Below resonance' : 'Above resonance';
    el.f0Hint.textContent = state.fromConsole
      ? 'Taken from the console\'s frequency. Change it to anything from 1 Hz to 20 kHz.'
      : 'The frequency the resonator rings at when left alone.';
    el.strikeHint.textContent = f0 < freq.HEARING_MIN
      ? 'Below 20 Hz there is nothing to hear: raise the natural frequency to listen.'
      : 'Hear it struck once and left to ring. A higher Q rings longer.';
    renderPair();
    plotsDirty = true;
  }

  function syncResonanceControls() {
    el.f0.value = Math.round(state.f0 * 10) / 10;
    el.q.value = qToSlider(state.q);
    el.drive.value = state.drive;
    el.coupling.value = kToSlider(state.k);
    el.volume.value = Math.round(state.volume * 100);
  }

  /* ------------------------------------------------ two tuned circuits */

  function sliderToK(v) { return K_MIN * Math.pow(K_MAX / K_MIN, v / 300); }
  function kToSlider(k) { return 300 * Math.log(k / K_MIN) / Math.log(K_MAX / K_MIN); }

  /* How long the lower plot runs, in cycles: long enough to see the energy cross, or die trying. */
  function swapSpan() {
    var fade = 5 * state.q / Math.PI;                  // five ring times
    return Math.max(4, Math.min(3 * fields.transferCycles(state.k), fade));
  }

  function renderPair() {
    var q = state.q, f0 = state.f0, k = state.k;
    var kc = fields.criticalCoupling(q);
    var peaks = fields.coupledPeaks(f0, k);
    var cross = fields.transferCycles(k);
    el.couplingOut.textContent = k < 0.01 ? k.toFixed(4) : k.toFixed(3);
    var split = k > kc * 1.02;
    el.pairState.textContent = Math.abs(k / kc - 1) <= 0.02 ? 'Critical coupling'
      : split ? 'Tightly coupled: two peaks' : 'Loosely coupled: one peak';
    el.pairLow.textContent = fixed(peaks.lower) + ' Hz';
    el.pairHigh.textContent = fixed(peaks.upper) + ' Hz';
    el.pairCrit.textContent = 'k = ' + (kc < 0.01 ? kc.toFixed(4) : kc.toFixed(3));
    el.pairCross.textContent = fixed(cross) + ' cycles · ' + seconds(cross / f0);
    // the most the second circuit ever swings, as a share of what the first started with
    var span = swapSpan(), most = 0;
    for (var i = 0; i <= 400; i++) most = Math.max(most, fields.coupledEnvelope(q, k, span * i / 400).secondary);
    el.pairArrives.textContent = Math.round(most * 100) + '%';
    plotsDirty = true;
  }

  function drawPair() {
    var c = prepare(el.pairCanvas), ctx = c.ctx;
    var padL = 46, padR = 12, padT = 12, padB = 24;
    var w = c.w - padL - padR, h = c.h - padT - padB;
    var lo = Math.log10(0.03), hi = Math.log10(Q_MAX * 2);
    var span = Math.log(PAIR_SPAN);
    var f0 = state.f0, q = state.q, k = state.k;
    function px(r) { return padL + (Math.log(r) / span + 1) / 2 * w; }
    function py(g) { return padT + (1 - (Math.log10(Math.max(1e-6, g)) - lo) / (hi - lo)) * h; }

    ctx.textBaseline = 'middle';
    [0.1, 1, 10, 100, 1000].forEach(function (g) {
      ctx.strokeStyle = ink.line; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(padL, py(g)); ctx.lineTo(padL + w, py(g)); ctx.stroke();
      ctx.fillStyle = ink.mute; ctx.textAlign = 'right';
      ctx.fillText('×' + g, padL - 8, py(g));
    });
    ctx.textBaseline = 'alphabetic';
    [0.5, Math.SQRT1_2, 1, Math.SQRT2, 2].forEach(function (r, i) {
      ctx.textAlign = i === 0 ? 'left' : i === 4 ? 'right' : 'center';
      ctx.strokeStyle = ink.line;
      ctx.beginPath(); ctx.moveTo(px(r), padT); ctx.lineTo(px(r), padT + h); ctx.stroke();
      ctx.fillStyle = ink.mute;
      ctx.fillText(fixed(f0 * r) + (i === 4 ? ' Hz' : ''), px(r), c.h - 7);
    });

    // Sharp peaks can fall between pixels, so the exact peak frequencies are always sampled too.
    var peaks = fields.coupledPeaks(f0, k);
    var xs = [1, peaks.lower / f0, peaks.upper / f0];
    for (var x = 0; x <= w; x += 1) xs.push(Math.exp((x / w * 2 - 1) * span));
    xs = xs.filter(function (r) { return r >= 1 / PAIR_SPAN && r <= PAIR_SPAN; }).sort(function (a, b) { return a - b; });
    // curves that fall below the bottom of the scale run off the plot rather than along its floor
    ctx.save();
    ctx.beginPath(); ctx.rect(padL, padT, w, h); ctx.clip();
    function curve(value) {
      ctx.beginPath();
      xs.forEach(function (r, i) {
        var y = py(value(r));
        if (i === 0) ctx.moveTo(px(r), y); else ctx.lineTo(px(r), y);
      });
      ctx.stroke();
    }
    ctx.strokeStyle = ink.faint; ctx.lineWidth = 1.2; ctx.setLineDash([4, 5]);
    curve(function (r) { return fields.response(f0 * r, f0, q).gain; });
    ctx.setLineDash([]);
    ctx.strokeStyle = ink.mute; ctx.lineWidth = 1.2;
    curve(function (r) { return fields.coupledResponse(f0 * r, f0, q, k).primary; });
    ctx.strokeStyle = ink.fg; ctx.lineWidth = 2.2;
    curve(function (r) { return fields.coupledResponse(f0 * r, f0, q, k).secondary; });
    ctx.restore();

    // the pair's two natural frequencies
    ctx.fillStyle = ink.fg;
    [peaks.lower / f0, peaks.upper / f0].forEach(function (r) {
      if (r < 1 / PAIR_SPAN || r > PAIR_SPAN) return;
      ctx.fillRect(px(r) - 1, padT + h - 8, 2, 8);
    });
  }

  function drawSwap() {
    var c = prepare(el.swapCanvas), ctx = c.ctx;
    var padL = 12, padR = 12, padT = 10, padB = 22;
    var w = c.w - padL - padR, h = c.h - padT - padB, mid = padT + h / 2, amp = h / 2 - 2;
    var q = state.q, k = state.k, span = swapSpan();
    var cross = fields.transferCycles(k);

    ctx.strokeStyle = ink.line; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(padL, mid); ctx.lineTo(padL + w, mid); ctx.stroke();

    function envelope(which, sign) {
      ctx.beginPath();
      for (var x = 0; x <= w; x += 2) {
        var y = mid - sign * amp * fields.coupledEnvelope(q, k, span * x / w)[which];
        if (x === 0) ctx.moveTo(padL + x, y); else ctx.lineTo(padL + x, y);
      }
      ctx.stroke();
    }
    ctx.strokeStyle = ink.mute; ctx.lineWidth = 1.4; ctx.setLineDash([5, 5]);
    envelope('primary', 1); envelope('primary', -1);
    ctx.setLineDash([]);

    // the second circuit: its oscillation when there is room to draw it, and always its outline
    if (span <= w / 12) {
      ctx.strokeStyle = ink.faint; ctx.lineWidth = 1;
      ctx.beginPath();
      for (var x = 0; x <= w; x += 0.5) {
        var y = mid - amp * fields.coupledRing(q, k, span * x / w).secondary;
        if (x === 0) ctx.moveTo(padL + x, y); else ctx.lineTo(padL + x, y);
      }
      ctx.stroke();
    }
    ctx.strokeStyle = ink.fg; ctx.lineWidth = 2.2;
    envelope('secondary', 1); envelope('secondary', -1);

    ctx.fillStyle = ink.mute; ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left'; ctx.fillText('0', padL, c.h - 6);
    ctx.textAlign = 'right'; ctx.fillText(seconds(span / state.f0), padL + w, c.h - 6);
    if (cross < span) {
      var cx = padL + cross / span * w;
      ctx.strokeStyle = ink.mute; ctx.lineWidth = 1; ctx.setLineDash([2, 4]);
      ctx.beginPath(); ctx.moveTo(cx, padT); ctx.lineTo(cx, padT + h); ctx.stroke();
      ctx.setLineDash([]);
      if (cx > padL + 50 && cx < padL + w - 110) {      // leave it out where it would sit on an end label
        ctx.textAlign = 'center';
        ctx.fillText(seconds(cross / state.f0), cx, c.h - 6);
      }
    }
  }

  /* ------------------------------------------------------------- sound */

  function renderSound() {
    el.volumeOut.textContent = Math.round(state.volume * 100) + '%';
    el.strikeBtn.textContent = sounding === 'one' ? 'Stop' : 'Strike';
    el.pairStrikeBtn.textContent = sounding === 'pair' ? 'Stop' : 'Strike the first';
    el.strikeBtn.setAttribute('aria-pressed', sounding === 'one' ? 'true' : 'false');
    el.pairStrikeBtn.setAttribute('aria-pressed', sounding === 'pair' ? 'true' : 'false');
  }

  function strikeNow(which) {
    if (sounding === which) { strike.stop(); return; }
    if (!SP.Strike.isSupported()) return;
    var rate = strike.sampleRate();
    var samples = which === 'pair'
      ? fields.coupledSamples(state.f0, state.q, state.k, rate, MAX_SOUND_S)
      : fields.ringSamples(state.f0, state.q, rate, MAX_SOUND_S);
    strike.play({ samples: samples, freq: state.f0, volume: state.volume, ceilingDb: ceilingDb });
    sounding = which;
    renderSound();
  }

  /* -------------------------------------------------------------- loop */

  function frame(now) {
    var dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
    last = now;
    if (linesDirty) buildLines();
    if (state.flow) flowTime += dt;
    if (view && view.ok) {
      if (state.flow) view.paint(flowTime);
      viewer.render();
    }
    if (state.turning) turnAngle += dt * 2 * Math.PI / TURN_SECONDS;
    if (state.turning || plotsDirty) { drawTurn(); drawPhases(); }
    if (plotsDirty) { drawResonance(); drawLag(); drawPair(); drawSwap(); plotsDirty = false; }
    root.requestAnimationFrame(frame);
  }

  /* ------------------------------------------------------------- theme */

  function applyTheme(next) {
    theme = next === 'light' ? 'light' : 'dark';
    document.documentElement.dataset.theme = theme;
    var other = theme === 'dark' ? 'light' : 'dark';
    el.themeBtn.textContent = other === 'light' ? 'Light' : 'Dark';
    el.themeBtn.setAttribute('aria-label', 'Switch to ' + other + ' theme');
    var css = getComputedStyle(document.documentElement);
    ink.fg = css.getPropertyValue('--fg').trim();
    ink.soft = css.getPropertyValue('--fg-soft').trim();
    ink.mute = css.getPropertyValue('--mute').trim();
    ink.faint = css.getPropertyValue('--faint').trim();
    ink.line = css.getPropertyValue('--line').trim();
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', css.getPropertyValue('--bg').trim());
    if (viewer) viewer.setTheme(theme);
    if (view) view.setTheme(theme);
    plotsDirty = true;
  }

  /* -------------------------------------------------------------- init */

  function check(name, value) {
    var r = document.querySelector('input[name="' + name + '"][value="' + value + '"]');
    if (r) r.checked = true;
  }

  function init() {
    ['themeBtn', 'stage', 'stageMsg', 'kindCaption', 'kindHint', 'flowBtn', 'viewReset', 'twistField', 'twist', 'twistOut',
      'turnCanvas', 'phaseCanvas', 'turnCaption', 'turnBtn', 'supplyHz', 'poles', 'rpm', 'rps', 'strength', 'slowed',
      'resState', 'f0', 'f0Hint', 'q', 'qOut', 'drive', 'driveOut', 'edgeLow', 'atPeak', 'edgeHigh',
      'resCanvas', 'lagCanvas', 'gain', 'lag', 'bw', 'ring', 'cycles',
      'volume', 'volumeOut', 'strikeBtn', 'strikeHint', 'pairState', 'coupling', 'couplingOut', 'looseBtn', 'criticalBtn',
      'tightBtn', 'pairStrikeBtn', 'pairCanvas', 'swapCanvas', 'pairLow', 'pairHigh', 'pairCrit', 'pairCross', 'pairArrives'
    ].forEach(function (id) { el[id] = $(id); });

    load();

    viewer = new SP.Viewer(el.stage);
    view = new SP.FieldView(viewer);
    if (!viewer.ok) {
      el.stageMsg.hidden = false;
      el.stageMsg.textContent = 'This browser cannot show 3D here. The rotating field and the resonance curve below still work.';
    }

    check('kind', state.kind);
    check('phases', state.phases);
    el.twist.value = state.twist;
    el.supplyHz.value = state.supplyHz;
    el.poles.value = state.poles;
    syncResonanceControls();

    applyTheme(theme);
    renderKind(); renderFlow(); renderTurn(); renderResonance(); renderSound();

    document.querySelectorAll('input[name="kind"]').forEach(function (r) {
      r.addEventListener('change', function () { state.kind = r.value; renderKind(); save(); });
    });
    el.twist.addEventListener('input', function () {
      state.twist = num(el.twist.value, 0.05, 1.5, state.twist);
      renderKind(); save();
    });
    el.flowBtn.addEventListener('click', function () { state.flow = !state.flow; renderFlow(); });
    el.viewReset.addEventListener('click', function () { viewer.resetView(); });

    document.querySelectorAll('input[name="phases"]').forEach(function (r) {
      r.addEventListener('change', function () { state.phases = Number(r.value); renderTurn(); plotsDirty = true; save(); });
    });
    el.turnBtn.addEventListener('click', function () { state.turning = !state.turning; renderTurn(); });
    el.supplyHz.addEventListener('input', function () {
      var v = Number(el.supplyHz.value);
      if (!isFinite(v) || v < 1) return;               // wait for a usable number
      state.supplyHz = Math.min(1000, v);
      renderTurn(); save();
    });
    el.supplyHz.addEventListener('change', function () { el.supplyHz.value = state.supplyHz; });
    el.poles.addEventListener('change', function () { state.poles = Number(el.poles.value); renderTurn(); save(); });

    el.f0.addEventListener('input', function () {
      var v = Number(el.f0.value);
      if (!isFinite(v) || v < freq.F_MIN) return;
      state.f0 = Math.min(freq.F_MAX, v);
      state.fromConsole = false;
      renderResonance(); save();
    });
    el.f0.addEventListener('change', function () { el.f0.value = Math.round(state.f0 * 10) / 10; });
    el.q.addEventListener('input', function () {
      state.q = Math.min(Q_MAX, Math.max(1, sliderToQ(Number(el.q.value))));
      renderResonance(); save();
    });
    el.drive.addEventListener('input', function () {
      state.drive = num(el.drive.value, -1000, 1000, 0);
      renderResonance(); save();
    });
    function driveTo(ratio) {
      state.drive = ratioToDrive(ratio);
      el.drive.value = state.drive;
      // the slider moves in steps, so keep the exact value rather than the one it rounded to
      renderResonance(); save();
    }
    el.atPeak.addEventListener('click', function () { driveTo(1); });
    el.edgeLow.addEventListener('click', function () { driveTo(Math.max(1 / RATIO_SPAN, 1 - 1 / (2 * state.q))); });
    el.edgeHigh.addEventListener('click', function () { driveTo(1 + 1 / (2 * state.q)); });

    el.coupling.addEventListener('input', function () {
      state.k = Math.min(K_MAX, Math.max(K_MIN, sliderToK(Number(el.coupling.value))));
      renderPair(); save();
    });
    function coupleTo(k) {
      state.k = Math.min(K_MAX, Math.max(K_MIN, k));
      el.coupling.value = kToSlider(state.k);
      renderPair(); save();
    }
    el.looseBtn.addEventListener('click', function () { coupleTo(fields.criticalCoupling(state.q) / 3); });
    el.criticalBtn.addEventListener('click', function () { coupleTo(fields.criticalCoupling(state.q)); });
    el.tightBtn.addEventListener('click', function () { coupleTo(fields.criticalCoupling(state.q) * 5); });

    el.volume.addEventListener('input', function () {
      state.volume = num(Number(el.volume.value) / 100, 0, 1, state.volume);
      renderSound(); save();
    });
    strike.onend = function () { sounding = ''; renderSound(); };
    el.strikeBtn.addEventListener('click', function () { strikeNow('one'); });
    el.pairStrikeBtn.addEventListener('click', function () { strikeNow('pair'); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && sounding) { strike.stop(); e.preventDefault(); }
    });

    el.themeBtn.addEventListener('click', function () {
      applyTheme(theme === 'dark' ? 'light' : 'dark');
      try {
        var s = readJson(CONSOLE_KEY);
        s.theme = theme;
        localStorage.setItem(CONSOLE_KEY, JSON.stringify(s));
      } catch (e) { /* not fatal */ }
    });

    root.addEventListener('resize', function () { plotsDirty = true; });
    if (root.ResizeObserver) {
      new ResizeObserver(function () { plotsDirty = true; }).observe(el.resCanvas);
      new ResizeObserver(function () { plotsDirty = true; }).observe(el.turnCanvas);
    }
    root.addEventListener('pagehide', function () { strike.stop(); flush(); });
    document.addEventListener('visibilitychange', function () { if (document.hidden) flush(); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { plotsDirty = true; });

    root.requestAnimationFrame(frame);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  // Exposed for debugging from the browser console; not a public API.
  SP.fieldsPage = {
    current: function () {
      return {
        state: state, turnAngle: turnAngle, flowTime: flowTime, segments: view ? view.count : 0,
        webgl: !!(viewer && viewer.ok), sounding: sounding, soundSeconds: strike.duration || 0
      };
    },
    strike: strike
  };
})(typeof self !== 'undefined' ? self : this);
