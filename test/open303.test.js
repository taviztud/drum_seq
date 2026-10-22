import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Run the AudioWorklet file in a sandbox that imitates AudioWorkletGlobalScope.
function loadProcessor(sampleRate = 48000) {
  const scope = { sampleRate, currentTime: 0, Math, Float64Array, Array, console };
  scope.AudioWorkletProcessor = class { constructor() { this.port = { onmessage: null }; } };
  scope.registerProcessor = (name, cls) => { scope.Processor = cls; };
  vm.runInNewContext(readFileSync(new URL('../src/worklets/open303-processor.js', import.meta.url), 'utf8'), scope);
  return scope;
}

// Render `seconds` of audio with the given note events and knob values.
function render(events, seconds, knobs = {}, sampleRate = 48000) {
  const scope = loadProcessor(sampleRate);
  const proc = new scope.Processor({ processorOptions: { events } });
  const params = Object.fromEntries(scope.Processor.parameterDescriptors.map((d) => [d.name, [knobs[d.name] ?? d.defaultValue]]));
  const out = new Float32Array(Math.ceil(seconds * sampleRate / 128) * 128);
  for (let i = 0; i < out.length; i += 128) {
    scope.currentTime = i / sampleRate;
    const block = new Float32Array(128);
    proc.process([], [[block]], params);
    out.set(block, i);
  }
  return out;
}

// Fundamental by autocorrelation over a window.
function pitchOf(x, from, to, sampleRate = 48000) {
  const seg = x.subarray(from * sampleRate, to * sampleRate);
  let best = 0, bestLag = 0;
  for (let lag = Math.floor(sampleRate / 1000); lag < sampleRate / 25; lag++) {
    let s = 0;
    for (let i = 0; i + lag < seg.length; i++) s += seg[i] * seg[i + lag];
    if (s > best) { best = s; bestLag = lag; }
  }
  return sampleRate / bestLag;
}
const rms = (x, from, to, sr = 48000) => Math.sqrt(x.subarray(from * sr, to * sr).reduce((a, v) => a + v * v, 0) / ((to - from) * sr));

test('a note plays at the right pitch and stays finite', () => {
  const out = render([{ time: 0, kind: 'on', key: 45, accent: false }, { time: 0.4, kind: 'off', key: 45 }], 0.6, { resonance: 0.2 });
  assert.ok(out.every(Number.isFinite));
  assert.ok(Math.max(...out.map(Math.abs)) < 4, 'bounded');
  const f = pitchOf(out, 0.05, 0.3);
  assert.ok(Math.abs(f - 110) < 3, `A2 should be ~110 Hz, got ${f}`);
  assert.ok(rms(out, 0.45, 0.6) < rms(out, 0.05, 0.3) / 20, 'note-off releases');
});

test('silence before the first note, and after the release', () => {
  const out = render([{ time: 0.1, kind: 'on', key: 40, accent: false }, { time: 0.2, kind: 'off', key: 40 }], 1.5);
  assert.equal(rms(out, 0, 0.09), 0);
  assert.ok(rms(out, 1.3, 1.5) < 1e-4);
});

test('slide glides to the new pitch while the old note is held', () => {
  const out = render([
    { time: 0, kind: 'on', key: 36, accent: false },
    { time: 0.3, kind: 'on', key: 48, accent: false }, // arrives while 36 is held: slide
    { time: 0.3, kind: 'off', key: 36 },
    { time: 0.7, kind: 'off', key: 48 },
  ], 0.8, { resonance: 0.1, decay: 1 });
  assert.ok(Math.abs(pitchOf(out, 0.1, 0.28) - 65.4) < 3);
  assert.ok(Math.abs(pitchOf(out, 0.45, 0.68) - 130.8) < 4);
  assert.ok(rms(out, 0.3, 0.35) > 0.01, 'no retrigger gap during the slide');
});

test('a slide onto the same note holds it instead of releasing', () => {
  const out = render([
    { time: 0, kind: 'on', key: 40, accent: false },
    { time: 0.2, kind: 'on', key: 40, accent: false },
    { time: 0.2, kind: 'off', key: 40 },
  ], 0.5, { decay: 1 });
  assert.ok(rms(out, 0.3, 0.5) > 0.01);
});

test('accent is louder than a normal note', () => {
  const normal = render([{ time: 0, kind: 'on', key: 40, accent: false }], 0.15, { accent: 1 });
  const accented = render([{ time: 0, kind: 'on', key: 40, accent: true }], 0.15, { accent: 1 });
  assert.ok(rms(accented, 0, 0.15) > rms(normal, 0, 0.15) * 1.3);
});

test('square and saw both work, with full resonance', () => {
  for (const waveform of [0, 1]) {
    const out = render([{ time: 0, kind: 'on', key: 33, accent: true }], 0.5, { waveform, resonance: 1, cutoff: 1, envMod: 1 });
    assert.ok(out.every(Number.isFinite), `waveform ${waveform}`);
    assert.ok(rms(out, 0, 0.3) > 0.01);
  }
});
