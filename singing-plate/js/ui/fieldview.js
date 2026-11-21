/*
 * ui/fieldview.js -- field lines in the 3D viewport.
 *
 * Draws what core/fields.js traced: the lines of the field, the wire or
 * coil that makes it, and bright pulses that travel along each line in the
 * direction the field points. It sits inside an SP.Viewer, which supplies
 * the camera, the orbit controls and the lights.
 */
(function (root) {
  'use strict';

  var SP = root.SP = root.SP || {};
  var THREE = root.THREE;

  var PULSE_GAP = 1.5;        // distance between pulses along a line, in ring radii
  var PULSE_WIDTH = 0.11;
  var WINDINGS = 44;          // turns of wire drawn round the former

  function torus(R, r, around, across) {
    var positions = new Float32Array(around * across * 3);
    var indices = new Uint32Array(around * across * 6);
    var p = 0, q = 0, i, j;
    for (i = 0; i < around; i++) {
      var u = 2 * Math.PI * i / around;
      for (j = 0; j < across; j++) {
        var v = 2 * Math.PI * j / across;
        var d = R + r * Math.cos(v);
        positions[p++] = d * Math.cos(u);
        positions[p++] = d * Math.sin(u);
        positions[p++] = r * Math.sin(v);
      }
    }
    for (i = 0; i < around; i++) {
      for (j = 0; j < across; j++) {
        var a = i * across + j, b = ((i + 1) % around) * across + j;
        var c = i * across + (j + 1) % across, e = ((i + 1) % around) * across + (j + 1) % across;
        indices[q++] = a; indices[q++] = b; indices[q++] = c;
        indices[q++] = c; indices[q++] = b; indices[q++] = e;
      }
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    g.setIndex(new THREE.BufferAttribute(indices, 1));
    g.computeVertexNormals();
    return g;
  }

  /* The winding: one wire going round and round the former as it travels round the ring. */
  function winding(r) {
    var steps = WINDINGS * 28;
    var out = new Float32Array(steps * 6);
    function at(k, to) {
      var u = 2 * Math.PI * k / steps, v = u * WINDINGS;
      var d = 1 + r * Math.cos(v);
      out[to] = d * Math.cos(u); out[to + 1] = d * Math.sin(u); out[to + 2] = r * Math.sin(v);
    }
    for (var k = 0; k < steps; k++) { at(k, k * 6); at(k + 1, k * 6 + 3); }
    return out;
  }

  function FieldView(viewer) {
    this.viewer = viewer;
    this.ok = !!(viewer && viewer.ok && THREE);
    this.light = false;
    this.count = 0;
    if (!this.ok) return;
    this.group = new THREE.Group();
    viewer.scene.add(this.group);
    this.lineMaterial = new THREE.LineBasicMaterial({ vertexColors: true });
    this.wireMaterial = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.4, metalness: 0.3 });
    this.formerMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff, roughness: 0.9, metalness: 0, transparent: true, opacity: 0.07,
      depthWrite: false, side: THREE.DoubleSide
    });
    this.windingMaterial = new THREE.LineBasicMaterial({ color: 0x6a6a6a });
  }

  FieldView.prototype.clear = function () {
    while (this.group.children.length) {
      var child = this.group.children[0];
      this.group.remove(child);
      child.geometry.dispose();
    }
  };

  /*
   * kind    'ring' | 'coil' | 'both'
   * lines   [{ points: Float32Array, closed }] from core/fields.js
   * tube    the former's tube radius
   */
  FieldView.prototype.show = function (kind, lines, tube) {
    if (!this.ok) return;
    this.clear();

    // Each line becomes a run of two-point segments, so every vertex can carry its own brightness.
    var segments = 0, i, k;
    for (i = 0; i < lines.length; i++) segments += lines[i].points.length / 3 - 1;
    var positions = new Float32Array(segments * 6);
    var along = new Float32Array(segments * 2);        // distance along its line, with a per-line offset
    var p = 0, a = 0;
    for (i = 0; i < lines.length; i++) {
      var pts = lines[i].points, n = pts.length / 3;
      var s = (i * 0.618034) % 1 * PULSE_GAP;           // stagger the lines so the pulses do not march in step
      for (k = 0; k < n - 1; k++) {
        var x0 = pts[k * 3], y0 = pts[k * 3 + 1], z0 = pts[k * 3 + 2];
        var x1 = pts[k * 3 + 3], y1 = pts[k * 3 + 4], z1 = pts[k * 3 + 5];
        var len = Math.sqrt((x1 - x0) * (x1 - x0) + (y1 - y0) * (y1 - y0) + (z1 - z0) * (z1 - z0));
        positions[p++] = x0; positions[p++] = y0; positions[p++] = z0;
        positions[p++] = x1; positions[p++] = y1; positions[p++] = z1;
        along[a++] = s; s += len; along[a++] = s;
      }
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.colors = new Float32Array(segments * 6);
    g.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    this.along = along;
    this.lineGeometry = g;
    this.group.add(new THREE.LineSegments(g, this.lineMaterial));
    this.count = segments;

    if (kind !== 'coil') this.group.add(new THREE.Mesh(torus(1, kind === 'ring' ? 0.022 : 0.014, 96, 10), this.wireMaterial));
    if (kind !== 'ring') {
      this.group.add(new THREE.Mesh(torus(1, tube, 72, 28), this.formerMaterial));
      var w = new THREE.BufferGeometry();
      w.setAttribute('position', new THREE.BufferAttribute(winding(tube * 1.012), 3));
      this.group.add(new THREE.LineSegments(w, this.windingMaterial));
      this.dimWinding = kind === 'both';       // with helices inside, the winding steps back
      this.tintWinding();
    }

    // The ring's own field reaches far out; the coil's stays inside its former.
    this.group.scale.setScalar(kind === 'ring' ? 0.42 : 0.8);
    this.paint(this.time || 0);
  };

  /* Move the pulses to where they are at time t (seconds). */
  FieldView.prototype.paint = function (t) {
    if (!this.ok || !this.colors) return;
    this.time = t;
    var base = this.light ? 0.66 : 0.3, peak = this.light ? 0.02 : 1;
    var colors = this.colors, along = this.along;
    var shift = t * 0.55;
    for (var v = 0, c = 0; v < along.length; v++, c += 3) {
      var f = (along[v] - shift) / PULSE_GAP;
      f = f - Math.floor(f) - 0.5;
      var w = Math.exp(-f * f / (2 * PULSE_WIDTH * PULSE_WIDTH));
      var value = base + (peak - base) * w;
      colors[c] = colors[c + 1] = colors[c + 2] = value;
    }
    this.lineGeometry.getAttribute('color').needsUpdate = true;
  };

  FieldView.prototype.tintWinding = function () {
    var dim = this.dimWinding;
    this.windingMaterial.color.set(this.light ? (dim ? 0xcfcfcf : 0xa4a4a4) : (dim ? 0x2e2e2e : 0x5c5c5c));
  };

  FieldView.prototype.setTheme = function (theme) {
    if (!this.ok) return;
    this.light = theme === 'light';
    this.wireMaterial.color.set(this.light ? 0x1c1c1c : 0xf2f2f2);
    this.formerMaterial.color.set(this.light ? 0x000000 : 0xffffff);
    this.formerMaterial.opacity = this.light ? 0.05 : 0.07;
    this.tintWinding();
    this.paint(this.time || 0);
  };

  SP.FieldView = FieldView;
})(typeof self !== 'undefined' ? self : this);
