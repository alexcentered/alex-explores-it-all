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
    assert.ok(s.hi >= 20 && s.lo <= 5000, `${s.id} overlaps 20 Hz to 5 kHz`);
    assert.ok(s.tune >= 20 && s.tune <= 5000, `${s.id} tune point is playable`);
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
  assert.equal(life.BEYOND.find((b) => b.id === 'space').evidence, 'unknown');
  assert.match(life.BEYOND.find((b) => b.id === 'space').note, /nobody has answered/);
});

test('life: activeAt finds everyone sharing a frequency', () => {
  const at = (f) => life.activeAt(f).map((s) => s.id);
  assert.deepEqual(at(20), ['whale-low', 'elephant', 'alligator']);
  assert.deepEqual(at(92), ['cat', 'midshipman', 'humpback', 'human', 'giraffe']);
  assert.ok(at(250).includes('honeybee') && at(250).includes('bullfrog'));
  assert.deepEqual(at(4900), ['songbird', 'cricket']);
  assert.deepEqual(at(4200), ['songbird']);
  assert.deepEqual(at(1), []);
  assert.deepEqual(at(NaN), []);
});

test('life: playable band is clipped to the console', () => {
  const by = (id) => life.SIGNALS.find((s) => s.id === id);
  assert.deepEqual(life.playable(by('elephant')), { lo: 20, hi: 35 });
  assert.deepEqual(life.playable(by('songbird')), { lo: 1000, hi: 5000 });
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
