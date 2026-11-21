/*
 * core/fields.js -- magnetic fields, a rotating field, resonance, coupled circuits.
 *
 * Four pieces of physics for the Fields page.
 *
 * 1. Field lines round a ring.
 *    A current flowing round a ring makes a magnetic field that loops
 *    through the hole and back round the outside: the "poloidal" field.
 *    A coil wound round a ring-shaped former (a toroidal coil) makes a
 *    field that stays inside the former and runs round the ring: the
 *    "toroidal" field. Put the two together and the lines become helices
 *    lying on nested ring-shaped surfaces.
 *    The ring current's field comes from the Biot-Savart law, summed
 *    numerically over short pieces of the ring. The ideal toroidal coil has
 *    a closed form: inside, strength falls as 1 / distance from the axis;
 *    outside, nothing.
 *
 * 2. The rotating field.
 *    Coils set at angles round a circle, fed alternating currents that peak
 *    one after another, add up to a field of constant strength that turns.
 *    One coil alone only pulses back and forth. This is the principle of
 *    Tesla's induction motor.
 *
 * 3. The resonance curve.
 *    How strongly anything that can ring (a plate, a tuned circuit, a
 *    bridge) responds when driven at a frequency near its own. Q measures
 *    how sharp the peak is.
 *
 * 4. Two tuned circuits.
 *    Two matched resonators whose coils share some magnetic field pass
 *    their energy back and forth, and their one peak becomes two. This is
 *    how a Tesla coil's primary feeds its secondary.
 *
 * Lengths are in units of the ring radius; field strength is relative.
 * Pure functions only.
 */
(function (root) {
  'use strict';

  var TUBE = 0.38;            // tube radius of the toroidal former, ring radius = 1
  var SEGMENTS = 72;          // pieces the ring current is cut into
  var RING_BOUND = 2.7;       // how far from the centre the ring's lines are followed

  /* ------------------------------------------------------- ring current */

  var ringCache = null;
  function ringPieces() {
    if (ringCache) return ringCache;
    var px = new Float64Array(SEGMENTS), py = new Float64Array(SEGMENTS);
    var dx = new Float64Array(SEGMENTS), dy = new Float64Array(SEGMENTS);
    for (var i = 0; i < SEGMENTS; i++) {
      var a = 2 * Math.PI * (i + 0.5) / SEGMENTS;
      var dl = 2 * Math.PI / SEGMENTS;
      px[i] = Math.cos(a); py[i] = Math.sin(a);
      dx[i] = -Math.sin(a) * dl; dy[i] = Math.cos(a) * dl;   // anticlockwise seen from above
    }
    ringCache = { px: px, py: py, dx: dx, dy: dy };
    return ringCache;
  }

  /*
   * Field of a unit ring current in the xy-plane, by Biot-Savart:
   * the sum over the ring of (piece of wire) x (vector to the point) / distance^3.
   * Writes into out and returns it.
   */
  function loopField(x, y, z, out) {
    var r = ringPieces();
    var bx = 0, by = 0, bz = 0;
    for (var i = 0; i < SEGMENTS; i++) {
      var rx = x - r.px[i], ry = y - r.py[i], rz = z;
      var d2 = rx * rx + ry * ry + rz * rz;
      var inv = 1 / (d2 * Math.sqrt(d2) + 1e-12);
      // dl x r, with dl = (dx, dy, 0)
      bx += r.dy[i] * rz * inv;
      by += -r.dx[i] * rz * inv;
      bz += (r.dx[i] * ry - r.dy[i] * rx) * inv;
    }
    var o = out || [0, 0, 0];
    o[0] = bx; o[1] = by; o[2] = bz;
    return o;
  }

  /* The same field on the axis, from the textbook formula, for checking the sum. */
  function loopAxisField(z) {
    return 2 * Math.PI / Math.pow(1 + z * z, 1.5);
  }

  /* ------------------------------------------------------ toroidal coil */

  function insideTube(x, y, z) {
    var rho = Math.sqrt(x * x + y * y);
    return (rho - 1) * (rho - 1) + z * z < TUBE * TUBE;
  }

  /*
   * Ideal toroidal coil: inside the former the field runs round the ring
   * with strength 1 / (distance from the axis); outside it is zero.
   */
  function toroidField(x, y, z, out) {
    var o = out || [0, 0, 0];
    o[0] = o[1] = o[2] = 0;
    if (!insideTube(x, y, z)) return o;
    var rho2 = x * x + y * y;
    o[0] = -y / rho2;
    o[1] = x / rho2;
    return o;
  }

  /*
   * kind      'ring' | 'coil' | 'both'
   * twist     for 'both': how strong the ring current's field is at the
   *           former's surface, relative to the coil's field
   */
  function fieldAt(kind, x, y, z, twist, out) {
    var o = out || [0, 0, 0];
    if (kind === 'ring') return loopField(x, y, z, o);
    if (kind === 'coil') return toroidField(x, y, z, o);
    toroidField(x, y, z, o);
    var tx = o[0], ty = o[1], tz = o[2];
    loopField(x, y, z, o);
    // Close to the wire the ring field is about 2 / distance; scaling by
    // TUBE / 2 makes it equal `twist` at the former's surface.
    var k = (twist === undefined ? 0.5 : twist) * TUBE / 2;
    o[0] = tx + k * o[0]; o[1] = ty + k * o[1]; o[2] = tz + k * o[2];
    return o;
  }

  /* --------------------------------------------------------- field lines */

  /*
   * Follow the field from a starting point with fourth-order Runge-Kutta
   * steps of fixed length. Stops when the line closes on itself, leaves the
   * region of interest, reaches the step limit, or the field vanishes.
   * Returns { points: Float32Array xyz..., closed: boolean }.
   */
  function fieldLine(kind, start, opts) {
    var o = opts || {};
    var h = o.step || 0.02;
    var maxSteps = o.maxSteps || 2000;
    var bound = o.bound || 3.2;
    var twist = o.twist;
    var pts = [start[0], start[1], start[2]];
    var p = [start[0], start[1], start[2]];
    var b = [0, 0, 0];
    var closed = false;

    function dir(x, y, z, d) {
      fieldAt(kind, x, y, z, twist, b);
      var m = Math.sqrt(b[0] * b[0] + b[1] * b[1] + b[2] * b[2]);
      if (!(m > 1e-9)) return false;
      d[0] = b[0] / m; d[1] = b[1] / m; d[2] = b[2] / m;
      return true;
    }
    var k1 = [0, 0, 0], k2 = [0, 0, 0], k3 = [0, 0, 0], k4 = [0, 0, 0];

    for (var s = 0; s < maxSteps; s++) {
      if (!dir(p[0], p[1], p[2], k1)) break;
      if (!dir(p[0] + h / 2 * k1[0], p[1] + h / 2 * k1[1], p[2] + h / 2 * k1[2], k2)) break;
      if (!dir(p[0] + h / 2 * k2[0], p[1] + h / 2 * k2[1], p[2] + h / 2 * k2[2], k3)) break;
      if (!dir(p[0] + h * k3[0], p[1] + h * k3[1], p[2] + h * k3[2], k4)) break;
      p[0] += h / 6 * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]);
      p[1] += h / 6 * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
      p[2] += h / 6 * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]);
      pts.push(p[0], p[1], p[2]);
      if (p[0] * p[0] + p[1] * p[1] + p[2] * p[2] > bound * bound) break;
      if (s > 8) {
        var dx = p[0] - start[0], dy = p[1] - start[1], dz = p[2] - start[2];
        if (dx * dx + dy * dy + dz * dz < h * h) {
          pts.push(start[0], start[1], start[2]);
          closed = true;
          break;
        }
      }
    }
    return { points: new Float32Array(pts), closed: closed };
  }

  function rotateZ(points, angle) {
    var c = Math.cos(angle), s = Math.sin(angle);
    var out = new Float32Array(points.length);
    for (var i = 0; i < points.length; i += 3) {
      out[i] = points[i] * c - points[i + 1] * s;
      out[i + 1] = points[i] * s + points[i + 1] * c;
      out[i + 2] = points[i + 2];
    }
    return out;
  }

  /*
   * A line that left the region was only followed from the ring's plane
   * upward. The field below the plane is the mirror image, so the missing
   * half is the same curve mirrored and walked the other way.
   */
  function wholeLine(half) {
    var n = half.length / 3;
    var out = new Float32Array((2 * n - 1) * 3);
    for (var i = 0; i < n; i++) {
      var from = (n - 1 - i) * 3, to = i * 3;
      out[to] = half[from]; out[to + 1] = half[from + 1]; out[to + 2] = -half[from + 2];
    }
    out.set(half.subarray(3), n * 3);
    return out;
  }

  /*
   * A set of lines that shows each field's character. Everything here has
   * the symmetry of a ring, so each line is traced once and copied round.
   */
  function fieldLines(kind, twist) {
    var lines = [], i, k;
    if (kind === 'ring') {
      // Lines in one upright plane, started between the centre and the wire, copied to eight planes.
      [0.2, 0.42, 0.62, 0.78, 0.9].forEach(function (x) {
        var line = fieldLine('ring', [x, 0, 0], { step: 0.015, maxSteps: 2600, bound: RING_BOUND });
        var pts = line.closed ? line.points : wholeLine(line.points);
        for (k = 0; k < 8; k++) lines.push({ points: rotateZ(pts, k * Math.PI / 4), closed: line.closed });
      });
      // The one straight line: up the axis, through the middle of the ring.
      lines.push({ points: new Float32Array([0, 0, -RING_BOUND, 0, 0, 0, 0, 0, RING_BOUND]), closed: false });
    } else if (kind === 'coil') {
      // Circles inside the former: on its centre line and at two depths round it.
      lines.push(fieldLine('coil', [1, 0, 0], { step: 0.02, maxSteps: 700 }));
      [0.45, 0.82].forEach(function (depth) {
        var count = depth < 0.6 ? 6 : 10;
        for (i = 0; i < count; i++) {
          var a = 2 * Math.PI * i / count;
          lines.push(fieldLine('coil', [1 + TUBE * depth * Math.cos(a), 0, TUBE * depth * Math.sin(a)], { step: 0.02, maxSteps: 900 }));
        }
      });
    } else {
      // Helices on three nested surfaces inside the former: two lines on each, a few times round the ring.
      [0.3, 0.58, 0.86].forEach(function (depth, n) {
        var line = fieldLine('both', [1 + TUBE * depth, 0, 0], { step: 0.012, maxSteps: 1500, twist: twist });
        for (k = 0; k < 2; k++) lines.push({ points: rotateZ(line.points, k * Math.PI + n * 0.7), closed: false });
      });
    }
    return lines;
  }

  /* ------------------------------------------------------ rotating field */

  /*
   * Coils round a circle, each fed a current that peaks a little after its
   * neighbour. Returns the field each coil contributes along its own axis
   * and their sum.
   *   phases 1  one coil: the field only pulses along a line
   *   phases 2  two coils at right angles, a quarter cycle apart
   *   phases 3  three coils 120 degrees apart, a third of a cycle apart
   */
  function rotatingField(phases, angle) {
    var n = phases === 1 || phases === 2 ? phases : 3;
    var spacing = n === 2 ? Math.PI / 2 : 2 * Math.PI / n;
    var parts = [], x = 0, y = 0;
    for (var k = 0; k < n; k++) {
      var axis = k * spacing;
      var value = Math.cos(angle - axis);
      parts.push({ axis: axis, value: value });
      x += value * Math.cos(axis);
      y += value * Math.sin(axis);
    }
    return { x: x, y: y, strength: Math.sqrt(x * x + y * y), parts: parts };
  }

  /* How fast the field turns: 120 f / poles revolutions a minute. */
  function synchronousRpm(freq, poles) {
    var p = Math.max(2, Math.round(poles / 2) * 2);
    return 120 * freq / p;
  }

  /* ----------------------------------------------------------- resonance */

  /*
   * A driven resonator: how much it moves, and how far it lags the drive.
   *   gain   1 well below resonance, about Q at resonance, falling away above
   *   lag    degrees behind the drive: 0 below, 90 at resonance, 180 above
   */
  function response(freq, f0, Q) {
    var r = freq / f0;
    var a = 1 - r * r, b = r / Q;
    return {
      gain: 1 / Math.sqrt(a * a + b * b),
      lag: Math.atan2(b, a) * 180 / Math.PI
    };
  }

  /* Width of the peak between its half-power points. */
  function bandwidth(f0, Q) {
    return f0 / Q;
  }

  /* Seconds for the ringing to fade to 37% once the drive stops. */
  function ringTime(f0, Q) {
    return Q / (Math.PI * f0);
  }

  /*
   * The sound of a resonator struck once and left alone: a sine at its
   * natural frequency, fading at the rate its Q sets. Peak value 1.
   * Returns Float32Array samples; never longer than maxSeconds.
   */
  function ringSamples(f0, Q, sampleRate, maxSeconds) {
    var tau = ringTime(f0, Q);
    var seconds = Math.min(maxSeconds || 6, Math.max(0.06, 6.9 * tau));     // 6.9 time constants is -60 dB
    var n = Math.max(1, Math.round(seconds * sampleRate));
    var out = new Float32Array(n);
    var w = 2 * Math.PI * f0 * Math.sqrt(Math.max(0, 1 - 1 / (4 * Q * Q)));  // loss lowers the pitch a hair
    var fade = Math.min(n, Math.round(0.01 * sampleRate));
    for (var i = 0; i < n; i++) {
      var t = i / sampleRate;
      out[i] = Math.exp(-t / tau) * Math.sin(w * t);
      if (i >= n - fade) out[i] *= (n - 1 - i) / fade;                      // end on silence, not a step
    }
    return out;
  }

  /* -------------------------------------------------- two tuned circuits */

  /*
   * Two identical tuned circuits whose coils share some of their magnetic
   * field: the heart of a Tesla coil. k is the coupling, the fraction of
   * the field they share, from 0 (none) to 1 (all of it).
   *
   * Together they have two natural frequencies, not one. In the lower the
   * two currents run in step; in the upper they run opposed.
   */
  function coupledPeaks(f0, k) {
    var c = clampCoupling(k);
    return { lower: f0 / Math.sqrt(1 + c), upper: f0 / Math.sqrt(1 - c) };
  }

  function clampCoupling(k) {
    k = Number(k);
    return isFinite(k) ? Math.min(0.9, Math.max(0, k)) : 0;
  }

  /* The coupling at which one peak begins to split into two: 1 / Q. */
  function criticalCoupling(Q) {
    return 1 / Q;
  }

  /*
   * Driven at the first circuit: the voltage across each circuit's
   * capacitor, relative to the drive. With no coupling the first is the
   * lone resonator of response() above and the second is still.
   * From the two circuit equations with a shared-field term between them.
   */
  function coupledResponse(freq, f0, Q, k) {
    var x = freq / f0, c = clampCoupling(k);
    var zr = 1 / Q, zi = x - 1 / x;                   // one circuit's impedance, real and imaginary parts
    // denominator: z * z + (x k)^2
    var dr = zr * zr - zi * zi + x * x * c * c, di = 2 * zr * zi;
    var d = Math.sqrt(dr * dr + di * di);
    return {
      primary: Math.sqrt(zr * zr + zi * zi) / (x * d),
      secondary: c / d
    };
  }

  /*
   * Charge the first circuit, let go, and watch. The pair splits exactly
   * into its two natural motions, each a fading sine, so there is a closed
   * form: no step-by-step simulation needed.
   *   t    time in cycles of the natural frequency
   * Returns the voltage on each capacitor, starting from 1 and 0.
   */
  function modeAt(Q, sign, k, t) {
    var w = 1 / Math.sqrt(1 + sign * k);              // this motion's frequency, natural frequency = 1
    var a = 1 / (2 * Q * (1 + sign * k));             // and how fast it fades
    var wd = Math.sqrt(Math.max(1e-12, w * w - a * a));
    var tau = 2 * Math.PI * t;
    return Math.exp(-a * tau) * (Math.cos(wd * tau) + a / wd * Math.sin(wd * tau));
  }

  function coupledRing(Q, k, t) {
    var c = clampCoupling(k);
    var together = modeAt(Q, 1, c, t), opposed = modeAt(Q, -1, c, t);
    return { primary: (together + opposed) / 2, secondary: (together - opposed) / 2 };
  }

  /* The size of each circuit's swing at time t, with the fast oscillation left out. */
  function coupledEnvelope(Q, k, t) {
    var c = clampCoupling(k);
    var tau = 2 * Math.PI * t;
    var a = Math.exp(-tau / (2 * Q * (1 + c))), b = Math.exp(-tau / (2 * Q * (1 - c)));
    var beat = Math.cos((1 / Math.sqrt(1 - c) - 1 / Math.sqrt(1 + c)) * tau);
    return {
      primary: Math.sqrt(Math.max(0, a * a + b * b + 2 * a * b * beat)) / 2,
      secondary: Math.sqrt(Math.max(0, a * a + b * b - 2 * a * b * beat)) / 2
    };
  }

  /* Cycles of the natural frequency for the energy to cross from the first circuit to the second. */
  function transferCycles(k) {
    var c = clampCoupling(k);
    if (!(c > 0)) return Infinity;
    return 1 / (2 * (1 / Math.sqrt(1 - c) - 1 / Math.sqrt(1 + c)));
  }

  /* The second circuit's voltage after the first is struck, as sound. Peak value at most 1. */
  function coupledSamples(f0, Q, k, sampleRate, maxSeconds) {
    var tau = ringTime(f0, Q);
    var cross = transferCycles(k) / f0;
    var seconds = Math.min(maxSeconds || 6, Math.max(0.06, Math.min(6.9 * tau * 1.3, 6.9 * tau + 2 * cross)));
    var n = Math.max(1, Math.round(seconds * sampleRate));
    var out = new Float32Array(n);
    var fade = Math.min(n, Math.round(0.01 * sampleRate));
    for (var i = 0; i < n; i++) {
      out[i] = coupledRing(Q, k, i / sampleRate * f0).secondary;
      if (i >= n - fade) out[i] *= (n - 1 - i) / fade;
    }
    return out;
  }

  var api = {
    ringSamples: ringSamples,
    coupledPeaks: coupledPeaks,
    criticalCoupling: criticalCoupling,
    coupledResponse: coupledResponse,
    coupledRing: coupledRing,
    coupledEnvelope: coupledEnvelope,
    transferCycles: transferCycles,
    coupledSamples: coupledSamples,
    TUBE: TUBE,
    RING_BOUND: RING_BOUND,
    loopField: loopField,
    loopAxisField: loopAxisField,
    insideTube: insideTube,
    toroidField: toroidField,
    fieldAt: fieldAt,
    fieldLine: fieldLine,
    fieldLines: fieldLines,
    rotatingField: rotatingField,
    synchronousRpm: synchronousRpm,
    response: response,
    bandwidth: bandwidth,
    ringTime: ringTime
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (root.SP = root.SP || {}).fields = api;
})(typeof self !== 'undefined' ? self : this);
