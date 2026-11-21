/*
 * core/chance.js -- the arithmetic behind the line test.
 *
 * The line test recreates an exercise described by Dan Sherman: a tone in
 * the headphones, a wavy line on the screen, and the instruction to flatten
 * the line with the mind. A computer cannot sense thought, so there is only
 * one honest way to let a person try it: drive the line with chance, and
 * count whether it flattens more often than chance alone would make it.
 *
 * How a session works:
 *   - Several times a second one random bit arrives.
 *       1  the line moves one step flatter   (a "converge" step)
 *       0  the line moves one step wavier    (a "diverge" step)
 *   - Each bit is a fair coin whatever state the line is in, so over a
 *     session the number of converge steps follows a plain binomial
 *     distribution: expected half, with a known spread.
 *   - The score is how far the count sits from half, in standard deviations
 *     (z). Nothing else is measured, and nothing can be nudged by hand.
 *
 * A session has a fixed length chosen before it starts. A session that is
 * abandoned still goes on the record, with the steps it had completed:
 * throwing it away would let someone quit every session that was going
 * badly and keep only the good ones. Because each step is a fair coin, the
 * pooled count stays fair wherever a session happens to stop.
 *
 * Pure functions only.
 */
(function (root) {
  'use strict';

  var LEVEL_MAX = 12;         // steps of waviness; 0 is a flat line
  var LEVEL_START = 6;
  var BLOCKS = 10;            // the session is shown as ten boxes, as in Sherman's account
  var TICKS_PER_SECOND = 4;
  var LENGTHS = [240, 480, 1200];   // trials: one, two and five minutes

  function newSession(trials, kind) {
    var blocks = [];
    for (var i = 0; i < BLOCKS; i++) blocks.push({ n: 0, hits: 0 });
    return {
      kind: kind === 'control' ? 'control' : 'intent',
      trials: Math.max(BLOCKS, Math.round(trials)),
      done: 0,
      hits: 0,
      level: LEVEL_START,
      blocks: blocks
    };
  }

  /* Feed one random bit to the session. Returns true once the session is complete. */
  function step(session, bit) {
    if (session.done >= session.trials) return true;
    var hit = bit ? 1 : 0;
    session.level = hit
      ? Math.max(0, session.level - 1)
      : Math.min(LEVEL_MAX, session.level + 1);
    var block = session.blocks[Math.min(BLOCKS - 1, Math.floor(session.done * BLOCKS / session.trials))];
    block.n += 1;
    block.hits += hit;
    session.hits += hit;
    session.done += 1;
    return session.done >= session.trials;
  }

  /* Standard deviations away from pure chance. Positive means flatter than chance. */
  function zScore(hits, n) {
    if (!(n > 0)) return 0;
    return (hits - n / 2) / Math.sqrt(n / 4);
  }

  /* Complementary error function (Abramowitz and Stegun 7.1.26, error under 2e-7). */
  function erfc(x) {
    var z = Math.abs(x);
    var t = 1 / (1 + 0.3275911 * z);
    var poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
    var v = poly * Math.exp(-z * z);
    return x >= 0 ? v : 2 - v;
  }

  /* Chance of a result at least this far from half, in either direction. */
  function pTwoSided(z) {
    return Math.min(1, erfc(Math.abs(z) / Math.SQRT2));
  }

  /*
   * What a z score means, in plain words. The bar is deliberately high:
   * with enough sessions, something unusual always turns up by luck.
   */
  function verdict(z, n) {
    var a = Math.abs(z);
    if (!(n > 0)) return { level: 'none', text: 'No trials yet.' };
    if (a < 2) return { level: 'chance', text: 'Within what chance alone produces.' };
    var way = z > 0 ? 'flatter' : 'wavier';
    if (a < 3) {
      return { level: 'unusual', text: 'Unusually ' + way + ' than chance, but about one result in twenty looks like this by luck. Repeat it before reading anything into it.' };
    }
    return { level: 'rare', text: 'Much ' + way + ' than chance: luck does this about once in ' + oneIn(pTwoSided(z)) + '. Worth repeating many times, with the number of sessions fixed in advance, before believing it.' };
  }

  function oneIn(p) {
    if (!(p > 0)) return 'a very great many';
    var n = 1 / p;
    if (n >= 1e6) return Math.round(n / 1e6).toLocaleString('en-US') + ' million';
    return Math.round(n).toLocaleString('en-US');
  }

  /* Pool finished sessions of one kind into a single count. */
  function combine(sessions, kind) {
    var n = 0, hits = 0, count = 0, abandoned = 0;
    (sessions || []).forEach(function (s) {
      if (kind && s.kind !== kind) return;
      n += s.n; hits += s.hits; count += 1;
      if (s.abandoned) abandoned += 1;
    });
    var z = zScore(hits, n);
    return { sessions: count, abandoned: abandoned, n: n, hits: hits, rate: n ? hits / n : 0, z: z, p: pTwoSided(z) };
  }

  /* Coerce a stored log into well-formed records, dropping anything malformed. */
  function sanitizeLog(raw) {
    if (!Array.isArray(raw)) return [];
    return raw.filter(function (s) {
      return s && (s.kind === 'intent' || s.kind === 'control') &&
        Number.isInteger(s.n) && Number.isInteger(s.hits) && s.n > 0 && s.hits >= 0 && s.hits <= s.n;
    }).map(function (s) {
      return { kind: s.kind, n: s.n, hits: s.hits, at: Number(s.at) || 0, abandoned: s.abandoned === true };
    }).slice(-1000);
  }

  var api = {
    LEVEL_MAX: LEVEL_MAX,
    LEVEL_START: LEVEL_START,
    BLOCKS: BLOCKS,
    TICKS_PER_SECOND: TICKS_PER_SECOND,
    LENGTHS: LENGTHS,
    newSession: newSession,
    step: step,
    zScore: zScore,
    erfc: erfc,
    pTwoSided: pTwoSided,
    verdict: verdict,
    combine: combine,
    sanitizeLog: sanitizeLog
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (root.SP = root.SP || {}).chance = api;
})(typeof self !== 'undefined' ? self : this);
