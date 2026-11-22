'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const growth = require('../js/core/growth.js');

const near = (a, b, tol = 1e-6) =>
  assert.ok(Math.abs(a - b) <= tol, `expected ${a} to be within ${tol} of ${b}`);
const full = (opts) => { const s = growth.create(opts); growth.grow(s, 1e9); return s; };

test('growth: the random numbers are repeatable and well spread', () => {
  const a = growth.rng(42), b = growth.rng(42), c = growth.rng(43);
  const xs = Array.from({ length: 2000 }, () => a());
  assert.deepEqual(xs.slice(0, 50), Array.from({ length: 50 }, () => b()));
  assert.notEqual(xs[0], c());
  assert.ok(xs.every((x) => x >= 0 && x < 1));
  near(xs.reduce((s, x) => s + x, 0) / xs.length, 0.5, 0.03);
});

test('growth: a fresh grid has one spark cell, an electrode, and a settled voltage', () => {
  const s = growth.create({ n: 41, shape: 'point', seed: 7 });
  assert.equal(s.n, 41);
  assert.equal(s.order.length, 1);
  assert.equal(s.start, 20 * 41 + 20);
  assert.equal(s.kind[s.start], growth.SPARK);
  assert.equal(s.phi[s.start], 0);
  assert.equal(s.kind[0], growth.ELECTRODE);                   // the corners lie outside the ring
  assert.equal(s.phi[0], 1);
  assert.equal(s.frontier.length, 4);                          // the four cells touching the start
  // every empty cell is the average of its neighbours, and lies between the two voltages
  growth.relax(s, 400);
  let worst = 0;
  for (let y = 1; y < 40; y++) for (let x = 1; x < 40; x++) {
    const i = y * 41 + x;
    if (s.kind[i] !== growth.FREE) continue;
    assert.ok(s.phi[i] > 0 && s.phi[i] < 1);
    worst = Math.max(worst, Math.abs(s.phi[i] - (s.phi[i - 1] + s.phi[i + 1] + s.phi[i - 41] + s.phi[i + 41]) / 4));
  }
  assert.ok(worst < 1e-5, `residual ${worst}`);
  // the voltage rises steadily from the spark to the electrode
  assert.ok(s.phi[s.start + 1] < s.phi[s.start + 5] && s.phi[s.start + 5] < s.phi[s.start + 12]);

  const p = growth.create({ n: 40, shape: 'plane' });           // an even size is made odd
  assert.equal(p.n, 41);
  assert.equal(p.start, 20);                                    // middle of the top edge
  assert.equal(p.kind[40 * 41 + 3], growth.ELECTRODE);          // the ground is the bottom row
  assert.equal(p.kind[5 * 41], growth.FREE);
});

test('growth: the same seed grows the same spark; another seed grows another', () => {
  const a = full({ n: 51, eta: 1, seed: 5 }), b = full({ n: 51, eta: 1, seed: 5 }), c = full({ n: 51, eta: 1, seed: 6 });
  assert.deepEqual(a.order, b.order);
  assert.notDeepEqual(a.order, c.order);
});

test('growth: the spark is one connected tree that reaches the electrode', () => {
  for (const shape of ['point', 'plane']) {
    const s = full({ n: 61, shape, eta: 1, seed: 3 });
    assert.equal(s.done, true);
    assert.equal(s.reached, true, `${shape} reaches the electrode`);
    assert.ok(s.order.length > 100);
    assert.equal(new Set(s.order).size, s.order.length);        // no cell joins twice
    for (let k = 1; k < s.order.length; k++) {
      const i = s.order[k], p = s.parent[i];
      assert.equal(s.kind[p], growth.SPARK);
      const dx = Math.abs(i % 61 - p % 61), dy = Math.abs(Math.floor(i / 61) - Math.floor(p / 61));
      assert.equal(dx + dy, 1, 'each cell grows from a neighbour');
      assert.ok(s.order.indexOf(p) < k, 'and from one that was there first');
    }
    assert.equal(s.parent[s.start], -1);
    // one line for every cell after the first; the whole spark hangs from the start
    const b = growth.bonds(s), load = growth.loads(s);
    assert.equal(b.share.length, s.order.length - 1);
    assert.equal(b.positions.length, 4 * (s.order.length - 1));
    assert.equal(load[s.start], s.order.length);
    for (const v of b.positions) assert.ok(v >= -1 && v <= 1);
    for (const v of b.share) assert.ok(v > 0 && v < 1);
    // each line is one cell long
    near(Math.hypot(b.positions[2] - b.positions[0], b.positions[3] - b.positions[1]), 1 / 30, 1e-6);
    if (shape === 'plane') near(b.positions[1], 1, 1e-6);       // it starts at the top
  }
});

test('growth: it can be stopped by a limit, and grown a few steps at a time', () => {
  const s = growth.create({ n: 61, eta: 0, seed: 2, maxCells: 300 });
  assert.equal(growth.grow(s, 10), 10);
  assert.equal(s.order.length, 11);
  assert.equal(s.done, false);
  growth.grow(s, 1e9);
  assert.equal(s.order.length, 300);
  assert.equal(s.done, true);
  assert.equal(s.reached, false);
  assert.equal(growth.step(s), -1);
  assert.equal(growth.grow(s, 5), 0);
  assert.ok(Number.isNaN(growth.dimension(growth.create({ n: 61 }))));     // too small to measure yet
});

test('growth: following the field more closely makes a thinner, lower-dimension spark', () => {
  const mean = (eta) => {
    let sum = 0, cells = 0;
    for (const seed of [1, 2, 3, 4]) { const s = full({ n: 121, eta, seed }); sum += growth.dimension(s) / 4; cells += s.order.length / 4; }
    return { d: sum, cells };
  };
  const blob = mean(0), standard = mean(1), thin = mean(2);
  near(blob.d, 2, 0.05);                                       // ignoring the field fills the plane
  // the standard model's published dimension is about 1.7
  assert.ok(Math.abs(standard.d - growth.PUBLISHED_DIMENSION) < 0.12, `eta 1 gave ${standard.d}`);
  assert.ok(thin.d < standard.d - 0.1 && thin.d > 1.15, `eta 2 gave ${thin.d}`);
  assert.ok(blob.cells > standard.cells && standard.cells > thin.cells);
});
