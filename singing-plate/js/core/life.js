/*
 * core/life.js -- who else signals at these frequencies.
 *
 * A reference table of the bands other living things are known to signal
 * in, so the console can show who shares the frequency being played.
 *
 * What this is, and is not:
 *   - Every band comes from published measurements (sources are listed in
 *     the README). Bands are rounded and vary between individuals,
 *     populations and studies.
 *   - A steady tone in someone's band is something they can sense, and in a
 *     few cases will respond to. It is not their language: real signals
 *     carry rhythm, pulses and sweeps that one pure tone does not.
 *   - `evidence` says how firm the claim is, and the uncertain ones are
 *     labelled rather than left out or dressed up.
 *
 * Pure data and functions only.
 */
(function (root) {
  'use strict';

  var F_MIN = 20;
  var F_MAX = 20000;

  var EVIDENCE = {
    documented: 'Well documented',
    early: 'Early evidence',
    unknown: 'Purpose unknown',
    claim: 'Unverified claim'
  };

  /*
   * Signals that fall at least partly inside the console's 20 Hz to 20 kHz.
   *   lo, hi   the band in hertz
   *   tune     a representative frequency inside both the band and the console
   *   signal   what the sound is
   *   note     what is known about it
   */
  var SIGNALS = [
    { id: 'whale-low', who: 'Blue and fin whales', lo: 10, hi: 40, tune: 20, evidence: 'documented',
      signal: 'Calls and pulses',
      note: 'The loudest, lowest voices on Earth. Fin whales repeat a pulse centred on 20 Hz; blue whale calls sit between 10 and 40 Hz and carry across ocean basins.' },
    { id: 'elephant', who: 'African elephant', lo: 12, hi: 35, tune: 20, evidence: 'documented',
      signal: 'Rumbles',
      note: 'Adults rumble at 12 to 20 Hz, mostly below human hearing, to keep in contact over kilometres. Calves rumble higher, at 20 to 35 Hz.' },
    { id: 'alligator', who: 'American alligator', lo: 18, hi: 20, tune: 20, evidence: 'documented',
      signal: 'Courtship bellow',
      note: 'A rumble too low to hear shakes the water on the male\'s back into leaping ripples: the same Faraday waves as the liquid experiments on this rig.' },
    { id: 'cat', who: 'Domestic cat', lo: 25, hi: 150, tune: 50, evidence: 'documented',
      signal: 'Purr',
      note: 'A steady purr between 25 and 150 Hz, with most of its strength at the low end.' },
    { id: 'midshipman', who: 'Plainfin midshipman fish', lo: 80, hi: 120, tune: 100, evidence: 'documented',
      signal: 'Mating hum',
      note: 'Males hum at about 100 Hz for minutes to hours at a stretch to draw females to the nest. The pitch rises as the water warms.' },
    { id: 'humpback', who: 'Humpback whale', lo: 80, hi: 4000, tune: 400, evidence: 'documented',
      signal: 'Song',
      note: 'Long structured songs sung by males, mostly between 80 Hz and 4 kHz, with one band near 250 to 475 Hz used most consistently.' },
    { id: 'human', who: 'Human', lo: 85, hi: 255, tune: 120, evidence: 'documented',
      signal: 'Speaking pitch',
      note: 'The pitch of a speaking voice: roughly 85 to 155 Hz for most men and 165 to 255 Hz for most women.' },
    { id: 'giraffe', who: 'Giraffe', lo: 85, hi: 100, tune: 92, evidence: 'unknown',
      signal: 'Night hum',
      note: 'Zoo giraffes were recorded humming at about 92 Hz, only at night. Nobody has yet shown what the hum is for, or that it is a signal at all.' },
    { id: 'bullfrog', who: 'American bullfrog', lo: 200, hi: 400, tune: 300, evidence: 'documented',
      signal: 'Advertisement call',
      note: 'The deep call carries most of its strength at 200 to 400 Hz, with a second band at 1 to 2 kHz.' },
    { id: 'honeybee', who: 'Honeybee', lo: 200, hi: 500, tune: 250, evidence: 'documented',
      signal: 'Dance buzz and queen piping',
      note: 'A dancing forager buzzes her wings at 200 to 300 Hz while pointing nestmates to food. Queens pipe at 350 to 500 Hz. Bees sense sound up to about 500 Hz.' },
    { id: 'corn', who: 'Corn seedling roots', lo: 200, hi: 300, tune: 220, evidence: 'early',
      signal: 'Response to a tone',
      note: 'Young roots were reported to bend toward a steady tone near 220 Hz and to click at similar frequencies. Few studies, not yet widely repeated.' },
    { id: 'primrose', who: 'Beach evening primrose', lo: 200, hi: 500, tune: 350, evidence: 'early',
      signal: 'Response to bee wings',
      note: 'In one study the flowers sweetened their nectar within minutes of hearing bee-wing sound at 200 to 500 Hz, and ignored much higher tones. Its meaning is still debated.' },
    { id: 'mosquito', who: 'Yellow fever mosquito', lo: 400, hi: 1200, tune: 400, evidence: 'documented',
      signal: 'Flight-tone duet',
      note: 'Females whine near 400 Hz and males near 600 Hz. A courting pair shift their wingbeats until their overtones meet, usually at about 1,200 Hz.' },
    { id: 'songbird', who: 'Songbirds', lo: 1000, hi: 8000, tune: 3000, evidence: 'documented',
      signal: 'Song',
      note: 'Most song lies between 1 and 8 kHz, and most songbirds hear best at 2 to 4 kHz.' },
    { id: 'peeper', who: 'Spring peeper frog', lo: 2500, hi: 3500, tune: 2900, evidence: 'documented',
      signal: 'Peep',
      note: 'A tiny frog with a piercing peep near 3 kHz. A chorus is heard a long way off.' },
    { id: 'cricket', who: 'Field cricket', lo: 4500, hi: 5200, tune: 4900, evidence: 'documented',
      signal: 'Calling song',
      note: 'Males chirp a nearly pure tone close to 5 kHz. Females are tuned to it and will walk toward a loudspeaker that plays it.' },
    { id: 'dolphin', who: 'Bottlenose dolphin', lo: 7000, hi: 15000, tune: 10000, evidence: 'documented',
      signal: 'Signature whistle',
      note: 'Each dolphin has a whistle of its own that works much like a name, typically sweeping between 7 and 15 kHz. Others call it back to them.' }
  ];

  /* Signals the console cannot reach: above the range of ordinary sound hardware. */
  var BEYOND = [
    { id: 'rat', who: 'Rat', band: '22 kHz and 50 kHz', evidence: 'documented',
      note: 'Long 22 kHz calls signal alarm or distress. Short 50 kHz chirps come with play, and with being tickled.' },
    { id: 'bat', who: 'Bats', band: 'mostly 20 to 100 kHz', evidence: 'documented',
      note: 'Calls for finding the way and finding prey by echo, far above human hearing.' }
  ];

  /* ---------------------------------------------------------------------
   * Beyond Earth.
   *
   * No contact with a non-human intelligence has been verified, so no
   * frequency is known to reach one. Two different kinds of thing exist,
   * and they are kept apart here so neither is mistaken for the other:
   *
   *   SEARCH   what people have actually measured or transmitted. Real
   *            frequencies, all radio, none of them sound.
   *   REPORTS  beings described in contact accounts, and the sounds and
   *            tones that appear in those accounts. Claims, not
   *            measurements; where no frequency was ever given, it says so.
   * ------------------------------------------------------------------- */

  var SEARCH = [
    { id: 'hydrogen', what: 'The hydrogen line', band: '1,420.406 MHz', when: 'listened on since 1960',
      note: 'Hydrogen, the commonest element in the universe, emits at this frequency, so any radio astronomer anywhere would know it. Most searches have listened here.' },
    { id: 'waterhole', what: 'The water hole', band: '1,420 to 1,720 MHz', when: 'named 1971',
      note: 'The quiet stretch of radio between the hydrogen line and the hydroxyl lines. Hydrogen plus hydroxyl makes water, hence the name for where species might meet.' },
    { id: 'wow', what: 'The Wow! signal', band: '1,420.456 MHz', when: '15 August 1977',
      note: 'A strong, narrow signal picked up for 72 seconds by the Big Ear telescope in Ohio. It has never been heard again and has never been explained.' },
    { id: 'blc1', what: 'BLC1', band: '982.002 MHz', when: 'April to May 2019',
      note: 'A signal that appeared only when the Parkes telescope pointed at Proxima Centauri. Later analysis found it was almost certainly interference from Earth.' },
    { id: 'listen', what: 'Breakthrough Listen', band: '1 to 11 GHz', when: 'since 2016',
      note: 'The largest search so far, scanning billions of narrow radio channels from nearby stars. Nothing confirmed.' },
    { id: 'arecibo', what: 'The Arecibo message', band: '2,380 MHz', when: 'sent 16 November 1974',
      note: 'The first deliberate message: 1,679 bits beamed at the star cluster M13. It will take about 25,000 years to arrive.' },
    { id: 'cosmiccall', what: 'Cosmic Call', band: '5.01 GHz', when: 'sent 1999 and 2003',
      note: 'Messages beamed from Yevpatoria, Ukraine, at nine nearby stars. The earliest could arrive in the 2030s.' }
  ];

  /* Beings described in contact accounts. `frequency` is what the accounts give, if anything. */
  var REPORTS = [
    { id: 'greys', who: 'Greys', home: 'Said to be from Zeta Reticuli, 39 light-years away',
      source: 'The Betty and Barney Hill abduction account of 1961; the commonest figure in reports ever since.',
      mode: 'Telepathy', frequency: 'None given' },
    { id: 'nordics', who: 'Nordics and Pleiadians', home: 'Said to be from the Pleiades, about 440 light-years away',
      source: 'The contactee movement: George Adamski in the 1950s, Billy Meier from 1975.',
      mode: 'Telepathy and speech', frequency: 'None given' },
    { id: 'reptilians', who: 'Reptilians', home: 'Various',
      source: 'A conspiracy theory popularised in the 1990s, more than a body of first-hand reports.',
      mode: 'Not described', frequency: 'None given' },
    { id: 'arcturians', who: 'Arcturians', home: 'Said to be from Arcturus, 37 light-years away',
      source: 'New Age and channelled writing.',
      mode: 'Telepathy and channelling', frequency: 'None given' },
    { id: 'insectoids', who: 'Insectoids, or Mantis beings', home: 'Not stated',
      source: 'Abduction accounts, mostly since the 1990s.',
      mode: 'Telepathy', frequency: 'None given' }
  ];

  /*
   * Sounds and tones that turn up in contact accounts. Only one comes with a
   * number that a speaker can play; `tune` is set for that one alone. `tag`
   * replaces the default "Unverified claim" label where that would mislead.
   */
  var ACCOUNTS = [
    { id: 'sherman', what: 'Dan Sherman and "intuitive communication"', frequency: 'No frequency: not sound or radio',
      note: 'Sherman, a former US Air Force sergeant, wrote in Above Black (1997) that he was trained under a programme he calls Project Preserve Destiny to exchange messages with Greys by thought alone. He describes exercises with tones during training, but the communication itself as mental, meant for a time when all electromagnetic links would be down. He is the only source for the programme; nothing independent confirms it.' },
    { id: 'ce5', what: 'CE-5 contact sessions', frequency: 'Tones are played; no agreed frequency',
      note: 'Groups following Steven Greer\'s protocol combine meditation, lights and recorded tones to invite contact. No reliable source gives the tones a specific frequency, and no session has produced verified contact.' },
    { id: 'trill', what: 'The crop circle trill', frequency: '5.0 to 5.2 kHz, as reported', lo: 5000, hi: 5200, tune: 5100,
      note: 'Witnesses and one recording describe a high trilling sound near crop circles, put at 5.0 to 5.2 kHz. The figure comes from popular accounts, not a published measurement, and the sound has ordinary candidate sources, such as birds and insects that sing in that band.' },
    { id: 'schumann', what: 'The Schumann resonance', frequency: '7.83 Hz, but it is not a sound', tag: 'Real, but not a signal',
      note: 'Often called Earth\'s frequency and linked to contact in popular writing. It is real, but it is a radio-wave resonance driven by lightning in the gap between the ground and the upper atmosphere. Nothing ties it to any signal, and a speaker cannot produce it.' }
  ];

  /* Every signal whose band contains this frequency. */
  function activeAt(freq) {
    var f = Number(freq);
    return SIGNALS.filter(function (s) { return f >= s.lo && f <= s.hi; });
  }

  /* The part of a band the console can actually play. */
  function playable(signal) {
    return { lo: Math.max(F_MIN, signal.lo), hi: Math.min(F_MAX, signal.hi) };
  }

  function formatBand(signal) {
    function hz(v) { return v >= 1000 ? (v / 1000).toLocaleString('en-US') + ' kHz' : v + ' Hz'; }
    return signal.lo >= 1000 || signal.hi < 1000
      ? hz(signal.lo).replace(/ k?Hz$/, '') + ' to ' + hz(signal.hi)
      : hz(signal.lo) + ' to ' + hz(signal.hi);
  }

  var api = {
    EVIDENCE: EVIDENCE,
    SIGNALS: SIGNALS,
    BEYOND: BEYOND,
    SEARCH: SEARCH,
    REPORTS: REPORTS,
    ACCOUNTS: ACCOUNTS,
    activeAt: activeAt,
    playable: playable,
    formatBand: formatBand
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (root.SP = root.SP || {}).life = api;
})(typeof self !== 'undefined' ? self : this);
