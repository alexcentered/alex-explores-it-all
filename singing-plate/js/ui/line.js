/*
 * ui/line.js -- runs the line test page.
 *
 * All of the arithmetic is in core/chance.js. This file draws the line,
 * plays the tones, feeds random bits to the session at a steady rate, and
 * keeps the record. It deliberately offers no way to influence a bit: the
 * only inputs during a session are Abandon and Esc, and a session ended
 * that way still goes on the record with the steps it had completed.
 */
(function (root) {
  'use strict';

  var SP = root.SP;
  var safety = SP.safety, chance = SP.chance;
  var CONSOLE_KEY = 'singing-plate:v1';
  var LOG_KEY = 'singing-plate:line:v1';
  var SPACING_PER_LEVEL = 0.5;       // Hz between the tones per step of waviness
  // Steps arrive four times a second. Tests set SP_LINE_TICK_MS to run a session quickly.
  var TICK_MS = Number(root.SP_LINE_TICK_MS) > 0 ? Number(root.SP_LINE_TICK_MS) : 1000 / chance.TICKS_PER_SECOND;

  function $(id) { return document.getElementById(id); }

  var el = {};
  var duo = new SP.Duo();
  var theme = 'dark';
  var ceilingDb = safety.DEFAULT_CEILING_DB;
  var ink = { fg: '#f2f2f2', faint: '#5a5a5a', line: 'rgba(255,255,255,0.12)' };

  var session = null;        // the session in progress, or the last finished one
  var running = false;
  var timer = null;
  var shown = chance.LEVEL_START;    // the waviness on screen, eased toward session.level
  var phase = 0;
  var log = [];

  function readJson(key, fallback) {
    try {
      var v = JSON.parse(localStorage.getItem(key) || 'null');
      return v === null ? fallback : v;
    } catch (e) { return fallback; }
  }

  function saveLog() {
    try { localStorage.setItem(LOG_KEY, JSON.stringify(log)); } catch (e) { /* not fatal */ }
  }

  /* One fair bit from the operating system's random source. */
  function randomBit() {
    var byte = new Uint8Array(1);
    root.crypto.getRandomValues(byte);
    return byte[0] & 1;
  }

  /* ---------------------------------------------------------- session */

  function chosen(name) {
    var r = document.querySelector('input[name="' + name + '"]:checked');
    return r ? r.value : '';
  }

  function start() {
    if (running) return;
    var trials = Number(chosen('length')) || chance.LENGTHS[1];
    session = chance.newSession(trials, chosen('kind'));
    shown = session.level;
    running = true;
    if (el.soundOn.checked && SP.Duo.isSupported()) {
      duo.start({
        base: toneHz(), spacing: session.level * SPACING_PER_LEVEL,
        volume: Number(el.lineVolume.value) / 100, ceilingDb: ceilingDb
      });
    }
    timer = setInterval(tick, TICK_MS);
    renderRun();
    renderLive();
  }

  function tick() {
    if (!running) return;
    var done = chance.step(session, randomBit());
    if (duo.playing) duo.setSpacing(session.level * SPACING_PER_LEVEL);
    renderLive();
    if (done) finish();
  }

  /* A completed session goes on the record exactly as it fell. */
  function finish() {
    stopRun();
    record(false);
    el.runState.textContent = 'Complete';
    renderLive();
    renderRecord();
  }

  /*
   * An abandoned session is recorded too, with the steps it reached.
   * Discarding it would let quitting-when-behind bias the record.
   */
  function abandon(panic) {
    if (!running) return;
    stopRun(panic);
    var counted = session.done > 0;
    if (counted) record(true);
    el.runState.textContent = counted ? 'Abandoned: ' + session.done + ' steps counted' : 'Abandoned before the first step';
    renderLive();
    renderRecord();
  }

  function record(abandoned) {
    log.push({ kind: session.kind, n: session.done, hits: session.hits, at: Date.now(), abandoned: abandoned });
    log = chance.sanitizeLog(log);
    saveLog();
  }

  function stopRun(panic) {
    running = false;
    clearInterval(timer);
    timer = null;
    if (duo.playing) { if (panic) duo.panic(); else duo.stop(); }
    renderRun();
  }

  function toneHz() {
    var n = Number(el.toneHz.value);
    return isFinite(n) ? Math.min(1000, Math.max(60, n)) : 110;
  }

  /* ---------------------------------------------------------- display */

  function renderRun() {
    el.startBtn.disabled = running;
    el.abandonBtn.disabled = !running;
    document.querySelectorAll('input[name="kind"], input[name="length"]').forEach(function (r) { r.disabled = running; });
    el.toneHz.disabled = running;
    el.soundOn.disabled = running;
    if (running) el.runState.textContent = session.kind === 'control' ? 'Control run' : 'Running';
    el.status.dataset.state = running && duo.playing ? 'live' : 'standby';
    el.statusText.textContent = running ? (duo.playing ? 'Tones live' : 'Running, silent') : 'Standby';
    el.runState.dataset.state = running ? 'running' : '';
  }

  function formatZ(z) {
    return (z >= 0 ? '+' : '−') + Math.abs(z).toFixed(2) + ' σ';
  }

  function formatOdds(p) {
    if (p >= 0.5) return 'more often than not';
    var n = 1 / p;
    return 'about 1 time in ' + (n >= 100 ? Math.round(n).toLocaleString('en-US') : n.toFixed(n < 10 ? 1 : 0));
  }

  function mmss(seconds) {
    var s = Math.max(0, Math.ceil(seconds));
    var m = Math.floor(s / 60), r = s % 60;
    return (m < 10 ? '0' : '') + m + ':' + (r < 10 ? '0' : '') + r;
  }

  function renderLive() {
    var trials = session ? session.trials : Number(chosen('length')) || chance.LENGTHS[1];
    var done = session ? session.done : 0;
    var hits = session ? session.hits : 0;
    el.progressFill.style.width = (done / trials * 100) + '%';
    el.progressText.textContent = done + ' of ' + trials + ' steps';
    el.timeLeft.textContent = mmss((trials - done) / chance.TICKS_PER_SECOND);
    el.liveHits.textContent = hits;
    el.liveMiss.textContent = done - hits;
    el.liveRate.textContent = done ? (hits / done * 100).toFixed(1) + '%' : '--';
    var z = chance.zScore(hits, done);
    el.liveZ.textContent = done ? formatZ(z) : '--';

    // The verdict waits for the end: a running tally invites stopping at a lucky moment.
    var finished = session && !running && done > 0;
    el.liveVerdict.hidden = !finished;
    if (finished) {
      el.liveVerdict.textContent = (done < trials ? 'This session, abandoned early: ' : 'This session: ') + hits + ' of ' + done + ' steps went flatter (' +
        (hits / done * 100).toFixed(1) + '%). ' + chance.verdict(z, done).text;
    }
    renderBlocks();
  }

  /* Ten boxes, one per tenth of the session, each drawn as flat as that tenth went. */
  function renderBlocks() {
    var blocks = session ? session.blocks : null;
    Array.prototype.forEach.call(el.blocks.children, function (li, i) {
      var b = blocks ? blocks[i] : null;
      var path = li.querySelector('path');
      if (!b || b.n === 0) {
        li.dataset.state = 'pending';
        path.setAttribute('d', 'M2 15 H58');
        li.setAttribute('aria-label', 'Part ' + (i + 1) + ': not reached');
        return;
      }
      var rate = b.hits / b.n;
      // Half and half draws a middling wave; all flatter draws a flat line.
      var amp = Math.max(0, Math.min(1, (1 - rate) * 2)) * 10;
      var d = 'M2 15';
      for (var x = 2; x <= 58; x += 2) d += ' L' + x + ' ' + (15 - amp * Math.sin((x - 2) / 56 * Math.PI * 4)).toFixed(2);
      path.setAttribute('d', d);
      li.dataset.state = b.n * chance.BLOCKS >= (session.trials) ? 'done' : 'live';
      li.setAttribute('aria-label', 'Part ' + (i + 1) + ': ' + Math.round(rate * 100) + '% of steps flatter');
    });
  }

  function renderRecord() {
    var intent = chance.combine(log, 'intent'), control = chance.combine(log, 'control');
    fillRow(el.rowIntent, intent);
    fillRow(el.rowControl, control);
    el.clearBtn.disabled = log.length === 0;

    var text;
    if (!intent.n) {
      text = 'No sessions on record yet.';
    } else {
      text = 'Trying, all sessions together: ' + chance.verdict(intent.z, intent.n).text;
      if (control.n) {
        // Trying against control: the comparison that matters. Difference of two proportions.
        var se = Math.sqrt(0.25 / intent.n + 0.25 / control.n);
        var zd = (intent.rate - control.rate) / se;
        var dv = chance.verdict(zd, intent.n);
        text += ' Against your control sessions the difference is ' + formatZ(zd) + '. ' +
          (dv.level === 'chance' ? 'That is no difference beyond chance.' : dv.text);
      } else {
        text += ' Run some control sessions to have something to compare with.';
      }
    }
    el.recordVerdict.textContent = text;
  }

  function fillRow(row, c) {
    var cells = row.querySelectorAll('td');
    cells[0].textContent = c.sessions + (c.abandoned ? ' (' + c.abandoned + ' abandoned)' : '');
    cells[1].textContent = c.n.toLocaleString('en-US');
    cells[2].textContent = c.n ? (c.rate * 100).toFixed(2) + '%' : '--';
    cells[3].textContent = c.n ? formatZ(c.z) : '--';
    cells[4].textContent = c.n ? formatOdds(c.p) : '--';
  }

  /* ------------------------------------------------------------ canvas */

  var lastDraw = 0;

  function draw(t) {
    // Eased by elapsed time, not by frame count, so a slow display settles just as fast.
    var dt = Math.min(0.25, Math.max(0, (t - lastDraw) / 1000 || 0));
    lastDraw = t;
    var target = session ? session.level : chance.LEVEL_START;
    shown += (target - shown) * (1 - Math.exp(-dt / 0.13));
    if (running) phase += dt * 3.3;
    var c = el.lineCanvas, ctx = c.getContext('2d');
    var w = c.width, h = c.height, mid = h / 2;
    ctx.clearRect(0, 0, w, h);

    ctx.strokeStyle = ink.line;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (var gx = 0; gx <= w; gx += w / 12) { ctx.moveTo(gx, 0); ctx.lineTo(gx, h); }
    for (var gy = 0; gy <= h; gy += h / 4) { ctx.moveTo(0, gy); ctx.lineTo(w, gy); }
    ctx.stroke();

    var amp = shown / chance.LEVEL_MAX * (mid - 28);
    ctx.strokeStyle = running || (session && session.done) ? ink.fg : ink.faint;
    ctx.lineWidth = 4;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (var x = 0; x <= w; x += 4) {
      var y = mid - amp * Math.sin(x / w * Math.PI * 6 + phase);
      if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    root.requestAnimationFrame(draw);
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
    ink.faint = css.getPropertyValue('--faint').trim();
    ink.line = css.getPropertyValue('--line').trim();
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', css.getPropertyValue('--bg').trim());
  }

  /* -------------------------------------------------------------- init */

  function init() {
    ['status', 'statusText', 'themeBtn', 'runState', 'lineCanvas', 'blocks', 'progressFill', 'progressText',
      'timeLeft', 'liveHits', 'liveMiss', 'liveRate', 'liveZ', 'liveVerdict', 'kindHint', 'toneHz',
      'lineVolume', 'lineVolumeOut', 'soundOn', 'startBtn', 'abandonBtn', 'clearBtn', 'rowIntent',
      'rowControl', 'recordVerdict'
    ].forEach(function (id) { el[id] = $(id); });

    var settings = readJson(CONSOLE_KEY, {}) || {};
    if (settings.theme === 'light') theme = 'light';
    if (settings.ceilingDb !== undefined) ceilingDb = safety.sanitizeCeilingDb(settings.ceilingDb);
    log = chance.sanitizeLog(readJson(LOG_KEY, []));

    for (var i = 0; i < chance.BLOCKS; i++) {
      var li = document.createElement('li');
      li.innerHTML = '<svg viewBox="0 0 60 30" aria-hidden="true"><path d="M2 15 H58"/></svg>';
      el.blocks.appendChild(li);
    }

    applyTheme(theme);
    renderRun();
    renderLive();
    renderRecord();

    el.startBtn.addEventListener('click', start);
    el.abandonBtn.addEventListener('click', function () { abandon(false); });
    document.querySelectorAll('input[name="kind"]').forEach(function (r) {
      r.addEventListener('change', function () {
        el.kindHint.textContent = chosen('kind') === 'control'
          ? 'Control: let it run with your attention elsewhere. Read, look away, do not try.'
          : 'Trying: hum the tone in your mind and will the line flat.';
      });
    });
    document.querySelectorAll('input[name="length"]').forEach(function (r) {
      r.addEventListener('change', function () { if (!running) { session = null; renderLive(); } });
    });
    el.lineVolume.addEventListener('input', function () {
      el.lineVolumeOut.textContent = el.lineVolume.value + '%';
      duo.setVolume(Number(el.lineVolume.value) / 100, ceilingDb);
    });
    el.toneHz.addEventListener('change', function () { el.toneHz.value = toneHz(); });

    // Two-step clear, so a record is not wiped by a stray click.
    el.clearBtn.addEventListener('click', function () {
      if (el.clearBtn.classList.contains('armed')) {
        log = [];
        saveLog();
        el.clearBtn.classList.remove('armed');
        el.clearBtn.textContent = 'Clear record';
        renderRecord();
      } else {
        el.clearBtn.classList.add('armed');
        el.clearBtn.textContent = 'Confirm clear';
        setTimeout(function () {
          el.clearBtn.classList.remove('armed');
          el.clearBtn.textContent = 'Clear record';
        }, 3500);
      }
    });

    el.themeBtn.addEventListener('click', function () {
      applyTheme(theme === 'dark' ? 'light' : 'dark');
      try {
        var s = readJson(CONSOLE_KEY, {}) || {};
        s.theme = theme;
        localStorage.setItem(CONSOLE_KEY, JSON.stringify(s));
      } catch (e) { /* not fatal */ }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && running) { abandon(true); e.preventDefault(); }
    });
    // Leaving the page mid-session abandons it, like any other early stop.
    root.addEventListener('pagehide', function () { if (running) abandon(true); });

    root.requestAnimationFrame(draw);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  // Exposed for debugging from the browser console; not a public API.
  SP.line = { current: function () { return { session: session, running: running, log: log }; }, duo: duo };
})(typeof self !== 'undefined' ? self : this);
