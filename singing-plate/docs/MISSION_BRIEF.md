# Operation Singing Plate: Cymatics Rig Build Plan

> This is the original plan, kept as written. The app has since grown past it: the range now runs to 20 kHz, and the stretch goals and phase two are built. See the README for what exists today.

**Mission:** build a desktop Chladni plate rig, driven by a custom frequency app built with Claude Code, to see sound draw patterns in sand.

## 1. How it works

A thin metal plate is clamped at its centre to a vibration driver. The app sends a pure sine wave to an amplifier, which drives the vibrator. At certain resonant frequencies the plate vibrates in standing waves. Sand bounces off the moving areas and collects along the still lines (nodes), drawing a pattern. Each resonant frequency draws its own shape.

**Why not the HomePod:** the energy has to go into the plate mechanically. A speaker pushing air at a plate wastes most of it, and AirPlay adds compression and processing that muddy pure tones.

## 2. Hardware parts list

| Item | Purpose | Approx. cost |
| --- | --- | --- |
| Mechanical wave driver (school physics type) or tactile transducer / bass shaker | Physically shakes the plate | $20 to $60 |
| Small class D amplifier (e.g. TPA3116 board, 50 W) with power supply | Powers the driver | $20 to $35 |
| 3.5 mm or USB audio cable from computer to amp | Signal path | $5 to $10 |
| Square aluminium or brass plate, about 24 cm, 1 to 1.5 mm thick, with centre hole | The canvas | $10 to $25 |
| Bolt, washers, nuts for centre mount | Clamps plate to driver | $5 |
| Fine sand, table salt, or semolina | Pattern medium | $3 |
| Earplugs or ear defenders | Hearing protection | $5 to $15 |
| Optional: phone tripod above plate | Record patterns | $15 |

Total: roughly $70 to $170.

## 3. The app (Claude Code build)

Recommended stack: a local web app using the Web Audio API (no install, runs in a browser), styled in the monochrome glassmorphic theme, dark by default, JetBrains Mono.

Core features:

- Pure sine oscillator, range 20 Hz to 5,000 Hz
- Coarse dial plus fine control down to 0.1 Hz, and keyboard nudge keys
- Sweep mode: glide slowly between two frequencies at a set rate, with pause the moment a pattern locks in
- Master volume with a hard safety limiter and soft fade in and out (prevents speaker pops)
- Waveform selector: sine by default, plus square and triangle for experiments
- Preset log: save a frequency with a name, notes, and a photo of the pattern
- Live readout of frequency, note name, and wavelength
- Optional: an on-screen Chladni pattern simulator showing the predicted shape for the current frequency, side by side with the real plate

## 4. Considerations

- **Plate:** thinner and square gives the cleanest classic patterns; circular plates give ring patterns. Centre mounting is standard.
- **Frequencies:** good patterns appear only at resonances, often between about 200 Hz and 3,000 Hz for this size. Sweep slowly to find them.
- **Volume:** start low. Higher frequencies are shrill; wear hearing protection.
- **Audio path:** use a wired connection, turn off any system EQ or sound enhancement, and keep output at full digital level with the amp controlling loudness.
- **Driver limits:** don't run high volume at very low frequencies for long; the driver can overheat or bottom out.
- **Mess:** work over a tray to catch sand.

## 5. Mission sequence

1. Order parts.
2. Build the app with Claude Code and test it with headphones at low volume.
3. Assemble: plate to driver, driver to amp, amp to computer.
4. Sweep from 100 Hz upward, logging every pattern.
5. Stretch goals: camera capture inside the app, a circular plate, liquid (water or cornflour) experiments.

## 6. Phase two: 3D Form Lab

Phase two adds a 3D lab to the same app: pick a frequency, see the 3D form it would make, and export it for printing. Build it after the plate rig works.

Shared core with phase one: the frequency engine, presets and log. Any pattern saved on the real plate can be opened in the 3D lab.

Core features:

- 3D viewer built with Three.js, orbit, zoom, and the monochrome dark theme
- Shape modes: plate surface (Chladni pattern lifted into relief), sphere (standing waves on a ball, like a vibrating droplet), and cube or room (standing waves inside a box, shown as node surfaces)
- Controls: frequency, mode numbers, amplitude (how tall the relief is), resolution, and symmetry
- Live animation of the wave, with a freeze button to capture the form
- Export to STL for 3D printing, with a wall thickness and base so prints are solid
- Side-by-side view: the 2D plate pattern next to its 3D form

Considerations:

- The 3D forms are mathematical models of standing waves, not physical recordings; they show the idealised shape.
- Printability: forms need a minimum thickness and no floating parts; the exporter should check this.
- Performance: high resolution meshes get heavy; keep a preview resolution and a separate export resolution.

Phase two sequence:

1. Add the Three.js viewer with the plate relief mode.
2. Add sphere and cube modes.
3. Add STL export and test-print a small form.
4. Link saved plate presets to the 3D lab.
