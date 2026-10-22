// Pattern model and timing math. No DOM, no audio: everything here is unit-tested.

// The 10 voices of a classic TR-style machine, with their front-panel abbreviations. Voices that share a `choke` group cut each other.
export const VOICES = [
  { id: 'bd', short: 'BD', name: 'Kick' },
  { id: 'sd', short: 'SD', name: 'Snare' },
  { id: 'lt', short: 'LT', name: 'Low Tom' },
  { id: 'ht', short: 'HT', name: 'Hi Tom' },
  { id: 'rs', short: 'RS', name: 'Rimshot' },
  { id: 'cp', short: 'CP', name: 'Clap' },
  { id: 'cb', short: 'CB', name: 'Cowbell' },
  { id: 'ch', short: 'CH', name: 'Closed Hat', choke: 'hat' },
  { id: 'oh', short: 'OH', name: 'Open Hat', choke: 'hat' },
  { id: 'cy', short: 'CY', name: 'Cymbal' },
];
// Row ids in grid order: the accent row first, as on the TR-808.
export const ROWS = ['ac', ...VOICES.map((v) => v.id)];

export const STEP_OPTIONS = [8, 12, 16, 24, 32];
export const PATTERN_SLOTS = ['A', 'B', 'C', 'D'];
export const BPM = { min: 40, max: 300, default: 120 };
export const SWING = { min: 50, max: 75, default: 50 };

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

// Parse user input to a number inside [min, max]; anything unusable returns `fallback`.
export function parseInRange(input, min, max, fallback) {
  const n = Number.parseFloat(input);
  return Number.isFinite(n) ? clamp(Math.round(n), min, max) : fallback;
}

export function createPattern(steps = 16) {
  return { steps, rows: Object.fromEntries(ROWS.map((id) => [id, Array(steps).fill(false)])) };
}

// Change the length but keep every step that still fits.
export function resize(pattern, steps) {
  const fit = (row) => Array.from({ length: steps }, (_, i) => row[i] ?? false);
  return { steps, rows: Object.fromEntries(ROWS.map((id) => [id, fit(pattern.rows[id])])) };
}

// Steps from `step` until the next hit that cuts this voice: itself (one voice per channel,
// like the hardware) or a voice in its choke group (closed hat cuts open hat).
export function gateSteps(pattern, voiceId, step, plays = () => true) {
  const choke = VOICES.find((v) => v.id === voiceId)?.choke;
  const cutters = VOICES.filter((v) => v.id === voiceId || (choke && v.choke === choke)).filter((v) => plays(v.id));
  for (let n = 1; n < pattern.steps; n++) {
    const s = (step + n) % pattern.steps;
    if (cutters.some((v) => pattern.rows[v.id][s])) return n;
  }
  return pattern.steps;
}

// MPC-style swing: 50% is straight, 66% is a triplet feel, 75% is a hard shuffle.
// Returns how late every second 16th note lands, in seconds.
export const swingOffset = (swing, stepSec) => (clamp(swing, SWING.min, SWING.max) / 50 - 1) * stepSec;

// Time from a hit on `step` to the hit `n` steps later, with swing applied to odd steps.
export const gateSeconds = (n, step, stepSec, offset) =>
  n * stepSec + (((step + n) % 2) - (step % 2)) * offset;

// Presets: one string per row, "x" = hit. Written for 16 steps.
const PRESETS = {
  'Electro (808)': {
    ac: '..x...x...x...x.', bd: 'x.....x...x.....', sd: '....x.......x...', cp: '....x.......x...',
    cb: '..........x..x..', ch: 'xxxxxxxxxxxxxx.x', oh: '..............x.',
  },
  'House (909)': {
    ac: 'x...x...x...x...', bd: 'x...x...x...x...', cp: '....x.......x...',
    ch: 'x..xx..xx..xx..x', oh: '..x...x...x...x.', cy: 'x...............',
  },
  'Boom bap (SP-12)': {
    bd: 'x......x..x.....', sd: '....x.......x...', ch: 'x.x.x.x.x.x.x...', oh: '..............x.',
  },
  'Breakbeat': {
    ac: '....x.......x...', bd: 'x.x.......xx....', sd: '....x..x.x..x..x', ch: 'x.x.x.x.x.x.x.x.',
  },
  'Bossa (CR-8000)': {
    bd: 'x..xx..xx..xx..x', rs: 'x..x..x...x..x..', ch: 'xxxxxxxxxxxxxxxx', lt: '...............x',
  },
};
export const PRESET_NAMES = Object.keys(PRESETS);

export function presetPattern(name) {
  const pattern = createPattern(16);
  for (const [id, hits] of Object.entries(PRESETS[name] ?? {})) {
    pattern.rows[id] = [...hits].map((c) => c === 'x');
  }
  return pattern;
}

// Rebuild a pattern from untrusted JSON (localStorage). Invalid parts fall back to empty.
export function normalizePattern(raw) {
  const steps = STEP_OPTIONS.includes(raw?.steps) ? raw.steps : 16;
  const pattern = createPattern(steps);
  for (const id of ROWS) {
    const row = raw?.rows?.[id];
    if (Array.isArray(row)) pattern.rows[id] = pattern.rows[id].map((_, i) => row[i] === true);
  }
  return pattern;
}
