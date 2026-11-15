/*
 * core/disc.js -- idealised model of a round plate with a free edge.
 *
 * A round plate's modes are counted by two numbers:
 *   n  nodal diameters (straight still lines through the centre)
 *   s  nodal circles   (still rings)
 * with shape
 *   W(r, theta) = [ J_n(x r/a) + C I_n(x r/a) ] cos(n theta)
 * where J_n and I_n are Bessel functions and x is fixed by the edge being
 * free: no bending moment and no shear force at r = a. Those two conditions
 * give a determinant that is zero only at the allowed x; this file finds
 * those roots numerically rather than trusting a table.
 *
 * Frequency follows the same thin-plate theory as the square plate:
 *   f = x^2 / (2 pi a^2) * sqrt(D / (rho h))
 *
 * A driver at the centre can only excite modes that move at the centre,
 * which on a round plate means n = 0: pure rings. That is why a
 * centre-driven round plate draws concentric circles.
 *
 * Pure functions only.
 */
(function (root) {
  'use strict';

  var chladni = typeof module !== 'undefined' && module.exports
    ? require('./chladni.js')
    : root.SP.chladni;

  var N_MAX = 12;           // most nodal diameters offered
  var S_MAX = 8;            // most nodal circles offered
  var PROFILE_SAMPLES = 257;

  /* ------------------------------------------------------------ Bessel */

  /*
   * J_n(x) from its integral form, (1/pi) * integral over 0..pi of
   * cos(n t - x sin t). The integrand is smooth and periodic, so the plain
   * trapezoid rule converges extremely fast: no series, no asymptotics.
   */
  function besselJ(n, x) {
    var steps = 48 + Math.ceil(Math.abs(x) + n);
    var sum = 0.5 * (1 + Math.cos(n * Math.PI));        // the two end points
    for (var i = 1; i < steps; i++) {
      var t = Math.PI * i / steps;
      sum += Math.cos(n * t - x * Math.sin(t));
    }
    return sum / steps;
  }

  /*
   * exp(-x) * I_n(x), the modified Bessel function with its exponential
   * growth divided out so large arguments do not overflow.
   */
  function besselIScaled(n, x) {
    var steps = 48 + Math.ceil(Math.abs(x) + n);
    var sum = 0.5 * (1 + Math.exp(-2 * x) * Math.cos(n * Math.PI));
    for (var i = 1; i < steps; i++) {
      var t = Math.PI * i / steps;
      sum += Math.exp(x * (Math.cos(t) - 1)) * Math.cos(n * t);
    }
    return sum / steps;
  }

  function besselJPrime(n, x) {
    return n === 0 ? -besselJ(1, x) : 0.5 * (besselJ(n - 1, x) - besselJ(n + 1, x));
  }

  function besselIPrimeScaled(n, x) {
    return n === 0 ? besselIScaled(1, x) : 0.5 * (besselIScaled(n - 1, x) + besselIScaled(n + 1, x));
  }

  /* ----------------------------------------------------- free-edge modes */

  /*
   * The two edge conditions, evaluated for the J part and the I part of the
   * shape at the rim (radius taken as 1, I scaled by exp(-x)).
   */
  function edgeTerms(n, x, nu) {
    var n2 = n * n, x2 = x * x;
    var Ju = besselJ(n, x), Jp = x * besselJPrime(n, x);
    var Iu = besselIScaled(n, x), Ip = x * besselIPrimeScaled(n, x);
    return {
      mJ: -Jp + (n2 - x2) * Ju + nu * (Jp - n2 * Ju),
      vJ: -x2 * Jp - (1 - nu) * n2 * (Jp - Ju),
      mI: -Ip + (n2 + x2) * Iu + nu * (Ip - n2 * Iu),
      vI: x2 * Ip - (1 - nu) * n2 * (Ip - Iu)
    };
  }

  function edgeDeterminant(n, x, nu) {
    var e = edgeTerms(n, x, nu);
    return e.mJ * e.vI - e.mI * e.vJ;
  }

  var rootCache = {};

  /*
   * Every allowed x for n nodal diameters, up to xMax, lowest first.
   * Each entry: { n, s, x, c } where c multiplies the scaled I part.
   */
  function modeRoots(n, nu, xMax) {
    var key = n + ':' + nu.toFixed(4) + ':' + xMax.toFixed(2);
    if (rootCache[key]) return rootCache[key];
    var out = [];
    var step = 0.05;
    // Below about x = 1 lie only the rigid motions (lift and tilt), not vibrations.
    var x0 = 1, d0 = edgeDeterminant(n, x0, nu);
    for (var x1 = x0 + step; x1 <= xMax + step; x1 += step) {
      var d1 = edgeDeterminant(n, x1, nu);
      if (d0 === 0 || d0 * d1 < 0) {
        var lo = x0, hi = x1, dLo = d0;
        for (var it = 0; it < 60; it++) {
          var mid = 0.5 * (lo + hi), dMid = edgeDeterminant(n, mid, nu);
          if (dLo * dMid <= 0) hi = mid; else { lo = mid; dLo = dMid; }
        }
        var x = 0.5 * (lo + hi);
        if (x <= xMax) {
          var e = edgeTerms(n, x, nu);
          // With no nodal diameters, or one, the lowest vibration already has a ring.
          out.push({ n: n, s: out.length + (n < 2 ? 1 : 0), x: x, c: -e.mJ / e.mI });
        }
      }
      x0 = x1; d0 = d1;
    }
    rootCache[key] = out;
    return out;
  }

  /* Radial shape of one mode, sampled from centre (0) to rim (1). */
  function radialProfile(mode, samples) {
    var out = new Float64Array(samples);
    for (var i = 0; i < samples; i++) {
      var r = i / (samples - 1);
      var z = mode.x * r;
      // c was found against exp(-x) I_n(x), hence the exp(z - x) to undo the scaling.
      out[i] = besselJ(mode.n, z) + mode.c * Math.exp(z - mode.x) * besselIScaled(mode.n, z);
    }
    return out;
  }

  /* ------------------------------------------------------- frequencies */

  /* Hz per unit of x^2 for this plate, sideCm read as the diameter. */
  function frequencyScale(plate) {
    return 4 / (Math.PI * Math.PI) * chladni.plateConstant(plate);
  }

  function poisson(plate) {
    return chladni.MATERIALS[chladni.sanitizePlate(plate).material].nu;
  }

  function sanitizeMode(n, s) {
    var nn = Math.round(Number(n)), ss = Math.round(Number(s));
    nn = isFinite(nn) ? Math.min(N_MAX, Math.max(0, nn)) : 0;
    var sMin = nn < 2 ? 1 : 0;
    ss = isFinite(ss) ? Math.min(S_MAX, Math.max(sMin, ss)) : sMin;
    return { n: nn, s: ss };
  }

  /* One named mode: its root, shape coefficient and frequency on this plate. */
  function findMode(plate, n, s) {
    var want = sanitizeMode(n, s);
    var nu = poisson(plate);
    var xMax = 12;
    for (var tries = 0; tries < 6; tries++) {
      var roots = modeRoots(want.n, nu, xMax);
      for (var i = 0; i < roots.length; i++) {
        if (roots[i].s === want.s) {
          var m = roots[i];
          return { n: m.n, s: m.s, x: m.x, c: m.c, f: frequencyScale(plate) * m.x * m.x };
        }
      }
      xMax += 12;
    }
    return null;
  }

  /*
   * Resonances a centre driver can excite (rings only), inside [fMin, fMax].
   * Same record shape as chladni.modeTable so the console treats both alike.
   */
  function modeTable(plate, fMin, fMax) {
    var scale = frequencyScale(plate);
    if (!(scale > 0)) return [];
    var xMax = Math.min(80, Math.ceil(Math.sqrt(fMax / scale) / 4) * 4);
    return modeRoots(0, poisson(plate), xMax).map(function (m) {
      return {
        n: 0, s: m.s, x: m.x, c: m.c, f: scale * m.x * m.x,
        label: m.s + (m.s === 1 ? ' ring' : ' rings')
      };
    }).filter(function (m) { return m.f >= fMin && m.f <= fMax; });
  }

  /* -------------------------------------------------- driven response */

  var profileCache = {};

  function ringProfiles(plate, xMax) {
    var nu = poisson(plate);
    var key = nu.toFixed(4) + ':' + xMax.toFixed(2);
    if (profileCache[key]) return profileCache[key];
    var modes = modeRoots(0, nu, xMax).map(function (m) {
      var w = radialProfile(m, PROFILE_SAMPLES);
      // Modal mass: integral of W^2 r dr over the disc (trapezoid rule).
      var mass = 0;
      for (var i = 0; i < PROFILE_SAMPLES; i++) {
        var r = i / (PROFILE_SAMPLES - 1);
        mass += w[i] * w[i] * r * (i === 0 || i === PROFILE_SAMPLES - 1 ? 0.5 : 1);
      }
      return { x: m.x, w: w, centre: w[0], mass: mass / (PROFILE_SAMPLES - 1) };
    });
    profileCache[key] = modes;
    return modes;
  }

  /*
   * The centre-driven plate's response along a radius: complex amplitude
   * from centre to rim, scaled so its RMS over the disc's area is 1.
   * Displacement at phase p is re cos(p) - im sin(p). Null if unphysical.
   */
  function radialResponse(freq, plate, opts) {
    var scale = frequencyScale(plate);
    if (!(scale > 0) || !(freq > 0)) return null;
    var Q = (opts && opts.Q) || chladni.DEFAULT_Q;
    // Rounded up in steps so a sweep reuses the same cached mode shapes.
    var xMax = Math.min(80, Math.ceil((Math.sqrt(2 * freq / scale) + 4) / 8) * 8);
    var modes = ringProfiles(plate, xMax);
    var re = new Float32Array(PROFILE_SAMPLES), im = new Float32Array(PROFILE_SAMPLES);
    var f2 = freq * freq;
    modes.forEach(function (m) {
      var fm = scale * m.x * m.x;
      var a = fm * fm - f2, b = freq * fm / Q;
      var k = m.centre / m.mass / (a * a + b * b);
      for (var i = 0; i < PROFILE_SAMPLES; i++) {
        re[i] += k * a * m.w[i];
        im[i] -= k * b * m.w[i];
      }
    });
    var sum = 0, area = 0;
    for (var i = 0; i < PROFILE_SAMPLES; i++) {
      var r = i / (PROFILE_SAMPLES - 1);
      sum += (re[i] * re[i] + im[i] * im[i]) * r;
      area += r;
    }
    var rms = Math.sqrt(sum / area);
    if (!(rms > 0)) return null;
    for (i = 0; i < PROFILE_SAMPLES; i++) { re[i] /= rms; im[i] /= rms; }
    return { re: re, im: im };
  }

  /* Read a centre-to-rim profile at any radius 0..1. */
  function sampleProfile(profile, r) {
    var p = Math.min(1, Math.max(0, r)) * (profile.length - 1);
    var i = Math.min(profile.length - 2, Math.floor(p));
    var t = p - i;
    return profile[i] * (1 - t) + profile[i + 1] * t;
  }

  /*
   * Vibration amplitude over the plate for the 2D views: size x size,
   * row-major, RMS 1 on the plate and -1 everywhere off it, so the view
   * knows where the plate ends.
   */
  function field(freq, plate, size, opts) {
    var o = opts || {};
    var out = o.out && o.out.length === size * size ? o.out : new Float32Array(size * size);
    var resp = radialResponse(freq, plate, o);
    var mag = new Float32Array(PROFILE_SAMPLES);
    for (var k = 0; k < PROFILE_SAMPLES; k++) {
      mag[k] = resp ? Math.sqrt(resp.re[k] * resp.re[k] + resp.im[k] * resp.im[k]) : 1;
    }
    return rasterize(function (r) { return sampleProfile(mag, r); }, size, out, false);
  }

  /*
   * Paint value(r, theta) onto a square grid, marking everything off the
   * disc as -1. Pass needAngle = false for ring patterns to skip the angle.
   */
  function rasterize(value, size, out, needAngle) {
    var o = out || new Float32Array(size * size);
    for (var j = 0; j < size; j++) {
      var y = (j + 0.5) / size * 2 - 1;
      for (var i = 0; i < size; i++) {
        var x = (i + 0.5) / size * 2 - 1;
        var r = Math.sqrt(x * x + y * y);
        o[j * size + i] = r > 1 ? -1 : value(r, needAngle === false ? 0 : Math.atan2(y, x));
      }
    }
    return o;
  }

  /* One mode's radial shape, scaled to a peak of 1, for the 3D lab. */
  function modeProfile(mode, samples) {
    var w = radialProfile(mode, samples || PROFILE_SAMPLES);
    var peak = 0;
    for (var i = 0; i < w.length; i++) if (Math.abs(w[i]) > peak) peak = Math.abs(w[i]);
    var out = new Float32Array(w.length);
    for (i = 0; i < w.length; i++) out[i] = peak > 0 ? w[i] / peak : 0;
    return out;
  }

  var api = {
    N_MAX: N_MAX,
    S_MAX: S_MAX,
    PROFILE_SAMPLES: PROFILE_SAMPLES,
    besselJ: besselJ,
    besselIScaled: besselIScaled,
    modeRoots: modeRoots,
    sanitizeMode: sanitizeMode,
    findMode: findMode,
    frequencyScale: frequencyScale,
    modeTable: modeTable,
    radialResponse: radialResponse,
    sampleProfile: sampleProfile,
    modeProfile: modeProfile,
    field: field,
    rasterize: rasterize
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (root.SP = root.SP || {}).disc = api;
})(typeof self !== 'undefined' ? self : this);
