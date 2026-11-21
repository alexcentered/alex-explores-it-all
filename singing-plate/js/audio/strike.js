/*
 * audio/strike.js -- plays one prepared burst of sound.
 *
 * The Fields page works out what a struck resonator sounds like as a list
 * of samples; this plays them. Same safety chain as the main engine: the
 * capped gain law sets the level, a hard limiter sits last before the
 * output, and stopping early fades rather than cuts.
 */
(function (root) {
  'use strict';

  var SP = root.SP = root.SP || {};
  var safety = SP.safety;
  var RELEASE = 0.03;

  function Strike() {
    this.ctx = null;
    this.playing = false;
    this._node = null;
    this._env = null;
    this._master = null;
    this._limiter = null;
    this.onend = null;
  }

  Strike.isSupported = function () {
    return !!(root.AudioContext || root.webkitAudioContext);
  };

  /* The rate samples should be prepared at. Creates the audio context on first use. */
  Strike.prototype.sampleRate = function () {
    this._init();
    return this.ctx.sampleRate;
  };

  Strike.prototype._init = function () {
    if (this.ctx) return;
    var AC = root.AudioContext || root.webkitAudioContext;
    this.ctx = new AC({ latencyHint: 'interactive' });
    this._master = this.ctx.createGain();
    this._limiter = this.ctx.createWaveShaper();
    this._limiter.oversample = 'none';
    this._master.connect(this._limiter);
    this._limiter.connect(this.ctx.destination);
  };

  /*
   * o.samples    Float32Array, peak value at most 1, prepared at sampleRate()
   * o.freq       its pitch in Hz: sets the driver guard for low notes
   * o.volume     0..1, same taper as the console
   * o.ceilingDb  limiter ceiling
   */
  Strike.prototype.play = function (o) {
    this._init();
    if (this.ctx.state !== 'running') this.ctx.resume();
    if (this.playing) this.stop();
    var ctx = this.ctx, t = ctx.currentTime + 0.02;

    this._limiter.curve = safety.limiterCurve(o.ceilingDb);
    this._master.gain.setValueAtTime(safety.outputGain({
      volume: o.volume, ceilingDb: o.ceilingDb, waveform: 'sine', freq: o.freq, lfGuard: true
    }), ctx.currentTime);

    var buffer = ctx.createBuffer(1, o.samples.length, ctx.sampleRate);
    buffer.getChannelData(0).set(o.samples);
    var node = ctx.createBufferSource();
    node.buffer = buffer;
    var env = ctx.createGain();
    env.gain.setValueAtTime(1, ctx.currentTime);
    node.connect(env);
    env.connect(this._master);

    var self = this;
    node.onended = function () {
      node.disconnect(); env.disconnect();
      if (self._node === node) {
        self._node = self._env = null;
        self.playing = false;
        if (self.onend) self.onend();
      }
    };
    node.start(t);
    this._node = node;
    this._env = env;
    this.playing = true;
    this.duration = buffer.duration;
  };

  /* Cut a burst short, with a fade. */
  Strike.prototype.stop = function () {
    if (!this.playing) return;
    var node = this._node, env = this._env, t = this.ctx.currentTime;
    env.gain.cancelScheduledValues(t);
    env.gain.setValueAtTime(1, t);
    env.gain.linearRampToValueAtTime(0, t + RELEASE);
    try { node.stop(t + RELEASE + 0.01); } catch (e) { /* already stopped */ }
    this._node = this._env = null;
    this.playing = false;
    if (this.onend) this.onend();
  };

  Strike.prototype.panic = Strike.prototype.stop;

  SP.Strike = Strike;
})(typeof self !== 'undefined' ? self : this);
