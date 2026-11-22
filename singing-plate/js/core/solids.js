/*
 * core/solids.js -- the five regular solids, the waves that share their
 * symmetry, and two fractals.
 *
 * 1. The Platonic solids. Each is worked out from its corners alone: the
 *    faces are found as the flat sides of the shape the corners enclose,
 *    and edges, angles and the dual solid follow from the faces. Nothing
 *    about them is typed in except the corners of four of them; the fifth,
 *    the dodecahedron, is built as the dual of the icosahedron.
 *
 * 2. Waves on a sphere. A sphere (a drop of water, a bubble, a bell) has
 *    standing waves numbered by a degree l. For most l the pattern can be
 *    arranged to have the full symmetry of a Platonic solid. The lowest
 *    that can: l = 3 for the tetrahedron, 4 for the cube and octahedron,
 *    6 for the dodecahedron and icosahedron. Such a wave is the sum of
 *    simple one-axis waves, one along each of the solid's main axes.
 *
 *    At one extreme of its swing the wave bulges at the corners of a
 *    solid; half a cycle later it bulges at the corners of that solid's
 *    dual. A cube and an octahedron are the two halves of one vibration.
 *
 * 3. Fractals. The Sierpinski tetrahedron and the Menger sponge: shapes
 *    made of smaller copies of themselves, with a dimension that need not
 *    be a whole number.
 *
 * Pure functions only. Solids have their corners at distance 1 from the centre.
 */
(function (root) {
  'use strict';

  var PHI = (1 + Math.sqrt(5)) / 2;         // the golden ratio
  var EPS = 1e-9;

  /* ------------------------------------------------------------ vectors */

  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function length(a) { return Math.sqrt(dot(a, a)); }
  function unit(a) { var n = length(a); return [a[0] / n, a[1] / n, a[2] / n]; }

  /* ------------------------------------------------------------- solids */

  /*
   * The flat faces of the shape enclosed by a set of corners. A face is a
   * plane through three corners with every other corner on one side of
   * it. Each face is returned as corner numbers, in order round the face,
   * anticlockwise seen from outside.
   */
  function facesOf(vertices) {
    var n = vertices.length, seen = {}, faces = [];
    for (var i = 0; i < n; i++) {
      for (var j = i + 1; j < n; j++) {
        for (var k = j + 1; k < n; k++) {
          var normal = cross(sub(vertices[j], vertices[i]), sub(vertices[k], vertices[i]));
          if (length(normal) < EPS) continue;
          normal = unit(normal);
          var offset = dot(normal, vertices[i]);
          var above = false, below = false, on = [];
          for (var m = 0; m < n; m++) {
            var d = dot(normal, vertices[m]) - offset;
            if (d > 1e-7) above = true;
            else if (d < -1e-7) below = true;
            else on.push(m);
          }
          if (above && below) continue;
          var key = on.join(',');
          if (seen[key]) continue;
          seen[key] = true;
          if (above) normal = [-normal[0], -normal[1], -normal[2]];       // make it point outward
          faces.push(order(vertices, on, normal));
        }
      }
    }
    return faces;
  }

  /* Put the corners of one face in order round it, anticlockwise about the outward normal. */
  function order(vertices, list, normal) {
    var c = [0, 0, 0];
    list.forEach(function (i) { c[0] += vertices[i][0]; c[1] += vertices[i][1]; c[2] += vertices[i][2]; });
    c = [c[0] / list.length, c[1] / list.length, c[2] / list.length];
    var u = unit(sub(vertices[list[0]], c)), v = cross(normal, u);
    return list.map(function (i) {
      var r = sub(vertices[i], c);
      return { i: i, a: Math.atan2(dot(r, v), dot(r, u)) };
    }).sort(function (p, q) { return p.a - q.a; }).map(function (p) { return p.i; });
  }

  function edgesOf(faces) {
    var seen = {}, edges = [];
    faces.forEach(function (f) {
      for (var i = 0; i < f.length; i++) {
        var a = f[i], b = f[(i + 1) % f.length], key = Math.min(a, b) + '-' + Math.max(a, b);
        if (!seen[key]) { seen[key] = true; edges.push([Math.min(a, b), Math.max(a, b)]); }
      }
    });
    return edges;
  }

  function faceNormal(vertices, face) {
    return unit(cross(sub(vertices[face[1]], vertices[face[0]]), sub(vertices[face[2]], vertices[face[0]])));
  }

  function faceCentre(vertices, face) {
    var c = [0, 0, 0];
    face.forEach(function (i) { c[0] += vertices[i][0]; c[1] += vertices[i][1]; c[2] += vertices[i][2]; });
    return [c[0] / face.length, c[1] / face.length, c[2] / face.length];
  }

  /* The angle inside the solid between two faces that share an edge, in degrees. */
  function dihedral(vertices, faces) {
    var a = faces[0];
    for (var i = 1; i < faces.length; i++) {
      var shared = faces[i].filter(function (v) { return a.indexOf(v) >= 0; }).length;
      if (shared === 2) {
        var c = dot(faceNormal(vertices, a), faceNormal(vertices, faces[i]));
        return 180 - Math.acos(Math.max(-1, Math.min(1, c))) * 180 / Math.PI;
      }
    }
    return NaN;
  }

  /* The dual: a corner in the middle of each face. Scaled so its corners are at distance 1. */
  function dualVertices(vertices, faces) {
    return faces.map(function (f) { return unit(faceCentre(vertices, f)); });
  }

  function complete(solid) {
    solid.faces = facesOf(solid.vertices);
    solid.edges = edgesOf(solid.faces);
    solid.V = solid.vertices.length;
    solid.E = solid.edges.length;
    solid.F = solid.faces.length;
    solid.p = solid.faces[0].length;                         // corners on each face
    solid.q = 2 * solid.E / solid.V;                         // faces (and edges) meeting at each corner
    solid.dihedral = dihedral(solid.vertices, solid.faces);
    var e = solid.edges[0];
    solid.edgeLength = length(sub(solid.vertices[e[0]], solid.vertices[e[1]]));
    solid.rotations = 2 * solid.E;                           // ways to turn it onto itself
    return solid;
  }

  function cyclic(list) {
    var out = [];
    list.forEach(function (v) { out.push([v[0], v[1], v[2]], [v[2], v[0], v[1]], [v[1], v[2], v[0]]); });
    return out;
  }

  var ICOSA = cyclic([[0, 1, PHI], [0, -1, PHI], [0, 1, -PHI], [0, -1, -PHI]]).map(unit);
  var ICOSA_FACES = facesOf(ICOSA);

  var SOLIDS = [
    complete({
      id: 'tetrahedron', name: 'Tetrahedron', dual: 'tetrahedron', faceName: 'triangles', element: 'Fire',
      vertices: [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]].map(unit),
      found: 'A carbon atom bonded to four others, as in methane and diamond, holds them at the corners of a tetrahedron.',
      note: 'The simplest solid there can be: four corners, each joined to the other three. It is its own dual.'
    }),
    complete({
      id: 'cube', name: 'Cube', dual: 'octahedron', faceName: 'squares', element: 'Earth',
      vertices: [[1, 1, 1], [1, 1, -1], [1, -1, 1], [1, -1, -1], [-1, 1, 1], [-1, 1, -1], [-1, -1, 1], [-1, -1, -1]].map(unit),
      found: 'Crystals of table salt and of pyrite grow as cubes, because their atoms are stacked in a cubic grid.',
      note: 'The only Platonic solid that fills space with copies of itself and leaves no gaps.'
    }),
    complete({
      id: 'octahedron', name: 'Octahedron', dual: 'cube', faceName: 'triangles', element: 'Air',
      vertices: [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]],
      found: 'Diamond and fluorite crystals commonly grow as octahedra.',
      note: 'Two square pyramids joined base to base. Its six corners lie on the three axes: up and down, left and right, front and back.'
    }),
    complete({
      id: 'dodecahedron', name: 'Dodecahedron', dual: 'icosahedron', faceName: 'pentagons', element: 'The cosmos',
      vertices: dualVertices(ICOSA, ICOSA_FACES),
      found: 'Rare in crystals, because pentagons cannot tile a flat layer. Pyrite grows a near miss with irregular pentagons, and quasicrystals, found in 1982, do have this symmetry.',
      note: 'Twelve pentagons. The diagonal of each face is longer than its side by exactly the golden ratio, 1.618.'
    }),
    complete({
      id: 'icosahedron', name: 'Icosahedron', dual: 'dodecahedron', faceName: 'triangles', element: 'Water',
      vertices: ICOSA,
      found: 'Many viruses build their shells with this symmetry: it encloses the most space with the fewest kinds of part.',
      note: 'Twenty triangles. Its twelve corners are the corners of three golden rectangles set at right angles to each other.'
    })
  ];

  function find(id) {
    for (var i = 0; i < SOLIDS.length; i++) if (SOLIDS[i].id === id) return SOLIDS[i];
    return null;
  }

  /*
   * The dual of a solid, placed so each of its corners sits over the middle
   * of one of the solid's faces. Same fields as a solid. For the
   * tetrahedron this is a second tetrahedron pointing the opposite way.
   */
  var dualCache = {};
  function dualOf(id) {
    if (dualCache[id]) return dualCache[id];
    var solid = find(id);
    if (!solid) return null;
    var named = find(solid.dual);
    dualCache[id] = complete({ id: named.id, name: named.name, vertices: dualVertices(solid.vertices, solid.faces) });
    return dualCache[id];
  }

  /*
   * Why there are only five. q regular p-sided faces meet at each corner.
   * The corner angles that meet there must add up to less than a full
   * turn, or the faces lie flat or cannot close up at all.
   */
  function cornerAngleSum(p, q) {
    return q * (180 - 360 / p);
  }

  /* A solid as a mesh with flat faces, plus its edges as line segments. Scaled by `size`. */
  function solidMesh(solid, size) {
    var s = size || 1, positions = [], indices = [], edges = [];
    solid.faces.forEach(function (f) {
      var base = positions.length / 3;
      f.forEach(function (i) { positions.push(solid.vertices[i][0] * s, solid.vertices[i][1] * s, solid.vertices[i][2] * s); });
      for (var k = 1; k < f.length - 1; k++) indices.push(base, base + k, base + k + 1);
    });
    solid.edges.forEach(function (e) {
      var a = solid.vertices[e[0]], b = solid.vertices[e[1]];
      edges.push(a[0] * s, a[1] * s, a[2] * s, b[0] * s, b[1] * s, b[2] * s);
    });
    return { positions: new Float32Array(positions), indices: new Uint32Array(indices), edges: new Float32Array(edges) };
  }

  /* -------------------------------------------------------------- waves */

  /* Legendre polynomial of degree l: the shape of a one-axis wave on a sphere, as a function of the cosine of the angle from its axis. */
  function legendre(l, x) {
    if (l === 0) return 1;
    var prev = 1, cur = x;
    for (var n = 1; n < l; n++) {
      var next = ((2 * n + 1) * x * cur - n * prev) / (n + 1);
      prev = cur; cur = next;
    }
    return cur;
  }

  /* One direction for each line through opposite corners. */
  function axesOf(vertices) {
    var out = [];
    vertices.forEach(function (v) {
      var dup = out.some(function (a) { return Math.abs(Math.abs(dot(a, v)) - 1) < 1e-6; });
      if (!dup) out.push(v);
    });
    return out;
  }

  /* The sum of one-axis waves of degree l along the given axes, at a point on the sphere. */
  function axisSum(axes, l, x, y, z) {
    var sum = 0;
    for (var i = 0; i < axes.length; i++) sum += legendre(l, axes[i][0] * x + axes[i][1] * y + axes[i][2] * z);
    return sum;
  }

  /*
   * The lowest standing wave on a sphere with the symmetry of a solid.
   *   l       its degree
   *   axes    the axes its one-axis waves lie along
   *   scale   chosen so the wave is +1 at each corner of the solid
   */
  var waveCache = {};
  function waveFor(id) {
    if (waveCache[id]) return waveCache[id];
    var solid = find(id);
    if (!solid) return null;
    var l, axes;
    if (id === 'tetrahedron') { l = 3; axes = solid.vertices; }                 // odd: opposite directions differ, so all four corners count
    else if (id === 'cube' || id === 'octahedron') { l = 4; axes = axesOf(find('octahedron').vertices); }
    else { l = 6; axes = axesOf(find('icosahedron').vertices); }
    var v = solid.vertices[0];
    var w = { id: id, l: l, axes: axes, scale: 1 / axisSum(axes, l, v[0], v[1], v[2]) };
    waveCache[id] = w;
    return w;
  }

  /* Height of the wave at a direction (a point at distance 1 from the centre). +1 at the solid's corners. */
  function waveValue(wave, x, y, z) {
    return wave.scale * axisSum(wave.axes, wave.l, x, y, z);
  }

  /*
   * How fast a free drop of water rings in the wave of degree l
   * (Rayleigh, 1879): f = (1 / 2 pi) sqrt(l (l - 1) (l + 2) s / (d R^3)),
   * with s the surface tension, d the density and R the radius.
   */
  var WATER = { sigma: 0.0728, rho: 998 };
  function dropFrequency(l, radiusMm) {
    var R = Math.min(50, Math.max(0.05, Number(radiusMm) || 1)) / 1000;
    return Math.sqrt(l * (l - 1) * (l + 2) * WATER.sigma / (WATER.rho * R * R * R)) / (2 * Math.PI);
  }

  /* A ball of small triangles: `level` rounds of splitting each triangle of an icosahedron in four. Corners are shared. */
  function sphere(level) {
    var dirs = ICOSA.map(function (v) { return v.slice(); });
    var tris = ICOSA_FACES.map(function (f) { return f.slice(); });
    for (var n = 0; n < (level || 0); n++) {
      var mid = {}, next = [];
      var half = function (a, b) {
        var key = Math.min(a, b) + '-' + Math.max(a, b);
        if (mid[key] === undefined) {
          mid[key] = dirs.length;
          dirs.push(unit([dirs[a][0] + dirs[b][0], dirs[a][1] + dirs[b][1], dirs[a][2] + dirs[b][2]]));
        }
        return mid[key];
      };
      for (var t = 0; t < tris.length; t++) {
        var a = tris[t][0], b = tris[t][1], c = tris[t][2];
        var ab = half(a, b), bc = half(b, c), ca = half(c, a);
        next.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
      }
      tris = next;
    }
    var directions = new Float32Array(dirs.length * 3), indices = new Uint32Array(tris.length * 3);
    dirs.forEach(function (d, i) { directions.set(d, i * 3); });
    tris.forEach(function (t, i) { indices.set(t, i * 3); });
    return { directions: directions, indices: indices };
  }

  /* The wave's height at every corner of a ball from sphere(). */
  function waveOnSphere(wave, ball) {
    var d = ball.directions, out = new Float32Array(d.length / 3);
    for (var i = 0; i < out.length; i++) out[i] = waveValue(wave, d[i * 3], d[i * 3 + 1], d[i * 3 + 2]);
    return out;
  }

  /* ----------------------------------------------------------- fractals */

  var FRACTALS = [
    {
      id: 'sierpinski', name: 'Sierpinski tetrahedron', copies: 4, shrink: 2, maxDepth: 6,
      note: 'Take a tetrahedron and keep only the four half-size copies at its corners. Do the same to each copy, and again.',
      odd: 'Each step halves the volume and leaves the surface area exactly the same. Carried on for ever it has no volume at all, and its dimension is exactly 2: a solid shape with the dimension of a flat sheet.'
    },
    {
      id: 'menger', name: 'Menger sponge', copies: 20, shrink: 3, maxDepth: 3,
      note: 'Cut a cube into 27 smaller cubes and remove the one at the centre and the six at the middle of each face, leaving 20. Do the same to each of those, and again.',
      odd: 'Each step removes about a quarter of the volume and adds surface. Carried on for ever it has no volume and endless surface. Its dimension is about 2.73: more than a sheet, less than a solid.'
    }
  ];

  function findFractal(id) {
    for (var i = 0; i < FRACTALS.length; i++) if (FRACTALS[i].id === id) return FRACTALS[i];
    return null;
  }

  /* Dimension of a shape made of `copies` copies of itself, each `shrink` times smaller: log(copies) / log(shrink). */
  function dimension(copies, shrink) {
    return Math.log(copies) / Math.log(shrink);
  }

  /* Number of pieces, and volume and surface area relative to the starting solid, after `depth` steps. */
  function fractalFacts(id, depth) {
    var f = findFractal(id), n = Math.max(0, Math.round(depth));
    if (!f) return null;
    var out = { pieces: Math.pow(f.copies, n), dimension: dimension(f.copies, f.shrink) };
    if (id === 'sierpinski') { out.volume = Math.pow(0.5, n); out.area = 1; }
    else { out.volume = Math.pow(20 / 27, n); out.area = (2 * Math.pow(20 / 9, n) + 4 * Math.pow(8 / 9, n)) / 6; }
    return out;
  }

  function sierpinski(depth) {
    var corners = find('tetrahedron').vertices, faces = find('tetrahedron').faces;
    var positions = [], indices = [];
    (function split(c, n) {
      if (n === 0) {
        faces.forEach(function (f) {
          var base = positions.length / 3;
          f.forEach(function (i) { positions.push(c[i][0], c[i][1], c[i][2]); });
          indices.push(base, base + 1, base + 2);
        });
        return;
      }
      for (var k = 0; k < 4; k++) {
        split(c.map(function (p) { return [(p[0] + c[k][0]) / 2, (p[1] + c[k][1]) / 2, (p[2] + c[k][2]) / 2]; }), n - 1);
      }
    })(corners, Math.min(6, Math.max(0, Math.round(depth))));
    return { positions: new Float32Array(positions), indices: new Uint32Array(indices) };
  }

  /* Is the small cube at (x, y, z) part of the sponge of the given depth? Coordinates count from 0 to 3^depth - 1. */
  function inSponge(x, y, z, depth) {
    for (var n = 0; n < depth; n++) {
      var mid = (x % 3 === 1 ? 1 : 0) + (y % 3 === 1 ? 1 : 0) + (z % 3 === 1 ? 1 : 0);
      if (mid >= 2) return false;
      x = Math.floor(x / 3); y = Math.floor(y / 3); z = Math.floor(z / 3);
    }
    return true;
  }

  /* The sponge as a mesh. Only faces open to the air are drawn. Side length 1.2, centred. */
  function menger(depth) {
    var d = Math.min(3, Math.max(0, Math.round(depth))), n = Math.pow(3, d), side = 1.2, cell = side / n;
    var positions = [], indices = [];
    var DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    function inside(x, y, z) { return x >= 0 && y >= 0 && z >= 0 && x < n && y < n && z < n && inSponge(x, y, z, d); }
    for (var x = 0; x < n; x++) for (var y = 0; y < n; y++) for (var z = 0; z < n; z++) {
      if (!inSponge(x, y, z, d)) continue;
      for (var f = 0; f < 6; f++) {
        var dir = DIRS[f];
        if (inside(x + dir[0], y + dir[1], z + dir[2])) continue;
        // the face's centre, and two directions across it chosen so its corners run anticlockwise seen from outside
        var u = [dir[1], dir[2], dir[0]], v = cross(dir, u);
        var c = [(x + 0.5 + dir[0] / 2) * cell - side / 2, (y + 0.5 + dir[1] / 2) * cell - side / 2, (z + 0.5 + dir[2] / 2) * cell - side / 2];
        var base = positions.length / 3, h = cell / 2;
        [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(function (s) {
          positions.push(c[0] + (s[0] * u[0] + s[1] * v[0]) * h, c[1] + (s[0] * u[1] + s[1] * v[1]) * h, c[2] + (s[0] * u[2] + s[1] * v[2]) * h);
        });
        indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
    }
    return { positions: new Float32Array(positions), indices: new Uint32Array(indices), side: side };
  }

  function fractalMesh(id, depth) {
    return id === 'menger' ? menger(depth) : sierpinski(depth);
  }

  var api = {
    PHI: PHI,
    SOLIDS: SOLIDS,
    FRACTALS: FRACTALS,
    find: find,
    dualOf: dualOf,
    findFractal: findFractal,
    facesOf: facesOf,
    edgesOf: edgesOf,
    dualVertices: dualVertices,
    cornerAngleSum: cornerAngleSum,
    solidMesh: solidMesh,
    legendre: legendre,
    axisSum: axisSum,
    axesOf: axesOf,
    waveFor: waveFor,
    waveValue: waveValue,
    dropFrequency: dropFrequency,
    sphere: sphere,
    waveOnSphere: waveOnSphere,
    dimension: dimension,
    fractalFacts: fractalFacts,
    fractalMesh: fractalMesh,
    inSponge: inSponge
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (root.SP = root.SP || {}).solids = api;
})(typeof self !== 'undefined' ? self : this);
