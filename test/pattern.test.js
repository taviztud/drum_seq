import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ROWS, VOICES, PRESET_NAMES, createPattern, resize, gateSteps, gateSeconds, swingOffset,
  parseInRange, presetPattern, normalizePattern,
} from '../src/pattern.js';
import { KITS } from '../src/kits.js';

const withHits = (steps, hits) => {
  const p = createPattern(steps);
  for (const [id, list] of Object.entries(hits)) for (const s of list) p.rows[id][s] = true;
  return p;
};

test('parseInRange clamps and rejects junk (empty, NaN, 0 steps, 5000 bpm)', () => {
  assert.equal(parseInRange('5000', 40, 300, 120), 300);
  assert.equal(parseInRange('', 40, 300, 120), 120);
  assert.equal(parseInRange('abc', 40, 300, 120), 120);
  assert.equal(parseInRange('12.6', 40, 300, 120), 40);
  assert.equal(parseInRange(undefined, 0, 100, 80), 80);
});

test('resize keeps the steps that still fit', () => {
  const p = withHits(16, { bd: [0, 9, 15] });
  assert.deepEqual(resize(p, 8).rows.bd, [true, false, false, false, false, false, false, false]);
  const grown = resize(resize(p, 8), 16);
  assert.equal(grown.rows.bd.length, 16);
  assert.equal(grown.rows.bd[0], true);
  assert.equal(grown.rows.bd[9], false);
  assert.deepEqual(Object.keys(grown.rows), ROWS);
});

test('a voice rings until its own next hit (one voice per channel)', () => {
  const p = withHits(16, { bd: [0, 6] });
  assert.equal(gateSteps(p, 'bd', 0), 6);
  assert.equal(gateSteps(p, 'bd', 6), 10); // wraps around the bar
  assert.equal(gateSteps(withHits(16, { bd: [3] }), 'bd', 3), 16);
});

test('closed hat chokes the open hat, unless the closed hat is muted', () => {
  const p = withHits(16, { oh: [2], ch: [4] });
  assert.equal(gateSteps(p, 'oh', 2), 2);
  assert.equal(gateSteps(p, 'oh', 2, (id) => id !== 'ch'), 16);
  assert.equal(gateSteps(withHits(16, { sd: [2], ch: [4] }), 'sd', 2), 16); // other voices are not choked
});

test('swing delays every second 16th, MPC style', () => {
  assert.equal(swingOffset(50, 0.125), 0);
  assert.equal(swingOffset(75, 0.125), 0.0625);
  assert.equal(swingOffset(99, 0.125), 0.0625); // clamped to 75%
  const off = swingOffset(66, 0.125);
  // straight step to swung step is longer, swung to straight is shorter, a pair stays two steps
  assert.ok(gateSeconds(1, 0, 0.125, off) > 0.125);
  assert.ok(gateSeconds(1, 1, 0.125, off) < 0.125);
  assert.equal(gateSeconds(2, 1, 0.125, off), 0.25);
});

test('presets are 16-step patterns using known rows', () => {
  for (const name of PRESET_NAMES) {
    const p = presetPattern(name);
    assert.equal(p.steps, 16, name);
    for (const id of ROWS) assert.equal(p.rows[id].length, 16, `${name} ${id}`);
    assert.ok(p.rows.bd.some(Boolean), `${name} has a kick`);
  }
});

test('normalizePattern repairs untrusted saved data', () => {
  assert.deepEqual(normalizePattern(null), createPattern(16));
  const p = normalizePattern({ steps: 7, rows: { bd: [true, 'yes', 1], zz: [true] } });
  assert.equal(p.steps, 16);
  assert.deepEqual(p.rows.bd.slice(0, 3), [true, false, false]);
  assert.equal(p.rows.zz, undefined);
});

test('every kit maps every voice (null when the machine lacks it)', () => {
  assert.equal(new Set(KITS.map((k) => k.id)).size, KITS.length);
  for (const kit of KITS) {
    assert.deepEqual(Object.keys(kit.map).sort(), VOICES.map((v) => v.id).sort(), kit.id);
    assert.ok(kit.map.bd && kit.map.sd && kit.map.ch, `${kit.id} has kick, snare and hat`);
  }
});
