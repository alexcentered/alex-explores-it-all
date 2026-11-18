/*
 * core/liquid.js -- what to expect when the plate carries liquid, not sand.
 *
 * Shake a shallow layer of liquid hard enough and its surface breaks into a
 * pattern of standing ripples: Faraday waves. Two facts make them
 * predictable:
 *   - they oscillate at half the drive frequency
 *   - their spacing follows the dispersion relation for ripples on deep
 *     liquid, where gravity and surface tension both pull the surface flat:
 *       w^2 = g k + (sigma / rho) k^3
 *     with w the ripple's angular frequency and k = 2 pi / wavelength
 *
 * So for a given drive frequency the ripple spacing can be worked out, and
 * measured against a photo. Valid for water-like liquids a few millimetres
 * deep or more; thick mixes such as cornflour behave differently and are
 * not modelled.
 *
 * Pure functions only.
 */
(function (root) {
  'use strict';

  var G = 9.81;
  var LIQUIDS = {
    water: { label: 'Water', sigma: 0.0728, rho: 998 }     // N/m and kg/m^3 at 20 degrees C
  };

  /* Wavelength in metres of the Faraday ripples for a drive frequency in Hz. */
  function rippleWavelength(driveHz, liquid) {
    var l = liquid || LIQUIDS.water;
    var f = Number(driveHz);
    if (!(f > 0)) return NaN;
    var w2 = Math.pow(Math.PI * f, 2);          // (2 pi f / 2)^2
    var s = l.sigma / l.rho;
    // Newton's method, started from the surface-tension-only answer.
    var k = Math.cbrt(w2 / s);
    for (var i = 0; i < 30; i++) {
      var step = (G * k + s * k * k * k - w2) / (G + 3 * s * k * k);
      k -= step;
      if (Math.abs(step) < 1e-9 * k) break;
    }
    return 2 * Math.PI / k;
  }

  var api = { G: G, LIQUIDS: LIQUIDS, rippleWavelength: rippleWavelength };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (root.SP = root.SP || {}).liquid = api;
})(typeof self !== 'undefined' ? self : this);
