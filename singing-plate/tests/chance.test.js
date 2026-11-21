'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const chance = require('../js/core/chance.js');

const near = (a, b, tol = 1e-6) =>
  assert.ok(Math.abs(a - b) <= tol, `expected ${a} to be within ${tol} of ${b}`);

// A small deterministic generator, so statistical tests are repeatable.
function lcg(seed) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return (s >>> 16) & 1; };
}

test('chance: a session counts every bit once and ends on time', () => {
  const s = chance.newSession(240, 'intent');
  assert.equal(s.level, chance.LEVEL_START);
  let ended = false;
  const bit = lcg(7);
  let ones = 0;
  for (let i = 0; i < 240; i++) { const b = bit(); ones += b; ended = chance.step(s, b); }
  assert.equal(ended, true);
  assert.equal(s.done, 240);
  assert.equal(s.hits, ones);
  assert.equal(chance.step(s, 1), true);          // further bits are ignored
  assert.equal(s.done, 240);
  assert.equal(s.hits, ones);
});

test('chance: converge steps flatten the line, diverge steps wave it, within bounds', () => {
  const flat = chance.newSession(100, 'intent');
  for (let i = 0; i < 100; i++) chance.step(flat, 1);
  assert.equal(flat.level, 0);
  assert.equal(flat.hits, 100);
  const wavy = chance.newSession(100, 'intent');
  for (let i = 0; i < 100; i++) chance.step(wavy, 0);
  assert.equal(wavy.level, chance.LEVEL_MAX);
  assert.equal(wavy.hits, 0);
});

test('chance: the count does not depend on the line hitting its limits', () => {
  // Pinned at flat, a converge bit still counts: otherwise a flat line would bias the score.
  const s = chance.newSession(60, 'intent');
  for (let i = 0; i < 60; i++) chance.step(s, 1);
  assert.equal(s.hits, 60);
});

test('chance: the session is split into ten equal blocks', () => {
  for (const trials of chance.LENGTHS) {
    const s = chance.newSession(trials, 'control');
    for (let i = 0; i < trials; i++) chance.step(s, i % 2);
    assert.equal(s.blocks.length, chance.BLOCKS);
    for (const b of s.blocks) assert.equal(b.n, trials / chance.BLOCKS);
    assert.equal(s.blocks.reduce((a, b) => a + b.hits, 0), s.hits);
  }
  assert.equal(chance.newSession(240, 'anything else').kind, 'intent');
});

test('chance: z score is zero at half and scales with the square root of trials', () => {
  assert.equal(chance.zScore(50, 100), 0);
  near(chance.zScore(60, 100), 2);
  near(chance.zScore(40, 100), -2);
  near(chance.zScore(240, 400), 4);
  assert.equal(chance.zScore(0, 0), 0);
});

test('chance: p values match the normal distribution', () => {
  near(chance.pTwoSided(0), 1, 1e-6);
  near(chance.pTwoSided(1.959964), 0.05, 1e-5);
  near(chance.pTwoSided(-1.959964), 0.05, 1e-5);
  near(chance.pTwoSided(2.575829), 0.01, 1e-5);
  near(chance.pTwoSided(3), 0.0026998, 1e-6);
  near(chance.erfc(0), 1, 1e-6);
  near(chance.erfc(1), 0.1572992, 1e-6);
  near(chance.erfc(-1), 1.8427008, 1e-6);
});

test('chance: verdicts set a high bar and say which way', () => {
  assert.equal(chance.verdict(0, 0).level, 'none');
  assert.equal(chance.verdict(1.9, 480).level, 'chance');
  assert.equal(chance.verdict(-1.9, 480).level, 'chance');
  const up = chance.verdict(2.4, 480);
  assert.equal(up.level, 'unusual');
  assert.match(up.text, /flatter/);
  assert.match(up.text, /one result in twenty/);
  const down = chance.verdict(-3.2, 480);
  assert.equal(down.level, 'rare');
  assert.match(down.text, /wavier/);
  assert.match(down.text, /fixed in advance/);
  assert.match(chance.verdict(3, 480).text, /once in 370/);
});

test('chance: fair bits land within chance, almost always', () => {
  // 400 simulated sessions of 480 fair bits: about 5% should pass |z| >= 2, and the pooled result should be unremarkable.
  const bit = lcg(20261118);
  let beyond2 = 0;
  const log = [];
  for (let k = 0; k < 400; k++) {
    const s = chance.newSession(480, 'intent');
    while (!chance.step(s, bit())) { /* run to the end */ }
    if (Math.abs(chance.zScore(s.hits, s.done)) >= 2) beyond2++;
    log.push({ kind: 'intent', n: s.done, hits: s.hits });
  }
  assert.ok(beyond2 >= 6 && beyond2 <= 38, `expected roughly 20 of 400 beyond 2, got ${beyond2}`);
  const pooled = chance.combine(log, 'intent');
  assert.equal(pooled.sessions, 400);
  assert.equal(pooled.n, 400 * 480);
  assert.ok(Math.abs(pooled.z) < 3.5, `pooled z ${pooled.z}`);
});

test('chance: a biased source is detected', () => {
  // A source that converges 60% of the time instead of 50%: three steps in every five.
  const s = chance.newSession(1200, 'intent');
  let i = 0;
  while (!chance.step(s, i++ % 5 < 3 ? 1 : 0)) { /* run to the end */ }
  near(s.hits / s.done, 0.6);
  assert.ok(chance.zScore(s.hits, s.done) > 6, 'a real bias should stand out clearly');
});

test('chance: combining keeps kinds apart', () => {
  const log = [
    { kind: 'intent', n: 100, hits: 60 }, { kind: 'intent', n: 100, hits: 50 },
    { kind: 'control', n: 100, hits: 45 }
  ];
  const intent = chance.combine(log, 'intent');
  assert.deepEqual([intent.sessions, intent.n, intent.hits], [2, 200, 110]);
  near(intent.rate, 0.55);
  near(intent.z, chance.zScore(110, 200));
  const control = chance.combine(log, 'control');
  assert.deepEqual([control.sessions, control.n, control.hits], [1, 100, 45]);
  // an abandoned session counts step for step, and is tallied so the record can say so
  const withQuit = chance.combine([...log, { kind: 'intent', n: 37, hits: 12, abandoned: true }], 'intent');
  assert.deepEqual([withQuit.sessions, withQuit.abandoned, withQuit.n, withQuit.hits], [3, 1, 237, 122]);
  assert.equal(intent.abandoned, 0);
  const empty = chance.combine([], 'intent');
  assert.deepEqual([empty.sessions, empty.n, empty.hits, empty.rate, empty.z], [0, 0, 0, 0, 0]);
  near(empty.p, 1, 1e-6);
});

test('chance: a stored log is cleaned of anything malformed', () => {
  const clean = chance.sanitizeLog([
    { kind: 'intent', n: 240, hits: 130, at: 5 },
    { kind: 'intent', n: 240, hits: 999 },          // more hits than trials
    { kind: 'wish', n: 240, hits: 100 },
    { kind: 'control', n: 0, hits: 0 },
    { kind: 'control', n: 240.5, hits: 100 },
    null, 'x'
  ]);
  assert.deepEqual(clean, [{ kind: 'intent', n: 240, hits: 130, at: 5, abandoned: false }]);
  assert.deepEqual(chance.sanitizeLog('nonsense'), []);
});

test('chance: quitting sessions that go badly cannot manufacture a result', () => {
  // A cheat who abandons whenever a session falls behind, 2,000 times over. Because abandoned
  // steps still count, the pooled record stays at chance.
  const bit = lcg(424242);
  const log = [];
  for (let k = 0; k < 2000; k++) {
    const s = chance.newSession(240, 'intent');
    let quit = false;
    while (!chance.step(s, bit())) {
      if (s.done >= 20 && chance.zScore(s.hits, s.done) < -1) { quit = true; break; }
    }
    log.push({ kind: 'intent', n: s.done, hits: s.hits, abandoned: quit });
  }
  const pooled = chance.combine(log, 'intent');
  assert.ok(pooled.abandoned > 200, 'the cheat should have quit many sessions');
  assert.ok(Math.abs(pooled.z) < 3, `pooled z should stay at chance, got ${pooled.z}`);
  // whereas throwing the abandoned ones away, as an unfair record would, shows a large false effect
  const cherryPicked = chance.combine(log.filter((s) => !s.abandoned), 'intent');
  assert.ok(cherryPicked.z > 5, `discarding would have faked an effect, z = ${cherryPicked.z}`);
});
