/*
 * ui/ancientview.js -- ancient structures in the 3D viewport.
 *
 * Draws a model from core/ancient.js: solid stone, see-through volumes
 * (a room's air, a mound, the body of a pyramid) with their outlines, and
 * optionally a level sheet showing how loud a room mode is at each place.
 * It sits inside an SP.Viewer, which supplies camera, controls and lights.
 */
(function (root) {
  'use strict';

  var SP = root.SP = root.SP || {};
  var THREE = root.THREE;
  var FIT = 2.75;              // the model's corner-to-corner size, in scene units

  function geometry(mesh) {
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3));
    g.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
    g.computeVertexNormals();
    return g;
  }

  function AncientView(viewer) {
    this.viewer = viewer;
    this.ok = !!(viewer && viewer.ok && THREE);
    this.light = false;
    this.sheet = null;
    if (!this.ok) return;
    this.group = new THREE.Group();
    viewer.scene.add(this.group);
    this.solidMaterial = new THREE.MeshStandardMaterial({ color: 0xe2e2e2, roughness: 0.78, metalness: 0.02, side: THREE.DoubleSide });
    this.ghostMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff, roughness: 0.9, metalness: 0, transparent: true, opacity: 0.07,
      depthWrite: false, side: THREE.DoubleSide
    });
    this.groundMaterial = new THREE.MeshStandardMaterial({ color: 0x4a4a4a, roughness: 0.95, metalness: 0, side: THREE.DoubleSide });
    this.edgeMaterial = new THREE.LineBasicMaterial({ color: 0x6e6e6e });
    this.sheetMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, side: THREE.DoubleSide });
  }

  AncientView.prototype.clear = function () {
    while (this.group.children.length) {
      var child = this.group.children[0];
      this.group.remove(child);
      child.geometry.dispose();
    }
    this.sheet = null;
  };

  /* model: the result of SP.ancient.model(id). */
  AncientView.prototype.show = function (model) {
    if (!this.ok) return;
    this.clear();
    if (model.ground.indices.length) this.group.add(new THREE.Mesh(geometry(model.ground), this.groundMaterial));
    if (model.solid.indices.length) this.group.add(new THREE.Mesh(geometry(model.solid), this.solidMaterial));
    if (model.ghost.indices.length) this.group.add(new THREE.Mesh(geometry(model.ghost), this.ghostMaterial));
    if (model.edges.length) {
      var e = new THREE.BufferGeometry();
      e.setAttribute('position', new THREE.BufferAttribute(model.edges, 3));
      this.group.add(new THREE.LineSegments(e, this.edgeMaterial));
    }
    var dx = model.max[0] - model.min[0], dy = model.max[1] - model.min[1], dz = model.max[2] - model.min[2];
    var s = FIT / (Math.sqrt(dx * dx + dy * dy + dz * dz) || 1);
    this.group.scale.setScalar(s);
    this.group.position.set(
      -(model.min[0] + model.max[0]) / 2 * s,
      -(model.min[1] + model.max[1]) / 2 * s,
      -(model.min[2] + model.max[2]) / 2 * s);
  };

  /* sheet: the result of SP.ancient.modeSlice(...), or null to take it away. */
  AncientView.prototype.setSheet = function (sheet) {
    if (!this.ok) return;
    if (this.sheet) {
      this.group.remove(this.sheet);
      this.sheet.geometry.dispose();
      this.sheet = null;
    }
    this.values = sheet ? sheet.values : null;
    if (!sheet) return;
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(sheet.positions, 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(sheet.values.length * 3), 3));
    g.setIndex(new THREE.BufferAttribute(sheet.indices, 1));
    g.computeVertexNormals();
    this.sheet = new THREE.Mesh(g, this.sheetMaterial);
    this.group.add(this.sheet);
    this.paintSheet();
  };

  /* Loud places are drawn in the theme's ink: bright on dark, dark on light. */
  AncientView.prototype.paintSheet = function () {
    if (!this.sheet || !this.values) return;
    var attr = this.sheet.geometry.getAttribute('color'), c = attr.array;
    for (var i = 0; i < this.values.length; i++) {
      var v = this.values[i];
      var shade = this.light ? 0.97 - 0.93 * v : 0.035 + 0.965 * v;
      c[i * 3] = c[i * 3 + 1] = c[i * 3 + 2] = shade;
    }
    attr.needsUpdate = true;
  };

  AncientView.prototype.setTheme = function (theme) {
    if (!this.ok) return;
    this.light = theme === 'light';
    this.solidMaterial.color.set(this.light ? 0x8a8a8a : 0xe2e2e2);
    this.groundMaterial.color.set(this.light ? 0xc9c9c9 : 0x4a4a4a);
    this.ghostMaterial.color.set(this.light ? 0x000000 : 0xffffff);
    this.ghostMaterial.opacity = this.light ? 0.05 : 0.07;
    this.edgeMaterial.color.set(this.light ? 0x9a9a9a : 0x6e6e6e);
    this.paintSheet();
  };

  SP.AncientView = AncientView;
})(typeof self !== 'undefined' ? self : this);
