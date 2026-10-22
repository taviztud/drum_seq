import test from 'node:test';
import assert from 'node:assert/strict';
import { renderWith, pitchOf, rms } from './worklet-harness.js';

const render = (events, seconds, knobs) => renderWith('open303-processor.js', events, seconds, knobs).out;

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
