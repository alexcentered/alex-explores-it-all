/*
 * core/safety.js -- everything that decides how loud the output may be.
 *
 * Defence in depth, three independent layers:
 *   1. outputGain()   the commanded gain can never exceed the ceiling
 *   2. limiterCurve() a hard clipper after the gain stage enforces the same
 *                     ceiling on the actual samples, whatever came before it
 *   3. the engine's fade in / fade out, so nothing starts or stops abruptly
 *
 * Pure functions only, so the limits are unit tested rather than trusted.
 */
(function (root) {
  'use strict';

  var CEILING_MIN_DB = -30;
  var CEILING_MAX_DB = 0;
  var DEFAULT_CEILING_DB = -6;
  var DEFAULT_VOLUME = 0.25;

  /*
   * Below the knee the driver is doing long, slow strokes: that is where it
   * overheats or bottoms out. The guard scales level down in proportion.
   */
  var LF_KNEE_HZ = 60;

  /*
   * At equal peak level a square wave carries twice the power of a sine.
   * Trim it 3 dB so switching waveform does not double the load on the driver.
   */
  var WAVE_TRIM = { sine: 1, triangle: 1, square: Math.SQRT1_2 };
  var WAVEFORMS = ['sine', 'triangle', 'square'];

  function clamp(v, lo, hi) {
    return Math.min(hi, Math.max(lo, v));
  }

  function dbToLin(db) {
    return Math.pow(10, db / 20);
  }

  function linToDb(lin) {
    return lin > 0 ? 20 * Math.log10(lin) : -Infinity;
  }

  function sanitizeVolume(v) {
    var n = Number(v);
    return isFinite(n) ? clamp(n, 0, 1) : 0;
  }

  function sanitizeCeilingDb(db) {
    var n = Number(db);
    return isFinite(n) ? clamp(n, CEILING_MIN_DB, CEILING_MAX_DB) : DEFAULT_CEILING_DB;
  }

  function sanitizeWaveform(w) {
    return WAVEFORMS.indexOf(w) === -1 ? 'sine' : w;
  }

  /* Square-law taper: the fader has useful resolution at the quiet end. */
  function volumeToGain(v) {
    var x = sanitizeVolume(v);
    return x * x;
  }

  function lfGuardFactor(freq, enabled) {
    if (!enabled) return 1;
    var f = Number(freq);
    if (!isFinite(f) || f <= 0) return 0;
    return f >= LF_KNEE_HZ ? 1 : f / LF_KNEE_HZ;
  }

  /*
   * Linear peak gain for the master stage. Every factor is <= 1, so the
   * result is always <= the ceiling, and bad input degrades to silence.
   */
  function outputGain(p) {
    var ceiling = dbToLin(sanitizeCeilingDb(p.ceilingDb));
    var g = ceiling *
      volumeToGain(p.volume) *
      WAVE_TRIM[sanitizeWaveform(p.waveform)] *
      lfGuardFactor(p.freq, p.lfGuard !== false);
    return isFinite(g) ? clamp(g, 0, ceiling) : 0;
  }

  /*
   * Transfer curve for a WaveShaperNode: straight through inside the
   * ceiling, flat outside it. An odd length puts a sample exactly on zero.
   */
  function limiterCurve(ceilingDb, length) {
    var n = length || 4097;
    var c = dbToLin(sanitizeCeilingDb(ceilingDb));
    var curve = new Float32Array(n);
    for (var i = 0; i < n; i++) {
      var x = (i / (n - 1)) * 2 - 1;
      curve[i] = clamp(x, -c, c);
    }
    return curve;
  }

  var api = {
    CEILING_MIN_DB: CEILING_MIN_DB,
    CEILING_MAX_DB: CEILING_MAX_DB,
    DEFAULT_CEILING_DB: DEFAULT_CEILING_DB,
    DEFAULT_VOLUME: DEFAULT_VOLUME,
    LF_KNEE_HZ: LF_KNEE_HZ,
    WAVE_TRIM: WAVE_TRIM,
    WAVEFORMS: WAVEFORMS,
    dbToLin: dbToLin,
    linToDb: linToDb,
    sanitizeVolume: sanitizeVolume,
    sanitizeCeilingDb: sanitizeCeilingDb,
    sanitizeWaveform: sanitizeWaveform,
    volumeToGain: volumeToGain,
    lfGuardFactor: lfGuardFactor,
    outputGain: outputGain,
    limiterCurve: limiterCurve
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (root.SP = root.SP || {}).safety = api;
})(typeof self !== 'undefined' ? self : this);
