// The whole jam: 4 scenes (A–D), each with a drum pattern, a 303 line, a synth line and a keys line,
// plus sound settings, mixer, effects and song order. No DOM, no audio: unit-tested.
import {
  VOICES, STEP_OPTIONS, BPM, SWING, createPattern, resize, presetPattern, normalizePattern, parseInRange,
} from './pattern.js';
import { createBass, resizeBass, normalizeBass, presetBass } from './bass.js';
import { findKit, findKeySound } from './kits.js';

export const SCENES = ['A', 'B', 'C', 'D'];
export const BASSES = ['bass1'];
export const CHANNELS = ['bass1', 'synth', 'keys', 'drums'];
export const DELAY_DIVISIONS = { '1/16': 1, '1/8': 2, '3/16': 3, '1/4': 4, '3/8': 6 }; // in 16th notes
export const MAX_SONG_LENGTH = 64;

export const BASS_KNOBS = {
  tune: { min: -12, max: 12, default: 0 },
  cutoff: { min: 0, max: 1, default: 0.35 },
  resonance: { min: 0, max: 1, default: 0.7 },
  envMod: { min: 0, max: 1, default: 0.55 },
  decay: { min: 0, max: 1, default: 0.3 },
  accent: { min: 0, max: 1, default: 0.7 },
  waveform: { min: 0, max: 1, default: 0 },
};
export const SYNTH_KNOBS = ['wave', 'detune', 'cutoff', 'reso', 'env', 'attack', 'release', 'glide']; // all 0..1
// Classic voicings: Minimoog-style monos, Juno-106 and Jupiter-8 style polys.
export const SYNTH_PRESETS = {
  'Mini lead': { mode: 'mono', chorus: 0, knobs: { wave: 0.15, detune: 0.35, cutoff: 0.45, reso: 0.35, env: 0.45, attack: 0.02, release: 0.25, glide: 0.35 } },
  'Mini bass': { mode: 'mono', chorus: 0, knobs: { wave: 0.6, detune: 0.2, cutoff: 0.25, reso: 0.25, env: 0.55, attack: 0, release: 0.15, glide: 0.15 } },
  'Juno pad': { mode: 'poly', chorus: 2, knobs: { wave: 0.2, detune: 0.5, cutoff: 0.5, reso: 0.15, env: 0.2, attack: 0.55, release: 0.6, glide: 0 } },
  'Juno strings': { mode: 'poly', chorus: 1, knobs: { wave: 0, detune: 0.6, cutoff: 0.6, reso: 0.05, env: 0.15, attack: 0.35, release: 0.45, glide: 0 } },
  'Jupiter brass': { mode: 'poly', chorus: 0, knobs: { wave: 0, detune: 0.45, cutoff: 0.35, reso: 0.2, env: 0.6, attack: 0.18, release: 0.3, glide: 0 } },
  'Poly stab': { mode: 'poly', chorus: 1, knobs: { wave: 0.4, detune: 0.4, cutoff: 0.4, reso: 0.35, env: 0.7, attack: 0, release: 0.12, glide: 0 } },
};
export const KEYS_KNOBS = { tone: 1, release: 0.35 }; // defaults, 0..1
export const DRUM_VOICE = { level: 80, tune: 0, decay: 100, tone: 100, mute: false, solo: false };
export const CHANNEL = { level: 0.8, pan: 0, delay: 0, drive: 0, mute: false, solo: false };

export function createScene(steps = 16) {
  return { steps, drums: createPattern(steps).rows, bass: [createBass(steps)], synth: createBass(steps), keys: createBass(steps) };
}

export function resizeScene(scene, steps) {
  return {
    steps,
    drums: resize({ steps: scene.steps, rows: scene.drums }, steps).rows,
    bass: scene.bass.map((b) => resizeBass(b, steps)),
    synth: resizeBass(scene.synth, steps),
    keys: resizeBass(scene.keys, steps),
  };
}

export const copyScene = (scene) => structuredClone(scene);

function demoScene(drums, bass, synth, keys) {
  return { steps: 16, drums: presetPattern(drums).rows, bass: [presetBass(bass)], synth: presetBass(synth), keys: presetBass(keys) };
}

export function createProject() {
  return {
    version: 3,
    bpm: 126,
    swing: 54,
    volume: 88,
    scene: 0,
    songMode: false,
    song: [0, 0, 1, 1, 2, 3],
    scenes: [
      demoScene('House (909)', 'Acid 1', '', 'Chords: long pad'),
      demoScene('House (909)', 'Acid 2', 'Lead: minor run', 'Chords: Cm Ab Eb Bb'),
      demoScene('Breakbeat', 'Squelch', 'Lead: arpeggio', 'Chords: house stabs'),
      demoScene('Electro (808)', 'Acid 1', 'Lead: minor run', 'Chords: Cm Ab Eb Bb'),
    ],
    drums: { kit: 'tr909', selected: 'bd', voices: Object.fromEntries(VOICES.map((v) => [v.id, { ...DRUM_VOICE }])) },
    bass: [{ knobs: knobDefaults() }],
    synth: structuredClone(SYNTH_PRESETS['Mini lead']),
    keys: { sound: 'mk2-violins', knobs: { ...KEYS_KNOBS } },
    mixer: {
      bass1: { ...CHANNEL, level: 0.75, delay: 0.25, drive: 0.35 },
      synth: { ...CHANNEL, level: 0.8, delay: 0.3, pan: 0.15 },
      keys: { ...CHANNEL, level: 0.55, delay: 0.15, pan: -0.1 },
      drums: { ...CHANNEL, level: 0.85 },
    },
    fx: { delayDivision: '3/16', feedback: 0.4, comp: 0.4 },
  };
}

function knobDefaults() {
  return Object.fromEntries(Object.entries(BASS_KNOBS).map(([k, v]) => [k, v.default]));
}

const num = (v, min, max, fallback) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback);

// localStorage is untrusted: every field is validated, anything odd falls back to the default.
export function normalizeProject(raw) {
  const p = createProject();
  if (!raw || typeof raw !== 'object') return p;
  p.bpm = parseInRange(raw.bpm, BPM.min, BPM.max, p.bpm);
  p.swing = parseInRange(raw.swing, SWING.min, SWING.max, p.swing);
  p.volume = parseInRange(raw.volume, 0, 100, p.volume);
  p.scene = parseInRange(raw.scene, 0, SCENES.length - 1, 0);
  p.songMode = raw.songMode === true;
  if (Array.isArray(raw.song)) {
    p.song = raw.song.filter((s) => Number.isInteger(s) && s >= 0 && s < SCENES.length).slice(0, MAX_SONG_LENGTH);
  }
  if (Array.isArray(raw.scenes)) {
    p.scenes = p.scenes.map((fallback, i) => {
      const s = raw.scenes[i];
      if (!s || typeof s !== 'object') return fallback;
      const steps = STEP_OPTIONS.includes(s.steps) ? s.steps : 16;
      return {
        steps,
        drums: normalizePattern({ steps, rows: s.drums }).rows,
        bass: [normalizeBass(s.bass?.[0], steps)], // older saves had a second 303: dropped
        // Saves from before the synth and keys existed keep the demo lines.
        synth: s.synth ? normalizeBass(s.synth, steps) : resizeBass(fallback.synth, steps),
        keys: s.keys ? normalizeBass(s.keys, steps) : resizeBass(fallback.keys, steps),
      };
    });
  }
  p.drums.kit = findKit(raw.drums?.kit).id;
  if (VOICES.some((v) => v.id === raw.drums?.selected)) p.drums.selected = raw.drums.selected;
  for (const { id } of VOICES) {
    const v = raw.drums?.voices?.[id] ?? {};
    p.drums.voices[id] = {
      level: parseInRange(v.level, 0, 100, DRUM_VOICE.level),
      tune: parseInRange(v.tune, -12, 12, DRUM_VOICE.tune),
      decay: parseInRange(v.decay, 0, 100, DRUM_VOICE.decay),
      tone: parseInRange(v.tone, 0, 100, DRUM_VOICE.tone),
      mute: v.mute === true,
      solo: v.solo === true,
    };
  }
  p.bass = p.bass.map((fallback, i) => ({
    knobs: Object.fromEntries(Object.entries(BASS_KNOBS).map(([k, r]) => [k, num(raw.bass?.[i]?.knobs?.[k], r.min, r.max, fallback.knobs[k])])),
  }));
  if (raw.synth) {
    p.synth.mode = raw.synth.mode === 'poly' ? 'poly' : 'mono';
    p.synth.chorus = [0, 1, 2].includes(raw.synth.chorus) ? raw.synth.chorus : 0;
    for (const k of SYNTH_KNOBS) p.synth.knobs[k] = num(raw.synth.knobs?.[k], 0, 1, p.synth.knobs[k]);
  }
  p.keys.sound = findKeySound(raw.keys?.sound).id;
  for (const k of Object.keys(KEYS_KNOBS)) p.keys.knobs[k] = num(raw.keys?.knobs?.[k], 0, 1, p.keys.knobs[k]);
  for (const ch of CHANNELS) {
    const c = raw.mixer?.[ch] ?? {};
    const d = p.mixer[ch];
    p.mixer[ch] = {
      level: num(c.level, 0, 1, d.level), pan: num(c.pan, -1, 1, d.pan), delay: num(c.delay, 0, 1, d.delay),
      drive: num(c.drive, 0, 1, d.drive), mute: c.mute === true, solo: c.solo === true,
    };
  }
  if (raw.fx?.delayDivision in DELAY_DIVISIONS) p.fx.delayDivision = raw.fx.delayDivision;
  p.fx.feedback = num(raw.fx?.feedback, 0, 0.9, p.fx.feedback);
  p.fx.comp = num(raw.fx?.comp, 0, 1, p.fx.comp);
  return p;
}

// Bring drum patterns and sounds over from drum_seq v1 (its own localStorage key).
export function migrateV1(v1) {
  const p = createProject();
  if (!v1 || typeof v1 !== 'object') return p;
  const legacy = normalizeProject({ drums: { kit: v1.kit, voices: v1.voices, selected: v1.selected }, bpm: v1.bpm, swing: v1.swing, volume: v1.volume });
  Object.assign(p, { bpm: legacy.bpm, swing: legacy.swing, volume: legacy.volume, drums: legacy.drums });
  if (Array.isArray(v1.patterns)) {
    p.scenes = p.scenes.map((scene, i) => {
      if (!v1.patterns[i]) return scene;
      const drums = normalizePattern(v1.patterns[i]);
      return { ...resizeScene(scene, drums.steps), drums: drums.rows };
    });
  }
  return p;
}
