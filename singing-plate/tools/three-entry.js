/*
 * Entry point for the vendored Three.js bundle.
 *
 * Three.js ships as ES modules, which browsers refuse to load from a page
 * opened straight off disk. `npm run vendor` bundles just the parts the 3D
 * lab uses into one classic script, vendor/three.bundle.js, exposing a
 * global THREE. Only needed when upgrading Three.js or using a new class.
 */
export {
  AmbientLight,
  BufferAttribute,
  BufferGeometry,
  Color,
  DirectionalLight,
  DoubleSide,
  Group,
  HemisphereLight,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer
} from 'three';
export { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
