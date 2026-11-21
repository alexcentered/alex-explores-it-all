# Singing Plate

Four tools in one app, built around a desktop Chladni plate rig:

- **Console** (`index.html`): sends a pure tone to an amplifier and vibration driver. A metal plate bolted to the driver resonates, and sand on the plate collects along the lines that stay still. The console is the signal source, the sweep controller, the logbook and a simulator of what the sand should do.
- **3D lab** (`lab.html`): pick a frequency, see the 3D form its standing wave would make, and export it as an STL for printing.
- **Fields** (`fields.html`): magnetic field lines round a ring and a toroidal coil, the rotating field of Tesla's motor, and the resonance curve.
- **Line test** (`line.html`): a recreation of the line-flattening exercise from Dan Sherman's account, built as a fair test against chance.

The hardware plan and parts list are in [docs/MISSION_BRIEF.md](docs/MISSION_BRIEF.md).

## Run it

No install and no build step.

- **Simplest:** open `index.html` in a browser.
- **Served locally** (some browsers are stricter about files opened directly): `npm start`, then visit <http://localhost:8080>.

Test with headphones at low volume before connecting the amplifier.

## The console

| Area | What you get |
| --- | --- |
| Frequency | 1 Hz to 20 kHz: the full range of human hearing, plus the infrasound below it. Logarithmic coarse dial, exact entry, ±0.1 / ±1 / ±10 Hz buttons, a spring-return fine trim, and keyboard nudges |
| Readout | Frequency, nearest note with cents offset, wavelength in air, period, and the ripple spacing to expect on water |
| Waveform | Sine by default; triangle and square for experiments |
| Output | Fade in and fade out on every start, stop and waveform change; volume; hard limiter with adjustable ceiling; low-frequency driver guard; live scope and peak meter |
| Sweep | Glide between two frequencies at a set rate in Hz per second. Lock freezes the sweep while the tone keeps holding; resume carries on from wherever you nudged to |
| Simulator | Predicted sand pattern for the current frequency on a square or round plate, a list of predicted resonances to jump to, and one-button alignment of the model to your real plate |
| Pattern log | Save a frequency with a name, notes, the medium on the plate and a photo, taken with the camera or chosen from files. Recall, edit, delete, export and import |
| Pulse | Swells and fades the tone at a slow rate, so a rate below hearing can be heard as a throb |
| Colour | An optional toggle that shows every frequency as the colour of light it would be if raised by octaves. Off by default |
| Relationships | The arithmetic behind the current frequency: rotation, light, radio, the tuned circuit, harmonics, intervals, and the Earth as a resonator |
| Life signals | Who else signals at the frequency being played: seventeen species drawn as bands on a shared frequency scale, with a Tune button for each, plus a Beyond Earth section that separates what has been measured from what has been claimed |
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
- Below 20 Hz the console says the tone is infrasound, and offers to play it as a pulse on an audible tone.
- Above 5 kHz the console warns that the tone is piercing and hard on small speakers. From 14 kHz it warns that you may not hear it while children and pets do, so it must not be turned up because it sounds quiet.
- Near the very top of the range browsers fade their own oscillator, so the output is quieter than commanded (about 1 dB down at 18 kHz and 7 dB at 20 kHz on a 44.1 kHz sound card), never louder. The peak meter shows the level actually produced.
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

## Below 20 Hz

The console goes down to 1 Hz. Below 20 Hz is infrasound: nobody hears it as a pitch, and most speakers, and many amplifiers, cannot produce it at all. The rig's driver can, which is the point: it will shake a plate or a dish of liquid at rates you can watch.

For ordinary speakers there is **Pulse**. It swells and fades an audible tone at a slow rate, so a 220 Hz tone pulsed at 7.8 Hz lets you hear 7.8 Hz as a throb. When the console is set below 20 Hz it offers this in one click. The pulse only ever turns the level down from where the volume set it.

The driver guard matters most here. It scales level with frequency below 60 Hz, so at 6 Hz the output is a tenth of what the volume asks for.

## Colour

The **Colour** button is off by default, and the console stays monochrome. Switched on, every frequency is shown as the colour of light it would be if doubled until it became light. Concert A, 440 Hz, doubled forty times is 484 THz: orange.

Visible light spans almost exactly one octave (380 to 760 nm), so this gives every note one place in the spectrum. Two things follow, and they are why colour is useful for seeing relationships:

- Notes an octave apart are the same colour. In the harmonics list, f, 2f, 4f and 8f match.
- A musical interval is a fixed step along the spectrum. A fifth is always the same distance round.

With Colour on, the dial, the oscilloscope trace, the simulated sand, the species bands, and the 3D form all take it up.

This is an analogy, not physics: sound is pressure in air and light is an electromagnetic wave, and only the arithmetic of doubling connects them. The far violet end of the spectrum is drawn as deepening blue.

## Relationships

A panel that shows the arithmetic behind whatever frequency is set. Every line is a formula that can be checked.

| Card | Formula | At 440 Hz |
| --- | --- | --- |
| As a rotation | ω = 2π f | 2.76 krad/s |
| As light | f × 2ⁿ | 40 octaves up: 483.8 THz, 620 nm, orange |
| As a radio wave | λ = c / f | 681 km long; ULF; quarter wave 170 km |
| As a tuned circuit | f = 1 / (2π √(L C)) | 0.1 µF needs a coil of 1.31 H |

- **Harmonics:** f ÷ 4 up to 8f, with note names. Click one to tune to it.
- **Intervals:** the small whole-number ratios (3:2, 4:3, 5:4 ...), each drawn as a Lissajous figure: one tone moves a dot side to side, the other up and down, and a simple ratio closes into a still shape.
- **The Earth as a resonator:** radio waves trapped between the ground and the upper atmosphere. Light circles the Earth 7.49 times a second, which is c / (2π R). The textbook cavity rings at that times √(n(n+1)), giving 10.6 Hz; the measured value is 7.83 Hz, lower because the real cavity is leaky. The table lists both for five modes, each tunable.

Why π is everywhere: anything that repeats can be drawn as a point going round a circle, and once round is 2π radians. Every formula on the panel is that circle in a different setting.

On Tesla: his resonant transformer of 1891 is the tuned-circuit formula twice over, two circuits passing energy only when both ring at the same frequency. He argued in 1899 that the Earth itself could be made to ring electrically. The cavity resonance was worked out by Schumann in 1952 and measured in 1960; what Tesla actually detected in 1899 is still debated.

Sources: [Schumann resonances](https://en.wikipedia.org/wiki/Schumann_resonances), [Plus Maths on the cavity formula](https://plus.maths.org/content/comment/9161), [Tesla coil](https://en.wikipedia.org/wiki/Tesla_coil), [Tesla's Colorado Springs notes](https://teslauniverse.com/nikola-tesla/books/nikola-tesla-colorado-springs-notes-1899-1900/18), [Tesla's induction motor](https://ethw.org/Tesla's_Electro-magnetic_motor), [the colours of music](https://jsbryaniv.github.io/the-colors-of-music).

## Life signals

The console lists the bands other living things are known to signal in, drawn against the same 1 Hz to 20 kHz scale as the dial. A line marks the frequency being played, the rows it crosses light up, and **Tune** jumps to a representative frequency in any band.

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
| Bottlenose dolphin | 7 to 15 kHz | Signature whistle, used much like a name |

Too high for any speaker, and listed for reference: rat calls (22 kHz alarm, 50 kHz play) and bat echolocation (mostly 20 to 100 kHz).

**Read this before calling it communication.** The bands are published measurements, rounded, and they vary between individuals, populations and studies. A steady tone in an animal's band is something it can sense, and in a few cases will respond to: female crickets walk toward a speaker playing the male's tone, and male mosquitoes are drawn to the female's flight tone. That is not the same as speaking its language. Real signals carry rhythm, pulses and sweeps that one pure tone does not. The plant entries rest on a small number of studies and are labelled as early evidence.

**Go gently.** Keep the level low around animals, stop if one seems distressed, and do not play calls to wild animals: it can stress them and disrupt breeding, and it is restricted in many parks and for protected species.

### Beyond Earth

No contact with a non-human intelligence has been verified, so no frequency is known to reach one. The console says so, and then lists what does exist in three groups that are kept apart on purpose.

**Listened for and sent.** Real frequencies, all radio, none of them sound:

| What | Frequency | When | Outcome |
| --- | --- | --- | --- |
| The hydrogen line | 1,420.406 MHz | listened on since 1960 | Where most searches listen |
| The water hole | 1,420 to 1,720 MHz | named 1971 | The quiet band searches favour |
| The Wow! signal | 1,420.456 MHz | 15 August 1977 | 72 seconds, never repeated, never explained |
| BLC1 | 982.002 MHz | April to May 2019 | Almost certainly interference from Earth |
| Breakthrough Listen | 1 to 11 GHz | since 2016 | Nothing confirmed |
| The Arecibo message | 2,380 MHz | sent 16 November 1974 | In transit for about 25,000 years |
| Cosmic Call | 5.01 GHz | sent 1999 and 2003 | In transit; earliest arrival in the 2030s |

**Reported beings.** Greys, Nordics and Pleiadians, Tall Whites, Essassani, Reptilians, Arcturians, and Insectoids or Mantis beings, each with where the account comes from and how the beings are said to communicate. Every one is labelled an unverified claim. None comes with a frequency, because the accounts do not give one: the beings are nearly always said to communicate by thought.

**Sounds and tones in contact accounts.**

- **Dan Sherman.** In *Above Black* (1997) Sherman, a former US Air Force sergeant, says he was trained under a programme he calls Project Preserve Destiny to exchange messages with Greys by thought alone. Accounts of the training describe a console with headphones and boxes of oscilloscope-style lines, and an instruction to hum a tone mentally until a wavy line went flat. The tone's pitch is never stated, and the communication itself is described as mental, intended for a time when all electromagnetic links would be down. He is the only source for the programme. The Line test page recreates the exercise.
- **CE-5 sessions.** Groups following Steven Greer's protocol play recorded tones alongside meditation and lights. His organisation says they were recorded near sightings; one listener describes bursts in threes, each set an octave lower. No source gives their pitch, so they are not simulated here; the recordings are distributed with Greer's app. No session has produced verified contact.
- **Bashar.** Material channelled by Darryl Anka names 333,000 cycles per second as a threshold between physical and non-physical being. It is described as a state, not a signal, and nothing measurable corresponds to it.
- **The crop circle trill.** A trilling sound reported near crop circles, put at 5.0 to 5.2 kHz in popular accounts. This is the only entry with a figure a speaker can play, so it has a Tune button. It is not a published measurement, and birds and insects sing in the same band.
- **The Schumann resonance.** 7.83 Hz, real, but a radio-wave resonance driven by lightning, not a sound and not a signal.

Why the measured frequencies cannot be played: sound needs air and space has none, so anything sent between stars is radio or light. Those frequencies are roughly a hundred thousand times above a speaker's reach, need a transmitter and a licence, and the band around the hydrogen line is reserved for listening.

### Simulations

Anything with a number that a speaker cannot reach has a **Simulate** button, which shifts it by whole octaves until it can be played. Doubling or halving a frequency gives the same note in another register, so the pitch is true even though the real thing stays out of reach. Every entry in a group is shifted by the same amount, so the intervals between them are the real ones.

| What | Real frequency | Shift | Plays at |
| --- | --- | --- | --- |
| The hydrogen line | 1,420.406 MHz | 21 octaves down | 677.3 Hz |
| The Wow! signal | 1,420.456 MHz | 21 octaves down | 677.3 Hz |
| BLC1 | 982.002 MHz | 21 octaves down | 468.3 Hz |
| The Arecibo message | 2,380 MHz | 21 octaves down | 1,134.9 Hz |
| Cosmic Call | 5.01 GHz | 21 octaves down | 2,389 Hz |
| Rat alarm call, play chirp | 22 kHz, 50 kHz | 3 octaves down | 2,750 Hz, 6,250 Hz |
| A typical bat call | 45 kHz | 3 octaves down | 5,625 Hz |
| Bashar's figure | 333 kHz | 6 octaves down | 5,203.1 Hz |
| The Schumann resonance | 7.83 Hz | 4 octaves up | 125.3 Hz |

The Wow! signal and the hydrogen line come out the same because they are only 50 kHz apart, which is a fiftieth of a hertz once shifted. A simulation carries pitch only: a steady tone has none of the timing or structure of the original. Entries with no published pitch (Sherman's tone, the CE-5 tones) have no Simulate button, because there is nothing to shift.

One gap in the research: Sherman's book and interview transcript could not be read directly when this was written, so the summary of his account rests on his publisher's description, reviews, interview summaries and later coverage. Those agree on the outline but differ in detail, such as how many boxes were on the screen.

Sources for Beyond Earth:

- Search and messages: [SETI League on the water hole](https://setileague.org/general/waterhol.htm), [SETI Institute observations](https://seti.org/seti-institute/project/details/seti-observations), [the Wow! signal](https://en.wikipedia.org/wiki/Wow!_signal), [Astronomy magazine on BLC1](https://www.astronomy.com/?p=117439), [Breakthrough Listen receiver bands](https://arxiv.org/pdf/2002.06162), [the Arecibo message of November 1974](https://ui.adsabs.harvard.edu/abs/10.1016/0019-1035(75)90116-5/abstract), [Cosmic Call](https://en.wikipedia.org/wiki/Cosmic_Call)
- Dan Sherman: [the book's own site](https://aboveblack.com/), [publisher's listing](https://store.bookbaby.com/book/above-black1), [review](https://www.theseekerbooks.com/articles/aboveblack.htm), [reader reviews](https://www.goodreads.com/book/show/18953914-above-black---project-preserve-destiny---an-insider-s-account-of-alien-c), [interview summary](https://pod.wave.co/podcast/american-alchemy/the-nsa-hired-me-to-speak-to-aliens-sargeant-dan-sherman), [a sceptical overview](https://uapwoo.com/project-preserve-destiny.php), [later coverage](https://newspaceeconomy.ca/2025/10/30/telepathic-soldiers-and-alien-codes-inside-the-nsas-alleged-project-preserve-destiny)
- Tall Whites: [HowStuffWorks overview](https://science.howstuffworks.com/space/aliens-ufos/tall-whites.htm)
- Billy Meier: [Wikipedia](https://en.wikipedia.org/wiki/Billy_Meier), [The Skeptic's Dictionary](https://www.skepdic.com/pleiades.html)
- Reptilians: [Reptilian conspiracy theory](https://en.wikipedia.org/wiki/Reptilian_conspiracy_theory)
- Betty and Barney Hill: [Discovery UK](https://www.discoveryuk.com/mysteries/star-struck-and-spooked-the-betty-and-barney-hill-abduction/)
- Bashar: [Quote Investigator on the channelled material](https://quoteinvestigator.com/?p=3808), [a transcript of the frequency claims](https://www.scribd.com/document/621747574/Bashar-11-11-666) (user-uploaded, unverified)
- Reported beings: [list of alleged extraterrestrial beings](https://en.wikipedia.com/wiki/List_of_alleged_extraterrestrial_beings), [Grey alien](https://www.Wikipedia.com/wiki/Grey_alien), [Sky at Night on Zeta Reticuli](https://www.skyatnightmagazine.com/space-science/zeta-reticuli-binary-star-sytem)
- CE-5: [CSETI working group manual](https://drstevengreer.com/wp-content/uploads/2012/12/WorkingGroupManual.pdf), [a listener's analysis of the tones](https://jdeepassion.substack.com/p/singing-in-the-wheat-part-1), [overview of the protocol](https://hangar1publishing.com/blogs/ufos-uaps-and-aliens/fifth-kind-contact)
- Crop circle trill: a NEXUS magazine article, "Sound and crop circles" (a popular magazine, not a measurement)

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
- Dolphin: [DOSITS on signature whistles](https://dosits.org/animals/use-of-sound/marine-mammal-communication/individual-specific-vocalizations), [SeaWorld on bottlenose dolphin communication](https://seaworld.org/animals/all-about/bottlenose-dolphin/communication/)
- Rat: [Panksepp, laughing rats](https://www.museumofplay.org/app/uploads/2022/01/2-3-article-laughing-rats-panksepp.pdf)
- Bats: the commonly quoted range, not checked against a source when this table was written

## The line test

Dan Sherman's account of his training describes a tone in headphones, boxes of oscilloscope-style lines on a screen, and an instruction to hum the tone mentally until a wavy line went flat. `line.html` recreates that: a tone, a line, ten boxes.

A computer has no way to sense a thought, so the line here is moved by chance, and the page counts:

- Four times a second it draws one random bit. One way the line gets a step flatter, the other way a step wavier. Each is a fair coin.
- You hear it as well as see it: two tones play a hair apart and throb. As the line flattens they move together and the throb slows, ending in one steady tone.
- A session has a fixed length, chosen before it starts. At the end the page reports how many steps went flatter and how far that is from chance, in standard deviations.
- **Trying** and **Control** sessions are recorded separately, and the record compares them.
- An abandoned session still counts, with the steps it had reached. Throwing it away would let someone quit every session that was going badly and keep the good ones. A unit test simulates exactly that cheat and confirms the record stays at chance.
- The bar is high on purpose: about one result in twenty looks unusual by luck alone.

To make a record mean something, decide the number of sessions before you begin, run that many, and run as many controls.

Whether a computer could do the real thing: not without a sensor. With an EEG headband, a line that settles as you settle is ordinary technology (neurofeedback). That would be your own brain activity moving the line, which is a different thing from thought reaching a machine unaided. This page does not connect to one.

Background: [the Princeton PEAR lab](https://en.wikipedia.org/wiki/Princeton_Engineering_Anomalies_Research_Lab) ran tests of this kind from 1979 to 2007 and reported a very small effect that independent groups, and later the lab itself, could not reproduce.

## The 3D lab

Five shapes, each chosen either by frequency or directly by mode numbers:

| Shape | What it shows | How frequency picks the form |
| --- | --- | --- |
| Plate | The Chladni pattern of a square plate lifted into relief: either the plate caught mid-swing, or the sand lines raised as ridges | The same driven-plate model as the console, using the plate set up there |
| Disc | The same for a round plate: rings when driven at the centre, star shapes when picked by nodal diameters and circles | The round-plate model, at the console plate's size, thickness and metal |
| Sphere | Standing waves on a ball, the shapes a vibrating droplet takes (spherical harmonics) | Rayleigh's formula for a water drop of the radius you set |
| Room | Standing waves inside a cube, drawn as the sheets where the air stays still | Room-mode formula for a cube of the side you set |
| Torus | Waves on a ring-shaped tube, standing as a chequer or rotating so the crests wind round like the turns of a coil | f = (c / 2π) √((m/a)² + (n/R)²) for a ring of the radius you set |

- **Predicted resonances:** under the viewer, every resonance the model predicts for the current shape, lowest first, with a strip showing where they fall. Click one to go to that mode exactly.
- **Colour:** the same toggle as the console; the form and its 2D pattern take the colour of the frequency.
- **Viewer:** drag to orbit, scroll or pinch to zoom. The wave animates; **Freeze** stops it where it is and **Freeze at peak** stops it at its most pronounced.
- **2D pattern:** the matching flat picture sits beside the 3D form: nodal lines on the plate, the sphere's still lines unrolled like a map, or a slice through the room.
- **Pattern log:** any pattern saved on the console can be opened here, from the picker or from the **3D** button on a log entry. One logged on a round plate opens as a disc.
- **Hear it:** plays the form's frequency through the same limited, faded output as the console.

### The torus and the rotating field

Unrolled, a torus is a sheet that joins up in both directions, so a wave must fit a whole number of times each way: m times round the tube, n times round the ring. The 2π in its formula is each of those paths being a circle.

Two waves running opposite ways stand still as a chequer of nodes. One wave alone keeps travelling, and on a torus its crests wind round the ring in a spiral, like the windings of a toroidal coil. That travelling pattern is a rotating field, the idea behind Tesla's induction motor, patented in 1888. Choose **Rotating** or **Standing** under Symmetry to see both.

The frequency treats the torus surface as a flat sheet wrapped both ways, which is exact for an idealised torus and an approximation for a real ring of air.

This is a wave pattern on a torus-shaped surface, not a magnetic field. Field lines are on the Fields page.

### Printing

A wave pattern has no thickness, so each shape is given what a printer needs: the plate and disc get a base slab, the sphere and torus a flat cut underneath so they sit still, and the room's node sheets a wall thickness plus an optional slab that ties them together.

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

## Fields

`fields.html` shows three pieces of textbook physics. It makes no sound.

### Field lines

A 3D view of magnetic field lines, with bright pulses travelling the way the field points.

- **Ring:** a current round one ring. The lines go up through the hole and back round the outside. This is the far field of the Earth or of a bar magnet. It is computed from the Biot-Savart law, summed over 72 short pieces of the ring, and checked against the closed-form value on the axis.
- **Coil:** wire wound round a ring-shaped former. The ideal case is used: the field runs round the ring inside the former with strength in proportion to 1 ÷ distance from the axis, and is zero outside.
- **Both:** the two added together. Each line becomes a helix lying on its own ring-shaped surface, nested inside the others. A slider sets the ring current against the coil current: more ring current winds the lines more tightly. A tokamak confines plasma on surfaces of this kind.

Lines are traced with fourth-order Runge-Kutta steps of fixed length. The unit tests check that the ring's field has zero divergence, that its lines close on themselves, and that a helix returns through the same place each time it goes round the tube.

### Rotating field

Coils round a circle, each fed an alternating current. A thin arrow shows each coil's own field and a heavy arrow their sum, with the currents plotted underneath.

- **1 phase:** the field pulses back and forth along one line and does not turn.
- **2 phase:** two coils at right angles, a quarter cycle apart. The sum has constant strength and turns.
- **3 phase:** three coils 120° apart, a third of a cycle apart. The sum has constant strength, 1.5 times one coil's peak, and turns.

Speed in revolutions a minute = 120 × supply frequency ÷ number of poles: 3,600 rpm for 60 Hz and two poles. The animation is slowed so that one supply cycle takes four seconds, and says by how much.

### Resonance curve

How strongly a resonator responds when driven near its natural frequency, and how far it lags the drive: `1 / √((1 − r²)² + (r / Q)²)`, where r is drive frequency ÷ natural frequency.

- **Q** sets the sharpness. At resonance the response is Q times what the same push would produce slowly, and it lags the drive by 90°.
- **Bandwidth** is natural frequency ÷ Q. **Lower edge** and **Upper edge** put the drive where the response has fallen to 71% of the peak.
- **Rings for** is how long the motion takes to fade to 37% once the drive stops: Q ÷ (π × natural frequency).

The natural frequency starts at whatever the console is tuned to and follows it until you type one here. Each sand pattern on the plate is one of these peaks; the plate simulator adds many together.

### What it leaves out

The models are idealised: a perfectly thin ring, a coil with no gaps between turns, a resonator with one natural frequency. Claims of torus-shaped energy fields round the body, or of free energy from a torus, are not supported by measurement and are not modelled.

## Layout

```
index.html          the console
lab.html            the 3D lab
fields.html         field lines, the rotating field, the resonance curve
line.html           the line test
css/styles.css      theme and layout for all four
fonts/              JetBrains Mono (SIL Open Font License, see fonts/OFL.txt)
vendor/             Three.js as one local script (MIT, see vendor/THREE-LICENSE.txt)
js/core/            pure logic, no browser APIs: unit tested
  freq.js             ranges, notes, wavelength, dial mapping
  safety.js           gain law, limiter curve, driver guard
  sweep.js            sweep state machine
  chladni.js          square plate model
  disc.js             round plate model (Bessel functions, free-edge modes)
  liquid.js           ripple spacing on a vibrated liquid
  life.js             bands other species signal in, Beyond Earth, simulations
  color.js            frequency to colour, by octaves up to light
  relations.js        harmonics, intervals, radio, the tuned circuit, the Earth
  chance.js           the statistics behind the line test
  fields.js           ring and coil fields, field lines, rotating field, resonance
  forms.js            sphere and room standing waves
  mesh.js             solid builders, isosurface, printability inspection, STL
js/audio/engine.js  Web Audio signal chain, shared by the console and the lab
js/audio/duo.js     two tones a hair apart, for the line test
js/store/presets.js pattern log storage (IndexedDB), shared by both pages
js/ui/              app.js wires the console, lab.js the lab, fields.js the fields page,
                    line.js the line test; dial, plate view, 3D viewer and field view
                    are the parts they use
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
