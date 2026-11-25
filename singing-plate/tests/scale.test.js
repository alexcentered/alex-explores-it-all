'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const scale = require('../js/core/scale.js');
const chladni = require('../js/core/chladni.js');
const ancient = require('../js/core/ancient.js');
const solids = require('../js/core/solids.js');
const relations = require('../js/core/relations.js');

const near = (a, b, tol = 1e-6) =>
  assert.ok(Math.abs(a - b) <= tol, `expected ${a} to be within ${tol} of ${b}`);
const get = (id) => scale.find(id);

test('scale: each rule is the one the full model of that thing follows', () => {
  // For each thing: its frequency at the example size, and at twice the size, from the module that models it.
  const room = ancient.find('kings-chamber').room;
  const models = {
    room: (s) => ancient.boxModes(room.L * s, room.W * s, room.H * s, 1)[0].freq,
    sheet: (s) => 4 * chladni.plateConstant({ sideCm: 24 * s, thicknessMm: 1, material: 'aluminium' }),
    model: (s) => 4 * chladni.plateConstant({ sideCm: 24 * s, thicknessMm: 1 * s, material: 'aluminium' }),
    drop: (s) => solids.dropFrequency(2, 1 * s),
    circuit: (s) => relations.lcFrequency(1e-3 * s, 100e-9 * s)
  };
  for (const id of Object.keys(models)) {
    const t = get(id), f = models[id];
    near(t.base, f(1), f(1) * 1e-4);
    near(Math.log2(f(2) / f(1)), t.power, 1e-9);                 // the power, measured from the model
    near(scale.frequency(t, 2), f(2), f(2) * 1e-4);
    near(scale.frequency(t, 0.5), f(0.5), f(0.5) * 1e-4);
  }
  // the planet: a wave at the speed of light once round the Earth
  near(get('planet').base, relations.EARTH.circuit, 0.01);
  near(get('planet').base, 299792458 / (2 * Math.PI * 6371000), 0.01);
  // the string: the textbook rule, and the example is the note A2
  assert.equal(get('string').base, 110);
  assert.equal(get('string').power, -1);
});

test('scale: what doubling does to each', () => {
  const shift = (id) => scale.octaves(get(id), 2);
  near(shift('string'), -1); near(shift('room'), -1); near(shift('circuit'), -1); near(shift('planet'), -1);
  near(shift('sheet'), -2);                                     // a plate from the same sheet: two octaves
  near(shift('model'), -1);
  near(shift('drop'), -1.5);                                    // a drop: an octave and a half
  near(scale.octaves(get('sheet'), 0.5), 2);
  near(scale.frequency(get('string'), 1), 110);
  near(scale.frequency(get('string'), 4), 27.5);
});

test('scale: limits and wording', () => {
  assert.equal(scale.sanitizeScale(0), 1);
  assert.equal(scale.sanitizeScale('x'), 1);
  assert.equal(scale.sanitizeScale(100), scale.SCALE_MAX);
  assert.equal(scale.sanitizeScale(0.01), scale.SCALE_MIN);
  assert.equal(scale.rule(get('string')), '1 ÷ size');
  assert.equal(scale.rule(get('sheet')), '1 ÷ size²');
  assert.equal(scale.rule(get('drop')), '1 ÷ size^1.5');
  assert.equal(scale.describeShift(0), 'the same note');
  assert.equal(scale.describeShift(-1), '1 octave lower');
  assert.equal(scale.describeShift(2), '2 octaves higher');
  assert.equal(scale.describeShift(-1.5), 'an octave and a half lower');
  assert.equal(scale.describeShift(0.5), 'half an octave higher');
  assert.equal(scale.describeShift(-0.415), '0.41 octaves lower');
  assert.equal(scale.find('bell'), null);
  for (const t of scale.THINGS) {
    assert.ok(t.name.length > 5 && t.scaled.length > 5 && t.example.length > 10 && t.why.length > 60, t.id);
    assert.ok(t.base > 0 && t.power < 0);
  }
  assert.equal(new Set(scale.THINGS.map((t) => t.id)).size, scale.THINGS.length);
});
