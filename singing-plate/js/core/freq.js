/*
 * core/freq.js -- frequency maths shared by every part of the rig console.
 * Pure functions only: no DOM, no audio. Loaded as a classic script in the
 * browser (attaches to window.SP.freq) and via require() in the Node tests.
 */
(function (root) {
  'use strict';

  var F_MIN = 20;
  var F_MAX = 5000;
  var STEP = 0.1;                 // finest resolution the console offers, in Hz
  var SPEED_OF_SOUND = 343;       // m/s in dry air at 20 degrees C
  var NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F',
                    'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];

  function clamp(v, lo, hi) {
    return Math.min(hi, Math.max(lo, v));
  }

  /* Snap to the 0.1 Hz grid without accumulating floating point drift. */
  function snap(f, step) {
    var s = step || STEP;
    return Math.round(f / s) * s;
  }

  /* Any number in, a legal console frequency out. Non-numbers fall back. */
  function sanitize(f, fallback) {
    var n = Number(f);
    if (!isFinite(n)) return fallback === undefined ? 440 : fallback;
    return Number(clamp(snap(n), F_MIN, F_MAX).toFixed(1));
  }

  function nudge(f, delta) {
    return sanitize(Number(f) + Number(delta), f);
  }

  /* Nearest equal-tempered note and how far off it we are, in cents. */
  function noteInfo(f, a4) {
    var ref = a4 || 440;
    var midiExact = 69 + 12 * Math.log2(f / ref);
    var midi = Math.round(midiExact);
    var cents = (midiExact - midi) * 100;
    var name = NOTE_NAMES[((midi % 12) + 12) % 12];
    var octave = Math.floor(midi / 12) - 1;
    return { midi: midi, name: name, octave: octave, label: name + octave, cents: cents };
  }

  function formatCents(cents) {
    var r = Math.round(cents);
    if (r === 0) return '±0 ¢';
    return (r > 0 ? '+' : '−') + Math.abs(r) + ' ¢';
  }

  /* Wavelength of the tone in air, metres. */
  function wavelength(f, c) {
    return (c || SPEED_OF_SOUND) / f;
  }

  function periodMs(f) {
    return 1000 / f;
  }

  function formatLength(m) {
    if (m >= 1) return m.toFixed(2) + ' m';
    if (m >= 0.01) return (m * 100).toFixed(1) + ' cm';
    return (m * 1000).toFixed(1) + ' mm';
  }

  function formatHz(f) {
    return Number(f).toFixed(1);
  }

  /*
   * The coarse dial is logarithmic: equal rotation = equal musical interval,
   * so 20 to 200 Hz gets as much travel as 500 to 5000 Hz.
   */
  function dialToFreq(t) {
    var x = clamp(t, 0, 1);
    return F_MIN * Math.pow(F_MAX / F_MIN, x);
  }

  function freqToDial(f) {
    return clamp(Math.log(f / F_MIN) / Math.log(F_MAX / F_MIN), 0, 1);
  }

  /* Coarse dial detent: whole hertz. Fine work belongs to the trim control. */
  function dialSnap(t) {
    return sanitize(Math.round(dialToFreq(t)));
  }

  var api = {
    F_MIN: F_MIN,
    F_MAX: F_MAX,
    STEP: STEP,
    SPEED_OF_SOUND: SPEED_OF_SOUND,
    clamp: clamp,
    snap: snap,
    sanitize: sanitize,
    nudge: nudge,
    noteInfo: noteInfo,
    formatCents: formatCents,
    wavelength: wavelength,
    periodMs: periodMs,
    formatLength: formatLength,
    formatHz: formatHz,
    dialToFreq: dialToFreq,
    freqToDial: freqToDial,
    dialSnap: dialSnap
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (root.SP = root.SP || {}).freq = api;
})(typeof self !== 'undefined' ? self : this);
