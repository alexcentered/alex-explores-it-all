/*
 * ui/viewer.js -- the 3D viewport.
 *
 * A thin wrapper round Three.js: one mesh, soft studio lighting, orbit and
 * zoom. It is handed finished geometry ({ positions, indices } in mm, z up)
 * and knows nothing about waves. If the browser has no WebGL the viewer
 * reports that and the rest of the lab, export included, carries on.
 */
(function (root) {
  'use strict';

  var SP = root.SP = root.SP || {};
  var THREE = root.THREE;
  var FIT = 2.25;           // the form's corner-to-corner size, in scene units
  var HOME = [2.1, -2.7, 1.9];

  function Viewer(container) {
    this.ok = false;
    this.container = container;
    if (!THREE) return;

    var renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch (e) {
      return;                // no WebGL here
    }
    this.renderer = renderer;
    renderer.setPixelRatio(Math.min(root.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);
    renderer.domElement.setAttribute('aria-hidden', 'true');

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(32, 1, 0.05, 50);
    this.camera.up.set(0, 0, 1);          // printers and this lab agree: z is up
    this.camera.position.set(HOME[0], HOME[1], HOME[2]);

    this.controls = new THREE.OrbitControls(this.camera, renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 1.2;
    this.controls.maxDistance = 9;
    this.controls.target.set(0, 0, 0);

    // A low key light rakes across the surface so shallow relief still reads.
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x1a1a1a, 0.55);
    this.key = new THREE.DirectionalLight(0xffffff, 3.1);
    this.key.position.set(3.5, -1.5, 2.4);
    this.fill = new THREE.DirectionalLight(0xffffff, 0.55);
    this.fill.position.set(-4, -3, 3);
    this.scene.add(this.hemi, this.key, this.fill);

    this.material = new THREE.MeshStandardMaterial({
      color: 0xdcdcdc, roughness: 0.62, metalness: 0.08, side: THREE.DoubleSide
    });
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.material);
    this.scene.add(this.mesh);

    var self = this;
    this._resize = function () {
      var w = container.clientWidth, h = container.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      self.camera.aspect = w / h;
      self.camera.updateProjectionMatrix();
    };
    if (root.ResizeObserver) new ResizeObserver(this._resize).observe(container);
    else root.addEventListener('resize', this._resize);
    this._resize();
    this.ok = true;
  }

  /* Show new geometry. fit = true recentres and rescales the view to it. */
  Viewer.prototype.setMesh = function (data, fit) {
    if (!this.ok) return;
    var geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
    geometry.setIndex(new THREE.BufferAttribute(data.indices, 1));
    geometry.computeVertexNormals();
    this.mesh.geometry.dispose();
    this.mesh.geometry = geometry;
    if (fit) this.fit(data.positions);
  };

  /* Same shape, moved vertices: the cheap path used while animating. */
  Viewer.prototype.updatePositions = function (positions) {
    if (!this.ok) return;
    var attr = this.mesh.geometry.getAttribute('position');
    if (!attr || attr.array.length !== positions.length) return;
    attr.array.set(positions);
    attr.needsUpdate = true;
    this.mesh.geometry.computeVertexNormals();
  };

  Viewer.prototype.fit = function (positions) {
    var min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (var p = 0; p < positions.length; p += 3) {
      for (var a = 0; a < 3; a++) {
        var v = positions[p + a];
        if (v < min[a]) min[a] = v;
        if (v > max[a]) max[a] = v;
      }
    }
    if (!isFinite(min[0])) return;
    // Fitting the diagonal keeps a cube and a flat plate both inside the frame.
    var dx = max[0] - min[0], dy = max[1] - min[1], dz = max[2] - min[2];
    var s = FIT / (Math.sqrt(dx * dx + dy * dy + dz * dz) || 1);
    this.mesh.scale.setScalar(s);
    this.mesh.position.set(
      -(min[0] + max[0]) / 2 * s,
      -(min[1] + max[1]) / 2 * s,
      -(min[2] + max[2]) / 2 * s);
  };

  Viewer.prototype.resetView = function () {
    if (!this.ok) return;
    this.camera.position.set(HOME[0], HOME[1], HOME[2]);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
  };

  Viewer.prototype.setTheme = function (theme) {
    if (!this.ok) return;
    var light = theme === 'light';
    this.material.color.set(light ? 0x8c8c8c : 0xdcdcdc);
    this.hemi.groundColor.set(light ? 0x8a8a8a : 0x1a1a1a);
    this.hemi.intensity = light ? 0.9 : 0.55;
  };

  Viewer.prototype.render = function () {
    if (!this.ok) return;
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };

  SP.Viewer = Viewer;
})(typeof self !== 'undefined' ? self : this);
