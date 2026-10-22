import test from 'node:test';
import assert from 'node:assert/strict';
import { renderWith, SR } from './worklet-harness.js';
import { parseBass, resizeBass, normalizeBass } from '../src/bass.js';
import { createProject, normalizeProject, resizeScene } from '../src/project.js';
import { advance, startCursor, stepEvents, planRender } from '../src/plan.js';

// Brightness of a stretch of audio: high-frequency energy (first difference) relative to the level.
function brightness(out, t0, t1) {
  let d = 0, e = 0;
  for (let i = Math.floor(t0 * SR) + 1; i < t1 * SR; i++) { d += (out[i] - out[i - 1]) ** 2; e += out[i] ** 2; }
  return Math.sqrt(d / e);
}

for (const [file, knobs] of [['open303-processor.js', { cutoff: 0.05, resonance: 0.2, envMod: 0 }], ['va-processor.js', { cutoff: 0.1, reso: 0.1, env: 0, attack: 0, release: 0.05, mono: 1 }]]) {
  test(`${file}: a locked cutoff opens the filter for its note only`, () => {
    const events = [
      { time: 0, kind: 'on', key: 45, accent: false, locks: { cutoff: 0.95 } }, { time: 0.25, kind: 'off', key: 45 },
      { time: 0.3, kind: 'on', key: 45, accent: false }, { time: 0.55, kind: 'off', key: 45 },
    ];
    const { out } = renderWith(file, events, 0.6, knobs);
    const locked = brightness(out, 0.05, 0.2);
    const plain = brightness(out, 0.35, 0.5);
    assert.ok(locked > plain * 2, `locked note ${locked.toFixed(3)} vs knob note ${plain.toFixed(3)}`);
  });
}

const line = (text) => resizeBass(parseBass(text), 16);

test('steps keep valid locks and chance from storage, and drop junk', () => {
  const [s] = normalizeBass([{ on: true, note: 2, prob: 7, locks: { cutoff: 2, tune: 0.5, reso: 'x', tone: 0.3 } }], 1);
  assert.equal(s.prob, 1);
  assert.deepEqual(s.locks, { cutoff: 1, tone: 0.3 });
  assert.equal('locks' in normalizeBass([{ on: true, locks: { nope: 1 } }], 1)[0], false, 'no empty locks object');
  const p = normalizeProject({
    power: { keys: false, synth: 'no' },
    scenes: [{ steps: 16, drumMeta: { bd: { 0: { prob: 0.5, tune: 40, junk: 1 }, 20: { prob: 0.5 }, x: {} }, zz: { 0: { prob: 1 } } } }],
  });
  assert.deepEqual(p.power, { bass1: true, synth: true, keys: false, drums: true });
  assert.deepEqual(p.scenes[0].drumMeta, { bd: { 0: { prob: 0.5, tune: 12 } } }, 'clamped, in range, known voices only');
  assert.deepEqual(resizeScene({ ...p.scenes[0], drumMeta: { bd: { 12: { prob: 0.5 } } } }, 8).drumMeta, {}, 'resizing drops hits past the end');
});

test('a machine switched off plays nothing and lets go of a held slide', () => {
  const p = createProject();
  p.scenes[0].bass[0] = line('Cs D');
  const c = advance(p, startCursor());
  const first = stepEvents(p, c, 0, 0.125);
  assert.equal(first.held.bass1, 36, 'the slide holds C');
  p.power.bass1 = false;
  p.power.drums = false;
  const next = stepEvents(p, { ...advance(p, c), held: first.held }, 0.125, 0.125);
  assert.deepEqual(next.notes.bass1.map(({ kind, key }) => ({ kind, key })), [{ kind: 'off', key: 36 }], 'held note released, nothing new');
  assert.equal(next.held.bass1, null);
  assert.deepEqual(stepEvents(p, c, 0, 0.125).drums, []);
});

test('chance 0 never plays, chance 1 always plays, and exports roll the same dice', () => {
  const p = createProject();
  p.scene = 0;
  p.scenes[0].bass[0] = line('C C C C C C C C C C C C C C C C').map((s, i) => ({ ...s, prob: i % 2 ? 0 : 1 }));
  p.scenes[0].drumMeta = { bd: { 0: { prob: 0 } } };
  const r = planRender(p, { bars: 2 });
  const stepOf = (t) => Math.round(t / (60 / p.bpm / 4));
  const ons = r.notes.bass1.filter((e) => e.kind === 'on').map((e) => stepOf(e.time) % 16);
  assert.ok(ons.length === 16 && ons.every((s) => s % 2 === 0), `only the sure steps: ${ons}`);
  assert.ok(!r.drums.some((d) => d.voice === 'bd' && stepOf(d.time) % 16 === 0), 'the 0% kick never plays');
  p.scenes[0].bass[0] = p.scenes[0].bass[0].map((s) => ({ ...s, prob: 0.5 }));
  assert.deepEqual(planRender(p, { bars: 4 }).notes.bass1, planRender(p, { bars: 4 }).notes.bass1, 'same export twice');
});

test('locks ride on note-on events and drum meta on hits', () => {
  const p = createProject();
  p.scenes[0].bass[0] = line('C');
  p.scenes[0].bass[0][0].locks = { cutoff: 0.9 };
  p.scenes[0].drumMeta = { bd: { 0: { tune: 5 } } };
  const ev = stepEvents(p, advance(p, startCursor()), 0, 0.125);
  assert.deepEqual(ev.notes.bass1[0].locks, { cutoff: 0.9 });
  assert.deepEqual(ev.drums.find((d) => d.voice === 'bd').meta, { tune: 5 });
});
