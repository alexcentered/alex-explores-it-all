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
