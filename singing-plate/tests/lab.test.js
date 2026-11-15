'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const chladni = require('../js/core/chladni.js');
const forms = require('../js/core/forms.js');
const mesh = require('../js/core/mesh.js');

const near = (a, b, tol = 1e-6) =>
  assert.ok(Math.abs(a - b) <= tol, `expected ${a} to be within ${tol} of ${b}`);

/* --------------------------------------------------- plate wave shapes */

test('chladni: complex field magnitude agrees with field()', () => {
  const C = 42, size = 40, f = 700;
  const mag = chladni.field(f, C, size);
  const { re, im } = chladni.complexField(f, C, size);
  for (let i = 0; i < mag.length; i += 7) near(Math.hypot(re[i], im[i]), mag[i], 1e-4);
  assert.equal(chladni.complexField(f, 0, size), null);
});

test('chladni: mode shape is the textbook figure, peak 1, any whole numbers', () => {
  const size = 50;
  const s = chladni.modeShape(3, 1, 1, size);
  let peak = 0;
  for (const v of s) peak = Math.max(peak, Math.abs(v));
  near(peak, 1, 1e-6);
  const at = (i, j) => s[j * size + i];
  near(at(7, 20), at(20, 7), 1e-6);                       // + combination is symmetric in x <-> y
  const anti = chladni.modeShape(3, 1, -1, size);
  near(anti[20 * size + 7], -anti[7 * size + 20], 1e-6);  // - combination is antisymmetric
  near(anti[12 * size + 12], 0, 1e-6);                    // so its diagonal is a nodal line
  assert.ok(Array.from(chladni.modeShape(2, 2, -1, size)).every((v) => v === 0));
});

test('forms: peak phase finds where a driven plate is furthest from flat', () => {
  const { re, im } = chladni.complexField(8 * 42 + 5, 42, 32);
  const energy = (p) => {
    let e = 0;
    for (let i = 0; i < re.length; i++) e += (re[i] * Math.cos(p) - im[i] * Math.sin(p)) ** 2;
    return e;
  };
  const best = forms.peakPhase(re, im);
  for (let p = 0; p < Math.PI; p += 0.05) assert.ok(energy(best) >= energy(p) - 1e-6);
});

/* -------------------------------------------------------------- sphere */

test('forms: Legendre functions match their closed forms', () => {
  for (const x of [-0.9, -0.3, 0, 0.4, 0.8]) {
    near(forms.legendre(0, 0, x), 1);
    near(forms.legendre(1, 0, x), x);
    near(forms.legendre(2, 0, x), (3 * x * x - 1) / 2);
    near(forms.legendre(3, 0, x), (5 * x ** 3 - 3 * x) / 2);
    near(forms.legendre(1, 1, x), Math.sqrt(1 - x * x));
    near(forms.legendre(2, 1, x), 3 * x * Math.sqrt(1 - x * x));
    near(forms.legendre(2, 2, x), 3 * (1 - x * x));
  }
});

test('forms: spherical harmonic is peak-scaled with the right symmetry', () => {
  const lat = 36, lon = 72;
  const y = forms.sphereHarmonic(4, 3, lat, lon);
  assert.equal(y.length, (lat + 1) * lon);
  let peak = 0;
  for (const v of y) { assert.ok(isFinite(v)); peak = Math.max(peak, Math.abs(v)); }
  near(peak, 1, 1e-6);
  const at = (r, c) => y[r * lon + c];
  near(at(10, 5), at(10, 5 + lon / 3), 1e-5);     // order 3: repeats three times round the axis
  near(at(0, 0), 0, 1e-6);                        // order > 0 vanishes at the poles
  near(at(10, 5), -at(lat - 10, 5), 1e-5);        // l - m odd: antisymmetric about the equator
});

test('forms: harmonic settings are clamped to legal values', () => {
  assert.deepEqual(forms.sanitizeHarmonic(5, 9), { l: 5, m: 5 });
  assert.deepEqual(forms.sanitizeHarmonic(999, -2), { l: forms.DEGREE_MAX, m: 0 });
  assert.deepEqual(forms.sanitizeHarmonic('x', 'y'), { l: forms.DEGREE_MIN, m: 0 });
});

test('forms: droplet frequencies follow Rayleigh and invert correctly', () => {
  // 1 mm radius water drop, degree 2: worked by hand, about 121 Hz
  near(forms.dropletFrequency(2, 1), 121.6, 1.5);
  near(forms.dropletFrequency(2, 4) / forms.dropletFrequency(2, 1), 1 / 8, 1e-9);   // f ~ R^-1.5
  for (const l of [2, 5, 11, 20]) {
    assert.equal(forms.dropletDegree(forms.dropletFrequency(l, 1) + 1, 1), l);
  }
  assert.equal(forms.dropletDegree(1, 1), forms.DEGREE_MIN);
});

/* ---------------------------------------------------------------- room */

test('forms: room frequencies and nearest mode', () => {
  near(forms.roomFrequency([1, 0, 0], 34.3), 500, 1e-9);
  near(forms.roomFrequency([2, 2, 1], 34.3), 1500, 1e-9);
  assert.deepEqual(forms.roomModeFor(1500, 34.3), [2, 2, 1]);
  assert.deepEqual(forms.roomModeFor(1, 34.3), [1, 0, 0]);
  assert.deepEqual(forms.sanitizeRoomMode([0, 0, 0]), [1, 0, 0]);
  assert.deepEqual(forms.sanitizeRoomMode([99, -1, 'x']), [forms.ROOM_INDEX_MAX, 0, 0]);
});

test('forms: permutations are distinct', () => {
  assert.equal(forms.permutations([1, 0, 0]).length, 3);
  assert.equal(forms.permutations([2, 1, 0]).length, 6);
  assert.equal(forms.permutations([1, 1, 1]).length, 1);
});

test('forms: room field matches the cosine product and blends axes', () => {
  const N = 16, S = N + 1;
  const single = forms.roomField([2, 1, 0], false, N);
  const at = (f, i, j, k) => f[(k * S + j) * S + i];
  near(at(single, 3, 5, 9), Math.cos(2 * Math.PI * 3 / N) * Math.cos(Math.PI * 5 / N), 1e-6);
  const blend = forms.roomField([1, 0, 0], true, N);
  // (cos x + cos y + cos z) / 3, the Schwarz P surface family
  near(at(blend, 4, 8, 12), (Math.cos(Math.PI * 4 / N) + Math.cos(Math.PI * 8 / N) + Math.cos(Math.PI * 12 / N)) / 3, 1e-6);
  near(at(blend, 2, 7, 11), at(blend, 11, 2, 7), 1e-6);   // unchanged when the axes are swapped
});

test('forms: 2D companions are RMS-scaled and finite', () => {
  for (const map of [forms.sphereMap(5, 2, 32), forms.roomSlice([2, 1, 1], true, 32, 0.5), forms.magnitudeMap(chladni.modeShape(4, 2, 1, 32))]) {
    let sumSq = 0;
    for (const v of map) { assert.ok(isFinite(v) && v >= 0); sumSq += v * v; }
    near(Math.sqrt(sumSq / map.length), 1, 1e-4);
  }
});

/* ---------------------------------------------------------------- mesh */

const cube = () => ({
  // unit cube, outward faces
  positions: new Float32Array([0,0,0, 1,0,0, 1,1,0, 0,1,0, 0,0,1, 1,0,1, 1,1,1, 0,1,1]),
  indices: new Uint32Array([0,2,1, 0,3,2, 4,5,6, 4,6,7, 0,1,5, 0,5,4, 1,2,6, 1,6,5, 2,3,7, 2,7,6, 3,0,4, 3,4,7])
});

test('mesh: inspect recognises a good solid', () => {
  const r = mesh.inspect(cube());
  assert.equal(r.triangles, 12);
  assert.equal(r.watertight, true);
  assert.equal(r.oriented, true);
  assert.equal(r.components, 1);
  near(r.volume, 1, 1e-6);
  assert.deepEqual(r.size.map((v) => Math.round(v)), [1, 1, 1]);
});

test('mesh: inspect catches holes, loose parts and inside-out faces', () => {
  const holed = cube();
  holed.indices = holed.indices.slice(3);                  // remove one triangle
  const h = mesh.inspect(holed);
  assert.equal(h.watertight, false);
  assert.equal(h.openEdges, 3);
  assert.equal(mesh.printChecks(h).ok, false);

  const a = cube(), b = cube();
  const two = {
    positions: new Float32Array([...a.positions, ...Array.from(b.positions, (v, i) => (i % 3 === 0 ? v + 5 : v))]),
    indices: new Uint32Array([...a.indices, ...Array.from(b.indices, (v) => v + 8)])
  };
  const t = mesh.inspect(two);
  assert.equal(t.watertight, true);
  assert.equal(t.components, 2);
  const verdict = mesh.printChecks(t);
  assert.equal(verdict.ok, false);
  assert.ok(verdict.checks.some((c) => c.name === 'One piece' && c.status === 'fail'));

  const inverted = cube();
  for (let i = 0; i < inverted.indices.length; i += 3) {
    [inverted.indices[i + 1], inverted.indices[i + 2]] = [inverted.indices[i + 2], inverted.indices[i + 1]];
  }
  const v = mesh.inspect(inverted);
  assert.equal(v.watertight, true);
  assert.equal(v.oriented, false);

  const oneFlipped = cube();
  [oneFlipped.indices[1], oneFlipped.indices[2]] = [oneFlipped.indices[2], oneFlipped.indices[1]];
  assert.ok(mesh.inspect(oneFlipped).flippedEdges > 0);
});

test('mesh: inspect welds duplicated vertices by position', () => {
  const c = cube();
  const split = { positions: new Float32Array(c.indices.length * 3), indices: new Uint32Array(c.indices.length) };
  c.indices.forEach((v, i) => {
    split.positions.set(c.positions.subarray(v * 3, v * 3 + 3), i * 3);
    split.indices[i] = i;
  });
  const r = mesh.inspect(split);
  assert.equal(r.vertices, 8);
  assert.equal(r.watertight, true);
});

test('mesh: thickness and resolution checks', () => {
  const good = mesh.inspect(cube());
  assert.equal(mesh.printChecks(good, { thinnest: { mm: 2, label: 'Base' } }).ok, true);
  const thin = mesh.printChecks(good, { thinnest: { mm: 0.4, label: 'Wall' } });
  assert.equal(thin.ok, false);
  const coarse = mesh.printChecks(good, { thinnest: { mm: 1, label: 'Wall' }, cellMm: 1.5 });
  assert.equal(coarse.ok, true);
  assert.ok(coarse.checks.some((c) => c.status === 'warn'));
  assert.equal(mesh.printChecks(mesh.inspect({ positions: new Float32Array(0), indices: new Uint32Array(0) })).ok, false);
});

test('mesh: plate relief is a printable solid of the right size and volume', () => {
  const size = 24;
  const flat = new Float32Array(size * size).fill(0.5);
  const m = mesh.buildPlate(flat, size, { width: 80, base: 2, relief: 6 });
  const r = mesh.inspect(m);
  assert.equal(r.watertight, true);
  assert.equal(r.oriented, true);
  assert.equal(r.components, 1);
  near(r.size[0], 80, 1e-3); near(r.size[1], 80, 1e-3); near(r.size[2], 5, 1e-3);
  near(r.volume, 80 * 80 * 5, 1);

  const wavy = chladni.modeShape(4, 2, 1, size).map((v) => (v + 1) / 2);
  const w = mesh.inspect(mesh.buildPlate(wavy, size, { width: 80, base: 2, relief: 6 }));
  assert.equal(w.watertight && w.oriented && w.components === 1, true);
  assert.ok(w.min[2] === 0 && w.max[2] <= 8 + 1e-4 && w.max[2] > 7);
});

test('mesh: updating a plate in place equals rebuilding it', () => {
  const size = 20, o = { width: 80, base: 2, relief: 6 };
  const first = chladni.modeShape(2, 0, 1, size).map((v) => (v + 1) / 2);
  const second = chladni.modeShape(4, 2, 1, size).map((v) => (v + 1) / 2);
  const moved = mesh.updatePlate(mesh.buildPlate(first, size, o), second, size, o);
  assert.deepEqual(Array.from(moved.positions), Array.from(mesh.buildPlate(second, size, o).positions));
  assert.equal(mesh.inspect(moved).watertight, true);
});

test('mesh: sphere is a printable solid, with and without a flat base', () => {
  const lat = 24, lon = 48;
  const round = mesh.inspect(mesh.buildSphere(new Float32Array((lat + 1) * lon), lat, lon, { diameter: 60, amplitude: 0.3, cut: 0 }));
  assert.equal(round.watertight && round.oriented && round.components === 1, true);
  near(round.volume, 4 / 3 * Math.PI * 30 ** 3, 4 / 3 * Math.PI * 30 ** 3 * 0.02);   // faceting loses a little
  near(round.size[2], 60, 1e-3);
  near(round.min[2], 0, 1e-4);

  const y = forms.sphereHarmonic(5, 3, lat, lon);
  const cut = mesh.inspect(mesh.buildSphere(y, lat, lon, { diameter: 60, amplitude: 0.25, cut: 6 }));
  assert.equal(cut.watertight && cut.oriented && cut.components === 1, true);
  near(cut.min[2], 0, 1e-4);
  assert.ok(cut.size[2] < 60 * 1.25);
});

test('mesh: marching tetrahedra makes a closed, outward-facing ball', () => {
  const n = 24, R = 0.35;
  const axis = Float32Array.from({ length: n }, (_, i) => i / (n - 1));
  const f = new Float32Array(n * n * n);
  for (let k = 0; k < n; k++) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    f[(k * n + j) * n + i] = Math.hypot(axis[i] - 0.5, axis[j] - 0.5, axis[k] - 0.5) - R;
  }
  const r = mesh.inspect(mesh.isoSurface(f, n, n, n, axis, axis, axis));
  assert.equal(r.watertight, true);
  assert.equal(r.oriented, true);
  assert.equal(r.flippedEdges, 0);
  assert.equal(r.components, 1);
  near(r.volume, 4 / 3 * Math.PI * R ** 3, 4 / 3 * Math.PI * R ** 3 * 0.03);
});

test('mesh: room node sheets are closed; a base fuses loose sheets into one piece', () => {
  const N = 28;
  // Single mode (2,0,0): two parallel flat node planes, which float free of each other.
  const planes = forms.roomField([2, 0, 0], false, N);
  const loose = mesh.inspect(mesh.buildRoom(planes, N, { size: 60, wall: 3, base: 0 }));
  assert.equal(loose.watertight, true);
  assert.equal(loose.oriented, true);
  assert.equal(loose.components, 2);
  assert.equal(mesh.printChecks(loose).ok, false);

  const fused = mesh.inspect(mesh.buildRoom(planes, N, { size: 60, wall: 3, base: 4 }));
  assert.equal(fused.watertight, true);
  assert.equal(fused.components, 1);
  assert.equal(mesh.printChecks(fused, { thinnest: { mm: 3, label: 'Wall' } }).ok, true);
  // capped flush with the cube: within a hair of its faces, and standing on z = 0
  for (let a = 0; a < 3; a++) assert.ok(fused.min[a] > -0.05 && fused.min[a] <= 0 && fused.max[a] < 60.05);
  near(fused.size[0], 60, 0.1); near(fused.size[1], 60, 0.1);
});

test('mesh: a blended room mode gives one closed curved sheet of about the asked thickness', () => {
  const N = 32, size = 60, wall = 8;      // both walls span at least two grid steps
  const field = forms.roomField([1, 0, 0], true, N);       // Schwarz P-like surface
  const r = mesh.inspect(mesh.buildRoom(field, N, { size, wall, base: 0 }));
  assert.equal(r.watertight, true);
  assert.equal(r.oriented, true);
  assert.equal(r.components, 1);
  // Volume of a sheet = area x thickness, so the implied thickness should be near the request.
  const thin = mesh.inspect(mesh.buildRoom(field, N, { size, wall: wall / 2, base: 0 }));
  const ratio = r.volume / thin.volume;
  assert.ok(ratio > 1.9 && ratio < 2.1, `doubling the wall should double the volume, got ${ratio}`);
  // The gyroid-like sheet in this cube has an area of about 1.17 x side^2.
  const implied = r.volume / (1.1725 * size * size);
  assert.ok(Math.abs(implied - wall) < 0.4, `asked for ${wall} mm, sheet works out at ${implied.toFixed(2)} mm`);
});

test('mesh: binary STL has the right layout and unit normals', () => {
  const buf = mesh.toBinaryStl(cube(), 'cube');
  assert.equal(buf.byteLength, 84 + 12 * 50);
  const view = new DataView(buf);
  assert.equal(view.getUint32(80, true), 12);
  const head = String.fromCharCode(...new Uint8Array(buf, 0, 5));
  assert.notEqual(head, 'solid');
  // first triangle is on the floor of the cube, so its normal points straight down
  near(view.getFloat32(84, true), 0); near(view.getFloat32(88, true), 0); near(view.getFloat32(92, true), -1);
  for (let t = 0; t < 12; t++) {
    const o = 84 + t * 50;
    near(Math.hypot(view.getFloat32(o, true), view.getFloat32(o + 4, true), view.getFloat32(o + 8, true)), 1, 1e-6);
  }
});
