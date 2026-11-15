# Singing Plate

Frequency console for a desktop Chladni plate rig. It sends a pure tone to an amplifier and vibration driver, a metal plate bolted to the driver resonates, and sand on the plate collects along the lines that stay still. This app is the signal source, the sweep controller, the logbook and a simulator of what the sand should do.

The hardware plan, parts list and phase two scope are in [docs/MISSION_BRIEF.md](docs/MISSION_BRIEF.md).

## Run it

No install and no build step.

- **Simplest:** open `index.html` in a browser.
- **Served locally** (some browsers are stricter about files opened directly): `npm start`, then visit <http://localhost:8080>.

Test with headphones at low volume before connecting the amplifier.

## What it does

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

## Layout

```
index.html          the console
css/styles.css      theme and layout
fonts/              JetBrains Mono (SIL Open Font License, see fonts/OFL.txt)
js/core/            pure logic, no browser APIs: unit tested
  freq.js             ranges, notes, wavelength, dial mapping
  safety.js           gain law, limiter curve, driver guard
  sweep.js            sweep state machine
  chladni.js          plate model
js/audio/engine.js  Web Audio signal chain
js/store/presets.js pattern log storage (IndexedDB) and photo handling
js/ui/              dial, plate view, and the wiring between controls
tests/              unit tests for js/core
docs/               mission brief
```

Scripts are plain files rather than ES modules so the app runs when opened straight from disk.

## Tests

```
npm test
```

Runs the unit tests for `js/core` on Node's built-in test runner. No dependencies to install.

## Data

Everything stays in your browser. The pattern log lives in IndexedDB and settings in localStorage, both scoped to wherever the page is served from, so a log made at `localhost:8080` is separate from one made by opening the file directly. Use **Export** to move a log between them or to back it up; photos travel inside the exported file.

## Phase two hooks

The 3D Form Lab reuses this core unchanged: `Engine` for sound, `Store` for presets (records carry a `schema` number, the plate setup and the nearest mode), and `chladni.field()` as the height map for the plate relief.

## Moving to its own repository

This directory is self-contained. To split it out with its history:

```
git subtree split --prefix=singing-plate -b singing-plate-only
```

then push that branch to a new repository as `main`.
