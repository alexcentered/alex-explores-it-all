'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const chladni = require('../js/core/chladni.js');
const disc = require('../js/core/disc.js');
const liquid = require('../js/core/liquid.js');
const mesh = require('../js/core/mesh.js');

const near = (a, b, tol = 1e-6) =>
  assert.ok(Math.abs(a - b) <= tol, `expected ${a} to be within ${tol} of ${b}`);

const PLATE = { shape: 'circle', sideCm: 24, thicknessMm: 1, material: 'aluminium', trim: 1 };

test('disc: Bessel functions match reference values', () => {
  near(disc.besselJ(0, 0), 1, 1e-12);
  near(disc.besselJ(0, 1), 0.7651976866, 1e-9);
  near(disc.besselJ(1, 2.5), 0.4970941025, 1e-9);
  near(disc.besselJ(2, 10), 0.2546303137, 1e-9);
  near(disc.besselJ(0, 2.404825558), 0, 1e-9);                 // first zero of J0
  near(disc.besselIScaled(0, 1) * Math.E, 1.2660658778, 1e-9);
  near(disc.besselIScaled(1, 3) * Math.exp(3), 3.9533702174, 1e-8);
  assert.ok(isFinite(disc.besselIScaled(3, 700)));             // no overflow at large arguments
});

test('disc: free-edge eigenvalues match the published table (Poisson ratio 0.3)', () => {
  // lambda^2 = x^2 for a completely free circular plate, from the standard reference tables
  const published = { '2,0': 5.358, '0,1': 9.003, '3,0': 12.439, '1,1': 20.475, '4,0': 21.835, '2,1': 35.26, '0,2': 38.443 };
  for (const [key, want] of Object.entries(published)) {
    const [n, s] = key.split(',').map(Number);
    const mode = disc.modeRoots(n, 0.3, 9).find((m) => m.s === s);
    assert.ok(mode, `mode n=${n} s=${s} should exist`);
    near(mode.x * mode.x, want, 0.002);
  }
});

test('disc: mode numbering and lookup', () => {
  assert.deepEqual(disc.sanitizeMode(0, 0), { n: 0, s: 1 });   // no ring-free vibration without diameters
  assert.deepEqual(disc.sanitizeMode(1, 0), { n: 1, s: 1 });
  assert.deepEqual(disc.sanitizeMode(3, 0), { n: 3, s: 0 });
  assert.deepEqual(disc.sanitizeMode(99, 99), { n: disc.N_MAX, s: disc.S_MAX });
  const m = disc.findMode(PLATE, 5, 6);
  assert.equal(m.n, 5); assert.equal(m.s, 6);
  assert.ok(m.f > disc.findMode(PLATE, 5, 5).f);
  near(disc.findMode(PLATE, 0, 1).f, disc.frequencyScale(PLATE) * 9.069, disc.frequencyScale(PLATE) * 0.01);
});

test('disc: each mode has exactly the nodal circles its number says', () => {
  for (const [n, s] of [[0, 1], [0, 3], [2, 0], [2, 2], [5, 1]]) {
    const w = disc.modeProfile(disc.findMode(PLATE, n, s), 801);
    let crossings = 0;
    for (let i = 21; i < w.length; i++) if (w[i - 1] * w[i] < 0) crossings++;   // skip the centre, where n > 0 shapes start at zero
    assert.equal(crossings, s, `n=${n} s=${s}`);
    let peak = 0;
    for (const v of w) peak = Math.max(peak, Math.abs(v));
    near(peak, 1, 1e-6);
  }
});

test('disc: ring modes are orthogonal over the plate', () => {
  const N = 2001;
  const a = disc.modeProfile(disc.findMode(PLATE, 0, 1), N);
  const b = disc.modeProfile(disc.findMode(PLATE, 0, 2), N);
  let ab = 0, aa = 0, bb = 0;
  for (let i = 0; i < N; i++) {
    const w = (i / (N - 1)) * (i === 0 || i === N - 1 ? 0.5 : 1);     // trapezoid rule, weighted by radius
    ab += a[i] * b[i] * w; aa += a[i] * a[i] * w; bb += b[i] * b[i] * w;
  }
  assert.ok(Math.abs(ab) / Math.sqrt(aa * bb) < 1e-5, 'different modes should not overlap');
});

test('disc: frequency scales like any thin plate', () => {
  const base = disc.findMode(PLATE, 0, 1).f;
  near(disc.findMode({ ...PLATE, thicknessMm: 2 }, 0, 1).f / base, 2, 1e-9);
  near(disc.findMode({ ...PLATE, sideCm: 48 }, 0, 1).f / base, 0.25, 1e-9);
  // 24 cm x 1 mm aluminium disc, first ring: x^2 = 9.069, f = x^2 / (2 pi a^2) sqrt(D / rho h) = 155 Hz
  near(base, 155, 1.5);
});

test('disc: console mode table is rings only, sorted, in range', () => {
  const table = disc.modeTable(PLATE, 20, 5000);
  assert.ok(table.length >= 5);
  table.forEach((m, i) => {
    assert.equal(m.n, 0);
    assert.equal(m.s, i + 1);
    assert.ok(m.f >= 20 && m.f <= 5000);
    if (i) assert.ok(m.f > table[i - 1].f);
  });
  assert.equal(table[0].label, '1 ring');
  assert.equal(table[1].label, '2 rings');
  assert.equal(chladni.nearestMode(table, table[2].f + 3), table[2]);
});

test('disc: driven response is area-RMS 1 and takes the mode shape on resonance', () => {
  const mode = disc.findMode(PLATE, 0, 3);
  const resp = disc.radialResponse(mode.f, PLATE, { Q: 400 });
  const N = resp.re.length;
  let sum = 0, area = 0, dot = 0, aa = 0, bb = 0;
  const ideal = disc.modeProfile(mode, N);
  for (let i = 0; i < N; i++) {
    const r = i / (N - 1), mag = Math.hypot(resp.re[i], resp.im[i]);
    sum += mag * mag * r; area += r;
    dot += mag * Math.abs(ideal[i]) * r; aa += mag * mag * r; bb += ideal[i] * ideal[i] * r;
  }
  near(Math.sqrt(sum / area), 1, 1e-4);
  assert.ok(dot / Math.sqrt(aa * bb) > 0.995, 'on resonance the response should match the mode');
  assert.equal(disc.radialResponse(0, PLATE), null);
});

test('disc: 2D field marks everything off the plate and is round', () => {
  const size = 64;
  const f = disc.field(disc.findMode(PLATE, 0, 2).f, PLATE, size);
  assert.equal(f[0], -1);                                   // corner is off the plate
  assert.ok(f[(size / 2) * size + size / 2] >= 0);           // centre is on it
  let on = 0;
  for (const v of f) if (v >= 0) on++;
  near(on / f.length, Math.PI / 4, 0.01);                    // a disc fills pi/4 of its square
  const at = (i, j) => f[j * size + i];
  near(at(40, 20), at(20, 40), 1e-5);                        // rings: unchanged by reflection
  near(at(40, 20), at(size - 1 - 40, 20), 1e-5);
});

test('mesh: disc relief is a printable solid of the right size and volume', () => {
  const rings = 20, segs = 72;
  const flat = new Float32Array(1 + rings * segs).fill(0.5);
  const o = { diameter: 80, base: 2, relief: 6 };
  const r = mesh.inspect(mesh.buildDisc(flat, rings, segs, o));
  assert.equal(r.watertight && r.oriented && r.components === 1, true);
  near(r.size[0], 80, 1e-3); near(r.size[1], 80, 1e-3); near(r.size[2], 5, 1e-4);
  near(r.min[2], 0, 1e-6);
  const polygonArea = 0.5 * segs * 40 * 40 * Math.sin(2 * Math.PI / segs);
  near(r.volume, polygonArea * 5, 1);

  const wavy = Float32Array.from({ length: 1 + rings * segs }, (_, i) => 0.5 + 0.5 * Math.sin(i * 0.37));
  const w = mesh.inspect(mesh.buildDisc(wavy, rings, segs, o));
  assert.equal(w.watertight && w.oriented && w.components === 1, true);
  const moved = mesh.updateDisc(mesh.buildDisc(flat, rings, segs, o), wavy, rings, segs, o);
  assert.deepEqual(Array.from(moved.positions), Array.from(mesh.buildDisc(wavy, rings, segs, o).positions));
});

test('chladni: plate setup remembers its shape', () => {
  assert.equal(chladni.sanitizePlate({}).shape, 'square');
  assert.equal(chladni.sanitizePlate({ shape: 'circle' }).shape, 'circle');
  assert.equal(chladni.sanitizePlate({ shape: 'hexagon' }).shape, 'square');
});

test('liquid: Faraday ripple spacing on water', () => {
  // 100 Hz drive -> 50 Hz ripples. Surface tension alone would give 5.68 mm;
  // gravity adds about a tenth to the restoring force and stretches that to 5.90 mm.
  near(liquid.rippleWavelength(100) * 1000, 5.9, 0.02);
  // the answer must satisfy the dispersion relation it came from
  for (const f of [20, 60, 250, 1000, 5000]) {
    const k = 2 * Math.PI / liquid.rippleWavelength(f);
    const w2 = (Math.PI * f) ** 2;
    near((liquid.G * k + 0.0728 / 998 * k ** 3) / w2, 1, 1e-9);
  }
  assert.ok(liquid.rippleWavelength(200) < liquid.rippleWavelength(100));   // higher pitch, finer ripples
  assert.ok(Number.isNaN(liquid.rippleWavelength(0)));
  assert.ok(Number.isNaN(liquid.rippleWavelength('x')));
});
