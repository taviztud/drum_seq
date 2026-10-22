// Audio for the whole rack: two Open303 voices, the sampled drum machine, mixer, delay and master bus.
// Live playback and the offline WAV export build the same graph and play the same plan.
import {
  DrumMachine, DrumAbuse, Sequencer, Scheduler, CacheStorage as SampleCache, audioBufferToWav16,
} from '../vendor/smplr-1.1.0.mjs';
import { advance, startCursor, stepEvents, planRender, VELOCITY } from './plan.js';
import { CHANNELS, BASSES, DELAY_DIVISIONS } from './project.js';
import { findKit } from './kits.js';

const WORKLET_URL = new URL('./worklets/open303-processor.js', import.meta.url);
const RELEASE = 0.015; // drum choke/retrigger release in seconds, near-instant like the hardware
const TAIL = 2; // seconds of delay tail kept at the end of an export

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

function buildGraph(ctx, project, bassEvents = [[], []]) {
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

  const channels = {};
  for (const id of CHANNELS) {
    const input = new GainNode(ctx);
    const drive = BASSES.includes(id) ? new WaveShaperNode(ctx, { oversample: '4x' }) : null;
    const fader = new GainNode(ctx);
    const pan = new StereoPannerNode(ctx);
    const send = new GainNode(ctx);
    const meter = new AnalyserNode(ctx, { fftSize: 512 });
    (drive ? input.connect(drive) : input).connect(fader).connect(pan);
    pan.connect(bus);
    pan.connect(send).connect(delayIn);
    pan.connect(meter);
    channels[id] = { input, drive, fader, pan, send, meter };
  }

  const basses = BASSES.map((id, i) => {
    const node = new AudioWorkletNode(ctx, 'open303', {
      numberOfInputs: 0, outputChannelCount: [1], processorOptions: { events: bassEvents[i] },
    });
    node.connect(channels[id].input);
    return node;
  });

  let lastDrive = {};
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
      if (channels[id].drive && lastDrive[id] !== m.drive) {
        channels[id].drive.curve = m.drive > 0 ? driveCurve(m.drive) : null;
        channels[id].input.gain.value = 1 / (1 + m.drive * 0.6); // keep loudness roughly even
        lastDrive[id] = m.drive;
      }
    }
    basses.forEach((node, i) => {
      for (const [name, value] of Object.entries(p.bass[i].knobs)) node.parameters.get(name).setValueAtTime(value, now);
    });
    const stepSec = 60 / p.bpm / 4;
    smooth(delay.delayTime, Math.min(3, DELAY_DIVISIONS[p.fx.delayDivision] * stepSec));
    smooth(feedback.gain, p.fx.feedback);
    comp.threshold.value = -p.fx.comp * 30;
    comp.ratio.value = 1 + p.fx.comp * 7;
    smooth(makeup.gain, 10 ** ((p.fx.comp * 9) / 20));
    smooth(master.gain, p.volume === 0 ? 0 : 10 ** (((p.volume / 100 - 1) * 48) / 20));
  }
  apply(project);
  return { channels, basses, masterMeter, apply };
}

function loadKit(ctx, def, { destination, storage, scheduler, onProgress }) {
  const samples = Object.values(def.map).filter(Boolean);
  const options = { destination, storage, scheduler, onLoadProgress: onProgress };
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

/**
 * The live rack. `project()` returns the current project; `queued()` the scene waiting for the
 * next bar (null if none). `onStep` gets what played, at its audio time, for the display.
 */
export async function createRack({ project, queued, onSceneChange, onStep }) {
  const ctx = new AudioContext({ latencyHint: 'interactive' });
  await ctx.audioWorklet.addModule(WORKLET_URL);
  const graph = buildGraph(ctx, project());
  // Cache samples in the browser (https only): kits load instantly and work offline after the first visit.
  const storage = window.isSecureContext && 'caches' in window ? SampleCache('drum_seq') : undefined;

  const kits = new Map(); // kit id -> Promise<instrument>
  let kit = null;
  let loadToken = 0;
  let pending = []; // drum notes scheduled but maybe not heard yet, so Stop can cancel them
  let cursor = startCursor();

  const seq = Sequencer(ctx, { stepSize: '16n' });
  seq.on('step', (_, time) => {
    const p = project();
    const wanted = queued();
    cursor = advance(p, cursor, wanted);
    if (cursor.barStart) onSceneChange?.(cursor.scene, cursor.songIndex, time);
    const ev = stepEvents(p, cursor, time, 60 / p.bpm / 4);
    cursor.held = ev.held;
    pending = pending.filter((n) => n.time > ctx.currentTime);
    for (const hit of ev.drums) {
      const stop = triggerDrum(kit, hit, p.drums.voices[hit.voice]);
      if (stop) pending.push({ time: hit.time, stop });
    }
    ev.bass.forEach((events, i) => events.length && graph.basses[i].port.postMessage({ type: 'events', events }));
    onStep({ scene: cursor.scene, pos: cursor.pos, songIndex: cursor.songIndex, time, drums: ev.drums.map((d) => d.voice), bass: ev.bass.map((e) => e.some((x) => x.kind === 'on')) });
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
    get kit() { return kit?.def ?? null; },
    now: () => ctx.currentTime,
    apply(p) { seq.bpm = p.bpm; graph.apply(p); },

    async start() {
      await ctx.resume(); // browsers keep audio suspended until a user gesture
      if (seq.state === 'playing') return;
      cursor = startCursor();
      seq.start();
    },

    stop() {
      seq.stop();
      for (const p of pending) p.stop();
      pending = [];
      kit?.inst.stop();
      for (const node of graph.basses) node.port.postMessage({ type: 'stop' });
      cursor = startCursor();
    },

    // Resolves when the kit is playable. A newer call wins over an older one.
    async loadKit(id, onProgress) {
      const def = findKit(id);
      const token = ++loadToken;
      if (!kits.has(def.id)) {
        const ready = loadKit(ctx, def, { destination: graph.channels.drums.input, storage, onProgress });
        ready.catch(() => kits.delete(def.id)); // let a later attempt retry
        kits.set(def.id, ready);
      }
      const inst = await kits.get(def.id);
      if (token === loadToken) kit = { def, inst };
      return def;
    },

    // Pads and keys play right away, as on the hardware.
    async auditionDrum(voice, params) {
      await ctx.resume();
      triggerDrum(kit, { voice, time: ctx.currentTime, accent: false }, params);
    },
    async auditionBass(i, key, accent = false) {
      await ctx.resume();
      if (seq.state === 'playing') return; // the line is already playing; don't stack notes on it
      const t = ctx.currentTime;
      graph.basses[i].port.postMessage({ type: 'events', events: [{ time: t, kind: 'on', key, accent }, { time: t + 0.18, kind: 'off', key }] });
    },

    // Peak level per channel and master, 0..1+, for the meters.
    levels() {
      return { ...Object.fromEntries(CHANNELS.map((id) => [id, level(graph.channels[id].meter)])), master: level(graph.masterMeter) };
    },

    // Render offline (faster than real time) and return a 16-bit WAV.
    async exportWav(options, onProgress) {
      const p = project();
      const plan = planRender(p, options);
      if (plan.duration === 0) throw new Error('Nothing to export: the song is empty.');
      const sampleRate = 44100;
      const off = new OfflineAudioContext(2, Math.ceil((plan.duration + TAIL) * sampleRate), sampleRate);
      await off.audioWorklet.addModule(WORKLET_URL);
      const offGraph = buildGraph(off, p, plan.bass);
      onProgress?.('Loading samples…');
      // A huge lookahead hands every note to the audio graph before rendering starts.
      const def = findKit(p.drums.kit);
      const inst = await loadKit(off, def, { destination: offGraph.channels.drums.input, storage, scheduler: Scheduler(off, { lookaheadMs: 1e12 }) });
      for (const hit of plan.drums) triggerDrum({ def, inst }, hit, p.drums.voices[hit.voice]);
      onProgress?.('Rendering…');
      const buffer = await off.startRendering();
      return audioBufferToWav16(buffer);
    },
  };
}
