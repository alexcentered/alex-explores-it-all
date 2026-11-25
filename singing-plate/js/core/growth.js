/*
 * core/growth.js -- a spark that grows itself: the dielectric breakdown model.
 *
 * Lightning, the streamers from a Tesla coil and the branching figures a
 * spark burns into plastic all form the same way. The discharge advances
 * one short step at a time, and it is more likely to advance where the
 * electric field at its edge is stronger. Every step changes the field,
 * so the field is worked out again before the next step.
 *
 * This is the model of Niemeyer, Pietronero and Wiesmann (1984), on a flat
 * square grid:
 *
 *   1. The discharge is a conductor at voltage 0. Some distance away is an
 *      electrode at voltage 1. In between, the voltage obeys Laplace's
 *      equation: at every empty cell it is the average of its neighbours.
 *   2. Every empty cell touching the discharge is a candidate. Its chance
 *      of being next is in proportion to (its voltage) ^ eta. The voltage
 *      there is the field at the discharge's edge, to within a constant.
 *   3. One candidate is chosen by chance and joins the discharge. Repeat.
 *
 * eta = 1 is the standard model. eta = 0 ignores the field and grows a
 * solid blob; a large eta follows the field so closely it barely branches.
 *
 * The result is a fractal only on average: no two are alike. Randomness
 * comes from a seeded generator so a pattern can be grown again exactly.
 *
 * Pure functions only.
 */
(function (root) {
  'use strict';

  var FREE = 0, SPARK = 1, ELECTRODE = 2;
  var OMEGA = 1.7;            // over-relaxation: reaches the average-of-neighbours state in fewer passes

  /* A small seeded random number generator (mulberry32). Returns values in [0, 1). */
  function rng(seed) {
    var a = (seed >>> 0) || 1;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /*
   * A fresh grid with a one-cell spark and its electrode.
   *   n         cells along each side (odd, 31 .. 161)
   *   shape     'point'   the spark starts at the centre, inside a ring electrode
   *             'plane'   it starts at the middle of the top edge, above a flat electrode: cloud to ground
   *   eta       how strongly growth follows the field, 0 .. 5
   *   seed      for the random choices
   *   maxCells  stop here even if the electrode has not been reached
   */
  function create(opts) {
    var o = opts || {};
    var n = Math.min(161, Math.max(31, Math.round(Number(o.n) || 121)));
    if (n % 2 === 0) n += 1;
    var s = {
      n: n,
      shape: o.shape === 'plane' ? 'plane' : 'point',
      eta: Math.min(5, Math.max(0, isFinite(Number(o.eta)) ? Number(o.eta) : 1)),
      seed: (Number(o.seed) >>> 0) || 1,
      maxCells: Math.max(2, Math.round(Number(o.maxCells) || 4000)),
      phi: new Float32Array(n * n),
      kind: new Uint8Array(n * n),
      parent: new Int32Array(n * n).fill(-1),
      order: [],
      frontier: [],
      inFrontier: new Uint8Array(n * n),
      done: false,
      reached: false
    };
    s.random = rng(s.seed);
    var c = (n - 1) / 2, x, y, i;
    if (s.shape === 'plane') {
      for (y = 0; y < n; y++) for (x = 0; x < n; x++) {
        i = y * n + x;
        if (y === n - 1) { s.kind[i] = ELECTRODE; s.phi[i] = 1; }
        else s.phi[i] = y / (n - 1);                 // a first guess: an even slope from cloud to ground
      }
      s.start = c;                                   // top row, middle
    } else {
      var R = c - 1;
      for (y = 0; y < n; y++) for (x = 0; x < n; x++) {
        i = y * n + x;
        var r = Math.sqrt((x - c) * (x - c) + (y - c) * (y - c));
        if (r >= R) { s.kind[i] = ELECTRODE; s.phi[i] = 1; }
        else s.phi[i] = r / R;
      }
      s.start = c * n + c;
    }
    join(s, s.start, -1);
    relax(s, 120);
    return s;
  }

  /* Add one cell to the spark and note the empty cells now touching it. */
  function join(s, i, from) {
    var n = s.n;
    s.kind[i] = SPARK;
    s.phi[i] = 0;
    s.parent[i] = from;
    s.order.push(i);
    var x = i % n, y = (i - x) / n;
    var next = [x > 0 ? i - 1 : -1, x < n - 1 ? i + 1 : -1, y > 0 ? i - n : -1, y < n - 1 ? i + n : -1];
    for (var k = 0; k < 4; k++) {
      var j = next[k];
      if (j < 0) continue;
      if (s.kind[j] === ELECTRODE) { s.reached = true; s.done = true; }
      else if (s.kind[j] === FREE && !s.inFrontier[j]) { s.inFrontier[j] = 1; s.frontier.push(j); }
    }
    if (s.order.length >= s.maxCells) s.done = true;
  }

  /*
   * Bring the voltage toward the state where every empty cell is the
   * average of its four neighbours. At the grid's own edges the missing
   * neighbour is taken as a mirror image, so no field crosses the edge.
   */
  function relax(s, passes) {
    var n = s.n, phi = s.phi, kind = s.kind;
    for (var p = 0; p < passes; p++) {
      for (var y = 0; y < n; y++) {
        var row = y * n;
        for (var x = 0; x < n; x++) {
          var i = row + x;
          if (kind[i] !== FREE) continue;
          var avg = (phi[x > 0 ? i - 1 : i + 1] + phi[x < n - 1 ? i + 1 : i - 1] + phi[y > 0 ? i - n : i + n] + phi[y < n - 1 ? i + n : i - n]) / 4;
          phi[i] += OMEGA * (avg - phi[i]);
        }
      }
    }
  }

  /* One step: choose a candidate by chance, weighted by the field, and add it. Returns the new cell, or -1 when growth has ended. */
  function step(s) {
    if (s.done || !s.frontier.length) { s.done = true; return -1; }
    var f = s.frontier, phi = s.phi, eta = s.eta, total = 0, k, w;
    var weights = new Float64Array(f.length);
    for (k = 0; k < f.length; k++) {
      w = eta === 0 ? 1 : Math.pow(Math.max(phi[f[k]], 1e-12), eta);
      weights[k] = w; total += w;
    }
    var pick = s.random() * total, chosen = f.length - 1;
    for (k = 0; k < f.length; k++) { pick -= weights[k]; if (pick < 0) { chosen = k; break; } }
    var cell = f[chosen];
    f[chosen] = f[f.length - 1]; f.pop();
    s.inFrontier[cell] = 0;
    // it joins from a neighbour that is already part of the spark
    var n = s.n, x = cell % n, y = (cell - x) / n;
    var near = [x > 0 ? cell - 1 : -1, x < n - 1 ? cell + 1 : -1, y > 0 ? cell - n : -1, y < n - 1 ? cell + n : -1].filter(function (j) { return j >= 0 && s.kind[j] === SPARK; });
    join(s, cell, near[Math.floor(s.random() * near.length)]);
    relax(s, 5);
    return cell;
  }

  /* Up to `count` steps. Returns how many were taken. */
  function grow(s, count) {
    var taken = 0;
    while (taken < count && !s.done) { if (step(s) < 0) break; taken++; }
    return taken;
  }

  /*
   * How much of the spark lies beyond each cell: itself plus everything
   * that grew from it. In a real discharge the current collects the same
   * way, so the trunk carries the most.
   */
  function loads(s) {
    var size = new Float32Array(s.n * s.n);
    for (var k = s.order.length - 1; k >= 0; k--) {
      var i = s.order[k];
      size[i] += 1;
      if (s.parent[i] >= 0) size[s.parent[i]] += size[i];
    }
    return size;
  }

  /*
   * The spark as line segments joining each cell to the one it grew from,
   * in a square from -1 to 1 (y upward, so a plane spark starts at the
   * top), with the load beyond each segment as a share of the whole.
   */
  function bonds(s) {
    var n = s.n, count = s.order.length - 1, size = loads(s);
    var positions = new Float32Array(Math.max(0, count) * 4), share = new Float32Array(Math.max(0, count));
    var c = (n - 1) / 2, total = s.order.length;
    for (var k = 1; k < s.order.length; k++) {
      var i = s.order[k], p = s.parent[i], o = (k - 1) * 4;
      positions[o] = (p % n - c) / c; positions[o + 1] = -(Math.floor(p / n) - c) / c;
      positions[o + 2] = (i % n - c) / c; positions[o + 3] = -(Math.floor(i / n) - c) / c;
      share[k - 1] = size[i] / total;
    }
    return { positions: positions, share: share };
  }

  /*
   * The spark's own dimension so far, by the mass-radius method: count the
   * cells within a distance r of where it started, for a range of r. If
   * the count grows as r ^ D, D is the dimension. This suits a pattern
   * grown outward from a point better than box counting, which reads low
   * on a pattern this small.
   * Returns NaN until the spark is big enough to measure.
   */
  function dimension(s) {
    var n = s.n, sx = s.start % n, sy = Math.floor(s.start / n);
    var dist = s.order.map(function (i) {
      var dx = i % n - sx, dy = Math.floor(i / n) - sy;
      return Math.sqrt(dx * dx + dy * dy);
    }).sort(function (a, b) { return a - b; });
    var reach = dist[dist.length - 1];
    if (dist.length < 150 || reach < 16) return NaN;
    var xs = [], ys = [], count = 0;
    for (var r = 4; r <= reach * 0.6; r *= 1.3) {
      while (count < dist.length && dist[count] <= r) count++;
      xs.push(Math.log(r)); ys.push(Math.log(count));
    }
    return slope(xs, ys);
  }

  function slope(xs, ys) {
    var mx = 0, my = 0, sxy = 0, sxx = 0, m = xs.length;
    if (m < 3) return NaN;
    for (var a = 0; a < m; a++) { mx += xs[a] / m; my += ys[a] / m; }
    for (var b = 0; b < m; b++) { sxy += (xs[b] - mx) * (ys[b] - my); sxx += (xs[b] - mx) * (xs[b] - mx); }
    return sxy / sxx;
  }

  var api = {
    FREE: FREE, SPARK: SPARK, ELECTRODE: ELECTRODE,
    PUBLISHED_DIMENSION: 1.7,       // for eta = 1, growing from a point on a flat grid (Niemeyer, Pietronero and Wiesmann, 1984)
    rng: rng,
    create: create,
    relax: relax,
    step: step,
    grow: grow,
    loads: loads,
    bonds: bonds,
    dimension: dimension
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (root.SP = root.SP || {}).growth = api;
})(typeof self !== 'undefined' ? self : this);
