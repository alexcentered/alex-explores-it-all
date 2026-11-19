/*
 * core/relations.js -- the arithmetic that ties frequencies together.
 *
 * Everything the Relationships panel shows is computed here, so each line on
 * screen is a formula that can be checked:
 *
 *   harmonics       whole-number multiples: the tones inside any note
 *   intervals       small whole-number ratios: why some pairs sound settled
 *   rotation        f turns a second is 2 pi f radians a second
 *   electromagnetic the same frequency as a radio wave, and how long it is
 *   resonance       the tuned circuit, f = 1 / (2 pi sqrt(L C))
 *   the Earth       the cavity between ground and sky, and why pi is in it
 *
 * Pi keeps appearing for one reason: anything that repeats can be drawn as a
 * point going round a circle, and a circle's circumference is 2 pi radii.
 *
 * Pure functions only.
 */
(function (root) {
  'use strict';

  var C_LIGHT = 299792458;        // m/s
  var C_SOUND = 343;              // m/s, air at 20 degrees C
  var EARTH_RADIUS = 6371000;     // m, mean

  /* The harmonic series: f, 2f, 3f ... Each is one more wave fitted into the same length. */
  function harmonics(f, count) {
    var out = [];
    for (var n = 1; n <= (count || 8); n++) out.push({ n: n, hz: f * n });
    return out;
  }

  /* The same series downward: f/2, f/3 ... */
  function subharmonics(f, count) {
    var out = [];
    for (var n = 2; n <= (count || 4) + 1; n++) out.push({ n: n, hz: f / n });
    return out;
  }

  /*
   * Just intervals: the pairs of whole numbers the ear finds settled.
   * `cents` is the size in hundredths of a semitone; an octave is 1200.
   */
  var INTERVALS = [
    { name: 'Unison', a: 1, b: 1 },
    { name: 'Major second', a: 9, b: 8 },
    { name: 'Minor third', a: 6, b: 5 },
    { name: 'Major third', a: 5, b: 4 },
    { name: 'Fourth', a: 4, b: 3 },
    { name: 'Fifth', a: 3, b: 2 },
    { name: 'Major sixth', a: 5, b: 3 },
    { name: 'Octave', a: 2, b: 1 }
  ].map(function (i) {
    i.ratio = i.a / i.b;
    i.cents = 1200 * Math.log2(i.ratio);
    return i;
  });

  function octavesBetween(from, to) {
    return Math.log2(to / from);
  }

  /* Angular frequency: turns a second become radians a second. */
  function angular(f) {
    return 2 * Math.PI * f;
  }

  /* Wavelength of sound in air, metres. */
  function soundWavelength(f) {
    return C_SOUND / f;
  }

  /* Wavelength of an electromagnetic wave of the same frequency, metres. */
  function emWavelength(f) {
    return C_LIGHT / f;
  }

  /* The radio band a frequency falls in, by the international naming. */
  function emBand(f) {
    if (f < 3) return 'below the named radio bands';
    if (f < 30) return 'extremely low frequency (ELF)';
    if (f < 300) return 'super low frequency (SLF)';
    if (f < 3000) return 'ultra low frequency (ULF)';
    if (f < 30000) return 'very low frequency (VLF)';
    return 'low frequency (LF)';
  }

  /* A quarter of the electromagnetic wavelength: the natural length of a resonant aerial or coil. */
  function quarterWave(f) {
    return C_LIGHT / (4 * f);
  }

  /*
   * The tuned circuit. A coil (L henries) and a capacitor (C farads) pass
   * energy back and forth at f = 1 / (2 pi sqrt(L C)).
   */
  function lcFrequency(L, C) {
    return 1 / (2 * Math.PI * Math.sqrt(L * C));
  }

  /* The coil needed to ring at f with a given capacitor. */
  function lcInductance(f, C) {
    var w = angular(f);
    return 1 / (w * w * C);
  }

  /*
   * The Earth as a resonator. Radio waves trapped between the ground and the
   * upper atmosphere fit a whole number of times round the planet.
   *   circuit    how many times a second light could circle the Earth
   *   ideal(n)   the textbook cavity: circuit * sqrt(n (n + 1))
   *   measured   what instruments actually record, lower because the real
   *              upper atmosphere is a leaky, fuzzy wall
   */
  var EARTH = {
    circuit: C_LIGHT / (2 * Math.PI * EARTH_RADIUS),
    ideal: function (n) { return EARTH.circuit * Math.sqrt(n * (n + 1)); },
    measured: [7.83, 14.3, 20.8, 27.3, 33.8]
  };

  /*
   * Points of a Lissajous figure: one tone moving a dot side to side, the
   * other moving it up and down. A ratio of small whole numbers closes into
   * a still figure; anything else never repeats.
   */
  function lissajous(a, b, phase, count) {
    var n = count || 600;
    var pts = new Float32Array((n + 1) * 2);
    for (var i = 0; i <= n; i++) {
      var t = i / n * 2 * Math.PI;
      pts[i * 2] = Math.sin(a * t + (phase || 0));
      pts[i * 2 + 1] = Math.sin(b * t);
    }
    return pts;
  }

  /* Numbers a person can read: three significant figures and a sensible unit. */
  function formatSI(value, unit) {
    if (!isFinite(value)) return '--';
    var a = Math.abs(value);
    var scales = [[1e12, 'T'], [1e9, 'G'], [1e6, 'M'], [1e3, 'k'], [1, ''], [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n'], [1e-12, 'p']];
    for (var i = 0; i < scales.length; i++) {
      if (a >= scales[i][0] || i === scales.length - 1) {
        var v = value / scales[i][0];
        var digits = Math.abs(v) >= 100 ? 0 : Math.abs(v) >= 10 ? 1 : 2;
        return v.toFixed(digits) + ' ' + scales[i][1] + unit;
      }
    }
    return value + ' ' + unit;
  }

  var api = {
    C_LIGHT: C_LIGHT,
    C_SOUND: C_SOUND,
    EARTH_RADIUS: EARTH_RADIUS,
    harmonics: harmonics,
    subharmonics: subharmonics,
    INTERVALS: INTERVALS,
    octavesBetween: octavesBetween,
    angular: angular,
    soundWavelength: soundWavelength,
    emWavelength: emWavelength,
    emBand: emBand,
    quarterWave: quarterWave,
    lcFrequency: lcFrequency,
    lcInductance: lcInductance,
    EARTH: EARTH,
    lissajous: lissajous,
    formatSI: formatSI
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (root.SP = root.SP || {}).relations = api;
})(typeof self !== 'undefined' ? self : this);
