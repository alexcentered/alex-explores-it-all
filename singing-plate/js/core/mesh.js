/*
 * core/mesh.js -- turns wave fields into solids a 3D printer can make.
 *
 * A wave pattern is a surface with no thickness. Printing needs a closed
 * solid, so each builder adds what the maths leaves out:
 *
 *   plate   relief on top of a slab, with walls and a floor
 *   sphere  a solid ball, optionally sliced flat underneath so it sits still
 *   room    node sheets given a wall thickness, optionally fused to a slab
 *
 * Every mesh is { positions: Float32Array xyz..., indices: Uint32Array },
 * in millimetres, z up, triangles wound anticlockwise seen from outside.
 *
 * inspect() then checks the result the way a slicer would: is the surface
 * closed, is it one piece, which way do the faces point. Nothing here
 * touches the DOM or Three.js, so it is all unit tested.
 */
(function (root) {
  'use strict';

  var MIN_WALL_MM = 0.8;     // two passes of a common 0.4 mm nozzle

  function clamp(v, lo, hi) {
    return Math.min(hi, Math.max(lo, v));
  }

  /* -------------------------------------------------------------- plate */

  /*
   * heights: size x size values in 0..1, row-major.
   * o.width   side of the square, mm
   * o.base    slab thickness under the lowest point of the relief, mm
   * o.relief  height the pattern adds on top of the slab, mm
   */
  function buildPlate(heights, size, o) {
    var W = o.width, base = o.base, relief = o.relief;
    var step = W / (size - 1);
    var ring = 4 * (size - 1);
    var topCount = size * size;
    var positions = new Float32Array((topCount + 3 * ring + 1) * 3);
    var indices = new Uint32Array(((size - 1) * (size - 1) * 2 + ring * 2 + ring) * 3);
    var i, j, p = 0, t = 0;

    for (j = 0; j < size; j++) {
      for (i = 0; i < size; i++) {
        positions[p++] = i * step;
        positions[p++] = j * step;
        positions[p++] = base + relief * clamp(heights[j * size + i], 0, 1);
      }
    }
    for (j = 0; j < size - 1; j++) {
      for (i = 0; i < size - 1; i++) {
        var v00 = j * size + i, v10 = v00 + 1, v01 = v00 + size, v11 = v01 + 1;
        indices[t++] = v00; indices[t++] = v10; indices[t++] = v11;
        indices[t++] = v00; indices[t++] = v11; indices[t++] = v01;
      }
    }

    var loop = rimLoop(size);
    var k;

    // Walls and floor get their own copies of the rim so edges shade crisply.
    var wallTop = topCount, wallBottom = topCount + ring, floorRing = topCount + 2 * ring;
    var centre = topCount + 3 * ring;
    for (k = 0; k < ring; k++) {
      var src = loop[k] * 3;
      var x = positions[src], y = positions[src + 1];
      positions[(wallTop + k) * 3] = x;
      positions[(wallTop + k) * 3 + 1] = y;
      positions[(wallTop + k) * 3 + 2] = positions[src + 2];
      positions[(wallBottom + k) * 3] = x;
      positions[(wallBottom + k) * 3 + 1] = y;
      positions[(floorRing + k) * 3] = x;
      positions[(floorRing + k) * 3 + 1] = y;
    }
    positions[centre * 3] = W / 2;
    positions[centre * 3 + 1] = W / 2;

    for (k = 0; k < ring; k++) {
      var n = (k + 1) % ring;
      indices[t++] = wallBottom + k; indices[t++] = wallBottom + n; indices[t++] = wallTop + n;
      indices[t++] = wallBottom + k; indices[t++] = wallTop + n; indices[t++] = wallTop + k;
      indices[t++] = centre; indices[t++] = floorRing + n; indices[t++] = floorRing + k;
    }
    return { positions: positions, indices: indices };
  }

  /* Vertex numbers round the plate's rim, anticlockwise seen from above. */
  function rimLoop(size) {
    var loop = new Uint32Array(4 * (size - 1));
    var k = 0, i, j;
    for (i = 0; i < size - 1; i++) loop[k++] = i;
    for (j = 0; j < size - 1; j++) loop[k++] = j * size + size - 1;
    for (i = size - 1; i > 0; i--) loop[k++] = (size - 1) * size + i;
    for (j = size - 1; j > 0; j--) loop[k++] = j * size;
    return loop;
  }

  /*
   * Move an existing plate mesh to new heights without rebuilding it.
   * Used every frame while the wave is animated.
   */
  function updatePlate(mesh, heights, size, o) {
    var P = mesh.positions;
    var count = size * size;
    for (var v = 0; v < count; v++) P[v * 3 + 2] = o.base + o.relief * clamp(heights[v], 0, 1);
    var loop = rimLoop(size);
    for (var k = 0; k < loop.length; k++) P[(count + k) * 3 + 2] = P[loop[k] * 3 + 2];
    return mesh;
  }

  /* --------------------------------------------------------------- disc */

  /*
   * A round plate in relief. heights holds the centre first, then `rings`
   * circles of `segs` values each, working outward, all in 0..1.
   * o.diameter, o.base and o.relief are in mm, as for buildPlate.
   */
  function buildDisc(heights, rings, segs, o) {
    var R = o.diameter / 2;
    var topCount = 1 + rings * segs;
    var wallTop = topCount, wallBottom = topCount + segs, floorRing = topCount + 2 * segs;
    var floorCentre = topCount + 3 * segs;
    var positions = new Float32Array((floorCentre + 1) * 3);
    var indices = new Uint32Array((segs + (rings - 1) * segs * 2 + segs * 2 + segs) * 3);
    var r, c, t = 0;

    positions[0] = R; positions[1] = R;
    for (r = 1; r <= rings; r++) {
      var rad = R * r / rings;
      for (c = 0; c < segs; c++) {
        var a = 2 * Math.PI * c / segs;
        var p = (1 + (r - 1) * segs + c) * 3;
        positions[p] = R + rad * Math.cos(a);
        positions[p + 1] = R + rad * Math.sin(a);
      }
    }
    var rim = 1 + (rings - 1) * segs;
    for (c = 0; c < segs; c++) {
      var x = positions[(rim + c) * 3], y = positions[(rim + c) * 3 + 1];
      [wallTop, wallBottom, floorRing].forEach(function (start) {
        positions[(start + c) * 3] = x;
        positions[(start + c) * 3 + 1] = y;
      });
    }
    positions[floorCentre * 3] = R; positions[floorCentre * 3 + 1] = R;

    for (c = 0; c < segs; c++) {
      var n = (c + 1) % segs;
      indices[t++] = 0; indices[t++] = 1 + c; indices[t++] = 1 + n;
      indices[t++] = wallBottom + c; indices[t++] = wallBottom + n; indices[t++] = wallTop + n;
      indices[t++] = wallBottom + c; indices[t++] = wallTop + n; indices[t++] = wallTop + c;
      indices[t++] = floorCentre; indices[t++] = floorRing + n; indices[t++] = floorRing + c;
    }
    for (r = 1; r < rings; r++) {
      var inner = 1 + (r - 1) * segs, outer = inner + segs;
      for (c = 0; c < segs; c++) {
        var c2 = (c + 1) % segs;
        indices[t++] = inner + c; indices[t++] = outer + c; indices[t++] = outer + c2;
        indices[t++] = inner + c; indices[t++] = outer + c2; indices[t++] = inner + c2;
      }
    }
    return updateDisc({ positions: positions, indices: indices }, heights, rings, segs, o);
  }

  /* Move an existing disc mesh to new heights without rebuilding it. */
  function updateDisc(mesh, heights, rings, segs, o) {
    var P = mesh.positions;
    var topCount = 1 + rings * segs;
    for (var v = 0; v < topCount; v++) P[v * 3 + 2] = o.base + o.relief * clamp(heights[v], 0, 1);
    var rim = 1 + (rings - 1) * segs;
    for (var c = 0; c < segs; c++) P[(topCount + c) * 3 + 2] = P[(rim + c) * 3 + 2];
    return mesh;
  }

  /* ------------------------------------------------------------- sphere */

  /*
   * values: (latSeg + 1) x lonSeg samples in -1..1, north pole first.
   * o.diameter  size of the undisturbed ball, mm
   * o.amplitude how far the surface moves, as a fraction of the radius
   * o.cut       depth sliced flat off the bottom so it stands on a bed, mm
   */
  function buildSphere(values, latSeg, lonSeg, o) {
    var R = o.diameter / 2;
    var amp = clamp(o.amplitude, -0.6, 0.6);
    var cut = Math.max(0, o.cut || 0);
    var count = (latSeg - 1) * lonSeg + 2;
    var positions = new Float32Array(count * 3);
    var indices = new Uint32Array(lonSeg * (latSeg - 1) * 2 * 3);
    var south = count - 1;
    var r, c, p;

    function radius(v) { return R * Math.max(0.05, 1 + amp * v); }

    positions[2] = radius(values[0]);
    positions[south * 3 + 2] = -radius(values[latSeg * lonSeg]);
    for (r = 1; r < latSeg; r++) {
      var theta = Math.PI * r / latSeg;
      var st = Math.sin(theta), ct = Math.cos(theta);
      for (c = 0; c < lonSeg; c++) {
        var phi = 2 * Math.PI * c / lonSeg;
        var rad = radius(values[r * lonSeg + c]);
        p = (1 + (r - 1) * lonSeg + c) * 3;
        positions[p] = rad * st * Math.cos(phi);
        positions[p + 1] = rad * st * Math.sin(phi);
        positions[p + 2] = rad * ct;
      }
    }

    var t = 0;
    for (c = 0; c < lonSeg; c++) {
      var cn = (c + 1) % lonSeg;
      indices[t++] = 0; indices[t++] = 1 + c; indices[t++] = 1 + cn;
      var last = 1 + (latSeg - 2) * lonSeg;
      indices[t++] = last + c; indices[t++] = south; indices[t++] = last + cn;
    }
    for (r = 1; r < latSeg - 1; r++) {
      var row = 1 + (r - 1) * lonSeg, next = row + lonSeg;
      for (c = 0; c < lonSeg; c++) {
        var c2 = (c + 1) % lonSeg;
        indices[t++] = row + c; indices[t++] = next + c; indices[t++] = next + c2;
        indices[t++] = row + c; indices[t++] = next + c2; indices[t++] = row + c2;
      }
    }

    // Slice the bottom flat, then stand the result on z = 0.
    var zMin = Infinity;
    for (p = 2; p < positions.length; p += 3) if (positions[p] < zMin) zMin = positions[p];
    var floor = zMin + cut;
    for (p = 2; p < positions.length; p += 3) {
      positions[p] = (positions[p] < floor ? floor : positions[p]) - floor;
    }
    return { positions: positions, indices: indices };
  }

  /* -------------------------------------------------------------- torus */

  /*
   * values: ringSeg x tubeSeg samples in -1..1, ring-major (see forms.torusValues).
   * o.diameter  outer diameter of the undisturbed ring, mm
   * o.aspect    tube radius as a fraction of ring radius
   * o.amplitude how far the surface moves, as a fraction of the tube radius
   * o.cut       depth sliced flat off the bottom so it sits on a bed, mm
   */
  function buildTorus(values, ringSeg, tubeSeg, o) {
    var R = o.diameter / (2 * (1 + o.aspect));
    var a = o.aspect * R;
    var amp = clamp(o.amplitude, -0.7, 0.7);
    var cut = Math.max(0, o.cut || 0);
    var positions = new Float32Array(ringSeg * tubeSeg * 3);
    var indices = new Uint32Array(ringSeg * tubeSeg * 6);
    var i, j, p = 0, t = 0;

    for (i = 0; i < ringSeg; i++) {
      var phi = 2 * Math.PI * i / ringSeg;
      var cphi = Math.cos(phi), sphi = Math.sin(phi);
      for (j = 0; j < tubeSeg; j++) {
        var theta = 2 * Math.PI * j / tubeSeg;
        var r = a * Math.max(0.2, 1 + amp * values[i * tubeSeg + j]);
        var ring = R + r * Math.cos(theta);
        positions[p++] = ring * cphi;
        positions[p++] = ring * sphi;
        positions[p++] = r * Math.sin(theta);
      }
    }
    // The surface closes on itself both ways, so every index wraps.
    for (i = 0; i < ringSeg; i++) {
      var i2 = (i + 1) % ringSeg;
      for (j = 0; j < tubeSeg; j++) {
        var j2 = (j + 1) % tubeSeg;
        var v00 = i * tubeSeg + j, v10 = i2 * tubeSeg + j, v11 = i2 * tubeSeg + j2, v01 = i * tubeSeg + j2;
        indices[t++] = v00; indices[t++] = v10; indices[t++] = v11;
        indices[t++] = v00; indices[t++] = v11; indices[t++] = v01;
      }
    }

    var zMin = Infinity;
    for (p = 2; p < positions.length; p += 3) if (positions[p] < zMin) zMin = positions[p];
    var floor = zMin + cut;
    for (p = 2; p < positions.length; p += 3) {
      positions[p] = (positions[p] < floor ? floor : positions[p]) - floor;
    }
    return { positions: positions, indices: indices };
  }

  /* --------------------------------------------------------- isosurface */

  /*
   * Marching tetrahedra: the surface where a sampled field crosses zero.
   * Negative is inside the solid. Each grid cube is split into six
   * tetrahedra around its long diagonal; neighbouring cubes split their
   * shared face the same way, so the result has no cracks.
   *
   * f: nx * ny * nz samples, x fastest. xs, ys, zs: grid coordinates.
   */
  var TETS = [0, 1, 3, 7, 0, 3, 2, 7, 0, 2, 6, 7, 0, 6, 4, 7, 0, 4, 5, 7, 0, 5, 1, 7];

  function isoSurface(f, nx, ny, nz, xs, ys, zs) {
    var total = nx * ny * nz;
    var plane = nx * ny;
    var cache = new Map();
    var pos = [];
    var idx = [];
    var corner = new Int32Array(8);
    var offsets = [0, 1, nx, nx + 1, plane, plane + 1, plane + nx, plane + nx + 1];
    var ins = [0, 0, 0, 0], outs = [0, 0, 0, 0];

    function nodeX(g) { return xs[g % nx]; }
    function nodeY(g) { return ys[((g / nx) | 0) % ny]; }
    function nodeZ(g) { return zs[(g / plane) | 0]; }

    /* The surface vertex on the grid edge between an inside and an outside node. */
    function edgeVertex(a, b) {
      var lo = a < b ? a : b, hi = a < b ? b : a;
      var key = lo * total + hi;
      var found = cache.get(key);
      if (found !== undefined) return found;
      var fa = f[lo], fb = f[hi];
      // Kept off the grid nodes themselves so no triangle collapses to a point.
      var t = clamp(fa / (fa - fb), 0.01, 0.99);
      var id = pos.length / 3;
      pos.push(
        nodeX(lo) + t * (nodeX(hi) - nodeX(lo)),
        nodeY(lo) + t * (nodeY(hi) - nodeY(lo)),
        nodeZ(lo) + t * (nodeZ(hi) - nodeZ(lo)));
      cache.set(key, id);
      return id;
    }

    /* Add a triangle, flipped if needed so its face points out of the solid. */
    function emit(a, b, c, dx, dy, dz) {
      var ax = pos[a * 3], ay = pos[a * 3 + 1], az = pos[a * 3 + 2];
      var ux = pos[b * 3] - ax, uy = pos[b * 3 + 1] - ay, uz = pos[b * 3 + 2] - az;
      var vx = pos[c * 3] - ax, vy = pos[c * 3 + 1] - ay, vz = pos[c * 3 + 2] - az;
      var dot = (uy * vz - uz * vy) * dx + (uz * vx - ux * vz) * dy + (ux * vy - uy * vx) * dz;
      if (dot >= 0) idx.push(a, b, c); else idx.push(a, c, b);
    }

    for (var k = 0; k < nz - 1; k++) {
      for (var j = 0; j < ny - 1; j++) {
        for (var i = 0; i < nx - 1; i++) {
          var g0 = (k * ny + j) * nx + i;
          var inside = 0;
          for (var q = 0; q < 8; q++) {
            corner[q] = g0 + offsets[q];
            if (f[corner[q]] < 0) inside++;
          }
          if (inside === 0 || inside === 8) continue;

          for (var tet = 0; tet < 24; tet += 4) {
            var ni = 0, no = 0;
            for (var v = 0; v < 4; v++) {
              var g = corner[TETS[tet + v]];
              if (f[g] < 0) ins[ni++] = g; else outs[no++] = g;
            }
            if (ni === 0 || ni === 4) continue;

            // Direction from the inside nodes to the outside nodes.
            var dx = 0, dy = 0, dz = 0, w;
            for (w = 0; w < no; w++) { dx += nodeX(outs[w]) / no; dy += nodeY(outs[w]) / no; dz += nodeZ(outs[w]) / no; }
            for (w = 0; w < ni; w++) { dx -= nodeX(ins[w]) / ni; dy -= nodeY(ins[w]) / ni; dz -= nodeZ(ins[w]) / ni; }

            if (ni === 1) {
              emit(edgeVertex(ins[0], outs[0]), edgeVertex(ins[0], outs[1]), edgeVertex(ins[0], outs[2]), dx, dy, dz);
            } else if (ni === 3) {
              emit(edgeVertex(outs[0], ins[0]), edgeVertex(outs[0], ins[1]), edgeVertex(outs[0], ins[2]), dx, dy, dz);
            } else {
              var q0 = edgeVertex(ins[0], outs[0]), q1 = edgeVertex(ins[0], outs[1]);
              var q2 = edgeVertex(ins[1], outs[1]), q3 = edgeVertex(ins[1], outs[0]);
              emit(q0, q1, q2, dx, dy, dz);
              emit(q0, q2, q3, dx, dy, dz);
            }
          }
        }
      }
    }
    return { positions: new Float32Array(pos), indices: new Uint32Array(idx) };
  }

  /* --------------------------------------------------------------- room */

  /*
   * field: (N + 1)^3 signed samples, x fastest (see forms.roomField).
   * o.size  side of the cube, mm
   * o.wall  thickness given to the node sheets, mm
   * o.base  slab under the form that fuses the sheets together, mm (0 = none)
   */
  function buildRoom(field, N, o) {
    var S = N + 1;
    var plane = S * S;
    var total = S * plane;
    var half = (o.wall / o.size) / 2;
    var base = Math.max(0, o.base || 0) / o.size;
    var grad = new Float32Array(total);
    var i, j, k, g, sumSq = 0;

    // Slope of the field, so "distance from the node sheet" can be estimated
    // and the wall comes out a roughly even thickness everywhere.
    for (k = 0; k < S; k++) {
      for (j = 0; j < S; j++) {
        for (i = 0; i < S; i++) {
          g = (k * S + j) * S + i;
          var gx = (field[i < N ? g + 1 : g] - field[i > 0 ? g - 1 : g]) * N / (i > 0 && i < N ? 2 : 1);
          var gy = (field[j < N ? g + S : g] - field[j > 0 ? g - S : g]) * N / (j > 0 && j < N ? 2 : 1);
          var gz = (field[k < N ? g + plane : g] - field[k > 0 ? g - plane : g]) * N / (k > 0 && k < N ? 2 : 1);
          var m2 = gx * gx + gy * gy + gz * gz;
          grad[g] = Math.sqrt(m2);
          sumSq += m2;
        }
      }
    }
    // Where sheets cross, the slope vanishes; a floor stops the estimate blowing up.
    var floor = 0.35 * Math.sqrt(sumSq / total) || 1;

    // The solid is wrapped in one extra layer of "outside" samples, placed a
    // hair beyond the cube. That is what closes the sheets off flat and clean
    // where they meet the cube's faces.
    var SP = S + 2;
    var solid = new Float32Array(SP * SP * SP).fill(1);
    for (k = 0; k < S; k++) {
      for (j = 0; j < S; j++) {
        for (i = 0; i < S; i++) {
          g = (k * S + j) * S + i;
          var d = Math.abs(field[g]) / Math.max(grad[g], floor) - half;
          if (base > 0) d = Math.min(d, k / N - base);
          if (Math.abs(d) < 1e-9) d = 1e-9;
          solid[((k + 1) * SP + j + 1) * SP + i + 1] = d;
        }
      }
    }

    var cell = o.size / N;
    var axis = new Float32Array(SP);
    for (i = 0; i < S; i++) axis[i + 1] = i * cell;
    axis[0] = -0.02 * cell;
    axis[SP - 1] = o.size + 0.02 * cell;
    return isoSurface(solid, SP, SP, SP, axis, axis, axis);
  }

  /* ---------------------------------------------------------- inspection */

  /*
   * Examine a mesh the way a slicer would. Vertices at the same place are
   * treated as one, so builders may duplicate them for shading.
   */
  function inspect(mesh) {
    var P = mesh.positions, I = mesh.indices;
    var vCount = P.length / 3;
    var min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    var a, b, c, p;
    for (p = 0; p < P.length; p += 3) {
      for (a = 0; a < 3; a++) {
        if (P[p + a] < min[a]) min[a] = P[p + a];
        if (P[p + a] > max[a]) max[a] = P[p + a];
      }
    }
    if (!vCount) { min = [0, 0, 0]; max = [0, 0, 0]; }
    var size = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
    // Weld vertices that sit at exactly the same place (open-addressed hash).
    var weld = new Uint32Array(vCount);
    var capacity = 16;
    while (capacity < vCount * 2) capacity *= 2;
    var table = new Int32Array(capacity).fill(-1);
    var firstAt = new Uint32Array(vCount);        // welded id -> a vertex holding its position
    var bitsF = new Float32Array(3), bitsU = new Uint32Array(bitsF.buffer);
    var welded = 0;
    for (var v = 0; v < vCount; v++) {
      var x = P[v * 3] + 0, y = P[v * 3 + 1] + 0, z = P[v * 3 + 2] + 0;   // + 0 folds -0 into 0
      bitsF[0] = x; bitsF[1] = y; bitsF[2] = z;
      var slot = (Math.imul(bitsU[0], 73856093) ^ Math.imul(bitsU[1], 19349663) ^ Math.imul(bitsU[2], 83492791)) & (capacity - 1);
      for (;;) {
        var id = table[slot];
        if (id === -1) {
          table[slot] = welded;
          firstAt[welded] = v;
          weld[v] = welded++;
          break;
        }
        var o = firstAt[id] * 3;
        if (P[o] === x && P[o + 1] === y && P[o + 2] === z) { weld[v] = id; break; }
        slot = (slot + 1) & (capacity - 1);
      }
    }

    var parent = new Uint32Array(welded);
    for (v = 0; v < welded; v++) parent[v] = v;
    function find(n) {
      while (parent[n] !== n) { parent[n] = parent[parent[n]]; n = parent[n]; }
      return n;
    }
    var used = new Uint8Array(welded);

    // One number per triangle side: which pair of vertices, and which way round.
    var sides = new Float64Array(I.length);
    var sideCount = 0;
    function addSide(from, to) {
      sides[sideCount++] = from < to ? (from * welded + to) * 2 : (to * welded + from) * 2 + 1;
    }

    var triangles = 0, degenerate = 0, volume = 0;
    for (var t = 0; t < I.length; t += 3) {
      a = weld[I[t]]; b = weld[I[t + 1]]; c = weld[I[t + 2]];
      if (a === b || b === c || a === c) { degenerate++; continue; }
      triangles++;
      addSide(a, b); addSide(b, c); addSide(c, a);
      used[a] = used[b] = used[c] = 1;
      parent[find(a)] = find(b);
      parent[find(b)] = find(c);
      var ia = I[t] * 3, ib = I[t + 1] * 3, ic = I[t + 2] * 3;
      volume += (P[ia] * (P[ib + 1] * P[ic + 2] - P[ib + 2] * P[ic + 1]) +
                 P[ia + 1] * (P[ib + 2] * P[ic] - P[ib] * P[ic + 2]) +
                 P[ia + 2] * (P[ib] * P[ic + 1] - P[ib + 1] * P[ic])) / 6;
    }

    // A closed, consistently wound surface uses every edge once in each direction.
    // Sorting puts the sides of each edge next to each other.
    var sorted = sides.subarray(0, sideCount).sort();
    var open = 0, nonManifold = 0, flipped = 0;
    for (var s = 0; s < sideCount;) {
      var pair = Math.floor(sorted[s] / 2);
      var forward = 0, back = 0;
      while (s < sideCount && Math.floor(sorted[s] / 2) === pair) {
        if (sorted[s] % 2) back++; else forward++;
        s++;
      }
      var sum = forward + back;
      if (sum === 1) open++;
      else if (sum > 2) nonManifold++;
      else if (forward !== 1) flipped++;
    }

    var components = 0;
    for (v = 0; v < welded; v++) if (used[v] && find(v) === v) components++;

    return {
      triangles: triangles,
      degenerate: degenerate,
      vertices: welded,
      openEdges: open,
      nonManifoldEdges: nonManifold,
      flippedEdges: flipped,
      watertight: triangles > 0 && open === 0 && nonManifold === 0,
      oriented: flipped === 0 && volume > 0,
      components: components,
      volume: volume,
      min: min,
      max: max,
      size: size
    };
  }

  /*
   * Turn an inspection into verdicts a person can act on.
   * facts.thinnest       { mm, label } the thinnest designed feature
   * facts.cellMm         grid spacing the form was sampled at (room only)
   * Each check is { name, status: 'pass' | 'warn' | 'fail', detail }.
   */
  function printChecks(ins, facts) {
    var f = facts || {};
    var checks = [];

    if (ins.triangles === 0) {
      checks.push({ name: 'Solid', status: 'fail', detail: 'These settings leave nothing to print.' });
      return { ok: false, checks: checks };
    }

    checks.push(ins.watertight
      ? { name: 'Watertight', status: 'pass', detail: 'Closed surface with no holes.' }
      : { name: 'Watertight', status: 'fail', detail: (ins.openEdges + ins.nonManifoldEdges) + ' edges do not close up. A slicer may refuse this file.' });

    checks.push(ins.components === 1
      ? { name: 'One piece', status: 'pass', detail: 'Everything is joined together.' }
      : { name: 'One piece', status: 'fail', detail: ins.components + ' separate pieces. They would print loose or in mid-air: add or thicken the base, thicken the wall, or pick another mode.' });

    if (f.thinnest) {
      var mm = f.thinnest.mm;
      checks.push(mm >= MIN_WALL_MM
        ? { name: 'Thickness', status: 'pass', detail: f.thinnest.label + ' is ' + mm.toFixed(1) + ' mm.' }
        : { name: 'Thickness', status: 'fail', detail: f.thinnest.label + ' is ' + mm.toFixed(2) + ' mm, under the ' + MIN_WALL_MM + ' mm most printers need.' });
      if (f.cellMm && mm < 1.5 * f.cellMm) {
        checks.push({ name: 'Detail', status: 'warn', detail: 'The wall is thinner than this resolution can draw cleanly (' + f.cellMm.toFixed(2) + ' mm steps). Raise the resolution or the wall thickness.' });
      }
    }

    if (ins.watertight && !ins.oriented) {
      checks.push({ name: 'Facing', status: 'warn', detail: 'Some faces point inward. Most slicers repair this automatically.' });
    }

    var ok = checks.every(function (c) { return c.status !== 'fail'; });
    return { ok: ok, checks: checks };
  }

  /* ---------------------------------------------------------------- STL */

  /* Binary STL: 80-byte header, triangle count, then 50 bytes per triangle. */
  function toBinaryStl(mesh, title) {
    var P = mesh.positions, I = mesh.indices;
    var count = I.length / 3;
    var buffer = new ArrayBuffer(84 + count * 50);
    var view = new DataView(buffer);
    // A binary file must not begin with the word "solid": that marks the text format.
    var header = ('Singing Plate ' + (title || 'form')).slice(0, 79);
    for (var h = 0; h < header.length; h++) view.setUint8(h, header.charCodeAt(h) & 0x7f);
    view.setUint32(80, count, true);

    var o = 84;
    for (var t = 0; t < I.length; t += 3) {
      var a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
      var ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
      var vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
      var nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      var len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      view.setFloat32(o, nx / len, true);
      view.setFloat32(o + 4, ny / len, true);
      view.setFloat32(o + 8, nz / len, true);
      o += 12;
      for (var k = 0; k < 3; k++) {
        var p = I[t + k] * 3;
        view.setFloat32(o, P[p], true);
        view.setFloat32(o + 4, P[p + 1], true);
        view.setFloat32(o + 8, P[p + 2], true);
        o += 12;
      }
      o += 2;   // attribute byte count, unused
    }
    return buffer;
  }

  var api = {
    MIN_WALL_MM: MIN_WALL_MM,
    buildPlate: buildPlate,
    updatePlate: updatePlate,
    buildDisc: buildDisc,
    updateDisc: updateDisc,
    buildSphere: buildSphere,
    buildTorus: buildTorus,
    isoSurface: isoSurface,
    buildRoom: buildRoom,
    inspect: inspect,
    printChecks: printChecks,
    toBinaryStl: toBinaryStl
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (root.SP = root.SP || {}).mesh = api;
})(typeof self !== 'undefined' ? self : this);
