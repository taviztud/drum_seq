// Runs an AudioWorklet processor file in Node, in a sandbox that imitates AudioWorkletGlobalScope.
import { readFileSync } from 'node:fs';

export const SR = 48000;

// A plain function scope rather than a vm context: V8 optimizes it the way it would a real worklet.
export function loadProcessor(file, sampleRate = SR) {
  const scope = { currentTime: 0 };
  const AudioWorkletProcessor = class { constructor() { this.port = { onmessage: null }; } };
  const registerProcessor = (name, cls) => { scope.Processor = cls; };
  const src = readFileSync(new URL(`../src/worklets/${file}`, import.meta.url), 'utf8').replaceAll('currentTime', 'scope.currentTime');
  new Function('scope', 'sampleRate', 'AudioWorkletProcessor', 'registerProcessor', src)(scope, sampleRate, AudioWorkletProcessor, registerProcessor);
  return scope;
}

// Render `seconds` of audio with the given note events and knob values. Returns the samples and the processor.
export function renderWith(file, events, seconds, knobs = {}, sampleRate = SR) {
  const scope = loadProcessor(file, sampleRate);
  const proc = new scope.Processor({ processorOptions: { events } });
  const params = Object.fromEntries(scope.Processor.parameterDescriptors.map((d) => [d.name, [knobs[d.name] ?? d.defaultValue]]));
  const out = new Float32Array(Math.ceil((seconds * sampleRate) / 128) * 128);
  for (let i = 0; i < out.length; i += 128) {
    scope.currentTime = i / sampleRate;
    const block = new Float32Array(128);
    proc.process([], [[block]], params);
    out.set(block, i);
  }
  return { out, proc };
}

// Fundamental by autocorrelation over a window.
export function pitchOf(x, from, to, sampleRate = SR) {
  const seg = x.subarray(from * sampleRate, to * sampleRate);
  let best = 0, bestLag = 0;
  for (let lag = Math.floor(sampleRate / 1000); lag < sampleRate / 25; lag++) {
    let s = 0;
    for (let i = 0; i + lag < seg.length; i++) s += seg[i] * seg[i + lag];
    if (s > best) { best = s; bestLag = lag; }
  }
  return sampleRate / bestLag;
}

export const rms = (x, from, to, sr = SR) => Math.sqrt(x.subarray(from * sr, to * sr).reduce((a, v) => a + v * v, 0) / ((to - from) * sr));
