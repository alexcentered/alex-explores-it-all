/*
 * core/ancient.js -- ancient structures: their shapes, proportions and sound.
 *
 * Six structures, each described three ways:
 *
 *   1. As a shape. A list of simple solids (boxes, cylinders, a pyramid)
 *      placed from published dimensions, in metres. These are schematic
 *      models for looking at proportion and layout, not surveys.
 *
 *   2. As proportions. Pairs of lengths, in the builders' own units where
 *      those are known, with the simple fraction and the musical interval
 *      each ratio is nearest to. Any two lengths make a ratio and every
 *      ratio is near some interval, so a match counts for little unless
 *      the builders' units come out as whole numbers. Each ratio says
 *      whether that is so.
 *
 *   3. As sound. Every statement carries a status:
 *        measured   someone measured it and published the result
 *        computed   worked out here, or in a published calculation
 *        claimed    said widely, with no measurement found to support it
 *
 * Nothing here is invented to fill a gap. Where no figure was found the
 * entry says so.
 */
(function (root) {
  'use strict';

  var SPEED_OF_SOUND = 343;        // m/s in air at 20 C
  var CUBIT = 0.5236;              // Egyptian royal cubit, metres

  /* ------------------------------------------------------------ ratios */

  var INTERVALS = [
    { name: 'Unison', a: 1, b: 1 },
    { name: 'Minor second', a: 16, b: 15 },
    { name: 'Major second', a: 9, b: 8 },
    { name: 'Minor third', a: 6, b: 5 },
    { name: 'Major third', a: 5, b: 4 },
    { name: 'Fourth', a: 4, b: 3 },
    { name: 'Tritone', a: 45, b: 32 },
    { name: 'Fifth', a: 3, b: 2 },
    { name: 'Minor sixth', a: 8, b: 5 },
    { name: 'Major sixth', a: 5, b: 3 },
    { name: 'Minor seventh', a: 9, b: 5 },
    { name: 'Major seventh', a: 15, b: 8 },
    { name: 'Octave', a: 2, b: 1 }
  ].map(function (i) {
    i.ratio = i.a / i.b;
    i.cents = 1200 * Math.log2(i.ratio);
    return i;
  });

  var CLOSE_CENTS = 10;            // about the smallest mistuning most listeners notice in a held interval

  /*
   * The musical interval a ratio is nearest to. Ratios above 2 are folded
   * down by octaves first, and the number of octaves removed is reported.
   *   off     cents the ratio is above (+) or below (-) the pure interval
   *   close   within CLOSE_CENTS
   */
  function nearestInterval(ratio) {
    var r = Number(ratio);
    if (!(r > 0) || !isFinite(r)) return null;
    if (r < 1) r = 1 / r;
    var cents = 1200 * Math.log2(r);
    var octaves = Math.floor(cents / 1200 + 1e-9);
    var within = cents - octaves * 1200;
    var best = null;
    INTERVALS.forEach(function (i) {
      var d = within - i.cents;
      if (!best || Math.abs(d) < Math.abs(best.off)) best = { name: i.name, a: i.a, b: i.b, off: d };
    });
    if (best.name === 'Octave') { best = { name: 'Unison', a: 1, b: 1, off: best.off }; octaves += 1; }
    if (best.name === 'Unison' && octaves > 0) { best.name = 'Octave'; best.a = 2; best.b = 1; octaves -= 1; }
    best.octaves = octaves;
    best.cents = cents;
    best.close = Math.abs(best.off) <= CLOSE_CENTS;
    return best;
  }

  /* The fraction with the smallest denominator, up to maxDen, that lies nearest x. */
  function simpleFraction(x, maxDen) {
    var best = { a: Math.round(x), b: 1 }, bestErr = Math.abs(x - Math.round(x));
    for (var b = 2; b <= (maxDen || 16); b++) {
      var a = Math.round(x * b), err = Math.abs(x - a / b);
      if (err < bestErr - 1e-12) { best = { a: a, b: b }; bestErr = err; }
    }
    best.error = bestErr / x;
    return best;
  }

  /* --------------------------------------------------- sound in a room */

  /*
   * The standing waves of air in a hard-walled box: its room modes.
   * Each fits a whole number of half wavelengths along each direction.
   *   f = (c / 2) * sqrt((nx / L)^2 + (ny / W)^2 + (nz / H)^2)
   * Returns the lowest `count`, sorted.
   */
  function boxModes(L, W, H, count) {
    var out = [];
    for (var nx = 0; nx <= 6; nx++) {
      for (var ny = 0; ny <= 6; ny++) {
        for (var nz = 0; nz <= 6; nz++) {
          if (!nx && !ny && !nz) continue;
          var used = (nx ? 1 : 0) + (ny ? 1 : 0) + (nz ? 1 : 0);
          out.push({
            n: [nx, ny, nz],
            freq: SPEED_OF_SOUND / 2 * Math.sqrt(nx * nx / (L * L) + ny * ny / (W * W) + nz * nz / (H * H)),
            kind: used === 1 ? 'axial' : used === 2 ? 'tangential' : 'oblique'
          });
        }
      }
    }
    out.sort(function (a, b) { return a.freq - b.freq || a.n[0] - b.n[0] || a.n[1] - b.n[1]; });
    return out.slice(0, count || 12);
  }

  /* Sound pressure of a mode at a place in the room, each coordinate given as a fraction 0..1. Range -1..1. */
  function boxPressure(n, x, y, z) {
    return Math.cos(n[0] * Math.PI * x) * Math.cos(n[1] * Math.PI * y) * Math.cos(n[2] * Math.PI * z);
  }

  /*
   * A level sheet through the room showing how loud the mode is at each
   * place on it. Returns a grid mesh in metres with one loudness value
   * (0 quiet .. 1 loud) per vertex.
   *   room     { L, W, H, origin: [x, y, z] of its lowest corner }
   *   height   0..1, how far up the room the sheet sits
   */
  function modeSlice(room, n, height, cells) {
    var res = cells || 40;
    var positions = new Float32Array((res + 1) * (res + 1) * 3);
    var values = new Float32Array((res + 1) * (res + 1));
    var indices = new Uint32Array(res * res * 6);
    var h = Math.min(1, Math.max(0, height));
    var p = 0, v = 0, q = 0, i, j;
    for (j = 0; j <= res; j++) {
      for (i = 0; i <= res; i++) {
        positions[p++] = room.origin[0] + room.L * i / res;
        positions[p++] = room.origin[1] + room.W * j / res;
        positions[p++] = room.origin[2] + room.H * h;
        values[v++] = Math.abs(boxPressure(n, i / res, j / res, h));
      }
    }
    for (j = 0; j < res; j++) {
      for (i = 0; i < res; i++) {
        var a = j * (res + 1) + i, b = a + 1, c = a + res + 1, d = c + 1;
        indices[q++] = a; indices[q++] = b; indices[q++] = c;
        indices[q++] = b; indices[q++] = d; indices[q++] = c;
      }
    }
    return { positions: positions, values: values, indices: indices };
  }

  /*
   * Many room modes are too low to hear. Raise a frequency by whole
   * octaves until it is comfortably audible on ordinary speakers.
   */
  function audible(freq) {
    var f = Number(freq), octaves = 0;
    if (!(f > 0)) return { freq: 0, octaves: 0 };
    while (f < 110) { f *= 2; octaves++; }
    while (f > 3520) { f /= 2; octaves--; }
    return { freq: f, octaves: octaves };
  }

  /* ---------------------------------------------------------- geometry */

  function Builder() {
    // solid: worked stone. ground: floors, bedrock and retaining walls, drawn darker. ghost: see-through volumes.
    this.pos = { solid: [], ghost: [], ground: [] };
    this.idx = { solid: [], ghost: [], ground: [] };
    this.edges = [];
    this.min = [Infinity, Infinity, Infinity];
    this.max = [-Infinity, -Infinity, -Infinity];
  }

  Builder.prototype.point = function (kind, p) {
    this.pos[kind].push(p[0], p[1], p[2]);
    for (var a = 0; a < 3; a++) {
      if (p[a] < this.min[a]) this.min[a] = p[a];
      if (p[a] > this.max[a]) this.max[a] = p[a];
    }
  };

  /* One flat face with its own corners, so it is lit as a flat face. Corners anticlockwise seen from outside. */
  Builder.prototype.face = function (kind, corners) {
    var base = this.pos[kind].length / 3;
    for (var i = 0; i < corners.length; i++) this.point(kind, corners[i]);
    for (var k = 1; k < corners.length - 1; k++) this.idx[kind].push(base, base + k, base + k + 1);
  };

  Builder.prototype.edge = function (a, b) {
    this.edges.push(a[0], a[1], a[2], b[0], b[1], b[2]);
  };

  /* A box: centre of its footprint, the height of its underside, its three sizes, and a turn about the vertical. */
  Builder.prototype.box = function (kind, cx, cy, z0, sx, sy, sz, turn) {
    var c = Math.cos(turn || 0), s = Math.sin(turn || 0);
    function at(dx, dy, z) { return [cx + dx * c - dy * s, cy + dx * s + dy * c, z]; }
    var hx = sx / 2, hy = sy / 2, z1 = z0 + sz;
    var b = [at(-hx, -hy, z0), at(hx, -hy, z0), at(hx, hy, z0), at(-hx, hy, z0)];
    var t = [at(-hx, -hy, z1), at(hx, -hy, z1), at(hx, hy, z1), at(-hx, hy, z1)];
    this.face(kind, [b[3], b[2], b[1], b[0]]);
    this.face(kind, [t[0], t[1], t[2], t[3]]);
    for (var i = 0; i < 4; i++) {
      var j = (i + 1) % 4;
      this.face(kind, [b[i], b[j], t[j], t[i]]);
      if (kind === 'ghost') { this.edge(b[i], b[j]); this.edge(t[i], t[j]); this.edge(b[i], t[i]); }
    }
  };

  /* An upright cylinder or tapered drum, drawn with flat sides. */
  Builder.prototype.cylinder = function (kind, cx, cy, z0, rBottom, rTop, height, sides) {
    var n = sides || 16, z1 = z0 + height, top = [], bottom = [], i;
    for (i = 0; i < n; i++) {
      var a = 2 * Math.PI * i / n;
      bottom.push([cx + rBottom * Math.cos(a), cy + rBottom * Math.sin(a), z0]);
      top.push([cx + rTop * Math.cos(a), cy + rTop * Math.sin(a), z1]);
    }
    for (i = 0; i < n; i++) {
      var j = (i + 1) % n;
      this.face(kind, [bottom[i], bottom[j], top[j], top[i]]);
      if (kind === 'ghost') { this.edge(bottom[i], bottom[j]); this.edge(top[i], top[j]); }
    }
    this.face(kind, top);
    this.face(kind, bottom.slice().reverse());
  };

  /* A square pyramid standing on its base. */
  Builder.prototype.pyramid = function (kind, cx, cy, z0, base, height) {
    var h = base / 2, apex = [cx, cy, z0 + height];
    var b = [[cx - h, cy - h, z0], [cx + h, cy - h, z0], [cx + h, cy + h, z0], [cx - h, cy + h, z0]];
    this.face(kind, [b[3], b[2], b[1], b[0]]);
    for (var i = 0; i < 4; i++) {
      var j = (i + 1) % 4;
      this.face(kind, [b[i], b[j], apex]);
      if (kind === 'ghost') { this.edge(b[i], b[j]); this.edge(b[i], apex); }
    }
  };

  /* A ridged roof: a triangle across the width, run along the length. */
  Builder.prototype.gable = function (kind, cx, cy, z0, length, width, height) {
    var hx = length / 2, hy = width / 2;
    var a = [cx - hx, cy - hy, z0], b = [cx - hx, cy + hy, z0], r = [cx - hx, cy, z0 + height];
    var d = [cx + hx, cy - hy, z0], e = [cx + hx, cy + hy, z0], s = [cx + hx, cy, z0 + height];
    this.face(kind, [b, a, r]);
    this.face(kind, [d, e, s]);
    this.face(kind, [a, d, s, r]);
    this.face(kind, [e, b, r, s]);
    this.face(kind, [a, b, e, d]);
  };

  /* A standing person, 1.7 m tall, to give the eye a sense of size. */
  Builder.prototype.person = function (cx, cy, z0) {
    this.cylinder('solid', cx, cy, z0, 0.2, 0.17, 1.45, 10);
    this.cylinder('solid', cx, cy, z0 + 1.45, 0.11, 0.11, 0.25, 10);
  };

  Builder.prototype.result = function () {
    return {
      solid: { positions: new Float32Array(this.pos.solid), indices: new Uint32Array(this.idx.solid) },
      ghost: { positions: new Float32Array(this.pos.ghost), indices: new Uint32Array(this.idx.ghost) },
      ground: { positions: new Float32Array(this.pos.ground), indices: new Uint32Array(this.idx.ground) },
      edges: new Float32Array(this.edges),
      min: this.min.slice(), max: this.max.slice()
    };
  };

  /* -------------------------------------------------------- structures */

  var KING = { L: 20 * CUBIT, W: 10 * CUBIT, H: 5 * Math.sqrt(5) * CUBIT };

  var STRUCTURES = [
    {
      id: 'kings-chamber',
      name: 'King\'s Chamber',
      place: 'Inside the Great Pyramid, Giza, Egypt',
      date: 'About 2560 BC',
      material: 'Red granite from Aswan, about 800 km upriver',
      size: '10.47 × 5.24 × 5.85 m',
      built: [
        'A plain granite box set out in royal cubits of 0.5236 m: 20 long and 10 wide, a double square.',
        'The height is half the diagonal of the floor, 5√5 or about 11.18 cubits. That choice makes the diagonal of each end wall exactly 15 cubits and the long diagonal through the room exactly 25. With the 20-cubit length they form a 3-4-5 triangle, five times over.',
        'Nine granite beams span the ceiling. Above them sit five low compartments and a gable of limestone that carry the weight of the pyramid away from the flat roof.',
        'The lidless granite coffer is slightly wider than the passage that leads to the room, so it was in place before the roof was laid.'
      ],
      room: { L: KING.L, W: KING.W, H: KING.H, origin: [-KING.L / 2, -KING.W / 2, 0] },
      ratios: [
        { label: 'Length to width', a: 20, b: 10, unit: 'cubits', whole: true },
        { label: 'Room diagonal to length', a: 25, b: 20, unit: 'cubits', whole: true },
        { label: 'Length to end-wall diagonal', a: 20, b: 15, unit: 'cubits', whole: true },
        { label: 'Room diagonal to end-wall diagonal', a: 25, b: 15, unit: 'cubits', whole: true },
        { label: 'Height to width', a: 5 * Math.sqrt(5), b: 10, unit: 'cubits', whole: false, note: 'The height is 5√5, not a whole number of cubits.' }
      ],
      ratioNote: 'The whole-number ratios here are real features of the design. Whether the builders thought of them as musical is not recorded.',
      acoustics: [
        { status: 'computed', text: 'A hard-walled box this size has the room modes listed under the model. The lowest, 16.4 Hz, is below the range of hearing: it would be felt more than heard.' },
        { status: 'computed', text: 'Because the room is exactly twice as long as it is wide, pairs of modes fall on the same frequency (32.8 Hz, 65.5 Hz and so on), which makes those notes stronger. Any double-square room does this.' },
        { status: 'claimed', text: 'It is often said that the chamber is tuned to a particular note or a healing frequency. No peer-reviewed acoustic measurement of the chamber was found for this page.' }
      ],
      sources: ['W. M. F. Petrie, The Pyramids and Temples of Gizeh (1883)'],
      parts: function (b) {
        var L = KING.L, W = KING.W, H = KING.H, t = 0.6;
        b.box('ground', 0, 0, -t, L + 2 * t, W + 2 * t, t);                // floor
        b.box('ghost', 0, 0, 0.02, L, W, H - 0.02);                        // the room itself
        // nine ceiling beams, running across the width
        for (var i = 0; i < 9; i++) b.box('ghost', -L / 2 + (i + 0.5) * L / 9, 0, H, L / 9 - 0.06, W + 2 * t, 1.6);
        // the coffer, near the west end: about 2.28 x 0.98 x 1.05 m outside (Petrie)
        var cx = -L / 2 + 2.3, cl = 2.28, cw = 0.98, ch = 1.05, wall = 0.15;
        b.box('solid', cx, 0, 0, cl, cw, 0.18);
        b.box('solid', cx, -cw / 2 + wall / 2, 0.18, cl, wall, ch - 0.18);
        b.box('solid', cx, cw / 2 - wall / 2, 0.18, cl, wall, ch - 0.18);
        b.box('solid', cx - cl / 2 + wall / 2, 0, 0.18, wall, cw - 2 * wall, ch - 0.18);
        b.box('solid', cx + cl / 2 - wall / 2, 0, 0.18, wall, cw - 2 * wall, ch - 0.18);
        b.person(1.5, 0.6, 0);
      }
    },
    {
      id: 'great-pyramid',
      name: 'Great Pyramid',
      place: 'Giza, Egypt',
      date: 'About 2560 BC',
      material: 'About 2.3 million blocks, mostly local limestone, once cased in white Tura limestone',
      size: '230.3 m square, 146.6 m high when complete',
      built: [
        'Egyptian builders set a slope as a seked: how many palms the face runs in for each cubit (7 palms) it rises. This one is 5½, a rise of 14 for a run of 11. The base is 440 cubits and the height 280.',
        'That slope has a consequence the builders may or may not have intended: the distance round the base, 1,760 cubits, divided by the height is 44 ÷ 7, which is 2π to within 0.04%. It follows directly from the slope, because 22 ÷ 7 is a close stand-in for π.',
        'The four sides agree in length to within about 20 cm over 230 m, and the base is aligned to true north to within a small fraction of a degree.',
        'The model shows three chambers at their heights: the King\'s Chamber 43 m above the base, the Queen\'s Chamber 21 m above it, and an unfinished chamber cut into the rock about 30 m below.'
      ],
      room: null,
      ratios: [
        { label: 'Height to half the base (the slope)', a: 280, b: 220, unit: 'cubits', whole: true },
        { label: 'Base to height', a: 440, b: 280, unit: 'cubits', whole: true },
        { label: 'Distance round the base to height', a: 1760, b: 280, unit: 'cubits', whole: true, note: '44 ÷ 7, within 0.04% of 2π.' }
      ],
      ratioNote: 'None of these lands on a simple musical interval. The numbers that do appear are 7, 11 and an approximation to π: geometry, not harmony.',
      acoustics: [
        { status: 'computed', text: 'A 2018 calculation (Balezin and others, Journal of Applied Physics) found that radio waves 200 to 600 m long would be concentrated in the chambers and under the base by a pyramid this shape. It is a study of scattering, and the authors do not claim the builders knew of it.' },
        { status: 'claimed', text: 'The pyramid is often described as a power plant or a resonator. No measurement supports that, and the structure is almost entirely solid stone.' }
      ],
      sources: ['J. H. Cole, Determination of the Exact Size and Orientation of the Great Pyramid (1925)', 'M. Balezin and others, Journal of Applied Physics 124, 034903 (2018)'],
      parts: function (b) {
        var base = 440 * CUBIT, height = 280 * CUBIT;
        b.box('ghost', 0, 0, -1.5, base + 30, base + 30, 1.4);              // the plateau, see-through so the rock chamber shows
        b.pyramid('ghost', 0, 0, 0, base, height);
        b.box('solid', 0, -11, 43, KING.W, KING.L, KING.H);               // King's Chamber, south of the axis
        b.box('solid', 0, 0, 21, 5.23, 5.75, 6.2);                         // Queen's Chamber, on the axis
        b.box('solid', 0, 0, -33, 8.3, 14, 3.5);                           // the unfinished chamber in the rock
      }
    },
    {
      id: 'osireion',
      name: 'Osireion',
      place: 'Abydos, Egypt',
      date: 'Dated by its excavators to Seti I, about 1290 to 1279 BC. Some argue it is far older; that is not the mainstream view.',
      material: 'Red granite pillars of about 50 to 55 tonnes each, from Aswan, more than 300 km upriver',
      size: 'Central hall about 30.5 × 19.8 m',
      built: [
        'A sunken hall behind the temple of Seti I, its floor well below the temple and at the level of the groundwater. Ten single-piece granite pillars stand in two rows on a stone island, with a channel of water all the way round it.',
        'Each pillar is about 4 m tall and a little over 2 m square. They carried granite beams, and the nave between the rows was roofed with slabs spanning about 7 m. The roof is gone.',
        'Seventeen small cells open off the channel round the hall. The style is bare: square pillars, no inscriptions on the granite, closer in look to the Valley Temple at Giza than to Seti\'s own temple beside it.',
        'The water comes from the ground. A team pumping at about 500 gallons a minute could not empty it. In antiquity the site was known as a well or spring.',
        'Published dimensions differ from source to source, so this model is the most schematic of the six. The hall is drawn from its overall size and the pillars from an average of the figures given.'
      ],
      room: null,
      ratios: [
        { label: 'Hall length to width', a: 100, b: 65, unit: 'feet', whole: false, note: 'Rounded modern measurements. The builders\' units are not established.' }
      ],
      ratioNote: 'With only rounded modern figures, no ratio here can be tested against the builders\' intent.',
      acoustics: [
        { status: 'computed', text: 'Sound crossing the nave between the two pillar rows, about 7 m apart, and back again repeats about 24.5 times a second. With the roof on, that would have been a low flutter between the facing stone.' },
        { status: 'claimed', text: 'The Osireion is described in some accounts as an acoustic or energy device. No acoustic measurement of it was found for this page, and today it is roofless and flooded.' }
      ],
      sources: ['H. Frankfort, A. de Buck and B. Gunn, The Cenotaph of Seti I at Abydos (Egypt Exploration Society, 1933)', 'J. Westerman, groundwater investigations at the Osireion'],
      parts: function (b) {
        var L = 30.5, W = 19.8, channel = 3, il = L - 2 * channel, iw = W - 2 * channel, wall = 2.5, depth = 1.6;
        b.box('ground', 0, 0, -depth - 0.6, L + 2 * wall, W + 2 * wall, 0.6);         // bed of the channel
        b.box('solid', 0, 0, -depth, il, iw, depth);                                   // the island
        b.box('ghost', 0, 0, -depth, L, W, depth - 0.5);                               // water
        // the walls that hold back the ground, drawn to the height of the beams
        b.box('ground', 0, -(W + wall) / 2, -depth, L + 2 * wall, wall, depth + 4.0);
        b.box('ground', 0, (W + wall) / 2, -depth, L + 2 * wall, wall, depth + 4.0);
        b.box('ground', -(L + wall) / 2, 0, -depth, wall, W, depth + 4.0);
        b.box('ground', (L + wall) / 2, 0, -depth, wall, W, depth + 4.0);
        // ten pillars in two rows of five, and the beams they carried
        for (var row = -1; row <= 1; row += 2) {
          for (var i = 0; i < 5; i++) b.box('solid', (i - 2) * 4.7, row * 4.55, 0, 2.35, 2.1, 4.0);
          b.box('solid', 0, row * 4.55, 4.0, 21.2, 2.1, 1.6);
        }
        b.person(0, 0, 0);
      }
    },
    {
      id: 'parthenon',
      name: 'Parthenon',
      place: 'Acropolis, Athens, Greece',
      date: '447 to 432 BC',
      material: 'Marble from Mount Pentelikon, 16 km away',
      size: 'Platform 30.88 × 69.50 m, columns 10.43 m',
      built: [
        'One ratio, 4 to 9, is used at three scales: column thickness to the spacing of columns, the width of the platform to its length, and the height of the front to its width.',
        'There are 8 columns across each end and 17 down each side, 46 in the outer ring. Each is a stack of ten or eleven marble drums, pinned at the centre and ground to fit so closely the joints barely show.',
        'Almost nothing is straight. The platform rises about 6 cm in the middle of each end and 11 cm along each side. The columns lean inward about 6 cm, swell slightly partway up, and the corner columns are thicker than the rest. These refinements are cut into the stone; they are not errors.',
        'The model shows the platform, the outer columns, the beam and frieze above them, the roof and the inner building, without the curvature.'
      ],
      room: null,
      ratios: [
        { label: 'Platform length to width', a: 69.50, b: 30.88, unit: 'm', whole: false, note: 'Within 0.1% of 9 to 4.' },
        { label: 'Front width to height', a: 30.88, b: 13.72, unit: 'm', whole: false, note: 'Height to the top of the horizontal cornice. Within 0.1% of 9 to 4.' },
        { label: 'Column spacing to thickness', a: 4.29, b: 1.905, unit: 'm', whole: false, note: 'Within 0.1% of 9 to 4.' }
      ],
      ratioNote: '9 to 4 is two fifths stacked (3 to 2, twice), an octave and a whole tone. Greek writers did tie number, music and proportion together, though no surviving text says the Parthenon was designed as music.',
      acoustics: [
        { status: 'computed', text: 'An open colonnade holds no standing wave of its own, so no room modes are given.' },
        { status: 'measured', text: 'Where the Greeks did build for sound, it shows. At the theatre of Epidaurus, the stepped stone seats were found to filter out sound below about 500 Hz, such as crowd murmur and wind, while passing the higher frequencies of the voice (Declercq and Dekeyser, 2007).' }
      ],
      sources: ['A. K. Orlandos, The Architecture of the Parthenon (1976 to 1978)', 'N. Declercq and C. Dekeyser, Journal of the Acoustical Society of America 121 (2007)'],
      parts: function (b) {
        var W = 30.88, L = 69.50, colH = 10.43, r = 1.905 / 2;
        for (var s = 0; s < 3; s++) b.box('solid', 0, 0, -(s + 1) * 0.55, L + s * 1.4 + 0.02, W + s * 1.4 + 0.02, 0.55);
        var i, x, y, ix = (L - 2 * r - 0.3) / 16, iy = (W - 2 * r - 0.3) / 7;
        for (i = 0; i < 17; i++) {
          x = -L / 2 + r + 0.15 + i * ix;
          b.cylinder('solid', x, -W / 2 + r + 0.15, 0, r, r * 0.78, colH, 14);
          b.cylinder('solid', x, W / 2 - r - 0.15, 0, r, r * 0.78, colH, 14);
        }
        for (i = 1; i < 7; i++) {
          y = -W / 2 + r + 0.15 + i * iy;
          b.cylinder('solid', -L / 2 + r + 0.15, y, 0, r, r * 0.78, colH, 14);
          b.cylinder('solid', L / 2 - r - 0.15, y, 0, r, r * 0.78, colH, 14);
        }
        b.box('solid', 0, 0, 0, 59.0, 21.4, colH);                         // the inner building
        b.box('solid', 0, 0, colH, L, W, 3.29);                            // beam, frieze and cornice: 13.72 m to the top
        b.gable('solid', 0, 0, colH + 3.29, L, W, 3.5);
        b.person(-L / 2 - 4, 0, -1.65);
      }
    },
    {
      id: 'stonehenge',
      name: 'Stonehenge',
      place: 'Salisbury Plain, England',
      date: 'The great stone circle about 2500 BC',
      material: 'Sarsen sandstone from West Woods, 25 km north; smaller bluestones from the Preseli Hills in Wales, 240 km away',
      size: 'Circle about 30 m across, lintels 4.9 m above the ground',
      built: [
        'Thirty uprights, each about 4.1 m above ground and around 25 tonnes, stood in a circle with thirty lintels in a continuous ring on top. Inside stood five great trilithons, pairs of uprights with a lintel across, in a horseshoe. The tallest rose 7.3 m.',
        'The joints are carpentry cut in stone. Each lintel sits on knobs left on top of the uprights, fitting into hollows on its underside, and locks to its neighbours with a tongue and a groove.',
        'The lintels are shaped to the curve of the circle, and their tops were level round the ring although the ground slopes.',
        'The open side of the horseshoe faces the midsummer sunrise, and the opposite direction the midwinter sunset.',
        'The model shows the circle and the horseshoe as they are thought to have stood complete. The bluestones are left out.'
      ],
      room: null,
      ratios: [],
      ratioNote: 'No written units survive from the builders, and proposed units such as the megalithic yard are disputed. No ratio is offered here.',
      acoustics: [
        { status: 'measured', text: 'A 1:12 scale model of the complete monument, tested in an acoustics laboratory, gave a reverberation time of 0.64 ± 0.03 s at speech frequencies and made speech 4.3 ± 0.9 dB louder for people inside (Cox, Fazenda and Greaney, 2020).' },
        { status: 'measured', text: 'There were no echoes inside the circle, and the effect did not carry to anyone outside it: sound made within was clearer to those within (Cox, Fazenda and Greaney, 2020).' }
      ],
      sources: ['T. Cox, B. Fazenda and S. Greaney, Journal of Archaeological Science 122 (2020)', 'D. Nash and others, Science Advances 6 (2020)'],
      parts: function (b) {
        var R = 15.5, i, a;
        b.cylinder('ground', 0, 0, -0.4, 21, 21, 0.4, 48);
        for (i = 0; i < 30; i++) {
          a = 2 * Math.PI * (i + 0.5) / 30;
          b.box('solid', R * Math.cos(a), R * Math.sin(a), 0, 1.1, 2.1, 4.1, a);
          var m = 2 * Math.PI * (i + 1) / 30;                                // a lintel bridges each gap
          b.box('solid', R * Math.cos(m), R * Math.sin(m), 4.1, 1.0, 3.25, 0.8, m);
        }
        // five trilithons in a horseshoe, open toward the north-east (here: +x)
        var tops = [6.1, 6.5, 7.3, 6.5, 6.1], angles = [70, 125, 180, 235, 290];
        for (i = 0; i < 5; i++) {
          a = angles[i] * Math.PI / 180;
          var cx = 7.2 * Math.cos(a), cy = 7.2 * Math.sin(a), tx = -Math.sin(a), ty = Math.cos(a), h = tops[i] - 1.0;
          b.box('solid', cx + tx * 1.7, cy + ty * 1.7, 0, 1.2, 2.2, h, a);
          b.box('solid', cx - tx * 1.7, cy - ty * 1.7, 0, 1.2, 2.2, h, a);
          b.box('solid', cx, cy, h, 1.2, 5.0, 1.0, a);
        }
        b.person(0, 0, 0);
      }
    },
    {
      id: 'newgrange',
      name: 'Newgrange',
      place: 'Boyne Valley, County Meath, Ireland',
      date: 'About 3200 BC',
      material: 'About 200,000 tonnes of stone and earth, ringed by 97 kerbstones',
      size: 'Mound about 85 m across; passage 19 m; roof 6 m high',
      built: [
        'A stone passage 19 m long runs into the mound and opens into a chamber shaped like a cross, with three recesses.',
        'The roof is corbelled: each ring of slabs sits a little further in than the one below, until a single capstone closes the top 6 m above the floor. No mortar is used. The slabs tilt slightly outward and carry cut grooves, so water drains away from the chamber, and it has stayed dry for five thousand years.',
        'Above the entrance is an opening called the roof-box. For a few days round the winter solstice the rising sun shines through it and along the passage, and lights the chamber floor for about 17 minutes.',
        'The model shows the passage, the chamber, its three recesses and the stepped roof inside the outline of the mound. Sizes of the chamber are approximate.'
      ],
      room: null,
      ratios: [],
      ratioNote: 'No units or design ratios are established for Newgrange. No ratio is offered here.',
      acoustics: [
        { status: 'measured', text: 'Newgrange has a strong acoustic resonance at about 110 Hz. The same study found a resonance between 95 and 120 Hz in all six stone chambers it tested in Britain and Ireland, despite their different shapes and sizes (Jahn, Devereux and Ibison, 1996).' },
        { status: 'computed', text: 'A 110 Hz sound has a wavelength of 3.1 m, about the width of the chamber. The chamber is too irregular for a simple formula to predict its resonance.' },
        { status: 'measured', text: 'A small 2008 study of 30 volunteers reported a change in the pattern of brain activity while listening to 110 Hz, compared with nearby tones (Cook, Pajot and Leuchter). It has not been repeated at scale.' },
        { status: 'claimed', text: 'That the builders chose 110 Hz on purpose. A chamber of roughly this size will resonate somewhere near there whatever the intent; 110 Hz is also in the range of a low male voice.' }
      ],
      sources: ['R. Jahn, P. Devereux and M. Ibison, Journal of the Acoustical Society of America 99 (1996)', 'I. Cook, S. Pajot and A. Leuchter, Time and Mind 1 (2008)', 'M. J. O\'Kelly, Newgrange: Archaeology, Art and Legend (1982)'],
      closeUp: 'Passage and chamber',
      parts: function (b, close) {
        var x0 = -42.5, len = 19, i;
        if (close) {
          b.box('ground', x0 + 13, 0, -0.4, 34, 14, 0.4);
        } else {
          b.cylinder('ghost', 0, 0, 0.05, 42.5, 30, 11, 40);               // the mound
          b.box('ground', 0, 0, -0.5, 88, 88, 0.5);
        }
        // the passage runs in from the south-east edge (here: from -x) toward the centre
        b.box('solid', x0 + len / 2, 0, 0, len, 1.9, 0.12);
        b.box('solid', x0 + len / 2, -0.75, 0.12, len, 0.4, 1.7);
        b.box('solid', x0 + len / 2, 0.75, 0.12, len, 0.4, 1.7);
        b.box('ghost', x0 + len / 2, 0, 1.82, len, 1.9, 0.35);             // roof slabs
        // chamber: a central space with three recesses
        var cx = x0 + len + 1.6;
        b.box('solid', cx, 0, 0, 6.6, 6.4, 0.12);
        b.box('solid', cx + 2.5, 0, 0.12, 0.4, 2.2, 1.9);                  // end recess
        b.box('solid', cx, 2.9, 0.12, 2.4, 0.4, 1.9);                      // side recesses
        b.box('solid', cx, -2.9, 0.12, 2.4, 0.4, 1.9);
        // the corbelled roof: rings stepping inward to a capstone at 6 m
        for (i = 0; i < 9; i++) {
          var half = 2.6 - i * 0.26, z = 2.0 + i * 0.42, t = 0.5;
          b.box('solid', cx, half + t / 2, z, 2 * half + 2 * t, t, 0.42);
          b.box('solid', cx, -half - t / 2, z, 2 * half + 2 * t, t, 0.42);
          b.box('solid', cx + half + t / 2, 0, z, t, 2 * half, 0.42);
          b.box('solid', cx - half - t / 2, 0, z, t, 2 * half, 0.42);
        }
        b.box('solid', cx, 0, 2.0 + 9 * 0.42, 1.6, 1.6, 0.25);
        b.person(cx, 0, 0.12);
      }
    }
  ];

  function find(id) {
    for (var i = 0; i < STRUCTURES.length; i++) if (STRUCTURES[i].id === id) return STRUCTURES[i];
    return null;
  }

  /*
   * The shapes of one structure as meshes. See Builder.result for the fields.
   * close: for a structure with a closeUp, leave out its surroundings so the
   * interior fills the view.
   */
  function model(id, close) {
    var s = find(id);
    if (!s) return null;
    var b = new Builder();
    s.parts(b, !!(close && s.closeUp));
    return b.result();
  }

  /* Each ratio of a structure with its value, nearest simple fraction and nearest interval. */
  function analyse(structure) {
    return structure.ratios.map(function (r) {
      var value = r.a / r.b;
      return {
        label: r.label, a: r.a, b: r.b, unit: r.unit, whole: !!r.whole, note: r.note || '',
        value: value, fraction: simpleFraction(value, 16), interval: nearestInterval(value)
      };
    });
  }

  var api = {
    SPEED_OF_SOUND: SPEED_OF_SOUND,
    CUBIT: CUBIT,
    CLOSE_CENTS: CLOSE_CENTS,
    INTERVALS: INTERVALS,
    STRUCTURES: STRUCTURES,
    STATUSES: ['measured', 'computed', 'claimed'],
    nearestInterval: nearestInterval,
    simpleFraction: simpleFraction,
    boxModes: boxModes,
    boxPressure: boxPressure,
    modeSlice: modeSlice,
    audible: audible,
    Builder: Builder,
    find: find,
    model: model,
    analyse: analyse
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (root.SP = root.SP || {}).ancient = api;
})(typeof self !== 'undefined' ? self : this);
