import test from 'node:test';
import assert from 'node:assert/strict';
import { CHORDS, presetBass, BASS_PRESET_NAMES, MELODY_PRESET_NAMES } from '../src/bass.js';
import {
  SCALES, euclid, diatonicChord, chordAt, generateLine, generateChords, mutateLine, transposeLine, inKey,
} from '../src/generate.js';

const seeded = (seed) => { let x = seed; return () => ((x = (x * 16807) % 2147483647) / 2147483647); };
const abs = (s) => 12 * s.oct + s.note;
const pc = (n) => ((n % 12) + 12) % 12;
const inScale = (key, s) => SCALES[key.scale].includes(pc(abs(s) - key.root));
const inRange = (s) => [-1, 0, 1].includes(s.oct) && s.note >= 0 && s.note <= 12;
const C_MINOR = { root: 0, scale: 'minor' };
const D_DORIAN = { root: 2, scale: 'dorian' };

test('euclid spreads exactly k hits', () => {
  for (const [k, n] of [[3, 8], [5, 8], [2, 12], [5, 16]]) {
    for (let rot = 0; rot < n; rot++) assert.equal(euclid(k, n, rot).filter(Boolean).length, k);
  }
  assert.deepEqual(euclid(3, 8).map(Number), [1, 0, 0, 1, 0, 0, 1, 0]); // the tresillo
});

test('diatonic chords stack thirds of the scale', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6].map((d) => diatonicChord(C_MINOR, d)), ['min', 'dim', 'maj', 'min', 'min', 'maj', 'maj']);
  assert.equal(diatonicChord({ root: 0, scale: 'major' }, 4, true), '7');
  assert.equal(diatonicChord(C_MINOR, 0, true), 'm7');
});

test('random lines keep the density, stay in key and sit on the Keys chords', () => {
  for (const key of [C_MINOR, D_DORIAN, { root: 9, scale: 'major' }]) {
    for (let seed = 1; seed < 30; seed++) {
      const rng = seeded(seed);
      const keysLine = generateChords({ steps: 16, key, density: 'few', rng });
      for (const [kind, density, hits] of [['synth', 'few', 4], ['synth', 'many', 10], ['bass', 'some', 10]]) {
        const line = generateLine(kind, { steps: 16, key, density, keysLine, rng });
        assert.equal(line.filter((s) => s.on).length, hits, `${kind} ${density} always plays ${hits} notes`);
        for (const [i, s] of line.entries()) {
          if (!s.on) continue;
          assert.ok(inRange(s) && inScale(key, s), `${kind} step ${i} in ${key.root} ${key.scale}`);
          if (i % 4 === 0) assert.ok(chordAt(keysLine, i, key).includes(pc(abs(s))), `${kind} step ${i} is a chord tone`);
        }
        const last = line.findLast((s) => s.on);
        const chord = chordAt(keysLine, line.lastIndexOf(last), key);
        assert.ok([chord[0], chord[2]].includes(pc(abs(last))), 'ends on the root or the fifth');
      }
    }
  }
  assert.equal(generateLine('bass', { steps: 16, key: C_MINOR, rng: seeded(3) })[0].on, true, 'the bass starts on the one');
  assert.deepEqual(generateLine('bass', { steps: 12, key: C_MINOR, rng: seeded(5) }).length, 12);
});

test('random chords follow a diatonic progression', () => {
  for (const key of [C_MINOR, { root: 7, scale: 'major' }, { root: 4, scale: 'phrygian' }]) {
    for (let seed = 1; seed < 20; seed++) {
      for (const density of ['few', 'some', 'many']) {
        const line = generateChords({ steps: 16, key, density, rng: seeded(seed) });
        assert.ok(line.some((s) => s.on));
        for (const s of line.filter((x) => x.on)) {
          assert.ok(inRange(s));
          for (const n of CHORDS[s.chord]) assert.ok(SCALES[key.scale].includes(pc(abs(s) + n - key.root)), `${s.chord} on ${s.note} is diatonic`);
        }
      }
    }
  }
});

test('mutate changes at most three steps and stays in key', () => {
  for (let seed = 1; seed < 40; seed++) {
    const rng = seeded(seed);
    for (const kind of ['bass', 'synth', 'keys']) {
      const before = kind === 'keys' ? generateChords({ steps: 16, key: D_DORIAN, rng }) : generateLine(kind, { steps: 16, key: D_DORIAN, rng });
      const after = mutateLine(before, kind, { key: D_DORIAN, rng });
      const changed = after.filter((s, i) => JSON.stringify(s) !== JSON.stringify(before[i])).length;
      assert.ok(changed <= 3, `${kind}: ${changed} steps changed`);
      for (const s of after.filter((x) => x.on)) assert.ok(inRange(s) && inScale(D_DORIAN, s));
    }
  }
});

test('example lines move into any key; C minor leaves them as written', () => {
  for (const name of [...BASS_PRESET_NAMES, ...MELODY_PRESET_NAMES]) {
    const line = presetBass(name);
    assert.deepEqual(inKey(line, C_MINOR), line, name);
    for (const s of inKey(line, D_DORIAN).filter((x) => x.on)) assert.ok(inRange(s) && inScale(D_DORIAN, s), name);
  }
});

test('transposing folds every note into the playable range', () => {
  const line = presetBass('Acid 1');
  for (const semis of [-12, -7, 5, 11, 12]) for (const s of transposeLine(line, semis)) assert.ok(inRange(s));
  assert.deepEqual(transposeLine(transposeLine(line, 5), -5).map(abs), line.map(abs));
});
