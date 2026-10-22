// Audio for the whole rack: the Open303 bass line, the analog synth, the sampled keys and drum machine,
// mixer, delay, reverb and master bus. Live playback and the offline WAV export build the same graph and play the same plan.
import {
  DrumMachine, DrumAbuse, Mellotron, ElectricPiano, Sequencer, Scheduler, CacheStorage as SampleCache, audioBufferToWav16,
} from '../vendor/smplr-1.1.0.mjs';
import { advance, startCursor, stepEvents, planRender, VELOCITY } from './plan.js';
import { CHANNELS, BASSES, DELAY_DIVISIONS, SYNTH_KNOBS } from './project.js';
import { findKit, findKeySound } from './kits.js';

const WORKLETS = ['open303-processor.js', 'va-processor.js'].map((f) => new URL(`./worklets/${f}`, import.meta.url));
const NODE_TRACKS = ['bass1', 'synth']; // machines played by an AudioWorklet voice
const RELEASE = 0.015; // drum choke/retrigger release in seconds, near-instant like the hardware
const TAIL = 3; // seconds of delay and reverb tail kept at the end of an export
// Juno-60/106 chorus modes: LFO rate (Hz) and delay sweep (s). Index 0 is off.
const CHORUS = [null, { rate: 0.5, depth: 0.0018 }, { rate: 0.83, depth: 0.0026 }];

// Drum knobs (0..100, tune in semitones) to smplr note options.
const decaySeconds = (decay) => (decay >= 100 ? Infinity : 0.03 + (decay / 100) ** 2 * 2);
const toneHz = (tone) => (tone >= 100 ? 20000 : 200 * 100 ** (tone / 100));

function driveCurve(amount) {
  const k = 1 + amount * 24;
  const curve = new Float32Array(1024);
  for (let i = 0; i < curve.length; i++) {
    const x = (i / (curve.length - 1)) * 2 - 1;
    curve[i] = Math.tanh(k * x) / Math.tanh(k);
  }
  return curve;
}

/**
 * Plate-style reverb impulse: stereo noise with a 20 ms pre-delay, decaying 60 dB over `seconds`
 * and getting darker as it fades. Seeded, so live playback and the export sound the same.
 */
export function reverbImpulse(sampleRate, seconds = 2.4, seed = 1) {
  let x = seed;
  const rnd = () => ((x = (x * 16807) % 2147483647) / 2147483647) * 2 - 1;
  const pre = Math.round(0.02 * sampleRate);
  const n = Math.round(seconds * sampleRate);
  return [0, 1].map(() => {
    const data = new Float32Array(n);
    let low = 0;
    for (let i = pre; i < n; i++) {
      const t = (i - pre) / (n - pre);
      low += (rnd() - low) * (0.65 - 0.55 * t); // one-pole low-pass closing over time
      data[i] = low * Math.exp(-6.9 * t);
    }
    return data;
  });
}

async function addWorklets(ctx) {
  for (const url of WORKLETS) await ctx.audioWorklet.addModule(url);
}

// `noteEvents` preloads the worklet voices (offline export); live playback posts events instead.
function buildGraph(ctx, project, noteEvents = {}) {
  const comp = new DynamicsCompressorNode(ctx, { knee: 6, attack: 0.005, release: 0.15 });
  const makeup = new GainNode(ctx);
  const master = new GainNode(ctx);
  // Brick-wall safety limiter so the mix never clips.
  const limiter = new DynamicsCompressorNode(ctx, { threshold: -1, knee: 0, ratio: 20, attack: 0.001, release: 0.08 });
  const bus = new GainNode(ctx);
  bus.connect(comp).connect(makeup).connect(master).connect(limiter).connect(ctx.destination);
  const masterMeter = new AnalyserNode(ctx, { fftSize: 512 });
  limiter.connect(masterMeter);

  // Tape-style delay: filtered feedback so repeats get darker and thinner.
  const delayIn = new GainNode(ctx);
  const delay = new DelayNode(ctx, { maxDelayTime: 3 });
  const feedback = new GainNode(ctx);
  const lowcut = new BiquadFilterNode(ctx, { type: 'highpass', frequency: 220 });
  const highcut = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 3200 });
  delayIn.connect(delay).connect(highcut).connect(lowcut).connect(feedback).connect(delay);
  lowcut.connect(bus);

  const reverbIn = new GainNode(ctx);
  const reverb = new ConvolverNode(ctx);
  const reverbOut = new GainNode(ctx);
  const impulse = reverbImpulse(ctx.sampleRate);
  reverb.buffer = ctx.createBuffer(2, impulse[0].length, ctx.sampleRate);
  impulse.forEach((data, ch) => reverb.buffer.copyToChannel(data, ch));
  reverbIn.connect(reverb).connect(reverbOut).connect(bus);

  const channels = {};
  for (const id of CHANNELS) {
    const input = new GainNode(ctx);
    const drive = BASSES.includes(id) ? new WaveShaperNode(ctx, { oversample: '4x' }) : null;
    const fader = new GainNode(ctx);
    const pan = new StereoPannerNode(ctx);
    const send = new GainNode(ctx);
    const verb = new GainNode(ctx);
    const meter = new AnalyserNode(ctx, { fftSize: 512 });
    (drive ? input.connect(drive) : input).connect(fader).connect(pan);
    pan.connect(bus);
    pan.connect(send).connect(delayIn);
    pan.connect(verb).connect(reverbIn);
    pan.connect(meter);
    channels[id] = { input, drive, fader, pan, send, verb, meter };
  }
  channels.keys.input.gain.value = 2; // the tape and piano samples are recorded quiet

  const voice = (processor, id) => {
    const node = new AudioWorkletNode(ctx, processor, {
      numberOfInputs: 0, outputChannelCount: [1], processorOptions: { events: noteEvents[id] ?? [] },
    });
    node.connect(channels[id].input);
    return node;
  };
  const nodes = { bass1: voice('open303', 'bass1'), synth: voice('va-synth', 'synth') };

  // Juno-style stereo chorus on the synth: two delay lines swept in opposite directions by one LFO.
  const lfo = new OscillatorNode(ctx, { type: 'triangle' });
  const chorusWet = new GainNode(ctx, { gain: 0 });
  const sweeps = [-1, 1].map((side) => {
    const line = new DelayNode(ctx, { maxDelayTime: 0.02, delayTime: 0.0045 });
    const sweep = new GainNode(ctx);
    lfo.connect(sweep).connect(line.delayTime);
    nodes.synth.connect(line).connect(new StereoPannerNode(ctx, { pan: side })).connect(chorusWet);
    return { sweep, side };
  });
  chorusWet.connect(channels.synth.input);
  lfo.start();

  const lastDrive = {};
  function apply(p) {
    const now = ctx.currentTime;
    const smooth = (param, value) => param.setTargetAtTime(value, now, 0.015);
    const soloing = CHANNELS.some((id) => p.mixer[id].solo);
    for (const id of CHANNELS) {
      const m = p.mixer[id];
      const audible = !m.mute && (!soloing || m.solo);
      smooth(channels[id].fader.gain, audible ? m.level ** 2 : 0); // squared: feels like an audio taper
      smooth(channels[id].pan.pan, m.pan);
      smooth(channels[id].send.gain, m.delay);
      smooth(channels[id].verb.gain, m.reverb);
      if (channels[id].drive && lastDrive[id] !== m.drive) {
        channels[id].drive.curve = m.drive > 0 ? driveCurve(m.drive) : null;
        channels[id].input.gain.value = 1 / (1 + m.drive * 0.6); // keep loudness roughly even
        lastDrive[id] = m.drive;
      }
    }
    BASSES.forEach((id, i) => {
      for (const [name, value] of Object.entries(p.bass[i].knobs)) nodes[id].parameters.get(name).setValueAtTime(value, now);
    });
    for (const name of SYNTH_KNOBS) nodes.synth.parameters.get(name).setValueAtTime(p.synth.knobs[name], now);
    nodes.synth.parameters.get('mono').setValueAtTime(p.synth.mode === 'mono' ? 1 : 0, now);
    const chorus = CHORUS[p.synth.chorus];
    smooth(chorusWet.gain, chorus ? 0.8 : 0);
    if (chorus) {
      lfo.frequency.setValueAtTime(chorus.rate, now);
      for (const s of sweeps) s.sweep.gain.setValueAtTime(s.side * chorus.depth, now);
    }
    const stepSec = 60 / p.bpm / 4;
    smooth(delay.delayTime, Math.min(3, DELAY_DIVISIONS[p.fx.delayDivision] * stepSec));
    smooth(feedback.gain, p.fx.feedback);
    smooth(reverbOut.gain, p.fx.reverb);
    comp.threshold.value = -p.fx.comp * 30;
    comp.ratio.value = 1 + p.fx.comp * 7;
    smooth(makeup.gain, 10 ** ((p.fx.comp * 9) / 20));
    smooth(master.gain, p.volume === 0 ? 0 : 10 ** (((p.volume / 100 - 1) * 48) / 20));
  }
  apply(project);
  return { channels, nodes, masterMeter, apply };
}

// Hand every note to Web Audio the moment it is planned, like the worklet events. smplr's default
// scheduler would hold notes more than 200 ms ahead for a main-thread timer, which a busy phone delays.
const immediate = (ctx) => Scheduler(ctx, { lookaheadMs: 1e12 });

function loadKit(ctx, def, { destination, storage, onProgress }) {
  const samples = Object.values(def.map).filter(Boolean);
  const options = { destination, storage, scheduler: immediate(ctx), onLoadProgress: onProgress };
  // Load only the samples this kit uses. DrumMachine kits get their sample list directly
  // (smplr 1.1.0 can't address samples past MIDI 127 in its full 808 list).
  const inst = def.source.type === 'dm'
    ? DrumMachine(ctx, { ...options, instrument: {
      baseUrl: def.source.baseUrl, name: def.id, samples, groupNames: [],
      nameToSampleName: Object.fromEntries(samples.map((n) => [n, n])), sampleGroupVariations: {},
    } })
    : DrumAbuse(ctx, { ...options, notesToLoad: { notes: samples }, source: { kind: 'machine', machine: def.source.machine, set: def.source.set } });
  return inst.ready.then(() => inst);
}

// 80 and 104 avoid the CP-80's 82..103 layer, whose A3 sample is missing upstream (the other pianos keep their layers).
const KEY_VELOCITY = { normal: 80, accent: 104 };

function loadKeys(ctx, def, { destination, storage, onProgress }) {
  // Electric pianos have several velocity layers; one range is enough and halves the download.
  // 'nearest' plays notes past a keyboard's range (a Mellotron has 35 tapes) from the closest sample.
  const velocityRange = def.type === 'ep' ? [KEY_VELOCITY.normal, KEY_VELOCITY.accent] : [0, 127];
  const options = {
    destination, storage, scheduler: immediate(ctx), onLoadProgress: onProgress, instrument: def.instrument, volume: 127,
    notesToLoad: { velocityRange, fallback: 'nearest' },
  };
  const inst = def.type === 'mellotron' ? Mellotron(ctx, options) : ElectricPiano(ctx, options);
  return inst.ready.then(() => inst);
}

function triggerDrum(kit, hit, params) {
  const note = kit?.def.map[hit.voice];
  const velocity = Math.round((hit.accent ? VELOCITY.accent : VELOCITY.normal) * (params.level / 100));
  if (!note || velocity <= 0) return null;
  const duration = Math.min(hit.gate ?? Infinity, decaySeconds(params.decay));
  return kit.inst.start({
    note, time: hit.time, stopId: hit.voice, velocity, ampRelease: RELEASE,
    detune: params.tune * 100, lpfCutoffHz: toneHz(params.tone),
    duration: Number.isFinite(duration) ? duration : null,
  });
}

// Keys get one start per note with its length; the plan's note-offs give that length.
function triggerKeys(inst, events, knobs) {
  if (!inst) return [];
  const offs = events.filter((e) => e.kind === 'off');
  return events.filter((e) => e.kind === 'on').map((e) => ({
    time: e.time,
    stop: inst.start({
      note: e.key, time: e.time, velocity: e.accent ? KEY_VELOCITY.accent : KEY_VELOCITY.normal,
      duration: (offs.find((o) => o.key === e.key && o.time > e.time)?.time ?? e.time + 0.25) - e.time,
      lpfCutoffHz: 300 * 66 ** knobs.tone, ampRelease: 0.05 + knobs.release ** 2 * 3,
    }),
  }));
}

/**
 * The live rack. `project()` returns the current project; `queued()` the scene waiting for the
 * next bar (null if none). `onStep` gets what played, at its audio time, for the display.
 */
export async function createRack({ project, queued, onStep }) {
  const ctx = new AudioContext({ latencyHint: 'interactive' });
  await addWorklets(ctx);
  const graph = buildGraph(ctx, project());
  // Cache samples in the browser (https only): sounds load instantly and work offline after the first visit.
  const storage = window.isSecureContext && 'caches' in window ? SampleCache('drum_seq') : undefined;

  const loaded = new Map(); // 'kit:id' or 'keys:id' -> Promise<instrument>
  const current = { kit: null, keys: null }; // { def, inst } in use
  const tokens = { kit: 0, keys: 0 };
  let pending = []; // sampled notes scheduled but maybe not heard yet, so Stop can cancel them
  let cursor = startCursor();

  // Resolves when the sound is playable. A newer call for the same slot wins over an older one.
  async function use(slot, def, load, destination, onProgress) {
    const token = ++tokens[slot];
    const key = `${slot}:${def.id}`;
    if (!loaded.has(key)) {
      const ready = load(ctx, def, { destination, storage, onProgress });
      ready.catch(() => loaded.delete(key)); // let a later attempt retry
      loaded.set(key, ready);
    }
    const inst = await loaded.get(key);
    if (token === tokens[slot]) current[slot] = { def, inst };
    return def;
  }

  // Plan 400 ms ahead: a busy phone can stall the main thread past smplr's 200 ms default,
  // and then every machine plays late. Edits still reach the sound within half a second.
  const seq = Sequencer(ctx, { stepSize: '16n', lookaheadMs: 400, intervalMs: 25 });
  seq.on('step', (_, time) => {
    const p = project();
    cursor = advance(p, cursor, queued());
    const ev = stepEvents(p, cursor, time, 60 / p.bpm / 4);
    cursor.held = ev.held;
    pending = pending.filter((n) => n.time > ctx.currentTime);
    for (const hit of ev.drums) {
      const stop = triggerDrum(current.kit, hit, p.drums.voices[hit.voice]);
      if (stop) pending.push({ time: hit.time, stop });
    }
    pending.push(...triggerKeys(current.keys?.inst, ev.notes.keys, p.keys.knobs));
    for (const id of NODE_TRACKS) if (ev.notes[id].length) graph.nodes[id].port.postMessage({ type: 'events', events: ev.notes[id] });
    const sounding = Object.fromEntries(Object.entries(ev.notes).map(([id, list]) => [id, list.some((e) => e.kind === 'on')]));
    onStep({ scene: cursor.scene, pos: cursor.pos, songIndex: cursor.songIndex, time, drums: ev.drums.map((d) => d.voice), notes: sounding });
  });

  function level(analyser) {
    const data = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(data);
    let peak = 0;
    for (const v of data) peak = Math.max(peak, Math.abs(v));
    return peak;
  }

  return {
    get playing() { return seq.state === 'playing'; },
    now: () => ctx.currentTime - (ctx.outputLatency || ctx.baseLatency || 0), // what is heard right now (Bluetooth adds a lot)
    apply(p) { seq.bpm = p.bpm; graph.apply(p); },

    async start() {
      await ctx.resume(); // browsers keep audio suspended until a user gesture
      if (seq.state === 'playing') return;
      cursor = startCursor();
      seq.start(-60); // half a 16th of pre-roll, so the first beat is planned before it is due
    },

    stop() {
      seq.stop();
      for (const p of pending) p.stop();
      pending = [];
      current.kit?.inst.stop();
      current.keys?.inst.stop();
      for (const id of NODE_TRACKS) graph.nodes[id].port.postMessage({ type: 'stop' });
      cursor = startCursor();
    },

    loadKit: (id, onProgress) => use('kit', findKit(id), loadKit, graph.channels.drums.input, onProgress),
    loadKeys: (id, onProgress) => use('keys', findKeySound(id), loadKeys, graph.channels.keys.input, onProgress),

    // Pads and keys play right away, as on the hardware.
    async auditionDrum(voice, params) {
      await ctx.resume();
      triggerDrum(current.kit, { voice, time: ctx.currentTime, accent: false }, params);
    },
    // Play notes now. A mono machine is skipped while playing: its own line is already sounding.
    async audition(track, keys, accent = false) {
      await ctx.resume();
      const p = project();
      const mono = track !== 'keys' && (track !== 'synth' || p.synth.mode === 'mono');
      if (mono && seq.state === 'playing') return;
      const t = ctx.currentTime;
      const events = keys.flatMap((key) => [{ time: t, kind: 'on', key, accent }, { time: t + 0.3, kind: 'off', key }]);
      if (track === 'keys') triggerKeys(current.keys?.inst, events, p.keys.knobs);
      else graph.nodes[track].port.postMessage({ type: 'events', events });
    },

    // Peak level per channel and master, 0..1+, for the meters.
    levels() {
      return { ...Object.fromEntries(CHANNELS.map((id) => [id, level(graph.channels[id].meter)])), master: level(graph.masterMeter) };
    },

    // Render offline (faster than real time) and return a 16-bit WAV. With `only`, render that
    // channel alone (a stem, with its own delay and reverb) and no bus compression, so stems sum to the mix.
    async exportWav({ only, ...options } = {}, onProgress) {
      const base = project();
      const p = only ? {
        ...base,
        fx: { ...base.fx, comp: 0 },
        mixer: Object.fromEntries(CHANNELS.map((id) => [id, { ...base.mixer[id], mute: id !== only, solo: false }])),
      } : base;
      const plan = planRender(p, options);
      if (plan.duration === 0) throw new Error('Nothing to export: the song is empty.');
      const sampleRate = 44100;
      const off = new OfflineAudioContext(2, Math.ceil((plan.duration + TAIL) * sampleRate), sampleRate);
      await addWorklets(off);
      const offGraph = buildGraph(off, p, plan.notes);
      onProgress?.('Loading samples…');
      const kitDef = findKit(p.drums.kit);
      const [kit, keys] = await Promise.all([
        loadKit(off, kitDef, { destination: offGraph.channels.drums.input, storage }),
        loadKeys(off, findKeySound(p.keys.sound), { destination: offGraph.channels.keys.input, storage }),
      ]);
      for (const hit of plan.drums) triggerDrum({ def: kitDef, inst: kit }, hit, p.drums.voices[hit.voice]);
      triggerKeys(keys, plan.notes.keys, p.keys.knobs);
      onProgress?.('Rendering…');
      return audioBufferToWav16(await off.startRendering());
    },
  };
}
