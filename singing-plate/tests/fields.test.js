'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const fields = require('../js/core/fields.js');

const near = (a, b, tol = 1e-6) =>
  assert.ok(Math.abs(a - b) <= tol, `expected ${a} to be within ${tol} of ${b}`);

/* ---------------------------------------------------------- ring current */

test('fields: the summed ring field matches the textbook formula on the axis', () => {
  for (const z of [0, 0.3, 1, 2.5]) {
    const b = fields.loopField(0, 0, z);
    near(b[0], 0, 1e-9);
    near(b[1], 0, 1e-9);
    near(b[2], fields.loopAxisField(z), fields.loopAxisField(z) * 2e-3);
  }
  near(fields.loopAxisField(0), 2 * Math.PI);        // at the centre: 2 pi, in these units
});

test('fields: the ring field has the symmetry of a ring', () => {
  // turning the point round the axis turns the field with it
  const a = fields.loopField(0.6, 0, 0.4);
  const b = fields.loopField(0, 0.6, 0.4);
  near(b[0], -a[1], 1e-6); near(b[1], a[0], 1e-6); near(b[2], a[2], 1e-6);
  // mirrored below the ring, the field's sideways part reverses and its upward part does not
  const c = fields.loopField(0.6, 0, -0.4);
  near(c[0], -a[0], 1e-9); near(c[2], a[2], 1e-9);
  // in the plane of the ring it points straight up inside and straight down outside
  assert.ok(fields.loopField(0.5, 0, 0)[2] > 0);
  assert.ok(fields.loopField(1.6, 0, 0)[2] < 0);
});

test('fields: magnetic field lines never start or end (zero divergence)', () => {
  const h = 1e-4;
  for (const [x, y, z] of [[0.4, 0.1, 0.3], [1.5, 0.2, -0.4], [0.1, 0.1, 1.2]]) {
    const dBx = (fields.loopField(x + h, y, z)[0] - fields.loopField(x - h, y, z)[0]) / (2 * h);
    const dBy = (fields.loopField(x, y + h, z)[1] - fields.loopField(x, y - h, z)[1]) / (2 * h);
    const dBz = (fields.loopField(x, y, z + h)[2] - fields.loopField(x, y, z - h)[2]) / (2 * h);
    const scale = Math.hypot(...fields.loopField(x, y, z));
    assert.ok(Math.abs(dBx + dBy + dBz) < scale * 1e-4, `divergence at ${[x, y, z]}`);
  }
});

/* --------------------------------------------------------- toroidal coil */

test('fields: an ideal toroidal coil keeps its field inside, running round the ring', () => {
  assert.equal(fields.insideTube(1, 0, 0), true);
  assert.equal(fields.insideTube(1 + fields.TUBE * 0.9, 0, 0), true);
  assert.equal(fields.insideTube(0, 0, 0), false);            // the hole
  assert.equal(fields.insideTube(1, 0, fields.TUBE * 1.1), false);
  assert.deepEqual(fields.toroidField(0, 0, 0), [0, 0, 0]);
  assert.deepEqual(fields.toroidField(2, 0, 0), [0, 0, 0]);
  // inside: no upward part, at right angles to the radius, strength 1 / distance from the axis
  for (const [x, y, z] of [[1, 0, 0], [0.8, 0, 0.1], [0, 1.2, -0.05], [0.7, 0.7, 0]]) {
    const b = fields.toroidField(x, y, z);
    near(b[2], 0);
    near(b[0] * x + b[1] * y, 0, 1e-12);
    near(Math.hypot(b[0], b[1]), 1 / Math.hypot(x, y), 1e-12);
  }
});

/* ----------------------------------------------------------- field lines */

test('fields: a line round a ring current closes on itself and links the wire', () => {
  const line = fields.fieldLine('ring', [0.62, 0, 0], { step: 0.015, maxSteps: 2600, bound: 3.4 });
  assert.equal(line.closed, true);
  const p = line.points;
  let above = 0, outside = 0;
  for (let i = 0; i < p.length; i += 3) {
    near(p[i + 1], 0, 1e-6);                         // stays in its upright plane
    if (p[i + 2] > 0.05) above++;
    if (p[i] > 1.02) outside++;
  }
  assert.ok(above > 10 && outside > 10, 'it should pass over the wire and round its outside');
});

test('fields: a line inside a toroidal coil is a circle round the axis', () => {
  const line = fields.fieldLine('coil', [1.2, 0, 0.1], { step: 0.02, maxSteps: 900 });
  assert.equal(line.closed, true);
  for (let i = 0; i < line.points.length; i += 3) {
    near(Math.hypot(line.points[i], line.points[i + 1]), 1.2, 2e-4);
    near(line.points[i + 2], 0.1, 1e-6);
  }
  near(line.points.length / 3 * 0.02, 2 * Math.PI * 1.2, 0.08);     // its length is the circumference
  // started outside the former there is no field, so no line
  assert.equal(fields.fieldLine('coil', [0.2, 0, 0], {}).points.length, 3);
});

test('fields: both together make a helix that stays on a ring-shaped surface', () => {
  const line = fields.fieldLine('both', [1 + fields.TUBE * 0.6, 0, 0], { step: 0.012, maxSteps: 2400, twist: 0.5 });
  const p = line.points;
  let maxD = 0, turnsRoundRing = 0, crossings = 0, prevAngle = 0, prevZ = 0;
  let minCross = Infinity, maxCross = 0;
  for (let i = 0; i < p.length; i += 3) {
    const rho = Math.hypot(p[i], p[i + 1]);
    const d = Math.hypot(rho - 1, p[i + 2]);         // distance from the ring's centre line
    maxD = Math.max(maxD, d);
    const angle = Math.atan2(p[i + 1], p[i]);
    if (i) {
      let da = angle - prevAngle;
      if (da > Math.PI) da -= 2 * Math.PI; else if (da < -Math.PI) da += 2 * Math.PI;
      turnsRoundRing += da / (2 * Math.PI);
      if (prevZ <= 0 && p[i + 2] > 0) {
        crossings++;
        minCross = Math.min(minCross, rho); maxCross = Math.max(maxCross, rho);
      }
    }
    prevAngle = angle; prevZ = p[i + 2];
  }
  assert.ok(maxD < fields.TUBE, 'the line stays inside the former');
  // each time round the tube it comes back through the same place: it keeps to one surface
  assert.ok(maxCross - minCross < 0.002, `it keeps to one surface (drift ${maxCross - minCross})`);
  assert.ok(minCross < 1, 'and that surface wraps the ring current');
  assert.ok(turnsRoundRing > 1.5, `it travels round the ring (${turnsRoundRing} turns)`);
  assert.ok(crossings >= 2, `and winds round the tube as it goes (${crossings} times)`);
  // more ring current means a tighter winding
  const tight = fields.fieldLine('both', [1 + fields.TUBE * 0.6, 0, 0], { step: 0.012, maxSteps: 2400, twist: 1.5 });
  let tc = 0;
  for (let i = 3; i < tight.points.length; i += 3) if (tight.points[i - 1] <= 0 && tight.points[i + 2] > 0) tc++;
  assert.ok(tc > crossings, `stronger twist winds more (${tc} against ${crossings})`);
});

test('fields: the line sets are complete for each kind', () => {
  const ring = fields.fieldLines('ring');
  assert.equal(ring.length, 41);                     // five lines in each of eight planes, and the axis
  assert.ok(ring.every((l) => l.points.length >= 9));
  // a line that leaves the region is drawn whole: in from below, out above, the same either side of the plane
  const open = ring.filter((l) => !l.closed && l.points.length > 9);
  assert.ok(open.length >= 8);
  for (const l of open) {
    const p = l.points, n = p.length / 3;
    assert.ok(p[2] < -1 && p[p.length - 1] > 1, 'runs from below the ring to above it');
    for (let i = 0; i < n; i += 37) {
      const j = n - 1 - i;
      near(p[i * 3], p[j * 3], 1e-6); near(p[i * 3 + 1], p[j * 3 + 1], 1e-6); near(p[i * 3 + 2], -p[j * 3 + 2], 1e-6);
    }
    // and never doubles back on itself: every step is one step long
    for (let i = 3; i < p.length; i += 3) {
      const d = Math.hypot(p[i] - p[i - 3], p[i + 1] - p[i - 2], p[i + 2] - p[i - 1]);
      assert.ok(d > 0.01 && d < 0.02, `step ${d}`);
    }
  }
  const coil = fields.fieldLines('coil');
  assert.equal(coil.length, 17);
  assert.ok(coil.every((l) => l.closed));
  const both = fields.fieldLines('both', 0.5);
  assert.equal(both.length, 6);
  assert.ok(both.every((l) => l.points.length > 3000));
});

/* -------------------------------------------------------- rotating field */

test('fields: two or three phases make a field of constant strength that turns', () => {
  for (const [phases, strength] of [[2, 1], [3, 1.5]]) {
    for (let a = 0; a < 6.3; a += 0.37) {
      const f = fields.rotatingField(phases, a);
      near(f.strength, strength, 1e-12);
      near(Math.atan2(f.y, f.x), Math.atan2(Math.sin(a), Math.cos(a)), 1e-12);   // it points where the cycle has got to
      assert.equal(f.parts.length, phases);
    }
  }
});

test('fields: one phase alone only pulses along a line', () => {
  let min = Infinity, max = -Infinity;
  for (let a = 0; a < 6.3; a += 0.1) {
    const f = fields.rotatingField(1, a);
    near(f.y, 0, 1e-12);
    min = Math.min(min, f.x); max = Math.max(max, f.x);
  }
  assert.ok(min < -0.99 && max > 0.99);
  near(fields.rotatingField(1, Math.PI / 2).strength, 0, 1e-12);       // and passes through nothing
});

test('fields: synchronous speed', () => {
  assert.equal(fields.synchronousRpm(60, 2), 3600);
  assert.equal(fields.synchronousRpm(50, 4), 1500);
  assert.equal(fields.synchronousRpm(60, 6), 1200);
  assert.equal(fields.synchronousRpm(60, 3), 1800);      // an odd count is read as the nearest whole pair of poles
});

/* ------------------------------------------------------------- resonance */

test('fields: the resonance curve', () => {
  // far below resonance it simply follows the drive; at resonance it is Q times larger and a quarter cycle behind
  near(fields.response(1, 1000, 50).gain, 1, 1e-5);
  near(fields.response(1, 1000, 50).lag, 0, 0.01);
  near(fields.response(1000, 1000, 50).gain, 50, 1e-9);
  near(fields.response(1000, 1000, 50).lag, 90, 1e-9);
  // far above, it barely moves and is half a cycle behind
  assert.ok(fields.response(10000, 1000, 50).gain < 0.011);
  near(fields.response(10000, 1000, 50).lag, 180, 0.2);
  // at the edges of the band the response has fallen to 1 / sqrt(2) of the peak
  const Q = 80, f0 = 500, half = fields.bandwidth(f0, Q) / 2;
  near(fields.bandwidth(f0, Q), 6.25);
  near(fields.response(f0 + half, f0, Q).gain / Q, Math.SQRT1_2, 0.01);
  near(fields.response(f0 - half, f0, Q).gain / Q, Math.SQRT1_2, 0.01);
});

test('fields: ring time', () => {
  near(fields.ringTime(440, 45), 45 / (Math.PI * 440));
  assert.ok(fields.ringTime(440, 450) > fields.ringTime(440, 45));     // a sharper resonance rings longer
});

test('fields: a struck resonator as sound', () => {
  const rate = 48000;
  const s = fields.ringSamples(440, 100, rate, 6);
  const tau = fields.ringTime(440, 100);
  near(s.length / rate, 6.9 * tau, 1e-3);                      // long enough to fade by 60 dB
  near(s[0], 0); near(s[s.length - 1], 0);                      // starts and ends on silence: no click
  let peak = 0, late = 0;
  for (let i = 0; i < s.length; i++) {
    peak = Math.max(peak, Math.abs(s[i]));
    if (i > rate * 3 * tau && i < rate * 3.2 * tau) late = Math.max(late, Math.abs(s[i]));
  }
  assert.ok(peak > 0.95 && peak <= 1, `peak ${peak}`);
  near(late, Math.exp(-3), 0.005);                             // after three time constants, e^-3 is left
  // its pitch: count the upward zero crossings in the first tenth of a second
  let ups = 0;
  for (let i = 1; i < rate * 0.1; i++) if (s[i - 1] <= 0 && s[i] > 0) ups++;
  near(ups, 44, 1);
  // a long ring is cut at the limit, a short one is still long enough to hear
  assert.equal(fields.ringSamples(20, 1000, rate, 6).length, 6 * rate);
  assert.equal(fields.ringSamples(10000, 1, rate, 6).length, Math.round(0.06 * rate));
});

/* --------------------------------------------------- two tuned circuits */

test('fields: two coupled circuits have two natural frequencies', () => {
  const p = fields.coupledPeaks(1000, 0.1);
  near(p.lower, 1000 / Math.sqrt(1.1), 1e-9);
  near(p.upper, 1000 / Math.sqrt(0.9), 1e-9);
  assert.deepEqual(fields.coupledPeaks(1000, 0), { lower: 1000, upper: 1000 });   // uncoupled: one frequency
  assert.ok(isFinite(fields.coupledPeaks(1000, 5).upper));                          // nonsense coupling is clamped
  near(fields.criticalCoupling(50), 0.02);
});

test('fields: the driven pair: one peak below critical coupling, two above', () => {
  const Q = 50, f0 = 1000, kc = fields.criticalCoupling(Q);
  const sec = (f, k) => fields.coupledResponse(f, f0, Q, k).secondary;
  // with no coupling the first circuit is the lone resonator and nothing reaches the second
  near(fields.coupledResponse(f0, f0, Q, 0).primary, Q, 1e-9);
  near(fields.coupledResponse(f0, f0, Q, 0).secondary, 0);
  near(fields.coupledResponse(930, f0, Q, 0).primary, fields.response(930, f0, Q).gain, 1e-9);
  // at critical coupling and resonance the second circuit carries half of that, the most it ever can there
  near(sec(f0, kc), Q / 2, 1e-9);
  assert.ok(sec(f0, kc / 2) < Q / 2 && sec(f0, kc * 2) < Q / 2);
  // under-coupled: the middle is the top
  assert.ok(sec(f0, kc / 2) > sec(f0 * 1.004, kc / 2) && sec(f0, kc / 2) > sec(f0 * 0.996, kc / 2));
  // over-coupled: the middle is a dip between two peaks, which sit near the two natural frequencies
  const k = 5 * kc, peaks = fields.coupledPeaks(f0, k);
  assert.ok(sec(f0, k) < sec(peaks.lower, k) && sec(f0, k) < sec(peaks.upper, k));
  let best = 0, at = 0;
  for (let f = 900; f < 1000; f += 0.25) if (sec(f, k) > best) { best = sec(f, k); at = f; }
  near(at, peaks.lower, 1.5);
  near(best, Q / 2, Q * 0.03);
});

test('fields: strike the first circuit and the energy crosses to the second and back', () => {
  const lossless = 1e9, k = 0.1;
  const start = fields.coupledRing(lossless, k, 0);
  near(start.primary, 1); near(start.secondary, 0);
  const cross = fields.transferCycles(k);
  near(cross, 1 / (2 * (1 / Math.sqrt(0.9) - 1 / Math.sqrt(1.1))), 1e-12);
  near(cross, 1 / (2 * k), 0.05);                              // roughly 1 / 2k cycles
  assert.equal(fields.transferCycles(0), Infinity);
  // at the crossing time the first circuit is nearly still and the second swings fully; later it all comes back
  const there = fields.coupledEnvelope(lossless, k, cross), back = fields.coupledEnvelope(lossless, k, 2 * cross);
  near(there.primary, 0, 1e-6); near(there.secondary, 1, 1e-6);
  near(back.primary, 1, 1e-6); near(back.secondary, 0, 1e-6);
  // the envelope really does bound the oscillation, and touches it
  let over = 0, reach = 0;
  for (let t = 0; t < 2 * cross; t += 0.003) {
    const r = fields.coupledRing(lossless, k, t), e = fields.coupledEnvelope(lossless, k, t);
    over = Math.max(over, Math.abs(r.secondary) - e.secondary, Math.abs(r.primary) - e.primary);
    if (Math.abs(t - cross) < 0.6) reach = Math.max(reach, Math.abs(r.secondary));
  }
  assert.ok(over < 0.03, `oscillation exceeds its envelope by ${over}`);
  assert.ok(reach > 0.97, `secondary reaches ${reach}`);
});

test('fields: the closed form satisfies the circuit equations, losses included', () => {
  // L q1'' + M q2'' + R q1' + q1 / C = 0 and the same with 1 and 2 exchanged, in units where L = C = 1
  const Q = 12, k = 0.3, h = 1e-4;
  const at = (t) => fields.coupledRing(Q, k, t / (2 * Math.PI));          // t in radians of the natural frequency
  for (const t of [0.5, 2.2, 7.9, 15.3]) {
    const a = at(t - h), b = at(t), c = at(t + h);
    const d1 = (c.primary - a.primary) / (2 * h), d2 = (c.secondary - a.secondary) / (2 * h);
    const dd1 = (c.primary - 2 * b.primary + a.primary) / (h * h), dd2 = (c.secondary - 2 * b.secondary + a.secondary) / (h * h);
    near(dd1 + k * dd2 + d1 / Q + b.primary, 0, 2e-6);
    near(dd2 + k * dd1 + d2 / Q + b.secondary, 0, 2e-6);
  }
  // it starts at rest: charged, no current
  near((at(h).primary - at(0).primary) / h, 0, 1e-3);
  // with loss, less arrives, and a lossier pair passes less
  const cross = fields.transferCycles(k);
  const good = fields.coupledEnvelope(200, k, cross).secondary, poor = fields.coupledEnvelope(5, k, cross).secondary;
  assert.ok(good > 0.97 && poor < good && poor > 0.3, `${good} ${poor}`);
});

test('fields: the second circuit as sound', () => {
  const rate = 48000;
  const s = fields.coupledSamples(440, 200, 0.02, rate, 6);
  near(s[0], 0); near(s[s.length - 1], 0);
  let peak = 0;
  for (let i = 0; i < s.length; i++) peak = Math.max(peak, Math.abs(s[i]));
  assert.ok(peak > 0.5 && peak <= 1, `peak ${peak}`);
  assert.ok(s.length <= 6 * rate && s.length > 0.5 * rate);
  // it swells from nothing: quiet at first, loudest near the crossing time
  const cross = Math.round(fields.transferCycles(0.02) / 440 * rate);
  let early = 0, mid = 0;
  for (let i = 0; i < cross * 0.1; i++) early = Math.max(early, Math.abs(s[i]));
  for (let i = Math.round(cross * 0.8); i < cross * 1.2; i++) mid = Math.max(mid, Math.abs(s[i]));
  assert.ok(early < 0.2 && mid > 0.5, `${early} ${mid}`);
});
