/*
 * core/color.js -- a colour for every frequency.
 *
 * The rule is the same octave shift the simulations use, pointed the other
 * way. Keep doubling a frequency and, about forty octaves above the notes
 * of a piano, the number lands in the range of visible light. Concert A,
 * 440 Hz, doubled forty times is 484 THz: orange.
 *
 * Visible light runs from about 380 to 760 nanometres, which is almost
 * exactly one octave. So every note has one place in the spectrum, notes an
 * octave apart share a colour, and a musical interval becomes a fixed
 * distance along the rainbow. That is what makes colour useful here: it lets
 * the eye see relationships the ear hears.
 *
 * This is an analogy, not physics. Sound is pressure moving through air and
 * light is an electromagnetic wave; nothing connects the two beyond the
 * arithmetic of doubling.
 *
 * House style rules out purple, so the violet end of the spectrum (below
 * about 440 nm) is drawn as deepening blue rather than violet.
 *
 * Pure functions only.
 */
(function (root) {
  'use strict';

  var C_LIGHT = 299792458;          // m/s
  var NM_LONG = 760;                // deep red
  var NM_SHORT = 380;               // far violet: exactly one octave above NM_LONG
  var HZ_LOW = C_LIGHT / (NM_LONG * 1e-9);     // 394.5 THz

  /* How many octaves up, and where it lands. */
  function toLight(freq) {
    var f = Number(freq);
    if (!(f > 0)) return null;
    var octaves = Math.ceil(Math.log2(HZ_LOW / f) - 1e-12);
    var hz = f * Math.pow(2, octaves);
    return { octaves: octaves, thz: hz / 1e12, nm: C_LIGHT / hz * 1e9 };
  }

  /*
   * Wavelength to screen colour, after Dan Bruton's widely used
   * approximation, with brightness falling away toward both ends of the
   * visible range as the eye's sensitivity does.
   */
  function wavelengthToRgb(nm) {
    var r = 0, g = 0, b = 0;
    if (nm >= 380 && nm < 440) { r = 0; g = 0; b = 1; }                 // violet, drawn as blue
    else if (nm < 490) { r = 0; g = (nm - 440) / 50; b = 1; }
    else if (nm < 510) { r = 0; g = 1; b = (510 - nm) / 20; }
    else if (nm < 580) { r = (nm - 510) / 70; g = 1; b = 0; }
    else if (nm < 645) { r = 1; g = (645 - nm) / 65; b = 0; }
    else if (nm <= 760) { r = 1; g = 0; b = 0; }

    var k = 1;
    if (nm < 420) k = 0.35 + 0.65 * (nm - 380) / 40;
    else if (nm > 700) k = 0.35 + 0.65 * (760 - nm) / 60;

    function channel(v) { return Math.round(255 * Math.pow(Math.max(0, v) * k, 0.8)); }
    return [channel(r), channel(g), channel(b)];
  }

  function colourName(nm) {
    if (nm < 450) return 'violet';
    if (nm < 485) return 'blue';
    if (nm < 500) return 'cyan';
    if (nm < 565) return 'green';
    if (nm < 590) return 'yellow';
    if (nm < 625) return 'orange';
    return 'red';
  }

  function toHex(rgb) {
    return '#' + rgb.map(function (v) { return (v < 16 ? '0' : '') + v.toString(16); }).join('');
  }

  /* Everything the interface needs to show a frequency as a colour. */
  function tone(freq) {
    var light = toLight(freq);
    if (!light) return null;
    var rgb = wavelengthToRgb(light.nm);
    return {
      octaves: light.octaves,
      thz: light.thz,
      nm: light.nm,
      rgb: rgb,
      hex: toHex(rgb),
      name: colourName(light.nm)
    };
  }

  /*
   * A CSS gradient for a band of frequencies, with enough stops that a band
   * several octaves wide shows the spectrum repeating once per octave.
   */
  function gradient(lo, hi) {
    if (!(lo > 0) || !(hi > lo)) return tone(lo > 0 ? lo : 1).hex;
    var octaves = Math.log2(hi / lo);
    var steps = Math.max(2, Math.min(96, Math.ceil(octaves * 12)));
    var stops = [];
    for (var i = 0; i <= steps; i++) {
      var f = lo * Math.pow(hi / lo, i / steps);
      stops.push(tone(f).hex + ' ' + (i / steps * 100).toFixed(1) + '%');
    }
    return 'linear-gradient(90deg, ' + stops.join(', ') + ')';
  }

  var api = {
    C_LIGHT: C_LIGHT,
    NM_LONG: NM_LONG,
    NM_SHORT: NM_SHORT,
    toLight: toLight,
    wavelengthToRgb: wavelengthToRgb,
    colourName: colourName,
    toHex: toHex,
    tone: tone,
    gradient: gradient
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (root.SP = root.SP || {}).color = api;
})(typeof self !== 'undefined' ? self : this);
