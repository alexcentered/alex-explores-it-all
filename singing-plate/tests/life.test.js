'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const life = require('../js/core/life.js');

test('life: every signal is complete, consistent and tunable on the console', () => {
  const ids = new Set();
  for (const s of life.SIGNALS) {
    assert.ok(s.id && !ids.has(s.id), `unique id: ${s.id}`);
    ids.add(s.id);
    for (const key of ['who', 'signal', 'note']) assert.ok(typeof s[key] === 'string' && s[key].length > 2, `${s.id}.${key}`);
    assert.ok(life.EVIDENCE[s.evidence], `${s.id} has a known evidence level`);
    assert.ok(s.lo > 0 && s.lo < s.hi, `${s.id} band runs low to high`);
    // the band must overlap the console, and the tune point must be playable and inside the band
    assert.ok(s.hi >= 20 && s.lo <= 20000, `${s.id} overlaps 20 Hz to 20 kHz`);
    assert.ok(s.tune >= 20 && s.tune <= 20000, `${s.id} tune point is playable`);
    assert.ok(s.tune >= s.lo && s.tune <= s.hi, `${s.id} tune point is inside its band`);
    assert.ok(s.note.endsWith('.'), `${s.id} note is a sentence`);
  }
});

test('life: signals are listed from low to high', () => {
  for (let i = 1; i < life.SIGNALS.length; i++) {
    assert.ok(life.SIGNALS[i].lo >= life.SIGNALS[i - 1].lo, `${life.SIGNALS[i].id} is out of order`);
  }
});

test('life: uncertain claims are labelled as such', () => {
  const by = (id) => life.SIGNALS.find((s) => s.id === id);
  assert.equal(by('primrose').evidence, 'early');
  assert.equal(by('corn').evidence, 'early');
  assert.equal(by('giraffe').evidence, 'unknown');
});

test('life: activeAt finds everyone sharing a frequency', () => {
  const at = (f) => life.activeAt(f).map((s) => s.id);
  assert.deepEqual(at(20), ['whale-low', 'elephant', 'alligator']);
  assert.deepEqual(at(92), ['cat', 'midshipman', 'humpback', 'human', 'giraffe']);
  assert.ok(at(250).includes('honeybee') && at(250).includes('bullfrog'));
  assert.deepEqual(at(4900), ['songbird', 'cricket']);
  assert.deepEqual(at(4200), ['songbird']);
  assert.deepEqual(at(10000), ['dolphin']);
  assert.deepEqual(at(18000), []);
  assert.deepEqual(at(1), []);
  assert.deepEqual(at(NaN), []);
});

test('life: playable band is clipped to the console', () => {
  const by = (id) => life.SIGNALS.find((s) => s.id === id);
  assert.deepEqual(life.playable(by('elephant')), { lo: 20, hi: 35 });
  assert.deepEqual(life.playable(by('songbird')), { lo: 1000, hi: 8000 });
  assert.deepEqual(life.playable(by('dolphin')), { lo: 7000, hi: 15000 });
  assert.deepEqual(life.playable(by('bullfrog')), { lo: 200, hi: 400 });
});

test('life: bands read naturally', () => {
  const by = (id) => life.SIGNALS.find((s) => s.id === id);
  assert.equal(life.formatBand(by('elephant')), '12 to 35 Hz');
  assert.equal(life.formatBand(by('songbird')), '1 to 8 kHz');
  assert.equal(life.formatBand(by('humpback')), '80 Hz to 4 kHz');
  assert.equal(life.formatBand(by('cricket')), '4.5 to 5.2 kHz');
});

test('life: beyond-range entries are complete', () => {
  for (const b of life.BEYOND) {
    for (const key of ['id', 'who', 'band', 'note']) assert.ok(typeof b[key] === 'string' && b[key].length > 1);
    assert.ok(life.EVIDENCE[b.evidence]);
  }
});

/* --------------------------------------------------------- beyond Earth */

test('life: the search list is real radio, and none of it is playable sound', () => {
  assert.ok(life.SEARCH.length >= 6);
  for (const e of life.SEARCH) {
    for (const key of ['id', 'what', 'band', 'when', 'note']) assert.ok(typeof e[key] === 'string' && e[key].length > 2, `${e.id}.${key}`);
    assert.match(e.band, /MHz|GHz/, `${e.id} is a radio frequency`);
    assert.equal(e.tune, undefined, `${e.id} must not offer a tune point`);
  }
  assert.match(life.SEARCH.find((e) => e.id === 'blc1').note, /interference/);
  assert.match(life.SEARCH.find((e) => e.id === 'wow').note, /never been explained/);
});

test('life: no reported being is given a frequency that the accounts do not give', () => {
  assert.ok(life.REPORTS.length >= 7);
  for (const r of life.REPORTS) {
    for (const key of ['id', 'who', 'home', 'source', 'mode', 'frequency']) assert.ok(typeof r[key] === 'string' && r[key].length > 2, `${r.id}.${key}`);
    assert.ok(r.frequency.startsWith('None given'), `${r.id} must not invent a frequency`);
    assert.equal(r.tune, undefined);
    assert.equal(r.sims, undefined, `${r.id} has nothing to simulate`);
  }
});

test('life: accounts are worded as claims, and only the one with a published figure is tunable', () => {
  const tunable = life.ACCOUNTS.filter((a) => a.tune !== undefined);
  assert.deepEqual(tunable.map((a) => a.id), ['trill']);
  assert.ok(tunable[0].tune >= tunable[0].lo && tunable[0].tune <= tunable[0].hi && tunable[0].hi <= 20000);
  const by = (id) => life.ACCOUNTS.find((a) => a.id === id);
  assert.match(by('sherman').frequency, /No frequency/);
  assert.match(by('sherman').note, /only source/);
  assert.match(by('ce5').note, /No session has produced verified contact/);
  assert.match(by('ce5').note, /cannot be simulated honestly/);
  assert.equal(by('ce5').sims, undefined);
  assert.equal(by('sherman').sims, undefined, 'Sherman gives no pitch, so there is nothing to simulate');
  assert.match(by('bashar').note, /not a signal to send/);
  assert.match(by('trill').note, /not a published measurement/);
  assert.match(by('schumann').note, /speaker cannot produce it/);
  assert.ok(life.EVIDENCE.claim);
});

test('life: simulations land on the console and say how far they were shifted', () => {
  const all = [...life.BEYOND, ...life.SEARCH, ...life.ACCOUNTS].flatMap((e) => (e.sims || []).map((sim) => ({ id: e.id, sim })));
  assert.ok(all.length >= 12);
  for (const { id, sim } of all) {
    assert.ok(typeof sim.label === 'string' && sim.label.length > 2, id);
    assert.ok(Number.isInteger(sim.octaves) && sim.octaves !== 0, `${id} is shifted by whole octaves`);
    const hz = life.simulate(sim);
    assert.ok(hz >= 20 && hz <= 20000, `${id}: ${hz} Hz must be playable`);
    // the real frequency itself must be out of reach, or there would be nothing to simulate
    assert.ok(sim.real < 20 || sim.real > 20000, `${id} is genuinely out of range`);
    // an octave shift is exact: undo it and the real frequency comes back
    assert.ok(Math.abs(hz / Math.pow(2, sim.octaves) - sim.real) / sim.real < 1e-3, id);
  }
});

test('life: worked simulation values', () => {
  const sim = (group, id, i = 0) => life.simulate(life[group].find((e) => e.id === id).sims[i]);
  assert.equal(sim('SEARCH', 'hydrogen'), 677.3);          // 1,420,405,752 / 2^21
  assert.equal(sim('SEARCH', 'arecibo'), 1134.9);
  assert.equal(sim('SEARCH', 'cosmiccall'), 2389);
  assert.equal(sim('SEARCH', 'blc1'), 468.3);
  assert.equal(sim('BEYOND', 'rat', 0), 2750);
  assert.equal(sim('BEYOND', 'rat', 1), 6250);
  assert.equal(sim('ACCOUNTS', 'schumann'), 125.3);        // 7.83 x 2^4
  assert.equal(sim('ACCOUNTS', 'bashar'), 5203.1);
  assert.equal(life.describeShift(-21), '21 octaves down');
  assert.equal(life.describeShift(4), '4 octaves up');
  assert.equal(life.describeShift(-1), '1 octave down');
});

test('life: one shift per group keeps the intervals between entries true', () => {
  const shifts = new Set(life.SEARCH.flatMap((e) => e.sims.map((s) => s.octaves)));
  assert.equal(shifts.size, 1, 'every radio entry is shifted by the same amount');
  const ultra = new Set(life.BEYOND.flatMap((e) => e.sims.map((s) => s.octaves)));
  assert.equal(ultra.size, 1);
  // so Arecibo over the hydrogen line is the same ratio simulated as real
  const h = life.SEARCH.find((e) => e.id === 'hydrogen').sims[0], a = life.SEARCH.find((e) => e.id === 'arecibo').sims[0];
  assert.ok(Math.abs(life.simulate(a) / life.simulate(h) - a.real / h.real) < 1e-3);
});
