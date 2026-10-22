import test from 'node:test';
import assert from 'node:assert/strict';
import { bassStep, createBass, keyOf, parseBass, presetBass, randomBass, normalizeBass, resizeBass, BASS_PRESET_NAMES, GATE } from '../src/bass.js';
import { createProject, normalizeProject, migrateV1, resizeScene, SCENES } from '../src/project.js';
import { advance, startCursor, stepEvents, planRender } from '../src/plan.js';

const line = (text) => parseBass(text);

test('a plain 303 note is gated for half a step', () => {
  const bass = line('C D');
  const { events, held } = bassStep(bass, 0, null);
  assert.deepEqual(events, [{ at: 0, kind: 'on', key: 36, accent: false }, { at: GATE, kind: 'off', key: 36 }]);
  assert.equal(held, null);
});

test('slide holds the note and the next one glides in before the old one is released', () => {
  const bass = line('Cs D+a');
  const first = bassStep(bass, 0, null);
  assert.deepEqual(first.events, [{ at: 0, kind: 'on', key: 36, accent: false }]);
  assert.equal(first.held, 36);
  const second = bassStep(bass, 1, first.held);
  assert.deepEqual(second.events.map((e) => `${e.kind}${e.key}@${e.at}`), ['on50@0', 'off36@0', `off50@${GATE}`]);
  assert.equal(second.events[0].accent, true);
});

test('slide into a rest releases on time, and a held note never hangs', () => {
  const bass = line('Cs -');
  assert.equal(bassStep(bass, 0, null).held, null, 'no hold when the next step is a rest');
  assert.deepEqual(bassStep(bass, 1, 40).events, [{ at: 0, kind: 'off', key: 40 }]);
});

test('note names, octaves and presets parse', () => {
  assert.equal(keyOf(line('C+')[0]), 48);
  assert.equal(keyOf(line('A#-')[0]), 34);
  assert.equal(line('-')[0].on, false);
  for (const name of BASS_PRESET_NAMES) assert.equal(presetBass(name).length, 16, name);
  assert.equal(presetBass('Acid 1').filter((s) => s.on).length > 8, true);
});

test('random lines are valid and reproducible', () => {
  const seeded = () => { let x = 7; return () => ((x = (x * 16807) % 2147483647) / 2147483647); };
  const a = randomBass(16, seeded()), b = randomBass(16, seeded());
  assert.deepEqual(a, b);
  assert.equal(a[0].on, true);
  for (const s of a) assert.ok(s.note >= 0 && s.note <= 12 && [-1, 0, 1].includes(s.oct));
});

test('bass data from storage is repaired', () => {
  const s = normalizeBass([{ on: true, note: 40, oct: 5, accent: 'yes' }, null], 4);
  assert.deepEqual(s[0], { on: true, note: 0, oct: 0, accent: false, slide: false });
  assert.equal(s.length, 4);
  assert.equal(resizeBass(createBass(4), 8).length, 8);
});

test('project survives junk from storage and keeps good values', () => {
  const p = normalizeProject({ bpm: 9999, song: [0, 9, 'x', 3], scenes: [{ steps: 5 }], mixer: { bass1: { level: 3, pan: -7 } }, fx: { delayDivision: 'nope', feedback: 2 } });
  assert.equal(p.bpm, 300);
  assert.deepEqual(p.song, [0, 3]);
  assert.equal(p.scenes[0].steps, 16);
  assert.equal(p.scenes[0].bass[0].length, 16);
  assert.equal(p.mixer.bass1.level, 1);
  assert.equal(p.mixer.bass1.pan, -1);
  assert.equal(p.fx.delayDivision, '3/16');
  assert.equal(p.fx.feedback, 0.9);
  assert.deepEqual(normalizeProject(JSON.parse(JSON.stringify(createProject()))), createProject());
});

test('drum patterns from drum_seq v1 come along', () => {
  const p = migrateV1({ kit: 'tr808', bpm: 133, patterns: [{ steps: 8, rows: { bd: [true, false, true] } }] });
  assert.equal(p.drums.kit, 'tr808');
  assert.equal(p.bpm, 133);
  assert.equal(p.scenes[0].steps, 8);
  assert.equal(p.scenes[0].drums.bd[2], true);
  assert.equal(p.scenes[0].bass[0].length, 8);
});

test('scenes change at the bar line: queued scene, or the next song entry', () => {
  const p = createProject();
  let c = advance(p, startCursor());
  assert.deepEqual([c.scene, c.pos, c.barStart], [0, 0, true]);
  for (let i = 0; i < 5; i++) c = advance(p, c, 2);
  assert.deepEqual([c.scene, c.pos], [0, 5], 'queued scene waits');
  for (let i = 0; i < 10; i++) c = advance(p, c, 2);
  c = advance(p, c, 2);
  assert.deepEqual([c.scene, c.pos], [2, 0]);
  const song = { ...p, songMode: true, song: [3, 1] };
  let s = advance(song, startCursor());
  assert.equal(s.scene, 3);
  for (let i = 0; i < 16; i++) s = advance(song, s);
  assert.equal(s.scene, 1);
  for (let i = 0; i < 16; i++) s = advance(song, s);
  assert.equal(s.scene, 3, 'song loops');
});

test('a shorter scene wraps at its own length', () => {
  const p = createProject();
  p.scenes[0] = resizeScene(p.scenes[0], 8);
  let c = advance(p, startCursor());
  for (let i = 0; i < 8; i++) c = advance(p, c);
  assert.deepEqual([c.pos, c.barStart], [0, true]);
});

test('step events: swing, accent and mute apply to drums; 303 notes carry times', () => {
  const p = createProject();
  p.swing = 75;
  p.scenes[0].drums.bd[1] = true;
  p.scenes[0].drums.ac[1] = true;
  p.scenes[0].bass[0] = line('C D');
  const c = { ...advance(p, startCursor()), pos: 1 };
  const ev = stepEvents(p, c, 10, 0.125);
  const kick = ev.drums.find((d) => d.voice === 'bd');
  assert.equal(kick.time, 10 + 0.0625);
  assert.equal(kick.accent, true);
  assert.deepEqual(ev.bass[0].map((e) => [e.kind, e.key, e.time]), [['on', 38, 10.0625], ['off', 38, 10.0625 + 0.0625]]);
  p.drums.voices.bd.mute = true;
  assert.equal(stepEvents(p, c, 10, 0.125).drums.some((d) => d.voice === 'bd'), false);
});

test('render plans cover the song and release every note', () => {
  const p = createProject();
  p.song = [0, 1];
  const r = planRender(p, { song: true });
  assert.equal(r.duration, 32 * 60 / p.bpm / 4);
  for (const list of r.bass) {
    const open = new Map();
    for (const e of list.slice().sort((a, b) => a.time - b.time)) {
      if (e.kind === 'on') open.set(e.key, (open.get(e.key) ?? 0) + 1);
      else open.set(e.key, (open.get(e.key) ?? 0) - 1);
    }
    for (const [key, n] of open) assert.ok(n <= 0, `key ${key} left on`);
  }
  assert.ok(r.drums.length > 20);
  assert.equal(planRender(p, { bars: 2 }).duration, 2 * 16 * 60 / p.bpm / 4);
  assert.equal(SCENES.length, 4);
});
