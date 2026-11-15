# Singing Plate

Two tools for a desktop Chladni plate rig, in one app:

- **Console** (`index.html`): sends a pure tone to an amplifier and vibration driver. A metal plate bolted to the driver resonates, and sand on the plate collects along the lines that stay still. The console is the signal source, the sweep controller, the logbook and a simulator of what the sand should do.
- **3D lab** (`lab.html`): pick a frequency, see the 3D form its standing wave would make, and export it as an STL for printing.

The hardware plan and parts list are in [docs/MISSION_BRIEF.md](docs/MISSION_BRIEF.md).

## Run it

No install and no build step.

- **Simplest:** open `index.html` in a browser.
- **Served locally** (some browsers are stricter about files opened directly): `npm start`, then visit <http://localhost:8080>.

Test with headphones at low volume before connecting the amplifier.

## The console

| Area | What you get |
| --- | --- |
| Frequency | 20 Hz to 5 kHz. Logarithmic coarse dial, exact entry, ±0.1 / ±1 / ±10 Hz buttons, a spring-return fine trim, and keyboard nudges |
| Readout | Frequency, nearest note with cents offset, wavelength in air, period |
| Waveform | Sine by default; triangle and square for experiments |
| Output | Fade in and fade out on every start, stop and waveform change; volume; hard limiter with adjustable ceiling; low-frequency driver guard; live scope and peak meter |
| Sweep | Glide between two frequencies at a set rate in Hz per second. Lock freezes the sweep while the tone keeps holding; resume carries on from wherever you nudged to |
| Simulator | Predicted sand pattern for the current frequency, a list of predicted resonances to jump to, and one-button alignment of the model to your real plate |
| Pattern log | Save a frequency with a name, notes and a photo. Recall, edit, delete, export and import |
| Theme | Dark by default, light on request, monochrome throughout |

## Keys

| Key | Action |
| --- | --- |
| `Space` | Engage or cease the tone |
| `Esc` | Emergency silence |
| `←` `→` | Nudge 1 Hz |
| `Shift` + `←` `→` | Nudge 10 Hz |
| `,` `.` | Nudge 0.1 Hz |
| `S` | Start, lock or resume the sweep |
| `[` `]` | Volume down or up 5% |
| `L` | Log the current pattern |
| `R` | Re-scatter the simulated sand |

`Space` is the tone key everywhere except inside text boxes; use `Enter` to press a focused button.

## Finding patterns

1. Set the sweep to run from about 100 Hz upward at a few Hz per second and start it.
2. Watch the sand. When lines sharpen, press `S` to lock.
3. Walk the frequency with `,` and `.` until the lines are at their crispest.
4. Press `L`, name it, add a photo, save.
5. Press `S` to resume.

The tick marks on the sweep bar show where the model expects resonances, so you know when to pay attention.

## Safety design

Loudness is limited in three independent layers, so no single fault produces a loud output:

1. **Commanded gain** is the product of factors that are each at most 1, capped at the ceiling. Invalid input resolves to silence.
2. **A hard clipper** after the gain stage enforces the same ceiling on the samples themselves. It is verified by forcing the gain stage wide open and measuring the output.
3. **Envelopes** on every start, stop and waveform change, so the driver never sees a step.

Also:

- Volume is not remembered between sessions. Every session starts at 25%.
- A square wave carries twice the power of a sine at the same peak, so it is trimmed 3 dB.
- The driver guard scales level down below 60 Hz, where long strokes overheat a driver or bottom it out. It can be switched off, and the console says so when it is.
- `Esc` silences the output from anywhere on the page.

The limiter caps what leaves the app. It cannot know how loud your amplifier is: bring the amplifier up from zero each session and wear hearing protection.

## The simulator, honestly

The model treats the plate as an ideal thin square plate with free edges, driven at its centre. Mode shapes are `cos(m π x) cos(n π y)`, mode frequencies are `C (m² + n²)` with `C` from the plate's size, thickness and material, and only modes that move at the centre (even `m` and `n`) are excited. At any frequency the picture is the sum of all such modes, each weighted by how near it is to resonance.

That gets the family of shapes and their order right. It does not get exact frequencies right: a real plate has a bolt and washers adding mass at the centre, edges that do not behave ideally, and metal that is not perfectly uniform. Expect real resonances near the predictions, not on them.

Once you find a real resonance whose pattern matches a predicted one, open **Plate setup** and press **Align model to this frequency**. That rescales every prediction to your plate.

## The 3D lab

Three shapes, each chosen either by frequency or directly by mode numbers:

| Shape | What it shows | How frequency picks the form |
| --- | --- | --- |
| Plate | The Chladni pattern lifted into relief: either the plate caught mid-swing, or the sand lines raised as ridges | The same driven-plate model as the console, using the plate set up there |
| Sphere | Standing waves on a ball, the shapes a vibrating droplet takes (spherical harmonics) | Rayleigh's formula for a water drop of the radius you set |
| Room | Standing waves inside a cube, drawn as the sheets where the air stays still | Room-mode formula for a cube of the side you set |

- **Viewer:** drag to orbit, scroll or pinch to zoom. The wave animates; **Freeze** stops it where it is and **Freeze at peak** stops it at its most pronounced.
- **2D pattern:** the matching flat picture sits beside the 3D form: nodal lines on the plate, the sphere's still lines unrolled like a map, or a slice through the room.
- **Pattern log:** any pattern saved on the console can be opened here, from the picker or from the **3D** button on a log entry.
- **Hear it:** plays the form's frequency through the same limited, faded output as the console.

### Printing

A wave pattern has no thickness, so each shape is given what a printer needs: the plate gets a base slab, the sphere a flat cut underneath so it stands, and the room's node sheets a wall thickness plus an optional slab that ties them together.

**Check and build** makes the print file at export resolution (finer than the preview, and independent of it) and inspects it:

| Check | What it means |
| --- | --- |
| Watertight | The surface is closed. If not, the download is withheld |
| One piece | Nothing is floating or loose. Fails with the number of separate pieces |
| Thickness | The thinnest designed feature is at least 0.8 mm |
| Detail | The wall is wide enough for the chosen resolution to draw cleanly |

It also reports size, volume, triangle count and file size. Files are binary STL in millimetres, z up.

Some room modes really are made of separate sheets (a single mode gives flat parallel planes, for example). The check will say so; adding a base, thickening the wall, or blending the axes usually joins them.

The forms are mathematical models of standing waves, not recordings. They show the idealised shape.

## Layout

```
index.html          the console
lab.html            the 3D lab
css/styles.css      theme and layout for both
fonts/              JetBrains Mono (SIL Open Font License, see fonts/OFL.txt)
vendor/             Three.js as one local script (MIT, see vendor/THREE-LICENSE.txt)
js/core/            pure logic, no browser APIs: unit tested
  freq.js             ranges, notes, wavelength, dial mapping
  safety.js           gain law, limiter curve, driver guard
  sweep.js            sweep state machine
  chladni.js          plate model
  forms.js            sphere and room standing waves
  mesh.js             solid builders, isosurface, printability inspection, STL
js/audio/engine.js  Web Audio signal chain, shared by both pages
js/store/presets.js pattern log storage (IndexedDB), shared by both pages
js/ui/              app.js wires the console, lab.js wires the lab;
                    dial, plate view and 3D viewer are the parts they use
tests/              unit tests for js/core
tools/              entry file for rebuilding the Three.js bundle
docs/               mission brief
```

Scripts are plain files rather than ES modules so the app runs when opened straight from disk. Three.js only ships as ES modules, so it is bundled once into `vendor/three.bundle.js`. That file is committed; nothing needs installing to run the app. To upgrade Three.js or use more of it: `npm install`, edit `tools/three-entry.js`, then `npm run vendor`.

## Tests

```
npm test
```

Runs the unit tests for `js/core` on Node's built-in test runner. No dependencies to install. The mesh tests build each kind of solid and assert it is closed, correctly faced, in one piece, and the size and thickness asked for.

## Data

Everything stays in your browser. The pattern log lives in IndexedDB and settings in localStorage, both scoped to wherever the page is served from, so a log made at `localhost:8080` is separate from one made by opening the file directly. Use **Export** to move a log between them or to back it up; photos travel inside the exported file.

## Moving to its own repository

This directory is self-contained. To split it out with its history:

```
git subtree split --prefix=singing-plate -b singing-plate-only
```

then push that branch to a new repository as `main`.
