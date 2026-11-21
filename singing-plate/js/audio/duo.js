/*
 * audio/duo.js -- two pure tones, a hair apart.
 *
 * The line test needs a sound whose steadiness the ear can judge. Two sine
 * tones at slightly different pitches beat against each other: the level
 * swells and fades at the difference between them. Bring the two pitches
 * together and the beating slows, then stops, leaving one steady tone. That
 * is the audible twin of a wavy line going flat.
 *
 * Same safety chain as the main engine: capped gain law, hard limiter, and a
 * fade on every start and stop. Each tone gets half the level, so their sum
 * never exceeds what a single tone would be allowed.
 */
(function (root) {
  'use strict';

  var SP = root.SP = root.SP || {};
  var safety = SP.safety;

  var ATTACK = 0.25;
  var RELEASE = 0.2;
  var PANIC_RELEASE = 0.03;
  var GLIDE = 0.12;          // s, how quickly the second tone follows a new spacing

  function Duo() {
    this.ctx = null;
    this.playing = false;
    this._nodes = null;
    this._master = null;
    this._limiter = null;
  }

  Duo.isSupported = function () {
    return !!(root.AudioContext || root.webkitAudioContext);
  };

  Duo.prototype._init = function (ceilingDb) {
    if (!this.ctx) {
      var AC = root.AudioContext || root.webkitAudioContext;
      this.ctx = new AC({ latencyHint: 'interactive' });
      this._master = this.ctx.createGain();
      this._limiter = this.ctx.createWaveShaper();
      this._limiter.oversample = 'none';
      this._master.connect(this._limiter);
      this._limiter.connect(this.ctx.destination);
    }
    this._limiter.curve = safety.limiterCurve(ceilingDb);
  };

  /*
   * o.base       pitch of the steady tone, Hz
   * o.spacing    how far above it the second tone starts, Hz
   * o.volume     0..1, same taper as the console
   * o.ceilingDb  limiter ceiling
   */
  Duo.prototype.start = function (o) {
    this._init(o.ceilingDb);
    if (this.ctx.state !== 'running') this.ctx.resume();
    if (this.playing) this.stop(PANIC_RELEASE);
    var ctx = this.ctx, t = ctx.currentTime;

    this._master.gain.setValueAtTime(safety.outputGain({
      volume: o.volume, ceilingDb: o.ceilingDb, waveform: 'sine', freq: o.base, lfGuard: true
    }), t);

    var env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(1, t + ATTACK);
    env.connect(this._master);

    var a = ctx.createOscillator(), b = ctx.createOscillator();
    var half = ctx.createGain();
    half.gain.value = 0.5;
    a.type = b.type = 'sine';
    a.frequency.setValueAtTime(o.base, t);
    b.frequency.setValueAtTime(o.base + Math.max(0, o.spacing || 0), t);
    a.connect(half); b.connect(half); half.connect(env);
    a.start(t); b.start(t);

    this._nodes = { a: a, b: b, half: half, env: env, base: o.base, t0: t };
    this.playing = true;
  };

  /* Move the second tone to a new distance above the first. */
  Duo.prototype.setSpacing = function (hz) {
    if (!this.playing) return;
    var n = this._nodes;
    n.b.frequency.setTargetAtTime(n.base + Math.max(0, hz), this.ctx.currentTime, GLIDE / 3);
  };

  Duo.prototype.setVolume = function (volume, ceilingDb) {
    if (!this.playing) return;
    this._master.gain.setTargetAtTime(safety.outputGain({
      volume: volume, ceilingDb: ceilingDb, waveform: 'sine', freq: this._nodes.base, lfGuard: true
    }), this.ctx.currentTime, 0.02);
  };

  Duo.prototype.stop = function (release) {
    if (!this.playing) return;
    var n = this._nodes, t = this.ctx.currentTime;
    var r = release === undefined ? RELEASE : release;
    var level = Math.min(1, Math.max(0, (t - n.t0) / ATTACK));
    n.env.gain.cancelScheduledValues(t);
    n.env.gain.setValueAtTime(level, t);
    n.env.gain.linearRampToValueAtTime(0, t + r);
    n.a.stop(t + r + 0.02);
    n.b.stop(t + r + 0.02);
    n.b.onended = function () { n.a.disconnect(); n.b.disconnect(); n.half.disconnect(); n.env.disconnect(); };
    this._nodes = null;
    this.playing = false;
  };

  Duo.prototype.panic = function () { this.stop(PANIC_RELEASE); };

  SP.Duo = Duo;
})(typeof self !== 'undefined' ? self : this);
