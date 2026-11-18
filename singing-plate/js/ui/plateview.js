/*
 * ui/plateview.js -- draws the simulated plate.
 *
 * Two views of the same amplitude field:
 *   sand   thousands of grains doing a random walk whose step size is the
 *          local vibration amplitude. Grains on lively metal get kicked
 *          around; grains that wander onto a nodal line stop being kicked
 *          and stay. That is the real mechanism, so the picture forms the
 *          way it does on the rig, a few seconds after the tone settles.
 *   field  the nodal lines drawn directly: instant, and motionless.
 */
(function (root) {
  'use strict';

  var SP = root.SP = root.SP || {};

  var RES = 640;            // canvas backing resolution, px
  var GRAINS = 26000;
  var STEP = 0.02;          // random-walk step per frame at RMS amplitude
  var AMP_CAP = 2.5;        // stops hot spots flinging grains across the plate
  var LINE_WIDTH = 0.22;    // nodal line half-width in field view, in RMS units

  function PlateView(canvas) {
    this.canvas = canvas;
    canvas.width = RES;
    canvas.height = RES;
    this.ctx = canvas.getContext('2d');
    this.image = this.ctx.createImageData(RES, RES);
    this.mode = 'sand';
    this.round = false;
    this.ink = [240, 240, 240];
    this.field = null;
    this.size = 0;
    this.x = new Float32Array(GRAINS);
    this.y = new Float32Array(GRAINS);
    this._fieldCanvas = document.createElement('canvas');
    this._fieldDirty = true;
    this.scatter();
  }

  /* Throw the sand back on evenly, as if re-sprinkling the plate. */
  PlateView.prototype.scatter = function () {
    for (var i = 0; i < GRAINS; i++) {
      var x, y;
      do {
        x = Math.random();
        y = Math.random();
      } while (this.round && (x - 0.5) * (x - 0.5) + (y - 0.5) * (y - 0.5) > 0.25);
      this.x[i] = x;
      this.y[i] = y;
    }
  };

  /* A round plate keeps its sand inside a circle. Field values below zero mean "off the plate". */
  PlateView.prototype.setRound = function (round) {
    if (this.round === !!round) return;
    this.round = !!round;
    this.scatter();
    this._fieldDirty = true;
  };

  PlateView.prototype.setField = function (field, size) {
    this.field = field;
    this.size = size;
    this._fieldDirty = true;
  };

  PlateView.prototype.setMode = function (mode) {
    this.mode = mode === 'field' ? 'field' : 'sand';
    this._fieldDirty = true;
  };

  PlateView.prototype.setInk = function (rgb) {
    this.ink = rgb;
    this._fieldDirty = true;
  };

  PlateView.prototype.frame = function () {
    if (!this.field) return;
    if (this.mode === 'sand') this._frameSand();
    else if (this._fieldDirty) this._drawField();
  };

  PlateView.prototype._frameSand = function () {
    var f = this.field, n = this.size;
    var x = this.x, y = this.y;
    var data = this.image.data;
    var r = this.ink[0], g = this.ink[1], b = this.ink[2];
    var TWO_PI = Math.PI * 2;
    var round = this.round;
    data.fill(0);

    for (var i = 0; i < GRAINS; i++) {
      var gx = x[i], gy = y[i];
      var amp = f[((gy * n) | 0) * n + ((gx * n) | 0)];
      if (amp > AMP_CAP) amp = AMP_CAP;
      else if (amp < 0) amp = 1;          // a rim cell sampled just off the plate
      var step = STEP * amp;
      var angle = Math.random() * TWO_PI;
      var nx = gx + Math.cos(angle) * step;
      var ny = gy + Math.sin(angle) * step;
      // Grains stay on the plate rather than falling off it.
      if (round) {
        if ((nx - 0.5) * (nx - 0.5) + (ny - 0.5) * (ny - 0.5) > 0.25) { nx = gx; ny = gy; }
      } else {
        if (nx < 0) nx = -nx; else if (nx >= 1) nx = 1.999999 - nx;
        if (ny < 0) ny = -ny; else if (ny >= 1) ny = 1.999999 - ny;
      }
      gx = nx; gy = ny;
      x[i] = gx; y[i] = gy;

      var px = (gx * (RES - 1)) | 0;
      var py = (gy * (RES - 1)) | 0;
      var o = (py * RES + px) * 4;
      plot(data, o, r, g, b);
      plot(data, o + 4, r, g, b);
      plot(data, o + RES * 4, r, g, b);
      plot(data, o + RES * 4 + 4, r, g, b);
    }
    this.ctx.putImageData(this.image, 0, 0);
  };

  function plot(data, o, r, g, b) {
    if (o + 3 >= data.length) return;
    data[o] = r; data[o + 1] = g; data[o + 2] = b;
    var a = data[o + 3] + 85;
    data[o + 3] = a > 255 ? 255 : a;
  }

  PlateView.prototype._drawField = function () {
    var f = this.field, n = this.size;
    var fc = this._fieldCanvas;
    if (fc.width !== n) { fc.width = n; fc.height = n; }
    var fctx = fc.getContext('2d');
    var img = fctx.createImageData(n, n);
    var d = img.data;
    var r = this.ink[0], g = this.ink[1], b = this.ink[2];
    for (var i = 0; i < f.length; i++) {
      var v = f[i] / LINE_WIDTH;
      var o = i * 4;
      d[o] = r; d[o + 1] = g; d[o + 2] = b;
      d[o + 3] = v < 0 ? 0 : 255 * Math.exp(-v * v);
    }
    fctx.putImageData(img, 0, 0);
    this.ctx.clearRect(0, 0, RES, RES);
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = 'high';
    this.ctx.drawImage(fc, 0, 0, RES, RES);
    this._fieldDirty = false;
  };

  SP.PlateView = PlateView;
})(typeof self !== 'undefined' ? self : this);
