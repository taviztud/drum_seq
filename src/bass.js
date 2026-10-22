// TB-303 style step model. Each step: note (0..12 = C..upper C), octave shift, accent, slide.
// No DOM, no audio: unit-tested.

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B', 'C'];
export const BASE_KEY = 36; // C2, the TB-303's home octave
export const GATE = 0.5; // a normal note is held for half a step

export const emptyStep = () => ({ on: false, note: 0, oct: 0, accent: false, slide: false });
export const createBass = (steps = 16) => Array.from({ length: steps }, emptyStep);
export const keyOf = (step) => BASE_KEY + 12 * step.oct + step.note;

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
    };
  });
}

/**
 * Turn step `i` into note events, the way the TB-303 gates them. `held` is the key still sounding
 * because the previous step slid into this one (or null). Event times `at` are in steps.
 * A slide keeps the gate open into the next step; the new note then glides instead of retriggering.
 */
export function bassStep(bass, i, held) {
  const step = bass[i];
  const next = bass[(i + 1) % bass.length];
  const events = [];
  if (!step.on) {
    if (held !== null) events.push({ at: 0, kind: 'off', key: held });
    return { events, held: null };
  }
  const key = keyOf(step);
  events.push({ at: 0, kind: 'on', key, accent: step.accent });
  if (held !== null) events.push({ at: 0, kind: 'off', key: held }); // after the on: that makes it a slide
  if (step.slide && next.on) return { events, held: key };
  events.push({ at: GATE, kind: 'off', key });
  return { events, held: null };
}

/**
 * Random acid line in a minor pentatonic feel, like ReBirth's pattern randomizer.
 * `rng` is injectable so tests are deterministic.
 */
export function randomBass(steps = 16, rng = Math.random) {
  const scale = [0, 3, 5, 7, 10, 12];
  const pick = (list) => list[Math.floor(rng() * list.length)];
  return Array.from({ length: steps }, (_, i) => {
    const on = i === 0 || rng() < 0.72;
    const r = rng();
    return {
      on,
      note: pick(scale),
      oct: r < 0.14 ? -1 : r > 0.84 ? 1 : 0,
      accent: on && rng() < 0.28,
      slide: on && rng() < 0.22,
    };
  });
}

// Presets written one token per step: "-" rest, note name, then optional "+"/"-" octave, "a" accent, "s" slide.
const PRESETS = {
  'Acid 1': 'C C+ - C D#a C+s C - G- C C+a - D#s F - C+',
  'Acid 2': 'C- C- C+as C- - C- D#s F G-a C- - C+ C- A#-s C C-',
  'Sub pulse': 'C- - - C- - - C- - A#- - - A#- - - G- -',
  'Squelch': 'Ca D#s Fs G Ca - C+s A# G D#a - Fs G - C+as C',
};
export const BASS_PRESET_NAMES = Object.keys(PRESETS);

export function parseBass(text) {
  return text.trim().split(/\s+/).map((token) => {
    const m = /^([A-G]#?)([+-]?)([as]*)$/.exec(token);
    if (!m) return emptyStep();
    const oct = m[2] === '+' ? 1 : m[2] === '-' ? -1 : 0;
    return { on: true, note: NOTE_NAMES.indexOf(m[1]), oct, accent: m[3].includes('a'), slide: m[3].includes('s') };
  });
}

export const presetBass = (name, steps = 16) => resizeBass(parseBass(PRESETS[name] ?? ''), steps);
