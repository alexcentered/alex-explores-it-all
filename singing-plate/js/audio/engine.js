/*
 * audio/engine.js -- the tone generator.
 *
 * Signal chain:
 *
 *   oscillator -> envelope -> master gain -> hard limiter -> analyser -> out
 *   (one "voice")  (fades)    (volume,       (clips at the   (scope and
 *                              ceiling,       ceiling)        meter)
 *                              LF guard)
 *
 * Every start, stop and waveform change goes through the envelope, so the
 * output never steps: a step is a click, and a click is a hammer blow to a
 * driver bolted to a metal plate.
 *
 * The engine knows nothing about the UI. Phase two reuses it unchanged.
 */
(function (root) {
  'use strict';

  var SP = root.SP = root.SP || {};
  var safety = SP.safety;

  var ATTACK = 0.08;        // s, fade in
  var RELEASE = 0.12;       // s, fade out
  var PANIC_RELEASE = 0.03; // s, emergency stop: fast, still click-free
  var CROSSFADE = 0.05;     // s, waveform change
  var GAIN_SMOOTH = 0.02;   // s, time constant for level changes
  var FREQ_SMOOTH = 0.008;  // s, time constant for manual frequency changes

  function Engine() {
    this.ctx = null;
    this.playing = false;
    this.params = {
      freq: 440,
      waveform: 'sine',
      volume: safety.DEFAULT_VOLUME,
      ceilingDb: safety.DEFAULT_CEILING_DB,
      lfGuard: true
    };
    this._voice = null;
    this._ramp = null;      // active sweep: { from, to, t0, dur }
    this._master = null;
    this._limiter = null;
    this._analyser = null;
    this._buf = null;
  }

  Engine.isSupported = function () {
    return !!(root.AudioContext || root.webkitAudioContext);
  };

  /* Browsers only allow audio to start from a user gesture, so build lazily. */
  Engine.prototype._init = function () {
    if (this.ctx) return;
    var AC = root.AudioContext || root.webkitAudioContext;
    var ctx = this.ctx = new AC({ latencyHint: 'interactive' });

    this._master = ctx.createGain();
    this._master.gain.value = this.targetGain();

    this._limiter = ctx.createWaveShaper();
    this._limiter.curve = safety.limiterCurve(this.params.ceilingDb);
    this._limiter.oversample = 'none';

    this._analyser = ctx.createAnalyser();
    this._analyser.fftSize = 2048;
    this._analyser.smoothingTimeConstant = 0;
    this._buf = new Float32Array(this._analyser.fftSize);

    this._master.connect(this._limiter);
    this._limiter.connect(this._analyser);
    this._analyser.connect(ctx.destination);
  };

  /* Seconds on the audio clock. Only advances once audio has been started. */
  Engine.prototype.now = function () {
    return this.ctx ? this.ctx.currentTime : 0;
  };

  Engine.prototype.targetGain = function (freqOverride) {
    var p = this.params;
    return safety.outputGain({
      volume: p.volume,
      ceilingDb: p.ceilingDb,
      waveform: p.waveform,
      freq: freqOverride === undefined ? this.currentFreq() : freqOverride,
      lfGuard: p.lfGuard
    });
  };

  Engine.prototype._applyGain = function (freqOverride) {
    if (!this.ctx) return;
    this._master.gain.setTargetAtTime(this.targetGain(freqOverride), this.ctx.currentTime, GAIN_SMOOTH);
  };

  /* The frequency actually being generated right now, sweep included. */
  Engine.prototype.currentFreq = function () {
    var r = this._ramp;
    if (!r || !this.ctx) return this.params.freq;
    if (r.dur <= 0) return r.to;
    var x = Math.min(1, Math.max(0, (this.ctx.currentTime - r.t0) / r.dur));
    return r.from + (r.to - r.from) * x;
  };

  Engine.prototype._spawnVoice = function (attack) {
    var ctx = this.ctx;
    var t = ctx.currentTime;
    var osc = ctx.createOscillator();
    var env = ctx.createGain();
    osc.type = this.params.waveform;

    var f = this.currentFreq();
    osc.frequency.setValueAtTime(f, t);
    var r = this._ramp;
    if (r && r.t0 + r.dur > t) osc.frequency.linearRampToValueAtTime(r.to, r.t0 + r.dur);

    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(1, t + attack);

    osc.connect(env);
    env.connect(this._master);
    osc.start(t);
    this._voice = { osc: osc, env: env, t0: t, attack: attack };
  };

  Engine.prototype._releaseVoice = function (voice, release) {
    var t = this.ctx.currentTime;
    // Where the fade-in had got to, worked out here rather than read back
    // from the node: not every browser reports automated values reliably.
    var level = Math.min(1, Math.max(0, (t - voice.t0) / voice.attack));
    voice.env.gain.cancelScheduledValues(t);
    voice.env.gain.setValueAtTime(level, t);
    voice.env.gain.linearRampToValueAtTime(0, t + release);
    voice.osc.stop(t + release + 0.02);
    voice.osc.onended = function () {
      voice.osc.disconnect();
      voice.env.disconnect();
    };
  };

  Engine.prototype.start = function () {
    this._init();
    if (this.ctx.state !== 'running') this.ctx.resume();
    if (this.playing) return;
    this._applyGain();
    this._spawnVoice(ATTACK);
    this.playing = true;
  };

  Engine.prototype.stop = function (release) {
    if (!this.playing) return;
    this.params.freq = this.currentFreq();
    this._ramp = null;
    this._releaseVoice(this._voice, release === undefined ? RELEASE : release);
    this._voice = null;
    this.playing = false;
  };

  Engine.prototype.panic = function () {
    this.stop(PANIC_RELEASE);
  };

  /* Go to a frequency and hold it. Cancels any sweep in progress. */
  Engine.prototype.setFrequency = function (f) {
    var from = this.currentFreq();
    this._ramp = null;
    this.params.freq = f;
    if (this._voice) {
      var t = this.ctx.currentTime;
      var p = this._voice.osc.frequency;
      p.cancelScheduledValues(t);
      p.setValueAtTime(from, t);
      p.setTargetAtTime(f, t, FREQ_SMOOTH);
    }
    this._applyGain(f);
  };

  /* Glide linearly from one frequency to another, sample-accurately. */
  Engine.prototype.sweep = function (from, to, duration) {
    this._init();
    var t = this.ctx.currentTime;
    this.params.freq = from;
    this._ramp = { from: from, to: to, t0: t, dur: Math.max(0, duration) };
    if (this._voice) {
      var p = this._voice.osc.frequency;
      p.cancelScheduledValues(t);
      p.setValueAtTime(from, t);
      if (duration > 0) p.linearRampToValueAtTime(to, t + duration);
      else p.setValueAtTime(to, t);
    }
    this._applyGain(from);
  };

  /* Called every frame during a sweep so the LF guard tracks the glide. */
  Engine.prototype.trackGain = function () {
    this._applyGain();
  };

  Engine.prototype.setWaveform = function (w) {
    var next = safety.sanitizeWaveform(w);
    if (next === this.params.waveform) return;
    this.params.waveform = next;
    if (this.playing) {
      this._releaseVoice(this._voice, CROSSFADE);
      this._spawnVoice(CROSSFADE);
    }
    this._applyGain();
  };

  Engine.prototype.setVolume = function (v) {
    this.params.volume = safety.sanitizeVolume(v);
    this._applyGain();
  };

  Engine.prototype.setCeilingDb = function (db) {
    this.params.ceilingDb = safety.sanitizeCeilingDb(db);
    if (this._limiter) this._limiter.curve = safety.limiterCurve(this.params.ceilingDb);
    this._applyGain();
  };

  Engine.prototype.setLfGuard = function (on) {
    this.params.lfGuard = !!on;
    this._applyGain();
  };

  /* Latest block of output samples, post-limiter, or null before first start. */
  Engine.prototype.samples = function () {
    if (!this._analyser) return null;
    if (this._analyser.getFloatTimeDomainData) {
      this._analyser.getFloatTimeDomainData(this._buf);
    } else {
      var bytes = new Uint8Array(this._buf.length);
      this._analyser.getByteTimeDomainData(bytes);
      for (var i = 0; i < bytes.length; i++) this._buf[i] = (bytes[i] - 128) / 128;
    }
    return this._buf;
  };

  Engine.prototype.sampleRate = function () {
    return this.ctx ? this.ctx.sampleRate : 48000;
  };

  SP.Engine = Engine;
})(typeof self !== 'undefined' ? self : this);
