/*
 * ui/geometryview.js -- solids, waves and fractals in the 3D viewport.
 *
 * Draws what core/solids.js works out: a flat-faced solid or fractal, a
 * ball whose surface rises and falls with a standing wave, and the edges
 * of a solid and of its dual as wire cages round the wave. It sits inside
 * an SP.Viewer, which supplies camera, controls and lights.
 */
(function (root) {
  'use strict';

  var SP = root.SP = root.SP || {};
  var THREE = root.THREE;
  var BALL = 0.8;             // radius of the ball when the wave is passing through level
  var SWING = 0.28;           // how far a corner of the solid rises, as a share of that radius

  function GeometryView(viewer) {
    this.viewer = viewer;
    this.ok = !!(viewer && viewer.ok && THREE);
    this.light = false;
    this.wave = null;
    if (!this.ok) return;
    this.group = new THREE.Group();
    viewer.scene.add(this.group);
    this.flatMaterial = new THREE.MeshStandardMaterial({ color: 0xdedede, roughness: 0.7, metalness: 0.04, side: THREE.DoubleSide });
    this.waveMaterial = new THREE.MeshStandardMaterial({ color: 0xdedede, roughness: 0.5, metalness: 0.08 });
    // The cages are drawn over everything: their edges are straight, so between corners
    // they pass inside the bulging surface and would otherwise be hidden.
    this.edgeMaterial = new THREE.LineBasicMaterial({ color: 0xffffff, depthTest: false });
    this.dualMaterial = new THREE.LineBasicMaterial({ color: 0x777777, depthTest: false });
    this.sparkMaterial = new THREE.LineBasicMaterial({ vertexColors: true });
    this.group.scale.setScalar(0.82);
  }

  GeometryView.prototype.clear = function () {
    if (!this.ok) return;
    while (this.group.children.length) {
      var child = this.group.children[0];
      this.group.remove(child);
      child.geometry.dispose();
    }
    this.wave = null;
    this.spark = null;
  };

  /* A flat-faced mesh: { positions, indices }. */
  GeometryView.prototype.addFlat = function (mesh) {
    if (!this.ok) return;
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3));
    g.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
    g.computeVertexNormals();
    this.group.add(new THREE.Mesh(g, this.flatMaterial));
  };

  /* Line segments (x y z pairs), scaled about the centre. dim: drawn fainter, for the dual. */
  GeometryView.prototype.addEdges = function (edges, scale, dim) {
    if (!this.ok) return;
    var p = new Float32Array(edges.length);
    for (var i = 0; i < edges.length; i++) p[i] = edges[i] * scale;
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    var lines = new THREE.LineSegments(g, dim ? this.dualMaterial : this.edgeMaterial);
    lines.renderOrder = dim ? 1 : 2;
    this.group.add(lines);
  };

  /*
   * A ball carrying a wave.
   *   ball     from SP.solids.sphere()
   *   values   the wave's height at each corner of the ball, +1 at the solid's corners
   */
  GeometryView.prototype.addWave = function (ball, values) {
    if (!this.ok) return;
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(ball.directions.length), 3));
    g.setIndex(new THREE.BufferAttribute(ball.indices, 1));
    this.wave = { geometry: g, directions: ball.directions, values: values };
    this.group.add(new THREE.Mesh(g, this.waveMaterial));
    this.setSwing(1);
  };

  /* Where the wave is in its cycle: +1 bulging at the solid's corners, -1 at its dual's, 0 a plain ball. */
  GeometryView.prototype.setSwing = function (c) {
    if (!this.ok || !this.wave) return;
    var w = this.wave, attr = w.geometry.getAttribute('position'), p = attr.array, d = w.directions;
    for (var i = 0, k = 0; i < w.values.length; i++, k += 3) {
      var r = BALL * (1 + SWING * c * w.values[i]);
      p[k] = d[k] * r; p[k + 1] = d[k + 1] * r; p[k + 2] = d[k + 2] * r;
    }
    attr.needsUpdate = true;
    w.geometry.computeVertexNormals();
  };

  /*
   * A flat branching pattern, stood upright.
   *   bonds   { positions: x y pairs in -1 .. 1, share: 0 .. 1 per segment } from SP.growth.bonds()
   * Segments carrying more of the pattern are drawn stronger, as the trunk
   * of a real discharge carries more current. Replaces any earlier spark.
   */
  GeometryView.prototype.setSpark = function (bonds) {
    if (!this.ok) return;
    if (this.spark) { this.group.remove(this.spark); this.spark.geometry.dispose(); this.spark = null; }
    var count = bonds.share.length, size = 1.05;
    var p = new Float32Array(count * 6), c = new Float32Array(count * 6);
    var base = this.light ? 0.66 : 0.36, peak = this.light ? 0 : 1;
    for (var k = 0; k < count; k++) {
      p[k * 6] = bonds.positions[k * 4] * size; p[k * 6 + 2] = bonds.positions[k * 4 + 1] * size;
      p[k * 6 + 3] = bonds.positions[k * 4 + 2] * size; p[k * 6 + 5] = bonds.positions[k * 4 + 3] * size;
      var shade = base + (peak - base) * Math.pow(bonds.share[k], 0.3);
      for (var j = 0; j < 6; j++) c[k * 6 + j] = shade;
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    this.spark = new THREE.LineSegments(g, this.sparkMaterial);
    this.group.add(this.spark);
  };

  /* The electrode the spark grows toward: a ring round it, or a line beneath it. */
  GeometryView.prototype.addElectrode = function (shape) {
    if (!this.ok) return;
    var size = 1.05, pts = [];
    if (shape === 'plane') pts.push(-size, 0, -size, size, 0, -size);
    else {
      for (var i = 0; i < 96; i++) {
        var a = 2 * Math.PI * i / 96, b = 2 * Math.PI * (i + 1) / 96;
        pts.push(size * Math.cos(a), 0, size * Math.sin(a), size * Math.cos(b), 0, size * Math.sin(b));
      }
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pts), 3));
    this.group.add(new THREE.LineSegments(g, this.dualMaterial));
  };

  /* How far from the centre the wave reaches where its height is `value`, at the top of its swing. */
  GeometryView.reach = function (value) {
    return BALL * (1 + SWING * Math.abs(value));
  };

  GeometryView.prototype.setTheme = function (theme) {
    if (!this.ok) return;
    this.light = theme === 'light';
    this.flatMaterial.color.set(this.light ? 0x8f8f8f : 0xdedede);
    this.waveMaterial.color.set(this.light ? 0x8f8f8f : 0xdedede);
    this.edgeMaterial.color.set(this.light ? 0x000000 : 0xffffff);
    this.dualMaterial.color.set(this.light ? 0x9c9c9c : 0x777777);
  };

  SP.GeometryView = GeometryView;
})(typeof self !== 'undefined' ? self : this);
