'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const freq = require('../js/core/freq.js');
const safety = require('../js/core/safety.js');
const { Sweep, formatEta } = require('../js/core/sweep.js');
const chladni = require('../js/core/chladni.js');

const near = (a, b, tol = 1e-6) =>
  assert.ok(Math.abs(a - b) <= tol, `expected ${a} to be within ${tol} of ${b}`);

/* ---------------------------------------------------------------- freq */

test('freq: sanitize clamps to the 1 Hz - 20 kHz envelope', () => {
  assert.equal(freq.sanitize(0.2), 1);
  assert.equal(freq.sanitize(5), 5);
  assert.equal(freq.sanitize(99999), 20000);
  assert.equal(freq.sanitize(-440), 1);
});

test('freq: sanitize snaps to the 0.1 Hz grid and rejects junk', () => {
  assert.equal(freq.sanitize(440.04), 440);
  assert.equal(freq.sanitize(440.06), 440.1);
  assert.equal(freq.sanitize('abc', 123), 123);
  assert.equal(freq.sanitize(NaN), 440);
  assert.equal(freq.sanitize(Infinity, 300), 300);
});

test('freq: repeated 0.1 Hz nudges do not drift', () => {
  let f = 100;
  for (let i = 0; i < 1000; i++) f = freq.nudge(f, 0.1);
  assert.equal(f, 200);
  for (let i = 0; i < 1000; i++) f = freq.nudge(f, -0.1);
  assert.equal(f, 100);
});

test('freq: nudge respects the limits', () => {
  assert.equal(freq.nudge(20, -10), 10);
  assert.equal(freq.nudge(5, -10), 1);
  assert.equal(freq.nudge(19999.9, 10), 20000);
});

test('freq: note names and cents', () => {
  assert.equal(freq.noteInfo(440).label, 'A4');
  near(freq.noteInfo(440).cents, 0);
  assert.equal(freq.noteInfo(261.63).label, 'C4');
  assert.equal(freq.noteInfo(27.5).label, 'A0');
  assert.equal(freq.noteInfo(4186.01).label, 'C8');
  const sharp = freq.noteInfo(445);
  assert.equal(sharp.label, 'A4');
  near(sharp.cents, 19.56, 0.01);
  assert.equal(freq.formatCents(0.2), '±0 ¢');
  assert.equal(freq.formatCents(19.56), '+20 ¢');
  assert.equal(freq.formatCents(-7.4), '−7 ¢');
});

test('freq: wavelength in air and formatting', () => {
  near(freq.wavelength(343), 1);
  assert.equal(freq.formatLength(freq.wavelength(100)), '3.43 m');
  assert.equal(freq.formatLength(freq.wavelength(440)), '78.0 cm');
  assert.equal(freq.formatLength(0.0068), '6.8 mm');
  near(freq.periodMs(440), 2.2727, 1e-3);
});

test('freq: dial mapping is logarithmic and round-trips', () => {
  near(freq.dialToFreq(0), 1);
  near(freq.dialToFreq(1), 20000);
  near(freq.dialToFreq(0.5), Math.sqrt(1 * 20000), 1e-9);
  for (const f of [1, 7.8, 20, 55.5, 440, 1234.5, 5000, 20000]) {
    near(freq.dialToFreq(freq.freqToDial(f)), f, 1e-9);
  }
  assert.equal(freq.dialToFreq(-1), 1);
  assert.equal(freq.dialToFreq(2), 20000);
  assert.equal(freq.dialSnap(0.5), 141);
});

/* -------------------------------------------------------------- safety */

test('safety: commanded gain never exceeds the ceiling', () => {
  for (const ceilingDb of [-30, -12, -6, 0]) {
    const ceiling = safety.dbToLin(ceilingDb);
    for (const waveform of safety.WAVEFORMS) {
      for (const volume of [0, 0.25, 0.5, 1, 7, -3]) {
        for (const f of [1, 7.8, 20, 59, 60, 440, 5000, 20000]) {
          const g = safety.outputGain({ volume, ceilingDb, waveform, freq: f, lfGuard: false });
          assert.ok(g >= 0 && g <= ceiling + 1e-12, `gain ${g} over ceiling ${ceiling}`);
        }
      }
    }
  }
});

test('safety: full volume sine reaches exactly the ceiling', () => {
  near(safety.outputGain({ volume: 1, ceilingDb: -6, waveform: 'sine', freq: 440 }),
    safety.dbToLin(-6), 1e-12);
});

test('safety: volume uses a square-law taper', () => {
  assert.equal(safety.volumeToGain(0), 0);
  assert.equal(safety.volumeToGain(0.5), 0.25);
  assert.equal(safety.volumeToGain(1), 1);
  assert.equal(safety.volumeToGain(2), 1);
});

test('safety: bad input degrades to silence or defaults, never to loud', () => {
  assert.equal(safety.outputGain({ volume: NaN, ceilingDb: 0, waveform: 'sine', freq: 440 }), 0);
  assert.equal(safety.outputGain({ volume: 1, ceilingDb: 0, waveform: 'sine', freq: NaN }), 0);
  assert.equal(safety.sanitizeCeilingDb(+20), 0);
  assert.equal(safety.sanitizeCeilingDb('x'), safety.DEFAULT_CEILING_DB);
  assert.equal(safety.sanitizeWaveform('sawtooth'), 'sine');
});

test('safety: square wave is trimmed 3 dB to match sine power', () => {
  const base = { volume: 1, ceilingDb: 0, freq: 440 };
  const sine = safety.outputGain({ ...base, waveform: 'sine' });
  const square = safety.outputGain({ ...base, waveform: 'square' });
  near(safety.linToDb(square / sine), -3.0103, 1e-3);
});

test('safety: low frequency guard scales level below the knee', () => {
  assert.equal(safety.lfGuardFactor(60, true), 1);
  assert.equal(safety.lfGuardFactor(440, true), 1);
  near(safety.lfGuardFactor(30, true), 0.5);
  near(safety.lfGuardFactor(20, true), 1 / 3);
  assert.equal(safety.lfGuardFactor(20, false), 1);
  const guarded = safety.outputGain({ volume: 1, ceilingDb: 0, waveform: 'sine', freq: 30, lfGuard: true });
  near(guarded, 0.5);
});

test('safety: infrasound is recognised, and the driver guard bites hardest there', () => {
  assert.equal(safety.isInfrasound(19.9), true);
  assert.equal(safety.isInfrasound(1), true);
  assert.equal(safety.isInfrasound(20), false);
  assert.equal(safety.isInfrasound(0), false);
  assert.equal(safety.isInfrasound(NaN), false);
  near(safety.lfGuardFactor(6, true), 0.1);
  // at 1 Hz, full volume and a 0 dB ceiling still leave under 2% of full scale
  assert.ok(safety.outputGain({ volume: 1, ceilingDb: 0, waveform: 'sine', freq: 1, lfGuard: true }) < 0.02);
});

test('safety: high-frequency cautions come in at the right points', () => {
  assert.equal(safety.hfCaution(440), '');
  assert.equal(safety.hfCaution(5000), '');
  assert.equal(safety.hfCaution(5000.1), 'piercing');
  assert.equal(safety.hfCaution(13999), 'piercing');
  assert.equal(safety.hfCaution(14000), 'unheard');
  assert.equal(safety.hfCaution(20000), 'unheard');
  assert.equal(safety.hfCaution(NaN), '');
});

test('safety: limiter curve is transparent inside the ceiling and flat outside', () => {
  const curve = safety.limiterCurve(-6);
  const c = safety.dbToLin(-6);
  const n = curve.length;
  assert.equal(n % 2, 1);
  assert.equal(curve[(n - 1) / 2], 0);
  near(curve[0], -c, 1e-6);
  near(curve[n - 1], c, 1e-6);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    assert.ok(Math.abs(curve[i]) <= c + 1e-6);
    if (Math.abs(x) < c - 1e-3) near(curve[i], x, 1e-6);
  }
});

/* --------------------------------------------------------------- sweep */

test('sweep: glides at the set rate and finishes on target', () => {
  const s = new Sweep({ from: 100, to: 200, rate: 10 });
  assert.equal(s.state, 'idle');
  s.start(50);
  assert.equal(s.state, 'running');
  near(s.update(50), 100);
  near(s.update(55), 150);
  near(s.remaining(55), 5);
  assert.equal(s.update(60), 200);
  assert.equal(s.state, 'done');
  assert.equal(s.update(999), 200);
});

test('sweep: downward sweeps work', () => {
  const s = new Sweep({ from: 1000, to: 400, rate: 100 }).start(0);
  near(s.update(2), 800);
  assert.equal(s.update(7), 400);
  assert.equal(s.state, 'done');
});

test('sweep: lock freezes the frequency, resume continues without a jump', () => {
  const s = new Sweep({ from: 100, to: 1000, rate: 20 }).start(0);
  const held = s.pause(10);
  near(held, 300);
  assert.equal(s.state, 'paused');
  near(s.update(500), 300);           // time passing while locked changes nothing
  s.resume(500);
  near(s.update(500), 300);
  near(s.update(505), 400);
});

test('sweep: resume picks up a frequency nudged while locked', () => {
  const s = new Sweep({ from: 100, to: 1000, rate: 20 }).start(0);
  s.pause(10);
  s.resume(20, 312.5);
  near(s.update(20), 312.5);
  near(s.update(21), 332.5);
});

test('sweep: resuming beyond the target heads back toward it', () => {
  const s = new Sweep({ from: 100, to: 500, rate: 50 }).start(0);
  s.pause(1);
  s.resume(2, 600);
  near(s.update(3), 550);
  assert.equal(s.update(10), 500);
  assert.equal(s.state, 'done');
});

test('sweep: plan describes exactly what the oscillator must do next', () => {
  const s = new Sweep({ from: 100, to: 1000, rate: 20 }).start(0);
  const plan = s.plan(5);
  near(plan.from, 200);
  assert.equal(plan.to, 1000);
  near(plan.duration, 40);
});

test('sweep: configuration is clamped to safe values', () => {
  const s = new Sweep({ from: 1, to: 99999, rate: 0 });
  assert.equal(s.from, 1);
  assert.equal(s.to, 20000);
  assert.ok(s.rate > 0);
  s.configure({ from: 'x', to: null, rate: -5 });
  assert.equal(s.from, 1);
  assert.equal(s.rate, 5);
});

test('sweep: position and ETA formatting', () => {
  const s = new Sweep({ from: 100, to: 300, rate: 1 });
  near(s.position(150), 0.25);
  assert.equal(s.position(50), 0);
  assert.equal(s.position(999), 1);
  near(s.duration(), 200);
  assert.equal(formatEta(0), '00:00');
  assert.equal(formatEta(75.2), '01:16');
  assert.equal(formatEta(Infinity), '--:--');
});

test('sweep: zero-length sweep completes immediately', () => {
  const s = new Sweep({ from: 440, to: 440, rate: 5 }).start(0);
  assert.equal(s.state, 'done');
});

/* ------------------------------------------------------------- chladni */

test('chladni: plate constant matches thin-plate theory for the reference plate', () => {
  // 24 cm x 1 mm aluminium, worked by hand: D = 6.453 N m, C = 42.2 Hz
  near(chladni.plateConstant({ sideCm: 24, thicknessMm: 1, material: 'aluminium', trim: 1 }), 42.16, 0.05);
});

test('chladni: frequency scales with thickness and inverse square of side', () => {
  const base = chladni.plateConstant({ sideCm: 24, thicknessMm: 1, material: 'aluminium' });
  near(chladni.plateConstant({ sideCm: 24, thicknessMm: 2, material: 'aluminium' }) / base, 2, 1e-9);
  near(chladni.plateConstant({ sideCm: 48, thicknessMm: 1, material: 'aluminium' }) / base, 0.25, 1e-9);
  near(chladni.plateConstant({ sideCm: 24, thicknessMm: 1, material: 'aluminium', trim: 1.1 }) / base, 1.1, 1e-9);
});

test('chladni: mode table holds only centre-driven modes, sorted, in range', () => {
  const C = 42;
  const table = chladni.modeTable(C, 20, 5000);
  assert.ok(table.length > 10);
  assert.deepEqual([table[0].m, table[0].n], [2, 0]);
  near(table[0].f, 168);
  for (let i = 0; i < table.length; i++) {
    const t = table[i];
    assert.equal(t.m % 2, 0);
    assert.equal(t.n % 2, 0);
    assert.ok(t.m >= t.n);
    assert.ok(t.f >= 20 && t.f <= 5000);
    if (i) assert.ok(t.f >= table[i - 1].f);
  }
  assert.deepEqual(chladni.modeTable(0, 20, 5000), []);
});

test('chladni: nearest mode and trim alignment', () => {
  const plate = { sideCm: 24, thicknessMm: 1, material: 'aluminium', trim: 1 };
  const C = chladni.plateConstant(plate);
  const table = chladni.modeTable(C, 20, 5000);
  const mode = chladni.nearestMode(table, 350);
  assert.equal(mode.label, '(2,2)');
  const trim = chladni.trimToAlign(plate, mode, 350);
  const C2 = chladni.plateConstant({ ...plate, trim });
  near(chladni.modeFrequency(C2, 2, 2), 350, 1e-6);
  assert.equal(chladni.nearestMode([], 350), null);
});

test('chladni: field is RMS-normalised, finite and four-fold symmetric', () => {
  const C = 42;
  const size = 48;
  const u = chladni.field(8 * C + 3, C, size);
  let sumSq = 0;
  for (const v of u) { assert.ok(isFinite(v) && v >= 0); sumSq += v * v; }
  near(Math.sqrt(sumSq / u.length), 1, 1e-4);
  const at = (i, j) => u[j * size + i];
  for (const [i, j] of [[3, 7], [10, 20], [0, 0], [23, 5]]) {
    near(at(i, j), at(size - 1 - i, j), 1e-4);   // mirror in x
    near(at(i, j), at(i, size - 1 - j), 1e-4);   // mirror in y
    near(at(i, j), at(j, i), 1e-4);              // mirror in the diagonal
  }
});

test('chladni: on resonance the field takes the shape of that mode', () => {
  const C = 42;
  const size = 64;
  // Mode (4,0): shape cos(4 pi x) + cos(4 pi y)
  const u = chladni.field(chladni.modeFrequency(C, 4, 0), C, size, { Q: 400 });
  let dot = 0, aa = 0, bb = 0;
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const x = (i + 0.5) / size, y = (j + 0.5) / size;
      const ideal = Math.abs(Math.cos(4 * Math.PI * x) + Math.cos(4 * Math.PI * y));
      const v = u[j * size + i];
      dot += ideal * v; aa += ideal * ideal; bb += v * v;
    }
  }
  assert.ok(dot / Math.sqrt(aa * bb) > 0.995, 'field should match the ideal mode shape');
});

test('chladni: the driven centre is never on a nodal line at resonance', () => {
  const C = 42;
  const size = 65;
  for (const [m, n] of [[2, 0], [2, 2], [4, 2], [6, 4]]) {
    const u = chladni.field(chladni.modeFrequency(C, m, n), C, size, { Q: 200 });
    const mid = (size - 1) / 2;
    assert.ok(u[mid * size + mid] > 1, `centre should be lively for mode (${m},${n})`);
  }
});

test('chladni: bad input yields a neutral field instead of NaN', () => {
  const u = chladni.field(440, 0, 8);
  assert.ok(Array.from(u).every((v) => v === 1));
  assert.equal(chladni.sanitizePlate({ material: 'unobtainium' }).material, 'aluminium');
  assert.equal(chladni.sanitizePlate({ sideCm: -4 }).sideCm, 5);
});
