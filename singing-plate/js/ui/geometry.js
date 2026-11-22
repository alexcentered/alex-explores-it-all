/*
 * ui/geometry.js -- runs the Geometry page.
 *
 * The solids, their waves and the fractals come from core/solids.js. This
 * file lays them out, drives the 3D view and plays the Hear buttons.
 */
(function (root) {
  'use strict';

  var SP = root.SP;
  var solids = SP.solids, growth = SP.growth, ancient = SP.ancient, freq = SP.freq, safety = SP.safety;
  var CONSOLE_KEY = 'singing-plate:v1';
  var KEY = 'singing-plate:geometry:v1';
  var HEAR_MS = 3000;
  var SWING_SECONDS = 3.2;       // one full swing of the wave on screen
  var BALL_LEVEL = 4;            // 5,120 triangles: smooth, and light enough to reshape every frame
  var SPARK_GRID = 121;          // cells along each side of the spark's grid
  var SPARK_PER_FRAME = 8;       // steps of growth per frame of animation
  var SPARK = { id: 'spark', name: 'Spark' };

  // The three waves, lowest first, each named for the pair of solids it joins.
  var WAVES = [
    { l: 3, id: 'tetrahedron', name: 'Tetrahedron' },
    { l: 4, id: 'cube', name: 'Cube and octahedron' },
    { l: 6, id: 'icosahedron', name: 'Dodecahedron and icosahedron' }
  ];

  function $(id) { return document.getElementById(id); }

  var el = {};
  var theme = 'dark';
  var ceilingDb = safety.DEFAULT_CEILING_DB;
  var reducedMotion = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var state = { item: 'cube', view: 'both', moving: !reducedMotion, depth: { sierpinski: 3, menger: 2 }, radius: 1, volume: 0.25, spark: { shape: 'point', eta: 1 } };
  var spark = null, sparkSeed = 1, sparkShown = -1;
  var viewer = null, view = null, ball = null;
  var duo = new SP.Duo();
  var sounding = '', soundTimer = null;
  var swing = 0, last = 0;       // swing: where the wave is in its cycle, in radians

  /* ----------------------------------------------------------- storage */

  function readJson(key) {
    try { return JSON.parse(localStorage.getItem(key) || 'null') || {}; } catch (e) { return {}; }
  }

  function num(v, lo, hi, fallback) {
    v = Number(v);
    return isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;
  }

  function known(id) { return !!(solids.find(id) || solids.findFractal(id)) || id === SPARK.id; }

  function load() {
    var s = readJson(KEY), c = readJson(CONSOLE_KEY);
    if (known(s.item)) state.item = s.item;
    if (s.view === 'solid' || s.view === 'wave' || s.view === 'both') state.view = s.view;
    if (s.depth) {
      state.depth.sierpinski = Math.round(num(s.depth.sierpinski, 0, 6, 3));
      state.depth.menger = Math.round(num(s.depth.menger, 0, 3, 2));
    }
    if (s.spark) {
      state.spark.shape = s.spark.shape === 'plane' ? 'plane' : 'point';
      state.spark.eta = Math.round(num(s.spark.eta, 0, 4, 1) * 2) / 2;
    }
    state.radius = num(s.radius, 0.5, 5, state.radius);
    state.volume = num(s.volume, 0, 1, state.volume);
    theme = c.theme === 'light' ? 'light' : 'dark';
    if (c.ceilingDb !== undefined) ceilingDb = safety.sanitizeCeilingDb(c.ceilingDb);
    var hash = (root.location.hash || '').slice(1);
    if (known(hash)) state.item = hash;
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify({ item: state.item, view: state.view, depth: state.depth, radius: state.radius, volume: state.volume, spark: state.spark }));
    } catch (e) { /* not fatal */ }
  }

  /* ------------------------------------------------------------- small */

  function make(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function fact(list, name, value) {
    var row = make('div');
    row.appendChild(make('dt', '', name));
    row.appendChild(make('dd', '', value));
    list.appendChild(row);
  }

  function hz(f) { return f >= 100 ? f.toFixed(0) : f.toFixed(1); }

  /* ------------------------------------------------------------- sound */

  function stopSound() {
    clearTimeout(soundTimer);
    if (duo.playing) duo.stop();
    sounding = '';
    renderSoundButtons();
  }

  function hear(key, base, second) {
    if (sounding === key) { stopSound(); return; }
    stopSound();
    if (!SP.Duo.isSupported()) return;
    duo.start({ base: base, spacing: Math.max(0, (second || base) - base), volume: state.volume, ceilingDb: ceilingDb });
    sounding = key;
    renderSoundButtons();
    soundTimer = setTimeout(stopSound, HEAR_MS);
  }

  function renderSoundButtons() {
    document.querySelectorAll('[data-hear]').forEach(function (b) {
      var on = b.dataset.hear === sounding;
      b.textContent = on ? 'Stop' : b.dataset.label;
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  function hearButton(key, label, aria, play) {
    var b = make('button', 'btn', label);
    b.type = 'button';
    b.dataset.hear = key;
    b.dataset.label = label;
    b.setAttribute('aria-label', aria);
    b.addEventListener('click', play);
    return b;
  }

  /* ------------------------------------------------------------ picker */

  function renderPicker() {
    function fill(list, items, place) {
      list.textContent = '';
      items.forEach(function (s) {
        var b = make('button', 'pick');
        b.type = 'button';
        b.setAttribute('role', 'radio');
        b.dataset.id = s.id;
        b.appendChild(make('span', 'pick-name', s.name));
        b.appendChild(make('span', 'pick-place', place(s)));
        b.addEventListener('click', function () { choose(s.id); });
        list.appendChild(b);
      });
    }
    fill(el.solidList, solids.SOLIDS, function (s) { return s.F + ' ' + s.faceName; });
    fill(el.fractalList, solids.FRACTALS.concat([SPARK]), function (f) {
      return f.id === SPARK.id ? 'Grown, not drawn' : 'Dimension ' + solids.dimension(f.copies, f.shrink).toFixed(2);
    });
  }

  function choose(id) {
    if (!known(id) || id === state.item) return;
    stopSound();
    state.item = id;
    render(true);
    save();
  }

  /* ------------------------------------------------------------ render */

  function render(resetCamera) {
    document.querySelectorAll('.pick').forEach(function (b) {
      b.setAttribute('aria-checked', b.dataset.id === state.item ? 'true' : 'false');
    });
    var solid = solids.find(state.item);
    el.sparkBlock.hidden = state.item !== SPARK.id;
    if (state.item !== SPARK.id) spark = null;
    if (solid) renderSolid(solid);
    else if (state.item === SPARK.id) renderSpark(true);
    else renderFractal(solids.findFractal(state.item));
    el.soundPanel.hidden = !solid;            // the three waves belong to the solids
    if (resetCamera) resetView();
  }

  /* The solids are seen from a corner; the spark is flat, so it is faced nearly square on. */
  function resetView() {
    if (!viewer || !viewer.ok) return;
    viewer.resetView();
    if (state.item === SPARK.id) {
      viewer.camera.position.set(0.9, -4.2, 0.45);
      viewer.controls.update();
    }
  }

  function renderSolid(solid) {
    var dual = solids.dualOf(solid.id), wave = solids.waveFor(solid.id);
    el.viewTitle.textContent = solid.name;
    el.viewSeg.hidden = false;
    el.depthBlock.hidden = true;
    el.waveBlock.hidden = false;
    el.fractalBlock.hidden = true;
    el.waveTitle.textContent = 'As a vibration';

    el.factList.textContent = '';
    fact(el.factList, 'Faces', solid.F + ' ' + solid.faceName);
    fact(el.factList, 'Edges', String(solid.E));
    fact(el.factList, 'Corners', solid.V + ', with ' + solid.q + ' faces meeting at each');
    fact(el.factList, 'Check', solid.V + ' − ' + solid.E + ' + ' + solid.F + ' = 2, as for every solid without holes');
    fact(el.factList, 'Between faces', solid.dihedral.toFixed(2) + '°');
    fact(el.factList, 'Dual', solid.dual === solid.id ? 'Itself' : dual.name);
    fact(el.factList, 'Turns', solid.rotations + ' ways to turn it onto itself');

    el.noteText.textContent = '';
    el.noteText.appendChild(make('p', '', solid.note));
    el.noteText.appendChild(make('h3', 'label', 'Where it turns up'));
    el.noteText.appendChild(make('p', '', solid.found));
    el.noteText.appendChild(make('h3', 'label', 'Plato\'s element'));
    var p = make('p', '', solid.element + '. ');
    var t = make('span', 'tag', 'Philosophy, not physics');
    t.dataset.status = 'claimed';
    p.appendChild(t);
    el.noteText.appendChild(p);

    var low = solids.waveValue(wave, dual.vertices[0][0], dual.vertices[0][1], dual.vertices[0][2]);
    var self = solid.dual === solid.id;
    el.waveText.textContent = 'The lowest wave on a sphere with this symmetry has degree ' + wave.l + '. At one end of its swing the surface bulges at '
      + solid.V + ' points, the corners of ' + article(solid.name) + '. Half a cycle later it bulges at ' + dual.V + ', the corners of '
      + (self ? 'a second tetrahedron pointing the other way.' : article(dual.name) + '.');
    el.viewCaption.textContent = state.view === 'solid' ? solid.F + ' ' + solid.faceName + ', ' + solid.E + ' edges, ' + solid.V + ' corners.'
      : state.view === 'wave' ? 'A standing wave of degree ' + wave.l + ' on a sphere.'
      : 'Bright cage: the ' + solid.name.toLowerCase() + '. Faint cage: its dual.';
    el.moveBtn.hidden = state.view === 'solid';
    renderMove();

    if (view && view.ok) {
      view.clear();
      if (state.view === 'solid') {
        var mesh = solids.solidMesh(solid, 1);
        view.addFlat(mesh);
        view.addEdges(mesh.edges, 1.002, false);
      } else {
        view.addWave(ball, solids.waveOnSphere(wave, ball));
        if (state.view === 'both') {
          view.addEdges(solids.solidMesh(solid, 1).edges, SP.GeometryView.reach(1), false);
          view.addEdges(solids.solidMesh(dual, 1).edges, SP.GeometryView.reach(low), true);
        }
        view.setSwing(Math.cos(swing));
      }
    }
    renderWaves();
  }

  function article(name) {
    return (/^[aeio]/i.test(name) ? 'an ' : 'a ') + name.toLowerCase();
  }

  /* The three waves as cards, with how fast a drop of the chosen size rings in each. */
  function renderWaves() {
    var solid = solids.find(state.item);
    el.radiusOut.textContent = state.radius.toFixed(1) + ' mm';
    el.waveList.textContent = '';
    WAVES.forEach(function (w) {
      var f = solids.dropFrequency(w.l, state.radius), note = freq.noteInfo(f);
      var mine = solid && solids.waveFor(solid.id).l === w.l;
      var card = make('div', 'ratio-card');
      if (mine) card.dataset.current = 'true';
      card.appendChild(make('p', 'label', 'Degree ' + w.l + ' · ' + w.name));
      card.appendChild(make('p', 'ratio-value', hz(f) + ' Hz  ·  ' + note.label + ' ' + freq.formatCents(note.cents)));
      var foot = make('div', 'ratio-foot');
      var heard = ancient.audible(f);
      foot.appendChild(make('span', 'hint', heard.octaves > 0 ? 'Played ' + heard.octaves + (heard.octaves === 1 ? ' octave' : ' octaves') + ' up' : mine ? 'The wave on show' : ''));
      foot.appendChild(hearButton('wave-' + w.l, 'Hear', 'Hear the degree ' + w.l + ' wave', function () { hear('wave-' + w.l, heard.freq); }));
      card.appendChild(foot);
      el.waveList.appendChild(card);
    });
    renderBetween();
  }

  /* The intervals between the three waves. They depend only on the degrees, not on the size of the drop. */
  function renderBetween() {
    el.betweenList.textContent = '';
    [[0, 1], [1, 2], [0, 2]].forEach(function (pair) {
      var a = WAVES[pair[0]], b = WAVES[pair[1]];
      var ratio = solids.dropFrequency(b.l, 1) / solids.dropFrequency(a.l, 1);
      var i = ancient.nearestInterval(ratio);
      var li = make('li', 'sound-item');
      li.appendChild(make('p', 'label', 'Degree ' + a.l + ' to degree ' + b.l));
      var text;
      if (Math.abs(i.cents - 1800) < 1e-6) text = 'Exactly an octave and a half: ' + ratio.toFixed(3) + ' to 1, which is 2√2. Half an octave is the equal-tempered tritone, √2 to 1, which is not a ratio of whole numbers.';
      else if (i.close) text = i.name + ', ' + freq.formatCents(i.off) + ' from pure: ' + ratio.toFixed(3) + ' to 1.';
      else text = 'No simple interval: ' + ratio.toFixed(3) + ' to 1, which is ' + freq.formatCents(i.off) + ' from the nearest, ' + (i.octaves ? 'an octave and a ' : 'a ') + i.name.toLowerCase() + '.';
      li.appendChild(make('p', '', text));
      var fa = ancient.audible(solids.dropFrequency(a.l, state.radius)).freq;
      li.appendChild(hearButton('pair-' + a.l + '-' + b.l, 'Hear both', 'Hear degrees ' + a.l + ' and ' + b.l + ' together',
        function () { hear('pair-' + a.l + '-' + b.l, fa, fa * ratio); }));
      el.betweenList.appendChild(li);
    });
    var note = make('li', 'sound-item');
    note.appendChild(make('p', '', 'These ratios come from the formula alone, √(l (l − 1)(l + 2)), so they are the same for a drop of any size. A sphere\'s notes are not a musical scale: unlike a string, its overtones are not whole-number multiples.'));
    el.betweenList.appendChild(note);
    renderSoundButtons();
  }

  function renderFractal(f) {
    var depth = state.depth[f.id], facts = solids.fractalFacts(f.id, depth);
    el.viewTitle.textContent = f.name;
    el.viewSeg.hidden = true;
    el.moveBtn.hidden = true;
    el.depthBlock.hidden = false;
    el.waveBlock.hidden = true;
    el.fractalBlock.hidden = false;
    el.waveTitle.textContent = 'Self-similarity';
    el.depth.max = f.maxDepth;
    el.depth.value = depth;
    el.depthOut.textContent = depth + ' of ' + f.maxDepth;
    el.depthHint.textContent = f.note;
    el.viewCaption.textContent = facts.pieces.toLocaleString('en-US') + (facts.pieces === 1 ? ' piece.' : ' pieces.');

    el.factList.textContent = '';
    fact(el.factList, 'Made of', f.copies + ' copies of itself');
    fact(el.factList, 'Each copy', f.shrink + ' times smaller');
    fact(el.factList, 'Dimension', 'log ' + f.copies + ' ÷ log ' + f.shrink + ' = ' + facts.dimension.toFixed(4).replace(/\.?0+$/, ''));
    el.noteText.textContent = '';
    el.noteText.appendChild(make('p', '', f.note));

    el.fractalFacts.textContent = '';
    fact(el.fractalFacts, 'Steps', String(depth));
    fact(el.fractalFacts, 'Pieces', facts.pieces.toLocaleString('en-US'));
    fact(el.fractalFacts, 'Volume left', (facts.volume * 100).toFixed(facts.volume < 0.1 ? 2 : 1) + '%');
    fact(el.fractalFacts, 'Surface', '× ' + facts.area.toFixed(2));
    el.fractalOdd.textContent = f.odd;

    if (view && view.ok) {
      view.clear();
      view.addFlat(solids.fractalMesh(f.id, depth));
    }
  }

  /* ------------------------------------------------------------- spark */

  var ETA_TEXT = [
    [0, 'Ignores the field: every edge cell is equally likely, and it grows as a solid blob.'],
    [0.5, 'Barely follows the field: thick and bushy.'],
    [1, 'The standard rule: chance in step with the field. Published dimension about 1.7 when grown from a point.'],
    [2, 'Follows the field closely: fewer, longer branches. Nearer to how lightning looks.'],
    [3, 'Follows the field very closely: little more than one channel with twigs.']
  ];

  function etaText(eta) {
    var text = ETA_TEXT[0][1];
    ETA_TEXT.forEach(function (row) { if (eta >= row[0]) text = row[1]; });
    return text;
  }

  /* fresh: start a new spark. Otherwise only the readouts are brought up to date. */
  function renderSpark(fresh) {
    var sp = state.spark;
    if (fresh) {
      spark = growth.create({ n: SPARK_GRID, shape: sp.shape, eta: sp.eta, seed: sparkSeed, maxCells: 4000 });
      sparkShown = -1;
      if (reducedMotion) growth.grow(spark, 1e9);      // no animation asked for: show it finished
      if (view && view.ok) { view.clear(); view.addElectrode(sp.shape); }
    }
    el.viewTitle.textContent = SPARK.name;
    el.viewSeg.hidden = true;
    el.moveBtn.hidden = true;
    el.depthBlock.hidden = true;
    el.waveBlock.hidden = true;
    el.fractalBlock.hidden = false;
    el.waveTitle.textContent = 'Growth';
    var r = document.querySelector('input[name="sparkShape"][value="' + sp.shape + '"]');
    if (r) r.checked = true;
    el.eta.value = sp.eta;
    el.etaOut.textContent = sp.eta.toFixed(1);
    el.etaHint.textContent = etaText(sp.eta);

    el.factList.textContent = '';
    fact(el.factList, 'Made by', 'Growth, one step at a time');
    fact(el.factList, 'Each step', 'Chance in proportion to (voltage at the edge) ^ η. The slider under the picture sets η.');
    fact(el.factList, 'Then', 'The voltage everywhere is worked out again');
    fact(el.factList, 'Model', 'Dielectric breakdown (Niemeyer, Pietronero and Wiesmann, 1984)');
    el.noteText.textContent = '';
    el.noteText.appendChild(make('p', '', 'A discharge spreading from a point toward a ring electrode, or from a cloud toward the ground. The faint line is the electrode. Stronger lines carry more of the pattern beyond them, as the trunk of a real discharge carries more current.'));
    el.noteText.appendChild(make('h3', 'label', 'Where it turns up'));
    el.noteText.appendChild(make('p', '', 'Lightning, the streamers from a Tesla coil, and Lichtenberg figures: the branching trees a spark burns into plastic or leaves on the skin.'));
    el.fractalOdd.textContent = 'Unlike the two fractals above, this one is not built from exact copies of itself, and no two are alike. It is self-similar on average: a branch looks statistically like the whole.';
    renderSparkFacts();
  }

  function renderSparkFacts() {
    if (!spark) return;
    var steps = spark.order.length - 1, d = growth.dimension(spark);
    sparkShown = spark.order.length;
    el.viewCaption.textContent = steps.toLocaleString('en-US') + (steps === 1 ? ' step.' : ' steps.');
    el.sparkState.textContent = !spark.done ? 'Growing…' : spark.reached ? 'Reached the electrode.' : 'Stopped at ' + steps.toLocaleString('en-US') + ' steps.';
    el.fractalFacts.textContent = '';
    fact(el.fractalFacts, 'Steps', steps.toLocaleString('en-US'));
    fact(el.fractalFacts, 'Dimension', isNaN(d) ? 'Too small to measure yet' : d.toFixed(2) + ' for this one, so far');
    fact(el.fractalFacts, 'Published', 'About ' + growth.PUBLISHED_DIMENSION + ' for η = 1 grown from a point');
    fact(el.fractalFacts, 'Measured by', state.spark.shape === 'point'
      ? 'Counting cells within each distance of the start'
      : 'The same count, which is rougher for a spark that starts at an edge');
    if (view && view.ok) view.setSpark(growth.bonds(spark));
  }

  function renderMove() {
    el.moveBtn.textContent = state.moving ? 'Freeze' : 'Move';
    el.moveBtn.setAttribute('aria-pressed', state.moving ? 'true' : 'false');
  }

  function renderFive() {
    var body = el.fiveTable.querySelector('tbody');
    body.textContent = '';
    var names = { 3: 'triangles', 4: 'squares', 5: 'pentagons', 6: 'hexagons' };
    [[3, 3], [3, 4], [3, 5], [3, 6], [4, 3], [4, 4], [5, 3], [5, 4], [6, 3]].forEach(function (c) {
      var sum = solids.cornerAngleSum(c[0], c[1]), row = make('tr');
      var match = solids.SOLIDS.filter(function (s) { return s.p === c[0] && s.q === c[1]; })[0];
      row.appendChild(make('th', '', c[1] + ' ' + names[c[0]]));
      row.appendChild(make('td', '', Math.round(sum) + '°'));
      row.appendChild(make('td', '', match ? match.name : sum > 360 + 1e-9 ? 'Too much: cannot close' : 'Lies flat'));
      body.appendChild(row);
    });
  }

  /* -------------------------------------------------------------- loop */

  function frame(now) {
    var dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
    last = now;
    if (viewer && viewer.ok) {
      if (state.moving && view.wave) {
        swing += dt * 2 * Math.PI / SWING_SECONDS;
        view.setSwing(Math.cos(swing));
      }
    }
    if (spark && state.item === SPARK.id) {
      var growing = !spark.done;
      if (growing) growth.grow(spark, SPARK_PER_FRAME);
      if (growing || spark.order.length !== sparkShown) renderSparkFacts();
    }
    if (viewer && viewer.ok) viewer.render();
    root.requestAnimationFrame(frame);
  }

  /* ------------------------------------------------------------- theme */

  function applyTheme(next) {
    theme = next === 'light' ? 'light' : 'dark';
    document.documentElement.dataset.theme = theme;
    var other = theme === 'dark' ? 'light' : 'dark';
    el.themeBtn.textContent = other === 'light' ? 'Light' : 'Dark';
    el.themeBtn.setAttribute('aria-label', 'Switch to ' + other + ' theme');
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', getComputedStyle(document.documentElement).getPropertyValue('--bg').trim());
    if (viewer) viewer.setTheme(theme);
    if (view) view.setTheme(theme);
    if (spark && view && view.ok) view.setSpark(growth.bonds(spark));     // its shading depends on the theme
  }

  /* -------------------------------------------------------------- init */

  function init() {
    ['themeBtn', 'solidList', 'fractalList', 'factList', 'noteText', 'viewTitle', 'viewSeg', 'viewReset', 'stage', 'stageMsg',
      'viewCaption', 'moveBtn', 'depthBlock', 'depth', 'depthOut', 'depthHint', 'waveTitle', 'waveBlock', 'waveText', 'radius',
      'radiusOut', 'waveList', 'fractalBlock', 'fractalFacts', 'fractalOdd', 'betweenList', 'volume', 'volumeOut', 'fiveTable',
      'sparkBlock', 'eta', 'etaOut', 'etaHint', 'sparkAgain', 'sparkState', 'soundPanel'
    ].forEach(function (id) { el[id] = $(id); });

    load();

    viewer = new SP.Viewer(el.stage);
    view = new SP.GeometryView(viewer);
    ball = solids.sphere(BALL_LEVEL);
    if (!viewer.ok) {
      el.stageMsg.hidden = false;
      el.stageMsg.textContent = 'This browser cannot show 3D here. The numbers and the sounds still work.';
    }

    var r = document.querySelector('input[name="view"][value="' + state.view + '"]');
    if (r) r.checked = true;
    el.radius.value = state.radius;
    el.volume.value = Math.round(state.volume * 100);
    el.volumeOut.textContent = Math.round(state.volume * 100) + '%';

    applyTheme(theme);
    renderPicker();
    renderFive();
    render(true);

    document.querySelectorAll('input[name="view"]').forEach(function (input) {
      input.addEventListener('change', function () { state.view = input.value; render(false); save(); });
    });
    el.viewReset.addEventListener('click', resetView);
    el.moveBtn.addEventListener('click', function () {
      state.moving = !state.moving;
      // frozen, the wave is held at the top of its swing, where it matches the bright cage
      if (!state.moving) { swing = 0; if (view) view.setSwing(1); }
      renderMove();
    });
    el.depth.addEventListener('input', function () {
      var f = solids.findFractal(state.item);
      if (!f) return;
      state.depth[f.id] = Math.round(num(el.depth.value, 0, f.maxDepth, 0));
      renderFractal(f); save();
    });
    document.querySelectorAll('input[name="sparkShape"]').forEach(function (input) {
      input.addEventListener('change', function () { state.spark.shape = input.value; renderSpark(true); save(); });
    });
    el.eta.addEventListener('input', function () {
      state.spark.eta = Math.round(num(el.eta.value, 0, 4, 1) * 2) / 2;
      renderSpark(true); save();
    });
    el.sparkAgain.addEventListener('click', function () { sparkSeed += 1; renderSpark(true); });
    el.radius.addEventListener('input', function () {
      state.radius = num(el.radius.value, 0.5, 5, state.radius);
      stopSound();
      renderWaves(); save();
    });
    el.volume.addEventListener('input', function () {
      state.volume = num(Number(el.volume.value) / 100, 0, 1, state.volume);
      el.volumeOut.textContent = Math.round(state.volume * 100) + '%';
      if (duo.playing) duo.setVolume(state.volume, ceilingDb);
      save();
    });
    el.themeBtn.addEventListener('click', function () {
      applyTheme(theme === 'dark' ? 'light' : 'dark');
      try {
        var s = readJson(CONSOLE_KEY);
        s.theme = theme;
        localStorage.setItem(CONSOLE_KEY, JSON.stringify(s));
      } catch (e) { /* not fatal */ }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && sounding) { stopSound(); e.preventDefault(); }
    });
    root.addEventListener('pagehide', stopSound);
    root.addEventListener('hashchange', function () {
      var id = (root.location.hash || '').slice(1);
      if (known(id)) choose(id);
    });

    root.requestAnimationFrame(frame);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  // Exposed for debugging from the browser console; not a public API.
  SP.geometryPage = {
    current: function () {
      return {
        state: state, swing: swing, sounding: sounding, webgl: !!(viewer && viewer.ok),
        shapes: view && view.ok ? view.group.children.length : 0,
        spark: spark ? { cells: spark.order.length, done: spark.done, reached: spark.reached, seed: spark.seed, eta: spark.eta, shape: spark.shape, dimension: growth.dimension(spark) } : null
      };
    },
    duo: duo
  };
})(typeof self !== 'undefined' ? self : this);
