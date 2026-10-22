// Note step model shared by the 303s, the synth and the keys. Each step: note (0..12 = C..upper C),
// octave shift, accent, slide, chord and length in steps (the 303 uses neither). No DOM, no audio: unit-tested.

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B', 'C'];
export const BASE_KEY = 36; // C2, the TB-303's home octave
export const GATE = 0.5; // a note releases half a step before its length ends: a 1-step note is the 303's half-step gate
export const MAX_LENGTH = 16;
// Chord shapes in semitones above the root. '' is a single note.
export const CHORDS = { '': [0], maj: [0, 4, 7], min: [0, 3, 7], 7: [0, 4, 7, 10], m7: [0, 3, 7, 10], sus4: [0, 5, 7], dim: [0, 3, 6] };

export const emptyStep = () => ({ on: false, note: 0, oct: 0, accent: false, slide: false, chord: '', len: 1 });
export const createBass = (steps = 16) => Array.from({ length: steps }, emptyStep);
export const keyOf = (step, base = BASE_KEY) => base + 12 * step.oct + step.note;

export function resizeBass(bass, steps) {
  return Array.from({ length: steps }, (_, i) => (bass[i] ? { ...bass[i] } : emptyStep()));
}

// Rebuild steps from untrusted JSON (localStorage).
export function normalizeBass(raw, steps) {
  return Array.from({ length: steps }, (_, i) => {
    const s = Array.isArray(raw) ? raw[i] : null;
    return {
      on: s?.on === true,
      note: Number.isInteger(s?.note) && s.note >= 0 && s.note <= 12 ? s.note : 0,
      oct: [-1, 0, 1].includes(s?.oct) ? s.oct : 0,
      accent: s?.accent === true,
      slide: s?.slide === true,
      chord: Object.hasOwn(CHORDS, s?.chord) ? s.chord : '',
      len: Number.isInteger(s?.len) && s.len >= 1 && s.len <= MAX_LENGTH ? s.len : 1,
    };
  });
}

/**
 * Turn step `i` into note events. `held` is the key still sounding because the previous step slid
 * into this one (or null). Event times `at` are in steps. A slide keeps the gate open into the next
 * step, so the next note glides instead of retriggering (303 and mono synth). With `poly`, the step's
 * chord sounds and slides are ignored.
 */
export function noteStep(line, i, held, { base = BASE_KEY, poly = false } = {}) {
  const step = line[i];
  const next = line[(i + 1) % line.length];
  const events = [];
  if (!step.on) {
    if (held !== null) events.push({ at: 0, kind: 'off', key: held });
    return { events, held: null };
  }
  const root = keyOf(step, base);
  const keys = poly ? CHORDS[step.chord].map((n) => root + n) : [root];
  for (const key of keys) events.push({ at: 0, kind: 'on', key, accent: step.accent });
  if (held !== null) events.push({ at: 0, kind: 'off', key: held }); // after the on: that makes it a slide
  if (!poly && step.slide && next.on) return { events, held: root };
  for (const key of keys) events.push({ at: step.len - GATE, kind: 'off', key });
  return { events, held: null };
}

// Presets written one token per step: "-" rest, then note name, optional "+"/"-" octave, optional chord
// (maj, min, 7, m7, sus4, dim), "a" accent, "s" slide, and ":n" for a length of n steps. E.g. "G#-maj:4".
const BASS_PRESETS = {
  'Acid 1': 'C C+ - C D#a C+s C - G- C C+a - D#s F - C+',
  'Acid 2': 'C- C- C+as C- - C- D#s F G-a C- - C+ C- A#-s C C-',
  'Sub pulse': 'C- - - C- - - C- - A#- - - A#- - - G- -',
  'Squelch': 'Ca D#s Fs G Ca - C+s A# G D#a - Fs G - C+as C',
};
const MELODY_PRESETS = {
  'Lead: minor run': 'C+:2 - D#+ F+ G+:3 - - A#+s G+:2 - F+ D#+:2 - C+:2 -',
  'Lead: arpeggio': 'C G C+ D#+ G+ D#+ C+ G C G C+ D#+ A#+ D#+ C+ A#',
  'Chords: Cm Ab Eb Bb': 'Cmin:4 - - - G#-maj:4 - - - D#maj:4 - - - A#-maj:4 - - -',
  'Chords: house stabs': '- - Cm7a - - - Cm7 - - - D#maj - - - A#-maj -',
  'Chords: long pad': 'Cm7:8 - - - - - - - G#-maj:8 - - - - - - -',
};
export const BASS_PRESET_NAMES = Object.keys(BASS_PRESETS);
export const MELODY_PRESET_NAMES = Object.keys(MELODY_PRESETS);

export function parseBass(text) {
  return text.trim().split(/\s+/).map((token) => {
    const m = /^([A-G]#?)([+-]?)(maj|min|m7|7|sus4|dim)?([as]*)(?::(\d+))?$/.exec(token);
    if (!m) return emptyStep();
    return {
      ...emptyStep(),
      on: true,
      note: NOTE_NAMES.indexOf(m[1]),
      oct: m[2] === '+' ? 1 : m[2] === '-' ? -1 : 0,
      chord: m[3] ?? '',
      accent: m[4].includes('a'),
      slide: m[4].includes('s'),
      len: m[5] ? Math.min(MAX_LENGTH, Number(m[5])) : 1,
    };
  });
}

export const presetBass = (name, steps = 16) => resizeBass(parseBass(BASS_PRESETS[name] ?? MELODY_PRESETS[name] ?? ''), steps);
