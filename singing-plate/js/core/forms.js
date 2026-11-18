/*
 * core/forms.js -- the standing waves behind the 3D lab's sphere and room.
 *
 * Like the plate model, these are mathematical ideals, not recordings:
 *
 *   sphere  surface waves on a ball, the shapes a vibrating droplet takes.
 *           Shape: a real spherical harmonic of degree l and order m.
 *           Frequency: Rayleigh's formula for a liquid drop held together
 *           by surface tension,
 *             f_l = (1 / 2 pi) sqrt( l (l - 1) (l + 2) sigma / (rho R^3) )
 *
 *   room    sound standing inside a hard-walled cube. Pressure is
 *             cos(nx pi x) cos(ny pi y) cos(nz pi z)
 *           and resonates at f = (c / 2L) sqrt(nx^2 + ny^2 + nz^2).
 *           In a cube, swapping the three numbers between the axes gives
 *           different waves at the same frequency, so they can be blended;
 *           the blend is what bends the flat node planes into curved sheets.
 *
 *   torus   waves running round a ring-shaped tube: once round the ring,
 *           and once round the tube's own girth. Unrolled, a torus is a
 *           sheet that joins up in both directions, so a wave must fit a
 *           whole number of times each way:
 *             f = (c / 2 pi) sqrt( (m / a)^2 + (n / R)^2 )
 *           with m waves round the tube (radius a) and n round the ring
 *           (radius R). The 2 pi is there because each path is a circle.
 *           Two such waves can stand still as a chequered pattern, or one
 *           can travel, its crests winding round the ring like the turns of
 *           a coil: a rotating field.
 *
 * Pure functions only.
 */
(function (root) {
  'use strict';

  var SPEED_OF_SOUND = 343;        // m/s, air at 20 degrees C
  var WATER = { sigma: 0.0728, rho: 998 };   // N/m and kg/m^3 at 20 degrees C
  var DEGREE_MIN = 2;              // l = 0 changes volume, l = 1 is just the drop moving
  var DEGREE_MAX = 24;
  var ROOM_INDEX_MAX = 12;

  function clamp(v, lo, hi) {
    return Math.min(hi, Math.max(lo, v));
  }

  function wholeNumber(v, lo, hi, fallback) {
    var n = Math.round(Number(v));
    return isFinite(n) ? clamp(n, lo, hi) : fallback;
  }

  /* ------------------------------------------------------------ sphere */

  /* Associated Legendre function P_l^m(x), sign convention ignored. */
  function legendre(l, m, x) {
    var pmm = 1;
    if (m > 0) {
      var s = Math.sqrt(Math.max(0, (1 - x) * (1 + x)));
      var fact = 1;
      for (var i = 1; i <= m; i++) { pmm *= fact * s; fact += 2; }
    }
    if (l === m) return pmm;
    var pmmp1 = x * (2 * m + 1) * pmm;
    if (l === m + 1) return pmmp1;
    var pll = 0;
    for (var ll = m + 2; ll <= l; ll++) {
      pll = (x * (2 * ll - 1) * pmmp1 - (ll + m - 1) * pmm) / (ll - m);
      pmm = pmmp1;
      pmmp1 = pll;
    }
    return pll;
  }

  function sanitizeHarmonic(l, m) {
    var degree = wholeNumber(l, 0, DEGREE_MAX, DEGREE_MIN);
    return { l: degree, m: wholeNumber(m, 0, degree, 0) };
  }

  /*
   * Real spherical harmonic sampled on a latitude / longitude grid.
   * Rows run from the north pole (row 0) to the south pole (row latSeg),
   * columns once round the axis. Signed, scaled to a peak of 1.
   * Returns (latSeg + 1) * lonSeg values.
   */
  function sphereHarmonic(l, m, latSeg, lonSeg) {
    var h = sanitizeHarmonic(l, m);
    var out = new Float32Array((latSeg + 1) * lonSeg);
    var peak = 0;
    var cosM = new Float64Array(lonSeg);
    for (var c = 0; c < lonSeg; c++) cosM[c] = Math.cos(h.m * 2 * Math.PI * c / lonSeg);
    for (var r = 0; r <= latSeg; r++) {
      var p = legendre(h.l, h.m, Math.cos(Math.PI * r / latSeg));
      for (c = 0; c < lonSeg; c++) {
        var v = p * cosM[c];
        out[r * lonSeg + c] = v;
        if (Math.abs(v) > peak) peak = Math.abs(v);
      }
    }
    if (peak > 0) for (var i = 0; i < out.length; i++) out[i] /= peak;
    return out;
  }

  /* Resonant frequency of degree l for a water drop of the given radius. */
  function dropletFrequency(l, radiusMm) {
    var R = clamp(Number(radiusMm) || 1, 0.05, 50) / 1000;
    return Math.sqrt(l * (l - 1) * (l + 2) * WATER.sigma / (WATER.rho * R * R * R)) / (2 * Math.PI);
  }

  /* The degree whose resonance lies nearest a frequency. */
  function dropletDegree(freq, radiusMm) {
    var best = DEGREE_MIN, bestDist = Infinity;
    for (var l = DEGREE_MIN; l <= DEGREE_MAX; l++) {
      var d = Math.abs(dropletFrequency(l, radiusMm) - freq);
      if (d < bestDist) { bestDist = d; best = l; }
    }
    return best;
  }

  /* -------------------------------------------------------------- room */

  function sanitizeRoomMode(n) {
    var src = n || [];
    var out = [0, 1, 2].map(function (i) { return wholeNumber(src[i], 0, ROOM_INDEX_MAX, 0); });
    if (out[0] + out[1] + out[2] === 0) out[0] = 1;   // (0,0,0) is silence
    return out;
  }

  function roomFrequency(n, sideCm) {
    var L = clamp(Number(sideCm) || 34.3, 1, 2000) / 100;
    return SPEED_OF_SOUND / (2 * L) * Math.sqrt(n[0] * n[0] + n[1] * n[1] + n[2] * n[2]);
  }

  /* The mode of a cube whose resonance lies nearest a frequency. */
  function roomModeFor(freq, sideCm) {
    var best = [1, 0, 0], bestDist = Infinity;
    for (var a = 0; a <= ROOM_INDEX_MAX; a++) {
      for (var b = 0; b <= a; b++) {
        for (var c = 0; c <= b; c++) {
          if (a === 0) continue;
          var d = Math.abs(roomFrequency([a, b, c], sideCm) - freq);
          if (d < bestDist) { bestDist = d; best = [a, b, c]; }
        }
      }
    }
    return best;
  }

  /* The distinct ways of assigning three mode numbers to the three axes. */
  function permutations(n) {
    var all = [
      [n[0], n[1], n[2]], [n[0], n[2], n[1]], [n[1], n[0], n[2]],
      [n[1], n[2], n[0]], [n[2], n[0], n[1]], [n[2], n[1], n[0]]
    ];
    var seen = {}, out = [];
    all.forEach(function (p) {
      var key = p.join(',');
      if (!seen[key]) { seen[key] = true; out.push(p); }
    });
    return out;
  }

  function cosAxis(k, count) {
    var t = new Float64Array(count);
    for (var i = 0; i < count; i++) t[i] = Math.cos(k * Math.PI * i / (count - 1));
    return t;
  }

  /*
   * Pressure pattern in the cube, sampled on (N + 1)^3 grid points with x
   * varying fastest, then y, then z. Signed, scaled to a peak of 1.
   * blend = true sums every distinct axis assignment of the mode numbers.
   */
  function roomField(n, blend, N) {
    var mode = sanitizeRoomMode(n);
    var terms = blend ? permutations(mode) : [mode];
    var S = N + 1;
    var out = new Float32Array(S * S * S);
    terms.forEach(function (t) {
      var cx = cosAxis(t[0], S), cy = cosAxis(t[1], S), cz = cosAxis(t[2], S);
      for (var k = 0; k < S; k++) {
        for (var j = 0; j < S; j++) {
          var yz = cy[j] * cz[k];
          var row = (k * S + j) * S;
          for (var i = 0; i < S; i++) out[row + i] += cx[i] * yz;
        }
      }
    });
    var peak = 0;
    for (var q = 0; q < out.length; q++) if (Math.abs(out[q]) > peak) peak = Math.abs(out[q]);
    if (peak > 1e-9) for (q = 0; q < out.length; q++) out[q] /= peak;
    else out.fill(0);
    return out;
  }

  /* Magnitude on one horizontal slice of the cube, RMS scaled, for 2D display. */
  function roomSlice(n, blend, size, height) {
    var mode = sanitizeRoomMode(n);
    var terms = blend ? permutations(mode) : [mode];
    var z = clamp(Number(height), 0, 1);
    var out = new Float32Array(size * size);
    var sumSq = 0;
    terms.forEach(function (t) {
      var cz = Math.cos(t[2] * Math.PI * z);
      for (var j = 0; j < size; j++) {
        var cy = Math.cos(t[1] * Math.PI * (j + 0.5) / size) * cz;
        for (var i = 0; i < size; i++) {
          out[j * size + i] += Math.cos(t[0] * Math.PI * (i + 0.5) / size) * cy;
        }
      }
    });
    for (var q = 0; q < out.length; q++) { out[q] = Math.abs(out[q]); sumSq += out[q] * out[q]; }
    return scaleToRms(out, sumSq);
  }

  /* -------------------------------------------------------------- torus */

  var TORUS_ASPECT = 0.38;         // tube radius as a fraction of ring radius
  var TORUS_INDEX_MAX = 12;

  function sanitizeTorusMode(m, n) {
    var mm = wholeNumber(m, 0, TORUS_INDEX_MAX, 1), nn = wholeNumber(n, 0, TORUS_INDEX_MAX, 3);
    if (mm === 0 && nn === 0) nn = 1;      // (0,0) is no wave at all
    return { m: mm, n: nn };
  }

  /* Resonant frequency of m waves round the tube and n round the ring. */
  function torusFrequency(m, n, ringCm) {
    var R = clamp(Number(ringCm) || 20, 1, 1000) / 100;
    var a = TORUS_ASPECT * R;
    return SPEED_OF_SOUND / (2 * Math.PI) * Math.sqrt((m / a) * (m / a) + (n / R) * (n / R));
  }

  /* Every mode up to fMax, lowest first. */
  function torusTable(ringCm, fMax, limit) {
    var out = [];
    for (var m = 0; m <= TORUS_INDEX_MAX; m++) {
      for (var n = 0; n <= TORUS_INDEX_MAX; n++) {
        if (m === 0 && n === 0) continue;
        var f = torusFrequency(m, n, ringCm);
        if (f <= fMax) out.push({ m: m, n: n, f: f });
      }
    }
    out.sort(function (x, y) { return x.f - y.f; });
    return limit ? out.slice(0, limit) : out;
  }

  function torusModeFor(freq, ringCm) {
    var best = { m: 0, n: 1 }, bestDist = Infinity;
    torusTable(ringCm, Infinity).forEach(function (t) {
      var d = Math.abs(t.f - freq);
      if (d < bestDist) { bestDist = d; best = { m: t.m, n: t.n }; }
    });
    return best;
  }

  /*
   * The wave on the torus surface at one moment, sampled round the ring
   * (ringSeg steps) and round the tube (tubeSeg steps), ring-major.
   *   standing   cos(m theta) cos(n phi) cos(phase): a pattern that breathes in place
   *   rotating   cos(m theta + n phi - phase): crests that travel, winding round
   */
  function torusValues(m, n, rotating, phase, ringSeg, tubeSeg) {
    var out = new Float32Array(ringSeg * tubeSeg);
    var cp = Math.cos(phase || 0);
    for (var i = 0; i < ringSeg; i++) {
      var phi = 2 * Math.PI * i / ringSeg;
      for (var j = 0; j < tubeSeg; j++) {
        var theta = 2 * Math.PI * j / tubeSeg;
        out[i * tubeSeg + j] = rotating
          ? Math.cos(m * theta + n * phi - (phase || 0))
          : Math.cos(m * theta) * Math.cos(n * phi) * cp;
      }
    }
    return out;
  }

  /* The still lines on the torus, unrolled flat: round the ring across, round the tube down. */
  function torusMap(m, n, rotating, phase, size) {
    var out = new Float32Array(size * size);
    var sumSq = 0;
    for (var j = 0; j < size; j++) {
      var theta = 2 * Math.PI * (j + 0.5) / size;
      for (var i = 0; i < size; i++) {
        var phi = 2 * Math.PI * (i + 0.5) / size;
        var v = Math.abs(rotating
          ? Math.cos(m * theta + n * phi - (phase || 0))
          : Math.cos(m * theta) * Math.cos(n * phi));
        out[j * size + i] = v;
        sumSq += v * v;
      }
    }
    return scaleToRms(out, sumSq);
  }

  /* ----------------------------------------------------- 2D companions */

  function scaleToRms(out, sumSq) {
    var rms = Math.sqrt(sumSq / out.length);
    if (rms > 1e-9) for (var i = 0; i < out.length; i++) out[i] /= rms;
    else out.fill(1);
    return out;
  }

  /* Magnitude of any signed field, RMS scaled, ready for the nodal-line view. */
  function magnitudeMap(signed) {
    var out = new Float32Array(signed.length);
    var sumSq = 0;
    for (var i = 0; i < signed.length; i++) { out[i] = Math.abs(signed[i]); sumSq += out[i] * out[i]; }
    return scaleToRms(out, sumSq);
  }

  /*
   * The sphere's nodal lines unrolled onto a square map: longitude across,
   * latitude down, like a world map of where the surface stays still.
   */
  function sphereMap(l, m, size) {
    var h = sanitizeHarmonic(l, m);
    var out = new Float32Array(size * size);
    var sumSq = 0;
    for (var j = 0; j < size; j++) {
      var p = legendre(h.l, h.m, Math.cos(Math.PI * (j + 0.5) / size));
      for (var i = 0; i < size; i++) {
        var v = Math.abs(p * Math.cos(h.m * 2 * Math.PI * (i + 0.5) / size));
        out[j * size + i] = v;
        sumSq += v * v;
      }
    }
    return scaleToRms(out, sumSq);
  }

  /*
   * Phase at which a driven plate is furthest from flat, so "freeze at peak"
   * captures the most pronounced shape. Displacement is re cos(p) - im sin(p).
   */
  function peakPhase(re, im) {
    var rr = 0, ii = 0, ri = 0;
    for (var i = 0; i < re.length; i++) {
      rr += re[i] * re[i];
      ii += im[i] * im[i];
      ri += re[i] * im[i];
    }
    return 0.5 * Math.atan2(-2 * ri, rr - ii);
  }

  var api = {
    SPEED_OF_SOUND: SPEED_OF_SOUND,
    DEGREE_MIN: DEGREE_MIN,
    DEGREE_MAX: DEGREE_MAX,
    ROOM_INDEX_MAX: ROOM_INDEX_MAX,
    legendre: legendre,
    sanitizeHarmonic: sanitizeHarmonic,
    sphereHarmonic: sphereHarmonic,
    sphereMap: sphereMap,
    dropletFrequency: dropletFrequency,
    dropletDegree: dropletDegree,
    sanitizeRoomMode: sanitizeRoomMode,
    roomFrequency: roomFrequency,
    roomModeFor: roomModeFor,
    permutations: permutations,
    roomField: roomField,
    roomSlice: roomSlice,
    TORUS_ASPECT: TORUS_ASPECT,
    TORUS_INDEX_MAX: TORUS_INDEX_MAX,
    sanitizeTorusMode: sanitizeTorusMode,
    torusFrequency: torusFrequency,
    torusTable: torusTable,
    torusModeFor: torusModeFor,
    torusValues: torusValues,
    torusMap: torusMap,
    magnitudeMap: magnitudeMap,
    peakPhase: peakPhase
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (root.SP = root.SP || {}).forms = api;
})(typeof self !== 'undefined' ? self : this);
