'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const solids = require('../js/core/solids.js');

const near = (a, b, tol = 1e-6) =>
  assert.ok(Math.abs(a - b) <= tol, `expected ${a} to be within ${tol} of ${b}`);
const get = (id) => solids.find(id);

/* ---------------------------------------------------------------- solids */

test('solids: the five, with faces found from their corners alone', () => {
  const expected = {
    tetrahedron: [4, 6, 4, 3, 3, 70.5288], cube: [8, 12, 6, 4, 3, 90], octahedron: [6, 12, 8, 3, 4, 109.4712],
    dodecahedron: [20, 30, 12, 5, 3, 116.5651], icosahedron: [12, 30, 20, 3, 5, 138.1897]
  };
  assert.deepEqual(solids.SOLIDS.map((s) => s.id), Object.keys(expected));
  for (const s of solids.SOLIDS) {
    const [V, E, F, p, q, angle] = expected[s.id];
    assert.deepEqual([s.V, s.E, s.F, s.p, s.q], [V, E, F, p, q], s.id);
    assert.equal(s.V - s.E + s.F, 2, `${s.id}: corners - edges + faces = 2`);
    near(s.dihedral, angle, 1e-3);
    assert.equal(s.rotations, 2 * E);
    for (const v of s.vertices) near(Math.hypot(...v), 1, 1e-12);
    // every face has the same number of corners, every edge the same length, every face points outward
    for (const f of s.faces) {
      assert.equal(f.length, p);
      const a = s.vertices[f[0]], b = s.vertices[f[1]], c = s.vertices[f[2]];
      const n = [(b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]), (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]), (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])];
      assert.ok(n[0] * a[0] + n[1] * a[1] + n[2] * a[2] > 0, `${s.id}: a face points inward`);
    }
    for (const e of s.edges) near(Math.hypot(...s.vertices[e[0]].map((x, i) => x - s.vertices[e[1]][i])), s.edgeLength, 1e-9);
    assert.ok(s.found.length > 30 && s.note.length > 30 && s.element.length > 2);
  }
  assert.equal(solids.find('sphere'), null);
});

test('solids: each solid\'s dual is the solid it names', () => {
  for (const s of solids.SOLIDS) {
    const d = solids.dualOf(s.id), named = get(s.dual);
    assert.deepEqual([d.V, d.E, d.F, d.p, d.q], [named.V, named.E, named.F, named.p, named.q], s.id);
    assert.deepEqual([d.V, d.F], [s.F, s.V], `${s.id}: corners and faces change places`);
    assert.equal(d.E, s.E);
    // each corner of the dual stands over the middle of a face
    for (let i = 0; i < s.F; i++) {
      const c = [0, 1, 2].map((k) => s.faces[i].reduce((sum, v) => sum + s.vertices[v][k], 0));
      const len = Math.hypot(...c);
      for (let k = 0; k < 3; k++) near(d.vertices[i][k], c[k] / len, 1e-9);
    }
  }
  // the tetrahedron's dual is the tetrahedron turned inside out
  const t = get('tetrahedron'), d = solids.dualOf('tetrahedron');
  for (const v of d.vertices) assert.ok(t.vertices.some((w) => Math.hypot(w[0] + v[0], w[1] + v[1], w[2] + v[2]) < 1e-9));
});

test('solids: the golden ratio in the dodecahedron and icosahedron', () => {
  near(solids.PHI, 1.6180339887, 1e-9);
  // a pentagon's diagonal is its side times the golden ratio
  const d = get('dodecahedron'), f = d.faces[0];
  const dist = (a, b) => Math.hypot(...d.vertices[a].map((x, i) => x - d.vertices[b][i]));
  near(dist(f[0], f[2]) / dist(f[0], f[1]), solids.PHI, 1e-9);
  // the icosahedron's corners are those of three golden rectangles at right angles
  const ico = get('icosahedron');
  const flat = ico.vertices.filter((v) => Math.abs(v[0]) < 1e-9);
  assert.equal(flat.length, 4);
  const ys = flat.map((v) => Math.abs(v[1])), zs = flat.map((v) => Math.abs(v[2]));
  near(Math.max(...zs) / Math.max(...ys), solids.PHI, 1e-9);
});

test('solids: why there are only five', () => {
  // the corner angles meeting at a point must total less than a full turn
  const works = [];
  for (let p = 3; p <= 8; p++) for (let q = 3; q <= 8; q++) if (solids.cornerAngleSum(p, q) < 360 - 1e-9) works.push(`${p},${q}`);
  assert.deepEqual(works.sort(), solids.SOLIDS.map((s) => `${s.p},${s.q}`).sort());
  near(solids.cornerAngleSum(3, 6), 360);                      // six triangles lie flat
  near(solids.cornerAngleSum(4, 4), 360);                      // four squares lie flat
  near(solids.cornerAngleSum(6, 3), 360);                      // three hexagons lie flat
  near(solids.cornerAngleSum(5, 3), 324);
});

test('solids: meshes', () => {
  for (const s of solids.SOLIDS) {
    const m = solids.solidMesh(s, 2);
    assert.equal(m.indices.length / 3, s.F * (s.p - 2));
    assert.equal(m.edges.length, s.E * 6);
    for (const i of m.indices) assert.ok(i < m.positions.length / 3);
    for (let i = 0; i < m.positions.length; i += 3) near(Math.hypot(m.positions[i], m.positions[i + 1], m.positions[i + 2]), 2, 1e-6);
  }
  const ball = solids.sphere(3);
  assert.equal(ball.indices.length / 3, 20 * 64);
  assert.equal(ball.directions.length / 3, 10 * 64 + 2);
  for (let i = 0; i < ball.directions.length; i += 3) near(Math.hypot(ball.directions[i], ball.directions[i + 1], ball.directions[i + 2]), 1, 1e-6);
});

/* ----------------------------------------------------------------- waves */

test('solids: Legendre polynomials', () => {
  near(solids.legendre(0, 0.3), 1);
  near(solids.legendre(1, 0.3), 0.3);
  near(solids.legendre(2, 0.3), (3 * 0.09 - 1) / 2);
  near(solids.legendre(4, 0.5), (35 * 0.0625 - 30 * 0.25 + 3) / 8);
  for (let l = 0; l <= 8; l++) { near(solids.legendre(l, 1), 1, 1e-12); near(solids.legendre(l, -1), l % 2 ? -1 : 1, 1e-12); }
});

test('solids: the wave of each solid peaks at its corners and dips at its dual\'s', () => {
  const degree = { tetrahedron: 3, cube: 4, octahedron: 4, dodecahedron: 6, icosahedron: 6 };
  const ball = solids.sphere(4);
  for (const s of solids.SOLIDS) {
    const w = solids.waveFor(s.id);
    assert.equal(w.l, degree[s.id]);
    const at = (v) => solids.waveValue(w, v[0], v[1], v[2]);
    for (const v of s.vertices) near(at(v), 1, 1e-9);                         // the same at every corner: it has the solid's symmetry
    const dual = solids.dualOf(s.id), low = at(dual.vertices[0]);
    assert.ok(low < -0.5, `${s.id}: ${low}`);
    for (const v of dual.vertices) near(at(v), low, 1e-9);
    // nowhere on the sphere is it higher than at the corners or lower than at the dual's corners
    const values = solids.waveOnSphere(w, ball);
    let min = Infinity, max = -Infinity;
    for (const v of values) { min = Math.min(min, v); max = Math.max(max, v); }
    assert.ok(max <= 1 + 1e-6 && min >= low - 1e-6, `${s.id}: ${min} .. ${max}`);
    // a pure wave is as much down as up: its average over evenly spread points is zero
    let sum = 0; const N = 6000, golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < N; i++) {
      const z = 1 - 2 * (i + 0.5) / N, r = Math.sqrt(1 - z * z);
      sum += solids.waveValue(w, r * Math.cos(golden * i), r * Math.sin(golden * i), z);
    }
    near(sum / N, 0, 0.002);
  }
  // a solid and its dual share one wave, seen at opposite ends of its swing
  const cube = solids.waveFor('cube'), octa = solids.waveFor('octahedron');
  for (const p of [[0.2, 0.5, 0.84], [0.9, -0.1, 0.42], [-0.6, 0.64, 0.48]]) {
    const n = Math.hypot(...p), x = p[0] / n, y = p[1] / n, z = p[2] / n;
    near(solids.waveValue(cube, x, y, z) / solids.waveValue(octa, x, y, z), cube.scale / octa.scale, 1e-9);
  }
  assert.ok(cube.scale / octa.scale < 0);
  assert.ok(solids.waveFor('dodecahedron').scale / solids.waveFor('icosahedron').scale < 0);
  assert.equal(solids.waveFor('prism'), null);
});

test('solids: these are the lowest waves that can have each symmetry', () => {
  // at any lower degree the one-axis waves along the solid's axes cancel everywhere
  const points = [[0.2, 0.5, 0.84], [0.9, -0.1, 0.42], [-0.6, 0.64, 0.48], [0, 0, 1]].map((p) => { const n = Math.hypot(...p); return p.map((x) => x / n); });
  const flat = (axes, l) => points.every((p) => Math.abs(solids.axisSum(axes, l, p[0], p[1], p[2])) < 1e-9);
  const tetra = get('tetrahedron').vertices, three = solids.axesOf(get('octahedron').vertices), six = solids.axesOf(get('icosahedron').vertices);
  assert.equal(three.length, 3); assert.equal(six.length, 6);
  assert.ok(flat(tetra, 1) && flat(tetra, 2) && !flat(tetra, 3));
  assert.ok(flat(three, 2) && !flat(three, 4));
  assert.ok(flat(six, 2) && flat(six, 4) && !flat(six, 6));
});

test('solids: how fast a drop of water rings', () => {
  // Rayleigh's formula for a 1 mm drop, degree 2
  near(solids.dropFrequency(2, 1), Math.sqrt(8 * 0.0728 / (998 * 1e-9)) / (2 * Math.PI), 1e-9);
  near(solids.dropFrequency(2, 1), 121.6, 0.1);
  // eight times the volume (twice the radius) rings 2 * sqrt(2) times slower
  near(solids.dropFrequency(3, 1) / solids.dropFrequency(3, 2), Math.sqrt(8), 1e-9);
  // the three symmetric waves: degree 6 is exactly an octave and a half above degree 3
  near(solids.dropFrequency(6, 1.7) / solids.dropFrequency(3, 1.7), Math.sqrt(8), 1e-9);
  near(1200 * Math.log2(solids.dropFrequency(6, 1) / solids.dropFrequency(3, 1)), 1800, 1e-6);
  near(solids.dropFrequency(4, 1) / solids.dropFrequency(3, 1), Math.sqrt(2.4), 1e-9);
});

/* -------------------------------------------------------------- fractals */

test('solids: fractal dimension and what each step does', () => {
  near(solids.dimension(4, 2), 2, 1e-12);                      // Sierpinski tetrahedron: exactly 2
  near(solids.dimension(20, 3), 2.7268, 1e-4);                 // Menger sponge
  near(solids.dimension(8, 2), 3, 1e-12);                      // a plain cube cut in halves: 3, as it should be
  const s = solids.fractalFacts('sierpinski', 3);
  assert.deepEqual([s.pieces, s.volume, s.area], [64, 0.125, 1]);
  const m = solids.fractalFacts('menger', 2);
  assert.equal(m.pieces, 400);
  near(m.volume, 400 / 729, 1e-12);
  assert.equal(solids.fractalFacts('koch', 1), null);
});

test('solids: fractal meshes match the arithmetic', () => {
  const area = (mesh) => {
    let a = 0; const p = mesh.positions, ix = mesh.indices;
    for (let t = 0; t < ix.length; t += 3) {
      const A = ix[t] * 3, B = ix[t + 1] * 3, C = ix[t + 2] * 3;
      const u = [p[B] - p[A], p[B + 1] - p[A + 1], p[B + 2] - p[A + 2]], v = [p[C] - p[A], p[C + 1] - p[A + 1], p[C + 2] - p[A + 2]];
      a += Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]) / 2;
    }
    return a;
  };
  const volume = (mesh) => {
    let v = 0; const p = mesh.positions, ix = mesh.indices;
    for (let t = 0; t < ix.length; t += 3) {
      const a = ix[t] * 3, c = ix[t + 1] * 3, d = ix[t + 2] * 3;
      v += (p[a] * (p[c + 1] * p[d + 2] - p[c + 2] * p[d + 1]) - p[a + 1] * (p[c] * p[d + 2] - p[c + 2] * p[d]) + p[a + 2] * (p[c] * p[d + 1] - p[c + 1] * p[d])) / 6;
    }
    return v;
  };
  // the Sierpinski tetrahedron: the surface stays the same while the volume halves
  const s0 = solids.fractalMesh('sierpinski', 0);
  for (let d = 0; d <= 4; d++) {
    const m = solids.fractalMesh('sierpinski', d), f = solids.fractalFacts('sierpinski', d);
    assert.equal(m.indices.length / 3, 4 * f.pieces);
    near(area(m) / area(s0), 1, 1e-5);
    near(volume(m) / volume(s0), f.volume, 1e-5);
  }
  // the Menger sponge: volume and open surface follow the formulas, counted from the mesh itself
  const m0 = solids.fractalMesh('menger', 0);
  near(volume(m0), Math.pow(m0.side, 3), 1e-5);
  for (let d = 0; d <= 3; d++) {
    const m = solids.fractalMesh('menger', d), f = solids.fractalFacts('menger', d);
    near(volume(m) / volume(m0), f.volume, 1e-4);
    near(area(m) / area(m0), f.area, 1e-4);
    for (const i of m.indices) assert.ok(i < m.positions.length / 3);
  }
  // twenty of the 27 small cubes are kept at the first step
  let kept = 0;
  for (let x = 0; x < 3; x++) for (let y = 0; y < 3; y++) for (let z = 0; z < 3; z++) if (solids.inSponge(x, y, z, 1)) kept++;
  assert.equal(kept, 20);
  assert.equal(solids.inSponge(1, 1, 1, 1), false);
  assert.equal(solids.inSponge(1, 1, 0, 1), false);
  assert.equal(solids.inSponge(1, 0, 0, 1), true);
  // depth is limited so a page cannot be asked for millions of triangles
  assert.equal(solids.fractalMesh('menger', 9).indices.length, solids.fractalMesh('menger', 3).indices.length);
  assert.equal(solids.fractalMesh('sierpinski', 99).indices.length, solids.fractalMesh('sierpinski', 6).indices.length);
});
