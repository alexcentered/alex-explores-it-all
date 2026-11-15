/*
 * core/chladni.js -- idealised model of a centre-driven square plate.
 *
 * Model, and its limits:
 *   - Mode shapes are the classic free-edge approximation
 *       phi_mn(x, y) = cos(m pi x) cos(n pi y),  x, y in [0, 1]
 *   - Mode frequencies follow thin-plate bending theory
 *       f_mn = C (m^2 + n^2),  C = (pi / 2 L^2) sqrt(D / (rho h)),
 *       D = E h^3 / (12 (1 - nu^2))
 *   - The driver sits at the centre, so only modes that move at the centre
 *     can be excited: m and n both even.
 *   - At any drive frequency the plate's shape is the sum of every such
 *     mode, each weighted by how close it is to resonance (a damped,
 *     driven oscillator). On a resonance one shape dominates; between
 *     resonances the shapes blend, exactly like sand going vague on the rig.
 *
 * A real plate has rounded-off corner behaviour, a bolt and washer adding
 * mass at the centre, and imperfect material, so real resonances land near
 * these predictions rather than on them. The "trim" factor exists so the
 * model can be aligned to the real plate once one resonance has been found.
 *
 * Pure functions only. Phase two's 3D relief reads the same field.
 */
(function (root) {
  'use strict';

  var MATERIALS = {
    aluminium: { label: 'Aluminium', E: 69e9, rho: 2700, nu: 0.33 },
    brass:     { label: 'Brass',     E: 105e9, rho: 8500, nu: 0.34 },
    steel:     { label: 'Steel',     E: 200e9, rho: 7850, nu: 0.29 }
  };

  var DEFAULT_PLATE = { sideCm: 24, thicknessMm: 1, material: 'aluminium', trim: 1 };
  var DEFAULT_Q = 45;       // sharpness of each resonance
  var MAX_INDEX = 48;       // highest mode number ever summed

  function clamp(v, lo, hi) {
    return Math.min(hi, Math.max(lo, v));
  }

  function sanitizePlate(p) {
    var src = p || {};
    function num(v, d, lo, hi) {
      var n = Number(v);
      return isFinite(n) ? clamp(n, lo, hi) : d;
    }
    return {
      sideCm: num(src.sideCm, DEFAULT_PLATE.sideCm, 5, 100),
      thicknessMm: num(src.thicknessMm, DEFAULT_PLATE.thicknessMm, 0.2, 10),
      material: MATERIALS[src.material] ? src.material : DEFAULT_PLATE.material,
      trim: num(src.trim, 1, 0.25, 4)
    };
  }

  /* C in Hz, such that f_mn = C (m^2 + n^2). */
  function plateConstant(plate) {
    var p = sanitizePlate(plate);
    var mat = MATERIALS[p.material];
    var L = p.sideCm / 100;
    var h = p.thicknessMm / 1000;
    var D = mat.E * h * h * h / (12 * (1 - mat.nu * mat.nu));
    return p.trim * (Math.PI / (2 * L * L)) * Math.sqrt(D / (mat.rho * h));
  }

  function modeFrequency(C, m, n) {
    return C * (m * m + n * n);
  }

  /*
   * Every centre-driven resonance inside [fMin, fMax], lowest first.
   * (m, n) and (n, m) are the same pattern rotated, so each pair is listed
   * once with m >= n.
   */
  function modeTable(C, fMin, fMax) {
    var out = [];
    if (!(C > 0)) return out;
    for (var m = 0; m <= MAX_INDEX; m += 2) {
      if (modeFrequency(C, m, 0) > fMax) break;
      for (var n = 0; n <= m; n += 2) {
        if (m === 0 && n === 0) continue;
        var f = modeFrequency(C, m, n);
        if (f > fMax) break;
        if (f >= fMin) out.push({ m: m, n: n, f: f, label: '(' + m + ',' + n + ')' });
      }
    }
    out.sort(function (a, b) { return a.f - b.f; });
    return out;
  }

  function nearestMode(table, freq) {
    var best = null;
    var bestDist = Infinity;
    for (var i = 0; i < table.length; i++) {
      var d = Math.abs(table[i].f - freq);
      if (d < bestDist) { bestDist = d; best = table[i]; }
    }
    return best;
  }

  /* Trim that would move the given mode exactly onto freq. */
  function trimToAlign(plate, mode, freq) {
    var p = sanitizePlate(plate);
    if (!mode || !(mode.f > 0)) return p.trim;
    return clamp(p.trim * freq / mode.f, 0.25, 4);
  }

  /* Highest mode number worth summing for a given drive frequency. */
  function indexLimit(C, freq) {
    var k = Math.ceil(Math.sqrt(2 * freq / C)) + 4;
    if (k % 2) k += 1;
    return clamp(k, 6, MAX_INDEX);
  }

  var cosCache = {};

  /* cos(k pi x) sampled at cell centres, for even k up to kMax. */
  function cosTable(size, kMax) {
    var key = size + ':' + kMax;
    if (cosCache[key]) return cosCache[key];
    var count = kMax / 2 + 1;
    var table = new Float32Array(count * size);
    for (var ki = 0; ki < count; ki++) {
      var k = ki * 2;
      for (var i = 0; i < size; i++) {
        table[ki * size + i] = Math.cos(k * Math.PI * (i + 0.5) / size);
      }
    }
    cosCache[key] = table;
    return table;
  }

  /*
   * Vibration amplitude over the plate at one drive frequency.
   * Returns a size x size Float32Array, row-major, scaled so its RMS is 1:
   * values near 0 are nodal lines (where sand settles), values above 1 are
   * the lively regions sand is thrown out of.
   */
  function field(freq, C, size, opts) {
    var o = opts || {};
    var Q = o.Q || DEFAULT_Q;
    var out = o.out && o.out.length === size * size ? o.out : new Float32Array(size * size);
    if (!(C > 0) || !(freq > 0)) { out.fill(1); return out; }

    var kMax = indexLimit(C, freq);
    var count = kMax / 2 + 1;
    var cosT = cosTable(size, kMax);
    var f2 = freq * freq;

    // Complex modal weights: coupling at the centre / modal mass / detuning.
    var wRe = new Float64Array(count * count);
    var wIm = new Float64Array(count * count);
    for (var mi = 0; mi < count; mi++) {
      for (var ni = 0; ni < count; ni++) {
        if (mi === 0 && ni === 0) continue;   // rigid-body motion, not a pattern
        var m = mi * 2, n = ni * 2;
        var fmn = modeFrequency(C, m, n);
        var a = fmn * fmn - f2;
        var b = freq * fmn / Q;
        var den = a * a + b * b;
        var centre = ((mi + ni) % 2) ? -1 : 1;       // cos(m pi/2) cos(n pi/2)
        var mass = (mi === 0 ? 1 : 0.5) * (ni === 0 ? 1 : 0.5);
        var s = centre / mass / den;
        wRe[mi * count + ni] = s * a;
        wIm[mi * count + ni] = -s * b;
      }
    }

    // Separable sum: fold the y direction first, then the x direction.
    var rowRe = new Float64Array(count * size);
    var rowIm = new Float64Array(count * size);
    var mi2, ni2, j, i;
    for (mi2 = 0; mi2 < count; mi2++) {
      for (ni2 = 0; ni2 < count; ni2++) {
        var re = wRe[mi2 * count + ni2];
        var im = wIm[mi2 * count + ni2];
        if (re === 0 && im === 0) continue;
        var cOff = ni2 * size, rOff = mi2 * size;
        for (j = 0; j < size; j++) {
          var cy = cosT[cOff + j];
          rowRe[rOff + j] += re * cy;
          rowIm[rOff + j] += im * cy;
        }
      }
    }

    var sumSq = 0;
    for (j = 0; j < size; j++) {
      for (i = 0; i < size; i++) {
        var uRe = 0, uIm = 0;
        for (mi2 = 0; mi2 < count; mi2++) {
          var cx = cosT[mi2 * size + i];
          uRe += cx * rowRe[mi2 * size + j];
          uIm += cx * rowIm[mi2 * size + j];
        }
        var mag2 = uRe * uRe + uIm * uIm;
        sumSq += mag2;
        out[j * size + i] = Math.sqrt(mag2);
      }
    }

    var rms = Math.sqrt(sumSq / (size * size));
    if (rms > 0) {
      var inv = 1 / rms;
      for (i = 0; i < out.length; i++) out[i] *= inv;
    } else {
      out.fill(1);
    }
    return out;
  }

  var api = {
    MATERIALS: MATERIALS,
    DEFAULT_PLATE: DEFAULT_PLATE,
    DEFAULT_Q: DEFAULT_Q,
    sanitizePlate: sanitizePlate,
    plateConstant: plateConstant,
    modeFrequency: modeFrequency,
    modeTable: modeTable,
    nearestMode: nearestMode,
    trimToAlign: trimToAlign,
    indexLimit: indexLimit,
    field: field
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (root.SP = root.SP || {}).chladni = api;
})(typeof self !== 'undefined' ? self : this);
