// Classic drum machines, sampled from the original hardware (credits in the page footer).
// Each kit maps the 10 voices to one sample; null means the machine never had that sound.
// `dm` = smplr DrumMachine collection (folder URL), `abuse` = smplr DrumAbuse (Synth Abuse) collection.
export const KITS = [
  {
    id: 'tr808', name: 'Roland TR-808', year: 1980,
    source: { type: 'dm', baseUrl: 'https://smpldsnds.github.io/drum-machines/TR-808' },
    map: {
      bd: 'kick/bd2575', sd: 'snare/sd2550', lt: 'tom-low/lt50', ht: 'tom-hi/ht50', rs: 'rimshot/rs',
      cp: 'clap/cp', cb: 'cowbell/cb', ch: 'hihat-close/ch', oh: 'hihat-open/oh50', cy: 'cymbal/cy5050',
    },
  },
  {
    id: 'lm1', name: 'Linn LM-1', year: 1980,
    source: { type: 'abuse', machine: 'linn-lm-1', set: '1' },
    map: {
      bd: 'Kick1', sd: 'SnareDrum1', lt: 'Lotom', ht: 'Hitom', rs: 'Sst',
      cp: 'Clap', cb: 'Cowb', ch: 'Chh', oh: 'Ohh', cy: 'Crash',
    },
  },
  {
    id: 'cr8000', name: 'Roland CR-8000', year: 1981,
    source: { type: 'dm', baseUrl: 'https://smpldsnds.github.io/drum-machines/Roland-CR-8000' },
    map: {
      bd: 'kick', sd: 'snare', lt: 'tom-low', ht: 'tom-high', rs: 'rimshot',
      cp: 'clap', cb: 'cowbell', ch: 'hihat-closed', oh: 'hihat-open', cy: 'cymball',
    },
  },
  {
    id: 'tr606', name: 'Roland TR-606', year: 1981,
    source: { type: 'abuse', machine: 'roland-tr-606', set: '1' },
    map: {
      bd: 'TR606Kick01', sd: 'TR606Snare01', lt: 'TR606TomLo01', ht: 'TR606TomHi01', rs: null,
      cp: null, cb: null, ch: 'TR606Hat_C01', oh: 'TR606Hat_O01', cy: 'TR606Cymb01',
    },
  },
  {
    id: 'dmx', name: 'Oberheim DMX', year: 1981,
    source: { type: 'abuse', machine: 'oberheim-dmx', set: '1' },
    map: {
      bd: 'Bdrum1_Oberheim_DMX', sd: 'Snare1_Oberheim_DMX', lt: 'TomLow_Oberheim_DMX', ht: 'tomHi_Oberheim_DMX',
      rs: 'Rimshot_Oberheim_DMX', cp: 'Clap1_Oberheim_DMX', cb: null, ch: 'Hhclose1_Oberheim_DMX',
      oh: 'open hi hat_Oberheim_DMX', cy: 'Crash_Oberheim_DMX',
    },
  },
  {
    id: 'lm2', name: 'LinnDrum LM-2', year: 1982,
    source: { type: 'dm', baseUrl: 'https://smpldsnds.github.io/drum-machines/LM-2' },
    map: {
      bd: 'kick', sd: 'snare-m', lt: 'tom-l', ht: 'tom-h', rs: 'stick-m',
      cp: 'clap', cb: 'cowbell', ch: 'hhclosed', oh: 'hhopen', cy: 'crash',
    },
  },
  {
    id: 'tr909', name: 'Roland TR-909', year: 1983,
    source: { type: 'abuse', machine: 'roland-tr-909', set: '1' },
    map: {
      bd: 'TR-909Kick 01', sd: 'TR-909Snare 01', lt: 'TR-909Tom Low 01', ht: 'TR-909Tom Hi 01', rs: 'TR-909Rim',
      cp: 'TR-909Clap', cb: null, ch: 'TR-909Hat C 01', oh: 'TR-909Hat O 03', cy: 'TR-909Crash',
    },
  },
  {
    id: 'tr707', name: 'Roland TR-707', year: 1985,
    source: { type: 'abuse', machine: 'roland-tr-707', set: '1' },
    map: {
      bd: 'TR-707Kick01', sd: 'TR-707Snare01', lt: 'TR-707Tom_Lo', ht: 'TR-707Tom_Hi', rs: 'TR-707RimShot',
      cp: 'TR-707Clap', cb: 'TR-707Cow', ch: 'TR-707Hat_C', oh: 'TR-707Hat_O', cy: 'TR-707Crash',
    },
  },
  {
    id: 'sp12', name: 'E-mu SP-12', year: 1985,
    source: { type: 'abuse', machine: 'emu-sp-12', set: '2/Dry' },
    map: {
      bd: 'SP12 Kick 1', sd: 'SP12 Snare 1', lt: 'SP12 Tom Low', ht: null, rs: null,
      cp: 'SP12 Clap', cb: null, ch: 'SP12 Closed Hi Hat', oh: 'SP12 Open Hi Hat', cy: null,
    },
  },
];

export const findKit = (id) => KITS.find((k) => k.id === id) ?? KITS[0];

// Keys: vintage keyboards, sampled. Mellotron tapes (archive.org Mellotron archive; license unclear),
// Greg Sullivan's electric pianos (CC BY 3.0) and the VCSL TX81Z FM piano (CC0), all via smplr.
export const KEY_SOUNDS = [
  { id: 'mk2-violins', name: 'Mellotron Violins', type: 'mellotron', instrument: 'MKII VIOLINS' },
  { id: 'choir', name: 'Mellotron 8-Voice Choir', type: 'mellotron', instrument: '8VOICE CHOIR' },
  { id: 'flute', name: 'Mellotron Flute', type: 'mellotron', instrument: 'TRON FLUTE' },
  { id: 'brass', name: 'Mellotron Brass', type: 'mellotron', instrument: 'MKII BRASS' },
  { id: 'wurli', name: 'Wurlitzer EP200', type: 'ep', instrument: 'WurlitzerEP200' },
  { id: 'cp80', name: 'Yamaha CP-80', type: 'ep', instrument: 'CP80' },
  { id: 'pianet', name: 'Hohner Pianet T', type: 'ep', instrument: 'PianetT' },
  { id: 'tx81z', name: 'Yamaha TX81Z FM piano', type: 'ep', instrument: 'TX81Z' },
];
export const findKeySound = (id) => KEY_SOUNDS.find((k) => k.id === id) ?? KEY_SOUNDS[0];
