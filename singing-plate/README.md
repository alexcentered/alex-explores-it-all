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
| Readout | Frequency, nearest note with cents offset, wavelength in air, period, and the ripple spacing to expect on water |
| Waveform | Sine by default; triangle and square for experiments |
| Output | Fade in and fade out on every start, stop and waveform change; volume; hard limiter with adjustable ceiling; low-frequency driver guard; live scope and peak meter |
| Sweep | Glide between two frequencies at a set rate in Hz per second. Lock freezes the sweep while the tone keeps holding; resume carries on from wherever you nudged to |
| Simulator | Predicted sand pattern for the current frequency on a square or round plate, a list of predicted resonances to jump to, and one-button alignment of the model to your real plate |
| Pattern log | Save a frequency with a name, notes, the medium on the plate and a photo, taken with the camera or chosen from files. Recall, edit, delete, export and import |
| Life signals | Who else signals at the frequency being played: sixteen species drawn as bands on a shared frequency scale, with a Tune button for each |
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

### Round plates

Set **Shape** to Round in Plate setup and the size becomes a diameter. A round plate's modes are counted in nodal diameters (straight still lines through the centre) and nodal circles (still rings). A driver at the centre can only raise modes that move at the centre, which on a round plate means rings alone, so the simulator predicts concentric circles. The mode frequencies come from solving the free-edge conditions numerically; the solver is checked against the published values for a free circular plate.

### Liquids

Swap the sand for a shallow dish of water and the surface breaks into standing ripples (Faraday waves) once the plate is shaking hard enough. They oscillate at half the drive frequency, and their spacing follows from gravity and surface tension, so the console shows the spacing to expect for the current frequency: measure it against your photo. This holds for water-like liquids a few millimetres deep. Thick mixes such as cornflour behave differently and are not modelled; log them with the Medium field and let the photo speak.

## Life signals

The console lists the bands other living things are known to signal in, drawn against the same 20 Hz to 5 kHz scale as the dial. A line marks the frequency being played, the rows it crosses light up, and **Tune** jumps to a representative frequency in any band.

| Who | Band | What it is |
| --- | --- | --- |
| Blue and fin whales | 10 to 40 Hz | Calls, and the fin whale's 20 Hz pulse |
| African elephant | 12 to 35 Hz | Contact rumbles, mostly below human hearing |
| American alligator | 18 to 20 Hz | Courtship bellow that raises Faraday waves on the water |
| Domestic cat | 25 to 150 Hz | Purr |
| Plainfin midshipman fish | 80 to 120 Hz | Mating hum |
| Humpback whale | 80 Hz to 4 kHz | Song |
| Human | 85 to 255 Hz | Speaking pitch |
| Giraffe | about 92 Hz | Night hum. Purpose unknown |
| American bullfrog | 200 to 400 Hz | Advertisement call |
| Honeybee | 200 to 500 Hz | Waggle-dance buzz and queen piping |
| Corn seedling roots | 200 to 300 Hz | Reported bending toward a tone. Early evidence |
| Beach evening primrose | 200 to 500 Hz | Nectar sweetened after bee-wing sound. Early evidence |
| Yellow fever mosquito | 400 Hz to 1.2 kHz | Courtship flight-tone duet |
| Songbirds | 1 to 8 kHz | Song |
| Spring peeper frog | 2.5 to 3.5 kHz | Peep |
| Field cricket | 4.5 to 5.2 kHz | Calling song |

Out of the console's reach, and listed for reference: bottlenose dolphin signature whistles (7 to 15 kHz), rat calls (22 kHz alarm, 50 kHz play), bat echolocation (mostly 20 to 100 kHz), and the radio frequencies used to listen for and signal to life beyond Earth (the hydrogen line at 1,420.4 MHz; the 1974 Arecibo message at 2,380 MHz). Nobody has answered the last of those.

**Read this before calling it communication.** The bands are published measurements, rounded, and they vary between individuals, populations and studies. A steady tone in an animal's band is something it can sense, and in a few cases will respond to: female crickets walk toward a speaker playing the male's tone, and male mosquitoes are drawn to the female's flight tone. That is not the same as speaking its language. Real signals carry rhythm, pulses and sweeps that one pure tone does not. The plant entries rest on a small number of studies and are labelled as early evidence.

**Go gently.** Keep the level low around animals, stop if one seems distressed, and do not play calls to wild animals: it can stress them and disrupt breeding, and it is restricted in many parks and for protected species.

Sources for the bands:

- Whales: [list of whale vocalizations](https://en.wikipedia.org/wiki/List_of_whale_vocalizations), [DOSITS on baleen whale calls](https://dosits.org/changes-in-baleen-whale-vocalizations), [National Geographic on humpback sound](https://www.nationalgeographic.com/animals/article/151207-humpback-whales-sounds-noises-oceans-animals)
- Elephant: [ElephantVoices, acoustic communication](https://www.elephantvoices.org/elephant-acoustic-communication)
- Alligator: [Science News on Moriarty and Holt's measurements](https://www.sciencenews.org/article/gators-go-courtin-fancy-physics)
- Cat: [Scientific American, why do cats purr](https://www.scientificamerican.com/article/why-do-cats-purr/)
- Midshipman: [review of midshipman hearing and calls](https://pmc.ncbi.nlm.nih.gov/articles/PMC4342331)
- Human: [voice frequency](https://en.wikipedia.org/wiki/Voice_frequency)
- Giraffe: [Baotic et al. 2015, nocturnal humming](https://pmc.ncbi.nlm.nih.gov/articles/PMC4565008)
- Frogs: [frog hearing and communication](https://en.wikipedia.org/wiki/Frog_hearing_and_communication), [calls of frogs and toads of the Northeast](https://musicofnature.com/calls-of-frogs-and-toads-of-the-northeast/) (the spring peeper band is from this field guide rather than a primary study)
- Honeybee: [Bee Culture, sound generation and hearing](https://beeculture.com/?p=15114), [Apidologie review of queen piping](https://www.apidologie.org/articles/apido/pdf/1993/03/Apidologie_0044-8435_1993_24_3_ART0009.pdf)
- Corn roots: [University of Western Australia on Gagliano's 2012 study](https://www.news.uwa.edu.au/201204034491/research/talking-plants)
- Evening primrose: [Veits et al. 2019, Ecology Letters](https://kops.uni-konstanz.de/entities/publication/dfbbe604-b565-455a-98cb-d4783dd75568/full), [National Geographic coverage](https://www.nationalgeographic.com/science/article/flowers-can-hear-bees-and-make-their-nectar-sweeter)
- Mosquito: [Cornell on Cator et al. 2009](https://news.cornell.edu/node/272570), [follow-up study](https://pmc.ncbi.nlm.nih.gov/articles/PMC6375921/)
- Songbirds: [Cornell Lab, All About Birds](https://www.allaboutbirds.org/news/?p=15841), [hearing in a small songbird](https://pubmed.ncbi.nlm.nih.gov/38656337/)
- Cricket: [carrier frequency and female tuning in field crickets](https://pmc.ncbi.nlm.nih.gov/articles/PMC2500168)
- Dolphin: [DOSITS on signature whistles](https://dosits.org/animals/use-of-sound/marine-mammal-communication/individual-specific-vocalizations)
- Rat: [Panksepp, laughing rats](https://www.museumofplay.org/app/uploads/2022/01/2-3-article-laughing-rats-panksepp.pdf)
- Beyond Earth: [SETI League on the water hole](https://setileague.org/general/waterhol.htm), [SETI Institute observations](https://seti.org/seti-institute/project/details/seti-observations), [the Arecibo message of November 1974](https://ui.adsabs.harvard.edu/abs/10.1016/0019-1035(75)90116-5/abstract)
- Bats: the commonly quoted range, not checked against a source when this table was written

## The 3D lab

Four shapes, each chosen either by frequency or directly by mode numbers:

| Shape | What it shows | How frequency picks the form |
| --- | --- | --- |
| Plate | The Chladni pattern of a square plate lifted into relief: either the plate caught mid-swing, or the sand lines raised as ridges | The same driven-plate model as the console, using the plate set up there |
| Disc | The same for a round plate: rings when driven at the centre, star shapes when picked by nodal diameters and circles | The round-plate model, at the console plate's size, thickness and metal |
| Sphere | Standing waves on a ball, the shapes a vibrating droplet takes (spherical harmonics) | Rayleigh's formula for a water drop of the radius you set |
| Room | Standing waves inside a cube, drawn as the sheets where the air stays still | Room-mode formula for a cube of the side you set |

- **Viewer:** drag to orbit, scroll or pinch to zoom. The wave animates; **Freeze** stops it where it is and **Freeze at peak** stops it at its most pronounced.
- **2D pattern:** the matching flat picture sits beside the 3D form: nodal lines on the plate, the sphere's still lines unrolled like a map, or a slice through the room.
- **Pattern log:** any pattern saved on the console can be opened here, from the picker or from the **3D** button on a log entry. One logged on a round plate opens as a disc.
- **Hear it:** plays the form's frequency through the same limited, faded output as the console.

### Printing

A wave pattern has no thickness, so each shape is given what a printer needs: the plate and disc get a base slab, the sphere a flat cut underneath so it stands, and the room's node sheets a wall thickness plus an optional slab that ties them together.

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
  chladni.js          square plate model
  disc.js             round plate model (Bessel functions, free-edge modes)
  liquid.js           ripple spacing on a vibrated liquid
  life.js             bands other species signal in
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

Everything stays in your browser, camera photos included: nothing is uploaded. The camera needs a secure page, so it works on `https` and on `localhost`; if the browser refuses, use **Add photo** instead. The pattern log lives in IndexedDB and settings in localStorage, both scoped to wherever the page is served from, so a log made at `localhost:8080` is separate from one made by opening the file directly. Use **Export** to move a log between them or to back it up; photos travel inside the exported file.

## Moving to its own repository

This directory is self-contained. To split it out with its history:

```
git subtree split --prefix=singing-plate -b singing-plate-only
```

then push that branch to a new repository as `main`.
