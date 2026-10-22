// Audio engine: smplr sampled kits driven by smplr's sample-accurate Sequencer.
import { DrumMachine, DrumAbuse, Sequencer, CacheStorage as SampleCache } from '../vendor/smplr-1.1.0.mjs';
import { VOICES, gateSteps, gateSeconds, swingOffset } from './pattern.js';
import { findKit } from './kits.js';

const VELOCITY = { normal: 96, accent: 127 };
const RELEASE = 0.015; // seconds; a choke or retrigger cuts almost instantly, like the hardware

// Voice knobs (0..100, tune in semitones) to smplr note options.
const decaySeconds = (decay) => (decay >= 100 ? Infinity : 0.03 + (decay / 100) ** 2 * 2);
const toneHz = (tone) => (tone >= 100 ? 20000 : 200 * 100 ** (tone / 100));

/**
 * @param {{ stateFor: (barStart: boolean) => object, onStep: (step: number, time: number) => void }} hooks
 * stateFor(barStart) returns { pattern, voices, swing } for the step about to play;
 * barStart is true on the first step of a bar, where a queued pattern change may take over.
 */
export function createEngine({ stateFor, onStep }) {
  const ctx = new AudioContext({ latencyHint: 'interactive' });
  const master = new GainNode(ctx);
  // Brick-wall safety limiter so stacked accents never clip.
  const limiter = new DynamicsCompressorNode(ctx, { threshold: -2, knee: 0, ratio: 20, attack: 0.001, release: 0.08 });
  master.connect(limiter).connect(ctx.destination);
  // Cache samples in the browser (https only), so kits load instantly and work offline after the first visit.
  const storage = window.isSecureContext && 'caches' in window ? SampleCache('drum_seq') : undefined;

  const loaded = new Map(); // kit id -> Promise<instrument>
  let kit = null; // { def, inst } currently playing
  let pending = []; // stop functions of notes scheduled but maybe not yet heard
  let pos = -1;
  let steps = 0;

  const seq = Sequencer(ctx, { stepSize: '16n' });
  seq.on('step', (_, time) => {
    const barStart = pos < 0 || pos + 1 >= steps;
    const state = stateFor(barStart);
    steps = state.pattern.steps;
    pos = barStart || pos + 1 >= steps ? 0 : pos + 1; // also wraps when the pattern got shorter mid-bar
    playStep(state, pos, time);
    onStep(pos, time);
  });

  function playStep({ pattern, voices, swing }, step, time) {
    const stepSec = 60 / seq.bpm / 4;
    const offset = swingOffset(swing, stepSec);
    const at = time + (step % 2 ? offset : 0);
    const soloing = VOICES.some((v) => voices[v.id].solo);
    const plays = (id) => !voices[id].mute && (!soloing || voices[id].solo);
    const accent = pattern.rows.ac[step];
    pending = pending.filter((p) => p.time > ctx.currentTime);
    for (const { id } of VOICES) {
      if (!pattern.rows[id][step] || !plays(id)) continue;
      const gate = gateSeconds(gateSteps(pattern, id, step, plays), step, stepSec, offset);
      const stop = trigger(id, voices[id], at, accent, gate);
      if (stop) pending.push({ time: at, stop });
    }
  }

  function trigger(id, params, time, accent, gate = Infinity) {
    const note = kit?.def.map[id];
    const velocity = Math.round((accent ? VELOCITY.accent : VELOCITY.normal) * (params.level / 100));
    if (!note || velocity <= 0) return null;
    const duration = Math.min(gate, decaySeconds(params.decay));
    return kit.inst.start({
      note,
      time,
      stopId: id,
      velocity,
      ampRelease: RELEASE,
      detune: params.tune * 100,
      lpfCutoffHz: toneHz(params.tone),
      duration: Number.isFinite(duration) ? duration : null,
    });
  }

  function instrumentFor(def, onProgress) {
    if (!loaded.has(def.id)) {
      const samples = Object.values(def.map).filter(Boolean);
      const options = { destination: master, storage, onLoadProgress: onProgress };
      // Load only the samples this kit uses. For DrumMachine kits the sample list is handed over directly
      // (smplr 1.1.0 can't address samples past MIDI 127 in its full 808 list).
      const inst = def.source.type === 'dm'
        ? DrumMachine(ctx, { ...options, instrument: {
          baseUrl: def.source.baseUrl, name: def.id, samples, groupNames: [],
          nameToSampleName: Object.fromEntries(samples.map((n) => [n, n])), sampleGroupVariations: {},
        } })
        : DrumAbuse(ctx, { ...options, notesToLoad: { notes: samples }, source: { kind: 'machine', machine: def.source.machine, set: def.source.set } });
      const ready = inst.ready.then(() => inst);
      ready.catch(() => loaded.delete(def.id)); // let a later attempt retry
      loaded.set(def.id, ready);
    }
    return loaded.get(def.id);
  }

  let loadToken = 0;
  return {
    get playing() { return seq.state === 'playing'; },
    get kit() { return kit?.def ?? null; },
    set bpm(value) { seq.bpm = value; },
    set volume(gain) { master.gain.setTargetAtTime(gain, ctx.currentTime, 0.01); },

    // Resolves when the kit is playable. A newer loadKit call wins over an older one.
    async loadKit(id, onProgress) {
      const def = findKit(id);
      const token = ++loadToken;
      const inst = await instrumentFor(def, onProgress);
      if (token === loadToken) kit = { def, inst };
      return def;
    },

    async start() {
      await ctx.resume(); // browsers keep audio suspended until a user gesture
      if (seq.state === 'playing') return;
      pos = -1;
      seq.start();
    },

    stop() {
      seq.stop();
      for (const p of pending) p.stop();
      pending = [];
      kit?.inst.stop();
      pos = -1;
    },

    // Play one voice now (row label click), as the pads on a drum machine do.
    async audition(id, params) {
      await ctx.resume();
      trigger(id, params, ctx.currentTime, false);
    },

    now: () => ctx.currentTime,
  };
}
