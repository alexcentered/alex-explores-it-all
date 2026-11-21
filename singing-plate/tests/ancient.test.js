'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const ancient = require('../js/core/ancient.js');

const near = (a, b, tol = 1e-6) =>
  assert.ok(Math.abs(a - b) <= tol, `expected ${a} to be within ${tol} of ${b}`);

/* ---------------------------------------------------------------- ratios */

test('ancient: the interval a ratio is nearest to', () => {
  let i = ancient.nearestInterval(2);
  assert.equal(i.name, 'Octave'); assert.equal(i.octaves, 0); near(i.off, 0); assert.equal(i.close, true);
  i = ancient.nearestInterval(3 / 2);
  assert.equal(i.name, 'Fifth'); near(i.off, 0);
  i = ancient.nearestInterval(9 / 4);                          // two fifths: an octave and a whole tone
  assert.equal(i.name, 'Major second'); assert.equal(i.octaves, 1); near(i.off, 0, 1e-9);
  i = ancient.nearestInterval(4);
  assert.equal(i.name, 'Octave'); assert.equal(i.octaves, 1);
  i = ancient.nearestInterval(1);
  assert.equal(i.name, 'Unison'); assert.equal(i.octaves, 0);
  // a ratio and its inverse are the same interval
  assert.equal(ancient.nearestInterval(2 / 3).name, 'Fifth');
  // the pyramid's slope is not a musical interval: it sits between a major third and a fourth
  i = ancient.nearestInterval(14 / 11);
  assert.equal(i.close, false);
  assert.ok(Math.abs(i.off) > 25, `off by ${i.off}`);
  // just inside and just outside the tolerance
  assert.equal(ancient.nearestInterval(1.5 * Math.pow(2, 9 / 1200)).close, true);
  assert.equal(ancient.nearestInterval(1.5 * Math.pow(2, 12 / 1200)).close, false);
  assert.equal(ancient.nearestInterval(0), null);
  assert.equal(ancient.nearestInterval(NaN), null);
});

test('ancient: the nearest simple fraction', () => {
  assert.deepEqual([ancient.simpleFraction(2.2506, 16).a, ancient.simpleFraction(2.2506, 16).b], [9, 4]);
  assert.deepEqual([ancient.simpleFraction(14 / 11, 16).a, ancient.simpleFraction(14 / 11, 16).b], [14, 11]);
  assert.deepEqual([ancient.simpleFraction(2, 16).a, ancient.simpleFraction(2, 16).b], [2, 1]);
  assert.deepEqual([ancient.simpleFraction(Math.PI, 16).a, ancient.simpleFraction(Math.PI, 16).b], [22, 7]);
  assert.ok(ancient.simpleFraction(2.2506, 16).error < 0.001);
});

/* ------------------------------------------------------------ room modes */

test('ancient: room modes of a box', () => {
  const modes = ancient.boxModes(10, 5, 4, 20);
  assert.equal(modes.length, 20);
  near(modes[0].freq, 343 / 20);                               // half a wavelength along the longest side
  assert.deepEqual(modes[0].n, [1, 0, 0]);
  assert.equal(modes[0].kind, 'axial');
  for (let i = 1; i < modes.length; i++) assert.ok(modes[i].freq >= modes[i - 1].freq);
  const m = modes.find((x) => x.n.join() === '1,1,0');
  near(m.freq, 343 / 2 * Math.hypot(1 / 10, 1 / 5));
  assert.equal(m.kind, 'tangential');
  assert.ok(modes.some((x) => x.kind === 'oblique'));
});

test('ancient: sound pressure in a mode, and the level sheet through it', () => {
  near(ancient.boxPressure([1, 0, 0], 0, 0.3, 0.7), 1);        // loud at the walls
  near(ancient.boxPressure([1, 0, 0], 1, 0.3, 0.7), -1);
  near(ancient.boxPressure([1, 0, 0], 0.5, 0.3, 0.7), 0, 1e-12);   // quiet in the middle
  near(ancient.boxPressure([2, 1, 0], 0.25, 0.9, 0.1), 0, 1e-12);
  const room = { L: 10, W: 5, H: 4, origin: [-5, -2.5, 0] };
  const sheet = ancient.modeSlice(room, [1, 0, 0], 0.5, 10);
  assert.equal(sheet.positions.length, 11 * 11 * 3);
  assert.equal(sheet.values.length, 11 * 11);
  assert.equal(sheet.indices.length, 10 * 10 * 6);
  near(sheet.positions[2], 2);                                  // halfway up a 4 m room
  near(sheet.positions[0], -5); near(sheet.positions[1], -2.5);
  near(sheet.values[0], 1); near(sheet.values[5], 0, 1e-6); near(sheet.values[10], 1);
  for (const v of sheet.values) assert.ok(v >= 0 && v <= 1);
  for (const i of sheet.indices) assert.ok(i < 121);
});

test('ancient: raising a low note by octaves until it can be heard', () => {
  assert.deepEqual(ancient.audible(440), { freq: 440, octaves: 0 });
  assert.deepEqual(ancient.audible(16.4), { freq: 16.4 * 8, octaves: 3 });
  assert.deepEqual(ancient.audible(110), { freq: 110, octaves: 0 });
  assert.deepEqual(ancient.audible(8000), { freq: 2000, octaves: -2 });
  assert.equal(ancient.audible(0).freq, 0);
});

/* ---------------------------------------------------------------- shapes */

test('ancient: the shape builder makes sound meshes', () => {
  const b = new ancient.Builder();
  b.box('solid', 0, 0, 0, 2, 4, 6);
  let m = b.result();
  assert.equal(m.solid.positions.length, 6 * 4 * 3);           // six faces, each with its own four corners
  assert.equal(m.solid.indices.length, 12 * 3);
  assert.deepEqual(m.min, [-1, -2, 0]);
  assert.deepEqual(m.max, [1, 2, 6]);
  assert.equal(m.edges.length, 0);                              // only see-through shapes get outlines
  // every face points outward: the signed volume is the box's volume
  const vol = (mesh) => {
    let v = 0; const p = mesh.positions, ix = mesh.indices;
    for (let t = 0; t < ix.length; t += 3) {
      const a = ix[t] * 3, c = ix[t + 1] * 3, d = ix[t + 2] * 3;
      v += (p[a] * (p[c + 1] * p[d + 2] - p[c + 2] * p[d + 1]) - p[a + 1] * (p[c] * p[d + 2] - p[c + 2] * p[d]) + p[a + 2] * (p[c] * p[d + 1] - p[c + 1] * p[d])) / 6;
    }
    return v;
  };
  near(vol(m.solid), 48, 1e-4);

  const g = new ancient.Builder();
  g.box('ghost', 0, 0, 0, 2, 2, 2);
  assert.equal(g.result().edges.length, 12 * 6);               // twelve edges, two points each

  const turned = new ancient.Builder();
  turned.box('solid', 0, 0, 0, 2, 4, 1, Math.PI / 2);          // a quarter turn swaps its footprint
  near(turned.result().max[0], 2, 1e-6); near(turned.result().max[1], 1, 1e-6);

  const py = new ancient.Builder();
  py.pyramid('solid', 0, 0, 0, 6, 5);
  near(vol(py.result().solid), 6 * 6 * 5 / 3, 1e-4);

  const cyl = new ancient.Builder();
  cyl.cylinder('solid', 0, 0, 0, 1, 1, 3, 64);
  near(vol(cyl.result().solid), Math.PI * 3, 0.02);

  const roof = new ancient.Builder();
  roof.gable('solid', 0, 0, 0, 10, 4, 3);
  near(vol(roof.result().solid), 0.5 * 4 * 3 * 10, 1e-4);
});

test('ancient: every structure has a model, a record and sources', () => {
  assert.equal(ancient.STRUCTURES.length, 6);
  const ids = new Set();
  for (const s of ancient.STRUCTURES) {
    assert.ok(!ids.has(s.id)); ids.add(s.id);
    for (const key of ['name', 'place', 'date', 'material', 'size', 'ratioNote']) assert.ok(typeof s[key] === 'string' && s[key].length > 3, `${s.id}.${key}`);
    assert.ok(s.built.length >= 3, `${s.id} says how it was built`);
    assert.ok(s.sources.length >= 1, `${s.id} names a source`);
    assert.ok(s.acoustics.length >= 2);
    for (const a of s.acoustics) {
      assert.ok(ancient.STATUSES.includes(a.status), `${s.id}: ${a.status}`);
      assert.ok(a.text.length > 20);
      // a measurement must say who made it
      if (a.status === 'measured') assert.match(a.text, /\((?:[A-Z][^)]*\d{4}|[A-Z][^)]+)\)/, `${s.id}: measured without a citation`);
    }
    const m = ancient.model(s.id);
    assert.ok(m.solid.indices.length > 30, `${s.id} has solid shapes`);
    for (const mesh of [m.solid, m.ghost, m.ground]) {
      assert.equal(mesh.positions.length % 3, 0);
      assert.equal(mesh.indices.length % 3, 0);
      for (const v of mesh.positions) assert.ok(Number.isFinite(v));
      for (const i of mesh.indices) assert.ok(i < mesh.positions.length / 3);
    }
    assert.equal(m.edges.length % 6, 0);
    for (let a = 0; a < 3; a++) assert.ok(m.max[a] > m.min[a]);
  }
  assert.equal(ancient.find('nowhere'), null);
  assert.equal(ancient.model('nowhere'), null);
});

test('ancient: the models are the sizes the records give', () => {
  const span = (id) => { const m = ancient.model(id); return [m.max[0] - m.min[0], m.max[1] - m.min[1], m.max[2]]; };
  // the Great Pyramid: 440 cubits square and 280 high
  const gp = ancient.model('great-pyramid');
  near(gp.max[2], 280 * ancient.CUBIT, 1e-3);
  near(gp.max[2], 146.6, 0.05);
  // the Parthenon: top of the cornice at 13.72 m, platform 69.5 m long
  const p = ancient.model('parthenon');
  near(p.max[2], 10.43 + 3.29 + 3.5, 1e-4);
  assert.ok(span('parthenon')[0] >= 69.5 && span('parthenon')[0] < 76);   // steps and a figure standing in front add a little
  // Stonehenge: tallest stone 7.3 m, circle about 30 m across inside
  near(ancient.model('stonehenge').max[2], 7.3, 1e-4);
  // Newgrange: mound 85 m across, 11 m high
  near(span('newgrange')[2], 11.05, 1e-4);
  // its close-up leaves the mound out: the passage, the chamber and a roof 6 m high
  const close = ancient.model('newgrange', true);
  assert.ok(close.max[0] - close.min[0] < 40 && close.ghost.indices.length < ancient.model('newgrange').ghost.indices.length);
  near(close.max[2], 2.0 + 9 * 0.42 + 0.25, 1e-4);
  near(close.max[2], 6, 0.1);
  // a structure without a close-up gives the same model either way
  assert.equal(ancient.model('parthenon', true).solid.positions.length, p.solid.positions.length);
  assert.deepEqual(ancient.STRUCTURES.filter((s) => s.closeUp).map((s) => s.id), ['newgrange']);
  // the Osireion: pillars 4 m, beams above
  near(ancient.model('osireion').max[2], 5.6, 1e-4);
});

test('ancient: the King\'s Chamber is the 3-4-5 room the record says it is', () => {
  const s = ancient.find('kings-chamber'), r = s.room, c = ancient.CUBIT;
  near(r.L / c, 20); near(r.W / c, 10); near(r.H / c, 5 * Math.sqrt(5));
  near(Math.hypot(r.W, r.H) / c, 15, 1e-9);                    // end-wall diagonal
  near(Math.hypot(r.L, r.W, r.H) / c, 25, 1e-9);               // long diagonal through the room
  near(r.L, 10.47, 0.005); near(r.H, 5.85, 0.005);
  // its lowest mode, and the doubling that a double square gives
  const modes = ancient.boxModes(r.L, r.W, r.H, 12);
  near(modes[0].freq, 16.38, 0.01);
  const pair = modes.filter((m) => Math.abs(m.freq - 32.75) < 0.02).map((m) => m.n.join());
  assert.deepEqual(pair.sort(), ['0,1,0', '2,0,0']);
  // the ratios the record lists are what it says: octave, major third, fourth, major sixth
  const a = ancient.analyse(s);
  assert.deepEqual(a.slice(0, 4).map((x) => x.interval.name), ['Octave', 'Major third', 'Fourth', 'Major sixth']);
  assert.ok(a.slice(0, 4).every((x) => x.whole && x.interval.close && Math.abs(x.interval.off) < 1e-9));
  assert.equal(a[4].whole, false);
});

test('ancient: ratios are reported honestly', () => {
  // the Parthenon's three ratios are all 9 to 4 within a tenth of a percent
  const p = ancient.analyse(ancient.find('parthenon'));
  assert.equal(p.length, 3);
  for (const r of p) {
    assert.deepEqual([r.fraction.a, r.fraction.b], [9, 4]);
    assert.ok(r.fraction.error < 0.0015, `${r.label}: ${r.fraction.error}`);
    assert.equal(r.interval.name, 'Major second'); assert.equal(r.interval.octaves, 1); assert.equal(r.interval.close, true);
  }
  // the pyramid's are whole numbers of cubits but not musical intervals; round the base to height is near 2 pi
  const g = ancient.analyse(ancient.find('great-pyramid'));
  assert.ok(g.every((r) => r.whole));
  assert.equal(g[0].interval.close, false);
  near(g[2].value, 2 * Math.PI, 2 * Math.PI * 0.0005);
  // no ratio is offered where the builders' units are unknown
  assert.equal(ancient.find('stonehenge').ratios.length, 0);
  assert.equal(ancient.find('newgrange').ratios.length, 0);
  assert.ok(ancient.analyse(ancient.find('osireion')).every((r) => !r.whole));
  // only the King's Chamber is a simple closed box, so only it gets computed room modes
  assert.deepEqual(ancient.STRUCTURES.filter((s) => s.room).map((s) => s.id), ['kings-chamber']);
});
