/*
 * core/sweep.js -- the sweep as a small state machine.
 *
 *   idle --start--> running --pause--> paused --resume--> running
 *                      |                                     |
 *                      +---------- reaches target ----------> done
 *
 * The machine never reads a clock itself: the caller passes in "now" (the
 * audio clock, in seconds). That keeps the readout locked to what the
 * oscillator is really doing, and makes every transition testable.
 */
(function (root) {
  'use strict';

  var F_MIN = 1;
  var F_MAX = 20000;
  var RATE_MIN = 0.1;    // Hz per second
  var RATE_MAX = 500;

  function clamp(v, lo, hi) {
    return Math.min(hi, Math.max(lo, v));
  }

  function num(v, fallback) {
    var n = Number(v);
    return isFinite(n) ? n : fallback;
  }

  function Sweep(config) {
    this.state = 'idle';
    this.from = 100;
    this.to = 3000;
    this.rate = 5;
    this._t0 = 0;        // clock time the current leg started
    this._f0 = this.from; // frequency the current leg started from
    this._held = this.from;
    if (config) this.configure(config);
  }

  Sweep.prototype.configure = function (c) {
    this.from = clamp(num(c.from, this.from), F_MIN, F_MAX);
    this.to = clamp(num(c.to, this.to), F_MIN, F_MAX);
    this.rate = clamp(Math.abs(num(c.rate, this.rate)) || RATE_MIN, RATE_MIN, RATE_MAX);
    return this;
  };

  Sweep.prototype.start = function (now) {
    this._f0 = this.from;
    this._t0 = now;
    this._held = this.from;
    this.state = this.from === this.to ? 'done' : 'running';
    return this;
  };

  /* Frequency at clock time "now". Does not change state. */
  Sweep.prototype.freqAt = function (now) {
    if (this.state !== 'running') return this._held;
    var dir = this.to >= this._f0 ? 1 : -1;
    var f = this._f0 + dir * this.rate * Math.max(0, now - this._t0);
    return dir > 0 ? Math.min(f, this.to) : Math.max(f, this.to);
  };

  /* Advance the machine: returns the frequency and flips to done on arrival. */
  Sweep.prototype.update = function (now) {
    var f = this.freqAt(now);
    if (this.state === 'running' && f === this.to) {
      this._held = this.to;
      this.state = 'done';
    }
    return f;
  };

  /* Lock: freeze on the frequency being played at this instant. */
  Sweep.prototype.pause = function (now) {
    if (this.state !== 'running') return this._held;
    this._held = this.freqAt(now);
    this.state = 'paused';
    return this._held;
  };

  /*
   * Carry on towards the target. If the operator nudged the frequency while
   * locked, pass it in and the sweep continues from there.
   */
  Sweep.prototype.resume = function (now, fromFreq) {
    if (this.state !== 'paused') return this;
    this._f0 = clamp(num(fromFreq, this._held), F_MIN, F_MAX);
    this._held = this._f0;
    this._t0 = now;
    this.state = this._f0 === this.to ? 'done' : 'running';
    return this;
  };

  Sweep.prototype.reset = function () {
    this.state = 'idle';
    this._held = this.from;
    return this;
  };

  Sweep.prototype.remaining = function (now) {
    return Math.abs(this.to - this.freqAt(now)) / this.rate;
  };

  Sweep.prototype.duration = function () {
    return Math.abs(this.to - this.from) / this.rate;
  };

  /* 0..1 position of a frequency along the configured from -> to span. */
  Sweep.prototype.position = function (f) {
    var span = this.to - this.from;
    if (span === 0) return 1;
    return clamp((f - this.from) / span, 0, 1);
  };

  /* What the audio engine must schedule to match the model from "now" on. */
  Sweep.prototype.plan = function (now) {
    var f = this.freqAt(now);
    return { from: f, to: this.to, duration: Math.abs(this.to - f) / this.rate };
  };

  function formatEta(seconds) {
    if (!isFinite(seconds) || seconds < 0) return '--:--';
    var s = Math.ceil(seconds);
    var m = Math.floor(s / 60);
    var r = s % 60;
    return (m < 10 ? '0' : '') + m + ':' + (r < 10 ? '0' : '') + r;
  }

  var api = {
    Sweep: Sweep,
    formatEta: formatEta,
    RATE_MIN: RATE_MIN,
    RATE_MAX: RATE_MAX
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (root.SP = root.SP || {}).sweep = api;
})(typeof self !== 'undefined' ? self : this);
