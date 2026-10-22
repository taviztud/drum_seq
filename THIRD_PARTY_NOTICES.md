# Third-party notices

drum_seq's own code is under the MIT License (see `LICENSE`). It builds on the components below.
Each keeps its own license; this file records where every piece comes from.

## Code

| Component | Used for | Source | License |
|---|---|---|---|
| Open303 by Robin Schmidt | TB-303 engine, ported to `src/worklets/open303-processor.js` | [RobinSchmidt/Open303](https://github.com/RobinSchmidt/Open303) | MIT |
| smplr 1.1.0 by danigb | Sample playback, bundled in `vendor/smplr-1.1.0.mjs` | [danigb/smplr](https://github.com/danigb/smplr) | MIT |

## Fonts (bundled in `vendor/fonts/`)

| Font | Source | License |
|---|---|---|
| Archivo | [Omnibus-Type/Archivo](https://github.com/Omnibus-Type/Archivo) | SIL Open Font License 1.1 (`Archivo-OFL.txt`) |
| DSEG7 Classic by keshikan | [keshikan/DSEG](https://github.com/keshikan/DSEG) | SIL Open Font License 1.1 (`DSEG-OFL.txt`) |

## Sounds

The samples are not stored in this repository. smplr loads them from smpldsnds, which republishes
each collection as web-ready files.

| Sounds | Loaded from | Original source | License |
|---|---|---|---|
| TR-808, LinnDrum LM-2, CR-8000 | [smpldsnds/drum-machines](https://github.com/smpldsnds/drum-machines) | Recordings of the original machines | Public domain, as stated by smpldsnds |
| LM-1, TR-606, DMX, TR-909, TR-707, Drumulator, DX, Linn 9000, DrumTraks, SP-12, RX5, DDD-1 (and their Characters) | smpldsnds Drum Abuse packs (`drum-abuse-vol2` to `vol4`) | [Synth Abuse](https://www.youtube.com/@synthabuse) collection | Not declared |
| Mellotron (Violins, 8-Voice Choir, Flute, Brass) | [smpldsnds/archiveorg-mellotron](https://github.com/smpldsnds/archiveorg-mellotron) | [Mellotron Archive CD-ROM](https://archive.org/details/mellotron-archive-cd-rom-nki-wav.-7z) on the Internet Archive | Not declared |
| Wurlitzer EP200, Yamaha CP-80, Hohner Pianet T | [smpldsnds/sfzinstruments-greg-sullivan-e-pianos](https://github.com/smpldsnds/sfzinstruments-greg-sullivan-e-pianos) | [sfzinstruments/GregSullivan.E-Pianos](https://github.com/sfzinstruments/GregSullivan.E-Pianos), by Greg Sullivan | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) |
| Yamaha TX81Z FM piano | [smpldsnds/sgossner-vcsl](https://github.com/smpldsnds/sgossner-vcsl) | [sgossner/VCSL](https://github.com/sgossner/VCSL), Versilian Community Sample Library | CC0 1.0 |

"Not declared" means the source publishes the sounds without a license statement. They are used
here with credit; before any commercial use, clear the rights with the owners.

The reverb impulse is generated in code (`reverbImpulse` in `src/rack.js`); no recorded impulse is used.
