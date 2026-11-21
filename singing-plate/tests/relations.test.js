'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const color = require('../js/core/color.js');
const rel = require('../js/core/relations.js');

const near = (a, b, tol = 1e-6) =>
  assert.ok(Math.abs(a - b) <= tol, `expected ${a} to be within ${tol} of ${b}`);

/* -------------------------------------------------------------- colour */

test('color: concert A, forty octaves up, is orange light', () => {
  const a = color.tone(440);
  assert.equal(a.octaves, 40);
  near(a.thz, 483.8, 0.05);            // 440 * 2^40
  near(a.nm, 619.7, 0.1);
  assert.equal(a.name, 'orange');
  assert.match(a.hex, /^#[0-9a-f]{6}$/);
  assert.ok(a.rgb[0] > 200 && a.rgb[2] === 0, 'orange is strong red, no blue');
});

test('color: every frequency lands inside one octave of visible light', () => {
  for (const f of [1, 7.83, 20, 261.63, 440, 5100, 20000, 1420405752]) {
    const t = color.tone(f);
    assert.ok(t.nm > color.NM_SHORT - 1e-6 && t.nm <= color.NM_LONG + 1e-6, `${f} Hz -> ${t.nm} nm`);
    near(t.thz * 1e12, f * Math.pow(2, t.octaves), f * Math.pow(2, t.octaves) * 1e-9);
  }
  assert.equal(color.tone(0), null);
  assert.equal(color.tone(-5), null);
  assert.equal(color.tone('x'), null);
});

test('color: octaves share a colour, and an interval is a fixed step along the spectrum', () => {
  const base = color.tone(110);
  for (const k of [2, 4, 8, 64]) assert.equal(color.tone(110 * k).hex, base.hex);
  assert.equal(color.tone(110 * 2).octaves, base.octaves - 1);
  // a fifth (3:2) is the same ratio of wavelengths whatever the starting note
  for (const f of [100, 277, 440]) {
    const lo = color.tone(f), hi = color.tone(f * 1.25);       // major third, stays inside the octave for these
    if (hi.octaves === lo.octaves) near(lo.nm / hi.nm, 1.25, 1e-9);
  }
});

test('color: the spectrum runs red to blue and never purple', () => {
  assert.equal(color.colourName(700), 'red');
  assert.equal(color.colourName(600), 'orange');
  assert.equal(color.colourName(575), 'yellow');
  assert.equal(color.colourName(530), 'green');
  assert.equal(color.colourName(470), 'blue');
  assert.equal(color.colourName(400), 'violet');
  // across the whole range, red and blue are never strong together: that mix is purple or pink
  for (let nm = 380; nm <= 760; nm += 1) {
    const [r, , b] = color.wavelengthToRgb(nm);
    assert.ok(Math.min(r, b) < 40, `${nm} nm would look purple: r ${r}, b ${b}`);
  }
  // the ends dim, as the eye does
  assert.ok(color.wavelengthToRgb(380)[2] < color.wavelengthToRgb(430)[2]);
  assert.ok(color.wavelengthToRgb(760)[0] < color.wavelengthToRgb(690)[0]);
});

test('color: a band becomes a gradient that repeats once per octave', () => {
  const g = color.gradient(200, 400);
  assert.match(g, /^linear-gradient\(90deg, #[0-9a-f]{6} 0\.0%/);
  assert.match(g, / 100\.0%\)$/);
  const stops = g.match(/#[0-9a-f]{6}/g);
  assert.equal(stops[0], stops[stops.length - 1], 'one octave ends on the colour it began with');
  assert.ok(color.gradient(80, 4000).match(/#[0-9a-f]{6}/g).length > 40);
  assert.match(color.gradient(440, 440), /^#[0-9a-f]{6}$/);
});

/* ----------------------------------------------------------- relations */

test('relations: harmonics are whole multiples, subharmonics whole divisions', () => {
  assert.deepEqual(rel.harmonics(110, 4).map((h) => h.hz), [110, 220, 330, 440]);
  assert.deepEqual(rel.subharmonics(120, 3).map((h) => h.hz), [60, 40, 30]);
  assert.equal(rel.harmonics(100).length, 8);
});

test('relations: just intervals have the sizes music theory gives them', () => {
  const by = (name) => rel.INTERVALS.find((i) => i.name === name);
  near(by('Octave').cents, 1200, 1e-9);
  near(by('Fifth').cents, 701.955, 1e-3);
  near(by('Fourth').cents, 498.045, 1e-3);
  near(by('Major third').cents, 386.314, 1e-3);
  near(by('Fifth').ratio * by('Fourth').ratio, 2, 1e-12);       // a fifth plus a fourth is an octave
  near(rel.octavesBetween(110, 880), 3);
});

test('relations: rotation and wavelengths', () => {
  near(rel.angular(1), 2 * Math.PI);
  near(rel.angular(50), 314.159265, 1e-6);
  near(rel.soundWavelength(343), 1);
  near(rel.emWavelength(440) / 1000, 681.35, 0.01);             // 440 Hz as radio is 681 km long
  near(rel.quarterWave(1e6), 74.948, 1e-3);
});

test('relations: radio band names', () => {
  assert.match(rel.emBand(7.83), /ELF/);
  assert.match(rel.emBand(60), /SLF/);
  assert.match(rel.emBand(440), /ULF/);
  assert.match(rel.emBand(10000), /VLF/);
  assert.match(rel.emBand(1), /below/);
});

test('relations: the tuned circuit formula and its inverse agree', () => {
  // 1 henry with 1 microfarad rings at 159.15 Hz
  near(rel.lcFrequency(1, 1e-6), 159.1549, 1e-4);
  for (const f of [7.83, 60, 440, 20000]) {
    const L = rel.lcInductance(f, 1e-7);
    near(rel.lcFrequency(L, 1e-7), f, f * 1e-9);
  }
  near(rel.lcInductance(440, 1e-7), 1.3084, 1e-3);              // 440 Hz with 0.1 microfarad needs 1.31 H
});

test('relations: the Earth cavity, ideal against measured', () => {
  near(rel.EARTH.circuit, 7.489, 0.001);                        // light circles the Earth 7.49 times a second
  near(rel.EARTH.ideal(1), 10.59, 0.01);
  near(rel.EARTH.ideal(2), 18.34, 0.01);
  near(rel.EARTH.ideal(3), 25.94, 0.01);
  assert.equal(rel.EARTH.measured[0], 7.83);
  // every measured mode sits below its ideal: the real cavity is leaky
  rel.EARTH.measured.forEach((m, i) => assert.ok(m < rel.EARTH.ideal(i + 1)));
});

test('relations: Lissajous figures close for whole-number ratios', () => {
  const pts = rel.lissajous(3, 2, 0, 600);
  assert.equal(pts.length, 601 * 2);
  near(pts[0], pts[600 * 2], 1e-5);                             // ends where it began
  near(pts[1], pts[600 * 2 + 1], 1e-5);
  for (const v of pts) assert.ok(v >= -1.000001 && v <= 1.000001);
});

test('relations: numbers are formatted to be read', () => {
  assert.equal(rel.formatSI(681346, 'm'), '681 km');
  assert.equal(rel.formatSI(1.3084, 'H'), '1.31 H');
  assert.equal(rel.formatSI(0.0000131, 'H'), '13.1 µH');
  assert.equal(rel.formatSI(2764.6, 'rad/s'), '2.76 krad/s');
  assert.equal(rel.formatSI(Infinity, 'm'), '--');
});
