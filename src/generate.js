// Musical generators: Random, Mutate and key changes for the note machines. Everything follows the
// project key, and the bass and synth follow the chords the Keys play. Pure (rng injectable): unit-tested.
import { CHORDS, MAX_LENGTH, emptyStep } from './bass.js';
import { ROWS } from './pattern.js';

export const SCALES = {
  minor: [0, 2, 3, 5, 7, 8, 10],
  major: [0, 2, 4, 5, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  harmonic: [0, 2, 3, 5, 7, 8, 11],
};
export const SCALE_NAMES = { minor: 'Minor', major: 'Major', dorian: 'Dorian', phrygian: 'Phrygian', mixolydian: 'Mixolydian', harmonic: 'Harmonic minor' };
export const DENSITIES = [['few', 'Few'], ['some', 'Some'], ['many', 'Many']];

// Notes per 8 steps. A Euclidean spread keeps that count exact, so a line is never crowded by chance.
const HITS = { bass: { few: 3, some: 5, many: 6 }, synth: { few: 2, some: 3, many: 5 } };
const REGISTER = { bass: [-5, 17], synth: [0, 22] }; // semitones above the machine's C
// Common progressions as scale degrees (0 = i/I): minor-mode and major-mode favourites.
const MINOR_PROGS = [[0, 5, 2, 6], [0, 3, 4, 0], [0, 5, 6, 0], [0, 3, 6, 2]];
const MAJOR_PROGS = [[0, 4, 5, 3], [0, 5, 3, 4], [5, 3, 0, 4], [1, 4, 0, 0]];
const MOVES = [1, 1, 1, -1, -1, -1, 0, 2, -2, 3, -4]; // scale steps between weak notes: mostly by step

const mod = (n, m) => ((n % m) + m) % m;
const pick = (list, rng) => list[Math.floor(rng() * list.length)];
const absOf = (step) => 12 * step.oct + step.note;
// A pitch in semitones above C to { note, oct }, folded into the step range (C one octave down .. C two up).
function place(abs) {
  while (abs > 24) abs -= 12;
  while (abs < -12) abs += 12;
  const oct = Math.min(1, Math.max(-1, Math.floor(abs / 12)));
  return { note: abs - 12 * oct, oct };
}
const degree = (key, d) => SCALES[key.scale][mod(d, 7)] + 12 * Math.floor(d / 7);
const inScale = (key, abs) => SCALES[key.scale].includes(mod(abs - key.root, 12));

// Hit pattern with exactly k hits spread as evenly as possible over n steps (Bjorklund's result).
export const euclid = (k, n, rot = 0) => Array.from({ length: n }, (_, i) => ((i + rot) * k) % n < k);

// Chord built on scale degree d by stacking thirds of the scale.
export function diatonicChord(key, d, seventh = false) {
  const third = degree(key, d + 2) - degree(key, d);
  const fifth = degree(key, d + 4) - degree(key, d);
  const sev = degree(key, d + 6) - degree(key, d);
  const triad = third === 4 ? 'maj' : fifth === 6 ? 'dim' : 'min';
  if (seventh && sev === 10 && triad !== 'dim') return triad === 'min' ? 'm7' : '7';
  return triad;
}

// Pitch classes (0 = C) of the Keys chord sounding at step i, or the key's tonic triad.
export function chordAt(keysLine, i, key) {
  for (let j = i; keysLine && j >= 0 && j > i - MAX_LENGTH; j--) {
    const s = keysLine[j];
    if (s.on && j + s.len > i) return CHORDS[s.chord].map((n) => mod(absOf(s) + n, 12));
  }
  return CHORDS[diatonicChord(key, 0)].map((n) => mod(key.root + n, 12));
}

const nearest = (candidates, to) => candidates.reduce((a, b) => (Math.abs(b - to) < Math.abs(a - to) ? b : a));
const tonesIn = ([lo, hi], ok) => { const out = []; for (let a = lo; a <= hi; a++) if (ok(a)) out.push(a); return out; };
// One scale step (or more) from `from`, reflecting at the edges of the register.
function stepFrom(ladder, from, move) {
  const i = ladder.indexOf(nearest(ladder, from));
  const j = i + move < 0 || i + move >= ladder.length ? i - move : i + move;
  return ladder[Math.min(ladder.length - 1, Math.max(0, j))];
}

/**
 * Random line for the bass or the synth: a motif of 8 steps repeated as A A' A A'' over the line,
 * chord tones on the beat (from the Keys), stepwise scale motion between, ending on root or fifth.
 */
export function generateLine(kind, { steps, key, density = 'some', keysLine = null, rng = Math.random }) {
  const seg = steps % 8 ? steps : 8;
  const hits = Math.max(1, Math.round((HITS[kind][density] * seg) / 8));
  const rhythm = euclid(hits, seg, kind === 'bass' ? 0 : Math.floor(rng() * seg)); // the bass starts on the one
  const motif = Array.from({ length: seg }, () => pick(MOVES, rng));
  const varied = (n) => { const m = [...motif]; for (let v = 0; v < n; v++) m[Math.floor(rng() * seg)] = pick(MOVES, rng); return m; };
  const moves = [motif, varied(1), motif, varied(2)];
  const range = REGISTER[kind];
  const ladder = tonesIn(range, (a) => inScale(key, a));
  const lastOn = steps - 1 - [...Array(steps).keys()].reverse().findIndex((i) => rhythm[i % seg]);
  const line = [];
  let cur = nearest(ladder, key.root + (kind === 'synth' ? 12 : 0));
  for (let i = 0; i < steps; i++) {
    const on = rhythm[i % seg];
    if (!on) { line.push(emptyStep()); continue; }
    const chord = chordAt(keysLine, i, key);
    const strong = i % 4 === 0;
    if (i === lastOn) cur = nearest(tonesIn(range, (a) => [chord[0], chord[2] ?? chord[0]].includes(mod(a, 12))), cur);
    else if (strong) {
      const wanted = kind === 'bass' && rng() < 0.65 ? [chord[0]] : chord;
      cur = nearest(tonesIn(range, (a) => wanted.includes(mod(a, 12))), cur);
    } else cur = stepFrom(ladder, cur, moves[Math.floor(i / seg) % 4][i % seg]);
    // The 303's octave jumps: now and then a weak note leaps an octave without moving the line.
    const out = kind === 'bass' && !strong && rng() < 0.12 ? cur + (rng() < 0.5 ? 12 : -12) : cur;
    line.push({ ...emptyStep(), on: true, ...place(out), accent: strong && rng() < 0.3 });
  }
  line.forEach((s, i) => {
    const next = line[(i + 1) % steps];
    s.slide = s.on && next.on && Math.abs(absOf(next) - absOf(s)) <= 5 && rng() < 0.22;
  });
  return line;
}

const chordStep = (key, d, seventh) => {
  const root = mod(key.root + degree(key, d), 12);
  return { ...emptyStep(), on: true, ...place(root > 7 ? root - 12 : root), chord: diatonicChord(key, d, seventh) };
};

// Random Keys line: a well-known progression of 4 chords, one per quarter of the line.
export function generateChords({ steps, key, density = 'some', rng = Math.random }) {
  const minorish = degree(key, 2) === 3;
  const prog = pick(minorish ? MINOR_PROGS : MAJOR_PROGS, rng);
  const span = steps / 4;
  const line = Array.from({ length: steps }, emptyStep);
  prog.forEach((d, c) => {
    const chord = chordStep(key, d, rng() < 0.3);
    const start = c * span;
    const hit = (at, len, accent = false) => { if (len > 0) line[start + at] = { ...chord, len, accent }; };
    if (density === 'few') hit(0, span);
    else if (density === 'some') { const half = Math.ceil(span / 2); hit(0, half); hit(half, span - half); }
    else for (let j = 0; j < span; j += 2) hit(j, 1, (start + j) % 4 === 2); // stabs, accented off the beat
  });
  return line;
}

/** Change 2 or 3 steps of a line and keep the rest: nudge a note, add or drop a weak step, flip an accent. */
export function mutateLine(line, kind, { key, keysLine = null, rng = Math.random }) {
  const out = line.map((s) => ({ ...s }));
  const ladder = tonesIn([-12, 24], (a) => inScale(key, a));
  const changes = 2 + (rng() < 0.5 ? 1 : 0);
  for (let c = 0; c < changes; c++) {
    const ons = out.map((s, i) => (s.on ? i : -1)).filter((i) => i >= 0);
    if (kind === 'keys') {
      if (!ons.length) break;
      const i = pick(ons, rng);
      out[i] = { ...chordStep(key, pick([0, 2, 3, 4, 5, 6], rng), rng() < 0.3), len: out[i].len, accent: out[i].accent };
      continue;
    }
    const i = Math.floor(rng() * out.length);
    const s = out[i];
    const r = rng();
    if (s.on && r < 0.5) Object.assign(s, place(stepFrom(ladder, absOf(s), rng() < 0.5 ? 1 : -1)));
    else if (i % 4 && r < 0.8) {
      if (s.on) s.on = false;
      else {
        const prev = [...out.slice(0, i)].reverse().find((p) => p.on);
        const near = prev ? absOf(prev) : key.root;
        Object.assign(s, { on: true, ...place(nearest(tonesIn([near - 5, near + 5], (a) => chordAt(keysLine, i, key).includes(mod(a, 12)) || inScale(key, a)), near)) });
      }
    } else if (s.on) s.accent = !s.accent;
  }
  return out;
}

// Move a whole line by some semitones (a key change), folding notes into the playable range.
export const transposeLine = (line, semis) => line.map((s) => ({ ...s, ...place(absOf(s) + semis) }));

/** Re-map a line written in C minor (the example lines) into a key, degree by degree, chords included. */
export function inKey(line, key) {
  const lift = key.root > 6 ? -12 : 0; // keep the line near its written register
  return line.map((s) => {
    const pc = mod(absOf(s), 12);
    const d = SCALES.minor.indexOf(pc);
    if (d < 0) return { ...s, ...place(absOf(s) + key.root + lift) };
    const chord = ['maj', 'min', 'dim'].includes(s.chord) ? diatonicChord(key, d)
      : ['7', 'm7'].includes(s.chord) ? diatonicChord(key, d, true) : s.chord;
    return { ...s, ...place(absOf(s) - pc + key.root + degree(key, d) + lift), chord };
  });
}

// Classic grooves as 16th positions in a bar: kick patterns per style, backbeat on 2 and 4.
const GROOVES = {
  house: { bd: [[0, 4, 8, 12]], back: 'cp', openHats: true },
  breakbeat: { bd: [[0, 10], [0, 3, 10], [0, 7, 10]], back: 'sd', openHats: false },
  electro: { bd: [[0, 6, 10], [0, 7, 10, 13], [0, 3, 6, 10]], back: 'sd', openHats: false },
};

/**
 * Random drum pattern: a house, breakbeat or electro groove with the backbeat always on 2 and 4.
 * Density adds hats, ghost notes, percussion and a tom fill at the end of the bar.
 */
export function generateDrums({ steps, density = 'some', rng = Math.random }) {
  const style = GROOVES[pick(Object.keys(GROOVES), rng)];
  const kick = pick(style.bd, rng);
  const rows = Object.fromEntries(ROWS.map((id) => [id, Array(steps).fill(false)]));
  const many = density === 'many';
  const perc = pick(['rs', 'cb', 'rs'], rng);
  const sprinkle = euclid(density === 'few' ? 0 : many ? 4 : 2, 16, Math.floor(rng() * 16));
  for (let i = 0; i < steps; i++) {
    const at = i % 16;
    const offbeat = at % 4 === 2;
    if (kick.includes(at)) rows.bd[i] = true;
    if (at === 4 || at === 12) rows[style.back][i] = true;
    if (style.back === 'cp' && density !== 'few' && (at === 4 || at === 12)) rows.sd[i] = true;
    if (style.openHats && offbeat) rows.oh[i] = true;
    else if (at % 2 === 0 || (density !== 'few' && (many || rng() < 0.3))) rows.ch[i] = true;
    if (many && style.back === 'sd' && (at === 7 || at === 15) && rng() < 0.6) rows.sd[i] = true; // ghost snares
    if (sprinkle[at] && !rows.bd[i] && !rows[style.back][i]) rows[perc][i] = true;
    if (many && i >= steps - 3 && i % 2 === 1) rows[i === steps - 1 ? 'lt' : 'ht'][i] = true; // fill into the next bar
    rows.ac[i] = at % 4 === 0 && rows.bd[i] && rng() < 0.5;
  }
  if (density !== 'few' && rng() < 0.3) rows.cy[0] = true;
  return rows;
}
