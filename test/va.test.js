import test from 'node:test';
import assert from 'node:assert/strict';
import { renderWith, pitchOf, rms } from './worklet-harness.js';

const render = (events, seconds, knobs) => renderWith('va-processor.js', events, seconds, knobs);
const on = (time, key, accent = false) => ({ time, kind: 'on', key, accent });
const off = (time, key) => ({ time, kind: 'off', key });
const OPEN = { cutoff: 0.95, reso: 0.1, env: 0, attack: 0, release: 0.1, wave: 0, detune: 0 };

test('a note plays at its pitch, then releases to silence', () => {
  const { out } = render([on(0, 57), off(0.4, 57)], 1, OPEN);
  assert.ok(out.every(Number.isFinite));
  assert.ok(Math.abs(pitchOf(out, 0.1, 0.35) - 220) < 4, 'A3 is 220 Hz');
  assert.ok(rms(out, 0.1, 0.35) > 0.05);
  assert.ok(rms(out, 0.8, 1) < 1e-3, 'released');
});

test('poly plays a chord on separate voices and steals the oldest past six', () => {
  const chord = [60, 64, 67];
  const { proc } = render(chord.map((k) => on(0, k)), 0.2, OPEN);
  assert.deepEqual(proc.synth.voices.filter((v) => v.active).map((v) => v.key).sort(), chord);
  const keys = [60, 62, 64, 65, 67, 69, 71, 72];
  const { proc: busy } = render(keys.map((k, i) => on(i * 0.01, k)), 0.2, OPEN);
  const playing = busy.synth.voices.map((v) => v.key).sort((a, b) => a - b);
  assert.deepEqual(playing, keys.slice(2), 'the two oldest notes were stolen');
});

test('mono glides between overlapping notes without retriggering', () => {
  const knobs = { ...OPEN, mono: 1, glide: 0.5 };
  const { out, proc } = render([on(0, 45), on(0.3, 57), off(0.3, 45), off(0.9, 57)], 0.9, knobs);
  // Mono adds a sub-oscillator an octave down, so the fundamental heard is half the note's pitch.
  assert.ok(Math.abs(pitchOf(out, 0.1, 0.28) - 55) < 2);
  const mid = pitchOf(out, 0.31, 0.36);
  assert.ok(mid > 57 && mid < 108, `still gliding at 0.33 s: ${mid}`);
  assert.ok(Math.abs(pitchOf(out, 0.65, 0.85) - 110) < 3);
  assert.equal(proc.synth.voices.filter((v) => v.active).length, 1);
  assert.ok(rms(out, 0.29, 0.31) > 0.03, 'no gap at the legato change');
});

test('full resonance and every waveform stay stable', () => {
  for (const wave of [0, 0.5, 1]) {
    const { out } = render([on(0, 36, true), on(0, 48), on(0, 55)], 0.6, { cutoff: 0.6, reso: 1, env: 1, wave });
    assert.ok(out.every(Number.isFinite), `wave ${wave}`);
    assert.ok(Math.max(...out.map(Math.abs)) < 3, 'bounded');
  }
});

test('six voices render well under real time', () => {
  const t0 = performance.now();
  render([60, 63, 67, 70, 72, 75].map((k) => on(0, k)), 5, { ...OPEN, cutoff: 0.5, env: 0.6 });
  const ms = performance.now() - t0;
  assert.ok(ms < 1000, `5 s of 6 voices took ${ms.toFixed(0)} ms`); // ~200 ms here; phones are a few times slower
});
