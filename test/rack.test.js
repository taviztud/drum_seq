import test from 'node:test';
import assert from 'node:assert/strict';
import { noteStep, createBass, keyOf, parseBass, presetBass, normalizeBass, resizeBass, BASS_PRESET_NAMES, MELODY_PRESET_NAMES, GATE } from '../src/bass.js';
import { createProject, normalizeProject, migrateV1, resizeScene, SCENES } from '../src/project.js';
import { advance, startCursor, stepEvents, planRender, recordStep, NOTE_TRACKS } from '../src/plan.js';
import { reverbImpulse } from '../src/rack.js';

const line = (text) => parseBass(text);

test('a plain 303 note is gated for half a step', () => {
  const bass = line('C D');
  const { events, held } = noteStep(bass, 0, null);
  assert.deepEqual(events, [{ at: 0, kind: 'on', key: 36, accent: false }, { at: GATE, kind: 'off', key: 36 }]);
  assert.equal(held, null);
});

test('slide holds the note and the next one glides in before the old one is released', () => {
  const bass = line('Cs D+a');
  const first = noteStep(bass, 0, null);
  assert.deepEqual(first.events, [{ at: 0, kind: 'on', key: 36, accent: false }]);
  assert.equal(first.held, 36);
  const second = noteStep(bass, 1, first.held);
  assert.deepEqual(second.events.map((e) => `${e.kind}${e.key}@${e.at}`), ['on50@0', 'off36@0', `off50@${GATE}`]);
  assert.equal(second.events[0].accent, true);
});

test('slide into a rest releases on time, and a held note never hangs', () => {
  const bass = line('Cs -');
  assert.equal(noteStep(bass, 0, null).held, null, 'no hold when the next step is a rest');
  assert.deepEqual(noteStep(bass, 1, 40).events, [{ at: 0, kind: 'off', key: 40 }]);
});

test('note names, octaves and presets parse', () => {
  assert.equal(keyOf(line('C+')[0]), 48);
  assert.equal(keyOf(line('A#-')[0]), 34);
  assert.equal(line('-')[0].on, false);
  for (const name of BASS_PRESET_NAMES) assert.equal(presetBass(name).length, 16, name);
  assert.equal(presetBass('Acid 1').filter((s) => s.on).length > 8, true);
});

test('bass data from storage is repaired', () => {
  const s = normalizeBass([{ on: true, note: 40, oct: 5, accent: 'yes' }, null], 4);
  assert.deepEqual(s[0], { on: true, note: 0, oct: 0, accent: false, slide: false, chord: '', len: 1, prob: 1 });
  assert.equal(s.length, 4);
  assert.equal(resizeBass(createBass(4), 8).length, 8);
});

test('project survives junk from storage and keeps good values', () => {
  const p = normalizeProject({ bpm: 9999, song: [0, 9, 'x', 3], scenes: [{ steps: 5 }], mixer: { bass1: { level: 3, pan: -7 } }, fx: { delayDivision: 'nope', feedback: 2 } });
  assert.equal(p.bpm, 300);
  assert.deepEqual(p.song, [{ scene: 0, tr: 0 }, { scene: 3, tr: 0 }], 'old scene numbers load as untransposed bars');
  assert.deepEqual(p.key, { root: 0, scale: 'minor' });
  assert.equal(p.scenes[0].steps, 16);
  assert.equal(p.scenes[0].bass[0].length, 16);
  assert.equal(p.mixer.bass1.level, 1);
  assert.equal(p.mixer.bass1.pan, -1);
  assert.equal(p.fx.delayDivision, '3/16');
  assert.equal(p.fx.feedback, 0.9);
  const fresh = createProject();
  assert.deepEqual(normalizeProject(JSON.parse(JSON.stringify(fresh))), fresh, 'a saved project loads unchanged');
  assert.equal(p.mixer.keys.reverb, 0.35, 'saves from before the reverb get its defaults');
  assert.equal(p.fx.reverb, 0.8);
  const named = normalizeProject({ id: 'abc123', name: `  ${'x'.repeat(60)} ` });
  assert.equal(named.id, 'abc123');
  assert.equal(named.name.length, 40);
  assert.notEqual(normalizeProject({ id: '<script>' }).id, '<script>', 'ids from files are checked');
});

test('live recording rounds a tap to the nearest step', () => {
  const at = { pos: 3, time: 10 };
  assert.equal(recordStep(at, 10.05, 0.125, 16), 3, 'early in the step: this step');
  assert.equal(recordStep(at, 10.1, 0.125, 16), 4, 'past the middle: the next step');
  assert.equal(recordStep({ pos: 15, time: 0 }, 0.1, 0.125, 16), 0, 'wraps to the start of the bar');
});

test('the reverb impulse is repeatable and dies away', () => {
  const [a] = reverbImpulse(8000);
  const [b] = reverbImpulse(8000);
  assert.deepEqual(a, b);
  const peak = (x) => x.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
  assert.ok(peak(a.slice(0, 800)) > 100 * peak(a.slice(-800)));
  assert.equal(a[0], 0, 'pre-delay');
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
  const song = { ...p, songMode: true, song: [{ scene: 3, tr: 0 }, { scene: 1, tr: 0 }] };
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
  assert.deepEqual(ev.notes.bass1.map((e) => [e.kind, e.key, e.time]), [['on', 38, 10.0625], ['off', 38, 10.0625 + 0.0625]]);
  p.drums.voices.bd.mute = true;
  assert.equal(stepEvents(p, c, 10, 0.125).drums.some((d) => d.voice === 'bd'), false);
});

test('render plans cover the song and release every note', () => {
  const p = createProject();
  p.song = [{ scene: 0, tr: 0 }, { scene: 1, tr: 0 }];
  const r = planRender(p, { song: true });
  assert.equal(r.duration, 32 * 60 / p.bpm / 4);
  for (const list of Object.values(r.notes)) {
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

test('chords and lengths: keys play the whole chord and hold it for its length', () => {
  const keys = line('Cm7a:4 - - -');
  const { events, held } = noteStep(keys, 0, null, { base: 60, poly: true });
  assert.deepEqual(events.filter((e) => e.kind === 'on').map((e) => e.key), [60, 63, 67, 70]);
  assert.ok(events.every((e) => e.kind === 'off' ? e.at === 4 - GATE : e.accent));
  assert.equal(held, null);
  assert.equal(noteStep(line('Cmin:2 -'), 0, null).events.length, 2, 'a mono machine ignores the chord');
});

test('mono synth glides on slide, poly synth does not', () => {
  const p = createProject();
  p.scenes[0].synth = line('Cs D+ - -');
  let c = advance(p, startCursor());
  p.synth.mode = 'mono';
  const first = stepEvents(p, c, 0, 0.125);
  assert.equal(first.held.synth, 48);
  c = { ...advance(p, c), held: first.held };
  assert.deepEqual(stepEvents(p, c, 0.125, 0.125).notes.synth.map((e) => `${e.kind}${e.key}`), ['on62', 'off48', 'off62']);
  p.synth.mode = 'poly';
  assert.equal(stepEvents(p, advance(p, startCursor()), 0, 0.125).held.synth, null);
});

test('every melody preset parses, and the demo song ends with nothing hanging on any machine', () => {
  for (const name of MELODY_PRESET_NAMES) assert.equal(presetBass(name).length, 16, name);
  const p = createProject();
  p.synth.mode = 'mono';
  const r = planRender(p, { song: true });
  assert.deepEqual(Object.keys(r.notes), Object.keys(NOTE_TRACKS));
  for (const [id, list] of Object.entries(r.notes)) {
    const open = new Map();
    for (const e of list.slice().sort((a, b) => a.time - b.time || (a.kind === 'on' ? -1 : 1))) open.set(e.key, (open.get(e.key) ?? 0) + (e.kind === 'on' ? 1 : -1));
    for (const [key, n] of open) assert.ok(n <= 0, `${id} key ${key} left on`);
    assert.ok(list.length > 0, `${id} plays in the demo song`);
  }
});

test('a transposed song bar moves the note machines, not the drums', () => {
  const p = createProject();
  p.songMode = true;
  p.song = [{ scene: 0, tr: 5 }];
  p.scenes[0].bass[0] = resizeBass(line('C'), 16);
  const c = advance(p, startCursor());
  assert.equal(c.tr, 5);
  const ev = stepEvents(p, c, 0, 0.125);
  assert.equal(ev.notes.bass1[0].key, 36 + 5);
  assert.deepEqual(ev.drums, stepEvents({ ...p, song: [{ scene: 0, tr: 0 }] }, advance({ ...p, song: [{ scene: 0, tr: 0 }] }, startCursor()), 0, 0.125).drums);
  const r = planRender(p, { song: true });
  assert.equal(r.notes.bass1[0].key, 41);
});
