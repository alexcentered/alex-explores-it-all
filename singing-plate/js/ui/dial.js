/*
 * ui/dial.js -- the coarse frequency dial.
 *
 * A 270 degree rotary control drawn in SVG. It works in a normalised
 * 0..1 position; the app maps that to hertz on a log scale. Drag it,
 * scroll over it, or focus it and use the arrow keys.
 */
(function (root) {
  'use strict';

  var SP = root.SP = root.SP || {};
  var NS = 'http://www.w3.org/2000/svg';
  var SWEEP_DEG = 270;
  var START_DEG = -135;      // 0 degrees is straight up, clockwise positive
  var CX = 100, CY = 100;

  function el(name, attrs, parent) {
    var node = document.createElementNS(NS, name);
    for (var k in attrs) node.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(node);
    return node;
  }

  function polar(radius, deg) {
    var rad = (deg - 90) * Math.PI / 180;
    return [CX + radius * Math.cos(rad), CY + radius * Math.sin(rad)];
  }

  function arcPath(radius, fromDeg, toDeg) {
    var a = polar(radius, fromDeg), b = polar(radius, toDeg);
    var large = toDeg - fromDeg > 180 ? 1 : 0;
    return 'M' + a[0].toFixed(2) + ' ' + a[1].toFixed(2) +
      ' A' + radius + ' ' + radius + ' 0 ' + large + ' 1 ' + b[0].toFixed(2) + ' ' + b[1].toFixed(2);
  }

  /*
   * opts.ticks:   [{ t, label? }]  positions 0..1; labelled ticks are major
   * opts.onInput: function (t)     called while the operator turns the dial
   * opts.onStep:  function (dir, big)  wheel / keyboard steps
   */
  function Dial(svg, opts) {
    this.svg = svg;
    this.opts = opts;
    this.t = 0;
    this._dragging = false;

    svg.setAttribute('viewBox', '0 0 200 200');
    el('path', { d: arcPath(78, START_DEG, START_DEG + SWEEP_DEG), class: 'dial-track' }, svg);
    this._arc = el('path', { d: '', class: 'dial-arc' }, svg);

    var ticks = el('g', { class: 'dial-ticks' }, svg);
    (opts.ticks || []).forEach(function (tick) {
      var deg = START_DEG + SWEEP_DEG * tick.t;
      var major = !!tick.label;
      var a = polar(84, deg), b = polar(major ? 92 : 88, deg);
      el('line', {
        x1: a[0].toFixed(2), y1: a[1].toFixed(2), x2: b[0].toFixed(2), y2: b[1].toFixed(2),
        class: major ? 'dial-tick major' : 'dial-tick'
      }, ticks);
      if (major) {
        var p = polar(99, deg);
        var text = el('text', {
          x: p[0].toFixed(2), y: p[1].toFixed(2), class: 'dial-label',
          'text-anchor': 'middle', 'dominant-baseline': 'middle'
        }, ticks);
        text.textContent = tick.label;
      }
    });

    el('circle', { cx: CX, cy: CY, r: 62, class: 'dial-knob' }, svg);
    el('circle', { cx: CX, cy: CY, r: 50, class: 'dial-cap' }, svg);
    this._pointer = el('g', { class: 'dial-pointer' }, svg);
    el('line', { x1: CX, y1: CY - 60, x2: CX, y2: CY - 38 }, this._pointer);

    this._bind();
    this.set(0);
  }

  Dial.prototype.set = function (t) {
    this.t = Math.min(1, Math.max(0, t));
    var deg = START_DEG + SWEEP_DEG * this.t;
    this._pointer.setAttribute('transform', 'rotate(' + deg.toFixed(2) + ' ' + CX + ' ' + CY + ')');
    this._arc.setAttribute('d', this.t > 0.001 ? arcPath(78, START_DEG, deg) : '');
  };

  Dial.prototype._positionFromEvent = function (e) {
    var rect = this.svg.getBoundingClientRect();
    var dx = e.clientX - (rect.left + rect.width / 2);
    var dy = e.clientY - (rect.top + rect.height / 2);
    var deg = Math.atan2(dx, -dy) * 180 / Math.PI;       // -180..180, 0 = up
    var t = (deg - START_DEG) / SWEEP_DEG;
    // The pointer is in the gap at the bottom: snap to whichever end is nearer.
    if (t < 0 || t > 1) t = deg < 0 ? 0 : 1;
    return t;
  };

  Dial.prototype._bind = function () {
    var self = this;
    var svg = this.svg;

    svg.addEventListener('pointerdown', function (e) {
      if (e.button !== undefined && e.button !== 0) return;
      self._dragging = true;
      svg.setPointerCapture(e.pointerId);
      svg.focus({ preventScroll: true });
      var t = self._positionFromEvent(e);
      self.opts.onInput(t);
      e.preventDefault();
    });

    svg.addEventListener('pointermove', function (e) {
      if (!self._dragging) return;
      var t = self._positionFromEvent(e);
      // Crossing the bottom gap would otherwise flip min <-> max in one move.
      if (Math.abs(t - self.t) > 0.5) return;
      self.opts.onInput(t);
    });

    function release(e) {
      if (!self._dragging) return;
      self._dragging = false;
      if (svg.hasPointerCapture && svg.hasPointerCapture(e.pointerId)) svg.releasePointerCapture(e.pointerId);
    }
    svg.addEventListener('pointerup', release);
    svg.addEventListener('pointercancel', release);

    svg.addEventListener('wheel', function (e) {
      e.preventDefault();
      self.opts.onStep(e.deltaY < 0 ? 1 : -1, e.shiftKey);
    }, { passive: false });

    svg.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowUp') { self.opts.onStep(1, true); e.preventDefault(); }
      else if (e.key === 'ArrowDown') { self.opts.onStep(-1, true); e.preventDefault(); }
      else if (e.key === 'Home') { self.opts.onInput(0); e.preventDefault(); }
      else if (e.key === 'End') { self.opts.onInput(1); e.preventDefault(); }
    });
  };

  SP.Dial = Dial;
})(typeof self !== 'undefined' ? self : this);
