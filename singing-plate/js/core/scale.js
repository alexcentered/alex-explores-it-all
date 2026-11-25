/*
 * core/scale.js -- how size sets pitch.
 *
 * Make a thing bigger and its note falls, because a wave has to cross it
 * and come back. How fast the note falls depends on what carries the wave:
 *
 *   A string, the air in a room, a tuned circuit, the gap round a planet:
 *     the wave travels at a fixed speed, so frequency goes as 1 / size.
 *   A plate cut from the same sheet:
 *     bending waves travel faster the shorter they are, so frequency goes
 *     as 1 / size squared. Scale the thickness too and it is 1 / size.
 *   A drop of water:
 *     surface tension pulls it back and its whole mass has to move, so
 *     frequency goes as 1 / size to the power 1.5.
 *
 * Each entry gives a starting frequency for a named example and the power
 * of size its frequency follows. The unit tests check both against the
 * modules that model each thing properly.
 *
 * Pure functions only.
 */
(function (root) {
  'use strict';

  var THINGS = [
    {
      id: 'string', name: 'A stretched string', scaled: 'its length', power: -1,
      example: 'A guitar\'s A string, 65 cm long', base: 110,
      why: 'The wave must fit between the two ends. Twice the length means twice the wavelength and half the frequency: an octave down. Every musical interval is a ratio of lengths on this rule.'
    },
    {
      id: 'room', name: 'The air in a stone room', scaled: 'every side', power: -1,
      example: 'The King\'s Chamber, 10.47 m long', base: 16.377,
      why: 'Sound crosses the room at a fixed speed, about 343 m/s, so the same rule holds as for a string. A chamber a few metres across lands in the range of a low voice whoever built it.'
    },
    {
      id: 'sheet', name: 'A plate cut from the same sheet', scaled: 'its side, at the same thickness', power: -2,
      example: 'A 24 cm aluminium plate, 1 mm thick', base: 168.634,
      why: 'A plate bends, and short bends travel faster than long ones. Twice the side gives a quarter of the frequency: two octaves down. This is why a larger plate shows its patterns at much lower notes.'
    },
    {
      id: 'model', name: 'A plate scaled like a model', scaled: 'its side and its thickness together', power: -1,
      example: 'The same plate, enlarged in every direction', base: 168.634,
      why: 'Thickness stiffens a plate and raises its note in proportion. Scale side and thickness together and the two effects leave 1 / size: the rule for a string again.'
    },
    {
      id: 'drop', name: 'A drop of water', scaled: 'its radius', power: -1.5,
      example: 'A free drop of 1 mm radius, in its simplest wave', base: 121.581,
      why: 'Surface tension is the spring and the drop\'s whole mass is the weight. Mass grows as size cubed, so the note falls faster than for a string: twice the radius is an octave and a half down.'
    },
    {
      id: 'circuit', name: 'A tuned circuit', scaled: 'its coil and its capacitor in proportion', power: -1,
      example: 'A 1 mH coil with a 100 nF capacitor', base: 15915.494,
      why: 'Frequency is 1 ÷ (2π √(L C)). Double both the coil and the capacitor and the frequency halves. Nothing moves but charge, and the arithmetic is the same as the string\'s.'
    },
    {
      id: 'planet', name: 'The gap between ground and sky', scaled: 'the planet\'s radius', power: -1,
      example: 'The Earth: a radio wave once round, 40,000 km', base: 7.489,
      why: 'A radio wave trapped between the ground and the upper atmosphere fits a whole number of times round the planet. For the Earth that gives about 7.5 Hz by this simple count; 7.83 Hz is measured.'
    }
  ];

  var SCALE_MIN = 0.25, SCALE_MAX = 4;

  function find(id) {
    for (var i = 0; i < THINGS.length; i++) if (THINGS[i].id === id) return THINGS[i];
    return null;
  }

  function sanitizeScale(s) {
    var v = Number(s);
    return isFinite(v) && v > 0 ? Math.min(SCALE_MAX, Math.max(SCALE_MIN, v)) : 1;
  }

  /* The thing's frequency when it is `scale` times its example size. */
  function frequency(thing, scale) {
    return thing.base * Math.pow(sanitizeScale(scale), thing.power);
  }

  /* How far the note moves, in octaves. Negative is lower. */
  function octaves(thing, scale) {
    return thing.power * Math.log2(sanitizeScale(scale));
  }

  /* The rule in words, for a table. */
  function rule(thing) {
    var p = -thing.power;
    return p === 1 ? '1 ÷ size' : p === 2 ? '1 ÷ size²' : '1 ÷ size^' + p;
  }

  /* "1 octave lower", "half an octave higher", "the same". */
  function describeShift(oct) {
    var a = Math.abs(oct);
    if (a < 0.005) return 'the same note';
    var amount = Math.abs(a - 0.5) < 0.005 ? 'half an octave'
      : Math.abs(a - 1) < 0.005 ? '1 octave'
      : Math.abs(a - 1.5) < 0.005 ? 'an octave and a half'
      : Math.abs(a - Math.round(a)) < 0.005 ? Math.round(a) + ' octaves'
      : a.toFixed(2) + ' octaves';
    return amount + (oct < 0 ? ' lower' : ' higher');
  }

  var api = {
    THINGS: THINGS,
    SCALE_MIN: SCALE_MIN,
    SCALE_MAX: SCALE_MAX,
    find: find,
    sanitizeScale: sanitizeScale,
    frequency: frequency,
    octaves: octaves,
    rule: rule,
    describeShift: describeShift
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (root.SP = root.SP || {}).scale = api;
})(typeof self !== 'undefined' ? self : this);
