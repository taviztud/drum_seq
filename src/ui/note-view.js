// One step-entry screen for every note machine: the 303 bass lines, the synth and the keys.
// Tap a step, play its note on the keyboard; the cursor moves on, as on the TB-303.
import { knob } from './knob.js';
import {
  NOTE_NAMES, CHORDS, MAX_LENGTH, keyOf, presetBass, emptyStep, BASS_PRESET_NAMES, MELODY_PRESET_NAMES,
} from '../bass.js';
import { DENSITIES, generateLine, generateChords, mutateLine, inKey } from '../generate.js';
import { BASS_KNOBS, SYNTH_PRESETS } from '../project.js';
import { KEY_SOUNDS } from '../kits.js';

const pct = (v) => `${Math.round(v * 100)}`;
const WHITE = [0, 2, 4, 5, 7, 9, 11, 12];
const BLACK = [[1, 1], [3, 2], [6, 4], [8, 5], [10, 6]]; // [note, white keys to its left]
const SPOKEN = ['C', 'C sharp', 'D', 'D sharp', 'E', 'F', 'F sharp', 'G', 'G sharp', 'A', 'A sharp', 'B', 'high C'];
// An array, not an object: an object would list the key '7' first.
const CHORD_LABELS = [['', 'Note'], ['maj', 'Maj'], ['min', 'Min'], ['7', '7'], ['m7', 'm7'], ['sus4', 'Sus'], ['dim', 'Dim']];
const CHORD_SPOKEN = { maj: 'major', min: 'minor', 7: 'seventh', m7: 'minor seventh', sus4: 'suspended fourth', dim: 'diminished' };
const CHORD_TAGS = { maj: '', min: 'm', 7: '7', m7: 'm7', sus4: 'sus', dim: '°' };

// On/Off switch for a machine's plate: off makes no sound and loads nothing.
export const powerButton = (title) => `<button type="button" class="power" aria-label="${title} power"><span class="power-led" aria-hidden="true"></span><span class="power-text"></span></button>`;
export function renderPower(root, on) {
  const b = root.querySelector('.power');
  b.ariaPressed = String(on);
  b.querySelector('.power-text').textContent = on ? 'On' : 'Off';
  root.classList.toggle('off', !on);
}
// How likely a step is to play, Elektron-style.
export const CHANCES = [1, 0.75, 0.5, 0.25];
export const chanceRow = () => `<div class="seg chance" role="group" aria-label="Chance this step plays">${CHANCES.map((c) => `<button type="button" data-chance="${c}">${c * 100}%</button>`).join('')}</div>`;

function describe(step, i, { chords }) {
  if (!step.on) return `Step ${i + 1}: rest`;
  const parts = [SPOKEN[step.note]];
  if (chords && step.chord) parts.push(`${CHORD_SPOKEN[step.chord]} chord`);
  if (step.oct) parts.push(step.oct > 0 ? 'up' : 'down');
  if (step.len > 1) parts.push(`${step.len} steps long`);
  if (step.accent) parts.push('accent');
  if (step.slide) parts.push('slide');
  if (step.prob < 1) parts.push(`${step.prob * 100}% chance`);
  if (step.locks) parts.push('locked knobs');
  return `Step ${i + 1}: ${parts.join(', ')}`;
}

/**
 * config: { id, kind ('bass' | 'synth' | 'keys'), title, num, maker, plate (class list), line(), setLine(line), knobs: [{ id, label, min, max,
 * default, format, step }], values() (object the knobs edit), switches: [{ label, options: [[value, text]],
 * get(), set(value) }], base, chords(), lengths, slide(), linePresets, lockable (knob ids a step can lock),
 * header (optional HTML) }
 */
export function createNoteView(root, app, config) {
  let selected = 0;
  let density = 'some'; // how busy Random makes the line; per machine, not saved
  let locking = false; // Lock mode: knobs edit the selected step's own values (parameter locks)
  const lockable = new Set(config.lockable ?? []);
  const chords = () => config.chords?.() ?? false;
  const slide = () => config.slide?.() ?? false;
  root.classList.add('machine', ...config.plate);
  root.innerHTML = `
    <header class="plate-head">
      <h2 class="logo">${config.title}${config.num ? ` <span class="logo-num">${config.num}</span>` : ''}</h2>
      <p class="maker">${config.maker}</p>
      ${powerButton(config.title)}
    </header>
    ${config.header ?? ''}
    <div class="knobs"></div>
    <div class="row switches"></div>
    <p class="hint">Tap a step, then play its note</p>
    <div class="pads note-pads" role="group" aria-label="Steps"></div>
    <div class="editor">
      <div class="keys" role="group" aria-label="Note for the selected step"></div>
      <div class="mods">
        <div class="seg" role="group" aria-label="Octave">
          <button type="button" data-oct="-1">Down</button><button type="button" data-oct="0">Mid</button><button type="button" data-oct="1">Up</button>
        </div>
        <button type="button" class="toggle accent" data-mod="accent">Accent</button>
        <button type="button" class="toggle" data-mod="slide">Slide</button>
        <button type="button" class="toggle" data-mod="rest">Rest</button>
      </div>
      <div class="seg chord-row" role="group" aria-label="Chord"></div>
      <div class="length-row">
        <span class="field-label" id="${config.id}-len">Length</span>
        <button type="button" data-len="-1" aria-label="Shorter">−</button>
        <output aria-labelledby="${config.id}-len"></output>
        <button type="button" data-len="1" aria-label="Longer">+</button>
      </div>
      <div class="row step-extra">
        <button type="button" class="toggle" data-lock aria-pressed="false">Lock knobs</button>
        <button type="button" data-clear-locks>Clear locks</button>
        ${chanceRow()}
      </div>
    </div>
    <div class="row tools">
      <button type="button" data-tool="random">Random</button>
      <button type="button" data-tool="mutate" aria-label="Mutate: change a few steps">Mutate</button>
      <button type="button" data-tool="left" aria-label="Shift steps left">◀</button>
      <button type="button" data-tool="right" aria-label="Shift steps right">▶</button>
      <button type="button" data-tool="clear">Clear</button>
      <div class="seg density" role="group" aria-label="Random density">${DENSITIES.map(([id, text]) => `<button type="button" data-density="${id}">${text}</button>`).join('')}</div>
      <select data-tool="preset" aria-label="Load a line"><option value="">Load a line…</option></select>
    </div>`;

  const knobs = config.knobs.map((k) => {
    const el = knob({
      ...k, value: config.values()[k.id], defaultValue: k.default,
      onInput: (v) => {
        const step = config.line()[selected];
        if (locking && lockable.has(k.id) && step.on) { step.locks = { ...step.locks, [k.id]: v }; app.changed('pattern'); renderPads(); }
        else { config.values()[k.id] = v; app.changed('sound'); }
      },
    });
    el.dataset.knob = k.id;
    return el;
  });
  root.querySelector('.knobs').append(...knobs);

  const switchesEl = root.querySelector('.switches');
  const switches = (config.switches ?? []).map((sw) => {
    const seg = document.createElement('div');
    seg.className = 'seg';
    seg.setAttribute('role', 'group');
    seg.setAttribute('aria-label', sw.label);
    seg.append(...sw.options.map(([value, text]) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = text;
      b.addEventListener('click', () => { sw.set(value); app.changed('sound'); render(); });
      b.value = String(value);
      return b;
    }));
    switchesEl.append(seg);
    return { sw, seg };
  });

  const keys = root.querySelector('.keys');
  for (const note of WHITE) keys.insertAdjacentHTML('beforeend', `<button type="button" class="key white" data-note="${note}" aria-label="${SPOKEN[note]}"><span>${NOTE_NAMES[note]}</span></button>`);
  for (const [note, left] of BLACK) keys.insertAdjacentHTML('beforeend', `<button type="button" class="key black" data-note="${note}" aria-label="${SPOKEN[note]}" style="--left:${left}"></button>`);
  const chordRow = root.querySelector('.chord-row');
  chordRow.append(...CHORD_LABELS.map(([chord, text]) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.chord = chord;
    b.textContent = text;
    return b;
  }));
  root.querySelector('.length-row').hidden = !config.lengths;
  root.querySelector('[data-mod="slide"]').hidden = !config.slide;
  root.querySelector('[data-tool="preset"]').append(...config.linePresets.map((n) => new Option(n, n)));

  const padsEl = root.querySelector('.pads');
  let pads = [];

  function buildPads() {
    padsEl.replaceChildren(...config.line().map((_, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'pad';
      b.dataset.step = i;
      b.innerHTML = '<span class="pad-led"></span><span class="pad-mark"></span><span class="pad-note"></span><span class="pad-oct"></span>';
      return b;
    }));
    pads = [...padsEl.children];
    selected = Math.min(selected, pads.length - 1);
  }

  function render() {
    renderPads();
    const line = config.line();
    const s = line[selected];
    for (const k of keys.children) k.ariaPressed = String(s.on && Number(k.dataset.note) === s.note);
    for (const b of root.querySelectorAll('[data-oct]')) b.ariaPressed = String(Number(b.dataset.oct) === s.oct);
    for (const mod of ['accent', 'slide']) root.querySelector(`[data-mod="${mod}"]`).ariaPressed = String(s[mod]);
    root.querySelector('[data-mod="slide"]').hidden = !slide();
    root.querySelector('[data-mod="rest"]').ariaPressed = String(!s.on);
    chordRow.hidden = !chords();
    for (const b of chordRow.children) b.ariaPressed = String(b.dataset.chord === s.chord);
    root.querySelector('.length-row output').textContent = `${s.len} step${s.len > 1 ? 's' : ''}`;
    for (const { sw, seg } of switches) for (const b of seg.children) b.ariaPressed = String(b.value === String(sw.get()));
    // In Lock mode the knobs show the selected step's own values where it has them.
    for (const k of knobs) {
      const id = k.dataset.knob;
      k.update(locking && s.locks?.[id] !== undefined ? s.locks[id] : config.values()[id]);
      k.classList.toggle('locked', locking && s.locks?.[id] !== undefined);
      k.classList.toggle('unlockable', locking && !lockable.has(id));
    }
    root.querySelector('[data-lock]').ariaPressed = String(locking);
    root.querySelector('[data-clear-locks]').disabled = !s.locks;
    for (const b of root.querySelectorAll('[data-chance]')) b.ariaPressed = String(Number(b.dataset.chance) === s.prob);
    for (const b of root.querySelectorAll('[data-density]')) b.ariaPressed = String(b.dataset.density === density);
    renderPower(root, app.project.power[config.id]);
  }

  function renderPads() {
    const line = config.line();
    if (pads.length !== line.length) buildPads();
    const ties = new Set(); // rest steps still covered by an earlier long note
    line.forEach((s, i) => { if (s.on) for (let j = 1; j < s.len && i + j < line.length && !line[i + j].on; j++) ties.add(i + j); });
    line.forEach((s, i) => {
      const pad = pads[i];
      pad.classList.toggle('on', s.on);
      pad.classList.toggle('accent', s.on && s.accent);
      pad.classList.toggle('slide', s.on && slide() && s.slide && line[(i + 1) % line.length].on);
      pad.classList.toggle('tied', ties.has(i));
      pad.classList.toggle('selected', i === selected);
      pad.classList.toggle('locks', s.on && !!s.locks);
      pad.classList.toggle('chance', s.on && s.prob < 1);
      const tag = chords() && s.chord ? CHORD_TAGS[s.chord] : '';
      pad.querySelector('.pad-note').textContent = s.on ? NOTE_NAMES[s.note] + tag : ties.has(i) ? '' : '–';
      pad.querySelector('.pad-oct').textContent = s.on && s.oct ? (s.oct > 0 ? '▲' : '▼') : '';
      pad.setAttribute('aria-label', describe(s, i, { chords: chords() }) + (ties.has(i) ? ', held' : ''));
      pad.ariaCurrent = i === selected ? 'true' : null;
    });
  }

  const edit = (fn) => { fn(config.line()[selected]); app.changed('pattern'); render(); };
  const audition = (step) => {
    if (!step.on) return;
    const low = keyOf(step, config.base);
    app.rack?.audition(config.id, (chords() ? CHORDS[step.chord] : [0]).map((n) => low + n), step.accent);
  };

  padsEl.addEventListener('click', (e) => {
    const pad = e.target.closest('.pad');
    if (!pad) return;
    selected = Number(pad.dataset.step);
    audition(config.line()[selected]);
    app.haptic();
    render();
  });
  keys.addEventListener('click', (e) => {
    const key = e.target.closest('.key');
    if (!key) return;
    const rec = app.recordStep();
    if (rec !== null) { // live recording: the note lands on the step being heard, with the chosen octave
      const line = config.line();
      Object.assign(line[rec], { on: true, note: Number(key.dataset.note), oct: line[selected].oct });
      app.changed('pattern');
      audition(line[rec]);
      render();
      return;
    }
    edit((s) => { s.on = true; s.note = Number(key.dataset.note); });
    audition(config.line()[selected]);
    app.haptic();
    const line = config.line();
    selected = (selected + line[selected].len) % line.length; // the next free step, as on the TB-303
    render();
  });
  root.querySelector('.mods').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.oct) edit((s) => { s.oct = Number(b.dataset.oct); s.on = true; });
    else if (b.dataset.mod === 'rest') edit((s) => { s.on = !s.on; });
    else edit((s) => { s[b.dataset.mod] = !s[b.dataset.mod]; if (s[b.dataset.mod]) s.on = true; });
    if (!b.dataset.mod || b.dataset.mod === 'accent') audition(config.line()[selected]);
  });
  chordRow.addEventListener('click', (e) => {
    const b = e.target.closest('[data-chord]');
    if (!b) return;
    edit((s) => { s.chord = b.dataset.chord; s.on = true; });
    audition(config.line()[selected]);
  });
  root.querySelector('.step-extra').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.hasAttribute('data-lock')) { locking = !locking; render(); return; }
    if (b.hasAttribute('data-clear-locks')) edit((s) => { delete s.locks; });
    else if (b.dataset.chance) edit((s) => { s.prob = Number(b.dataset.chance); });
  });
  root.querySelector('.power').addEventListener('click', () => {
    app.project.power[config.id] = !app.project.power[config.id];
    app.changed('power');
    render();
  });
  root.querySelector('.length-row').addEventListener('click', (e) => {
    const delta = Number(e.target.closest('[data-len]')?.dataset.len);
    if (delta) edit((s) => { s.len = Math.min(MAX_LENGTH, Math.max(1, s.len + delta)); });
  });

  const setLine = (line) => { config.setLine(line); app.changed('pattern'); render(); };
  // Bass and synth follow the chords of this scene's Keys line, so the whole rack shares one harmony.
  const harmony = () => ({ key: app.project.key, keysLine: app.scene().keys });
  root.querySelector('.tools').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b?.dataset.density) { density = b.dataset.density; render(); return; }
    const tool = b?.dataset.tool;
    const line = config.line();
    const steps = line.length;
    if (tool === 'random') {
      setLine(config.kind === 'keys' ? generateChords({ steps, key: app.project.key, density })
        : generateLine(config.kind, { steps, density, ...harmony() }));
    } else if (tool === 'mutate') setLine(mutateLine(line, config.kind, harmony()));
    else if (tool === 'left') setLine([...line.slice(1), line[0]]);
    else if (tool === 'right') setLine([line.at(-1), ...line.slice(0, -1)]);
    else if (tool === 'clear') setLine(line.map(emptyStep));
  });
  root.querySelector('[data-tool="preset"]').addEventListener('change', (e) => {
    if (!e.target.value) return;
    setLine(inKey(presetBass(e.target.value, config.line().length), app.project.key)); // examples are written in C minor
    e.target.value = '';
  });

  return {
    id: config.id,
    render,
    rebuild() { buildPads(); render(); },
    playhead(pos) { pads.forEach((p, i) => p.classList.toggle('now', i === pos)); },
  };
}

// ---------- The three machines ----------

const BASS_KNOB_VIEW = [
  { id: 'tune', label: 'Tune', format: (v) => `${v > 0 ? '+' : ''}${Math.round(v)} st`, step: 1 },
  { id: 'cutoff', label: 'Cutoff', format: pct },
  { id: 'resonance', label: 'Reso', format: pct },
  { id: 'envMod', label: 'Env mod', format: pct },
  { id: 'decay', label: 'Decay', format: (v) => `${Math.round(200 * 10 ** v)} ms` },
  { id: 'accent', label: 'Accent', format: pct },
].map((k) => ({ ...k, min: BASS_KNOBS[k.id].min, max: BASS_KNOBS[k.id].max, default: BASS_KNOBS[k.id].default }));

export function createBassView(root, app) {
  const settings = () => app.project.bass[0].knobs;
  return createNoteView(root, app, {
    id: 'bass1', kind: 'bass', title: 'Bass Line', maker: 'Computer controlled',
    plate: ['bassline', 'silver'], base: 36,
    line: () => app.scene().bass[0], setLine: (line) => { app.scene().bass[0] = line; },
    knobs: BASS_KNOB_VIEW, values: settings,
    switches: [{ label: 'Waveform', options: [[0, 'Saw'], [1, 'Square']], get: () => Math.round(settings().waveform), set: (v) => { settings().waveform = v; } }],
    slide: () => true, linePresets: BASS_PRESET_NAMES, lockable: ['cutoff', 'resonance', 'envMod', 'decay'],
  });
}

const time = (seconds) => (seconds < 1 ? `${Math.round(seconds * 1000)} ms` : `${seconds.toFixed(1)} s`);
const SYNTH_KNOB_VIEW = [
  { id: 'wave', label: 'Wave', format: (v) => (v < 0.05 ? 'Saw' : v > 0.95 ? 'Pulse' : `${pct(v)}`) },
  { id: 'detune', label: 'Detune', format: (v) => `${Math.round(v * 25)} ct` },
  { id: 'cutoff', label: 'Cutoff', format: pct },
  { id: 'reso', label: 'Emphasis', format: pct },
  { id: 'env', label: 'Contour', format: pct },
  { id: 'attack', label: 'Attack', format: (v) => time(0.001 + v ** 2 * 3) },
  { id: 'release', label: 'Release', format: (v) => time(0.02 + v ** 2 * 4) },
  { id: 'glide', label: 'Glide', format: (v) => (v === 0 ? 'Off' : pct(v)) },
].map((k) => ({ ...k, min: 0, max: 1, default: SYNTH_PRESETS['Mini lead'].knobs[k.id] }));

export function createSynthView(root, app) {
  const synth = () => app.project.synth;
  const view = createNoteView(root, app, {
    id: 'synth', kind: 'synth', title: 'Synth', maker: 'Minimoog mono, Juno and Jupiter poly',
    plate: ['synth'], base: 48,
    header: `<label class="kit-select"><span class="visually-hidden">Load a sound</span><select data-sound-preset><option value="">Load a sound…</option>${Object.keys(SYNTH_PRESETS).map((n) => `<option>${n}</option>`).join('')}</select></label>`,
    line: () => app.scene().synth, setLine: (line) => { app.scene().synth = line; },
    knobs: SYNTH_KNOB_VIEW, values: () => synth().knobs,
    switches: [
      { label: 'Voice mode', options: [['mono', 'Mono'], ['poly', 'Poly']], get: () => synth().mode, set: (v) => { synth().mode = v; } },
      { label: 'Chorus', options: [[0, 'Chorus off'], [1, 'I'], [2, 'II']], get: () => synth().chorus, set: (v) => { synth().chorus = v; } },
    ],
    chords: () => synth().mode === 'poly', slide: () => synth().mode === 'mono', lengths: true,
    linePresets: MELODY_PRESET_NAMES, lockable: ['cutoff', 'reso', 'env', 'release'],
  });
  root.querySelector('[data-sound-preset]').addEventListener('change', (e) => {
    if (!e.target.value) return;
    app.project.synth = structuredClone(SYNTH_PRESETS[e.target.value]);
    e.target.value = '';
    app.changed('sound');
    view.render();
  });
  return view;
}

export function createKeysView(root, app) {
  const view = createNoteView(root, app, {
    id: 'keys', kind: 'keys', title: 'Keys', maker: 'Tapes, tines and FM',
    plate: ['keys-plate'], base: 48,
    header: `<label class="kit-select"><span class="visually-hidden">Keyboard</span><select data-keys-sound>${KEY_SOUNDS.map((k) => `<option value="${k.id}">${k.name}</option>`).join('')}</select></label>
      <p class="kit-status" role="status"></p>`,
    line: () => app.scene().keys, setLine: (line) => { app.scene().keys = line; },
    knobs: [
      { id: 'tone', label: 'Tone', min: 0, max: 1, default: 1, format: (v) => (v > 0.99 ? 'Open' : pct(v)) },
      { id: 'release', label: 'Release', min: 0, max: 1, default: 0.35, format: (v) => time(0.05 + v ** 2 * 3) },
    ],
    values: () => app.project.keys.knobs,
    chords: () => true, lengths: true, linePresets: MELODY_PRESET_NAMES, lockable: ['tone', 'release'],
  });
  const select = root.querySelector('[data-keys-sound]');
  const status = root.querySelector('.kit-status');
  select.addEventListener('change', () => { app.project.keys.sound = select.value; app.changed('keys'); });
  return {
    ...view,
    render() { select.value = app.project.keys.sound; view.render(); },
    setStatus(text, state) { status.textContent = text; status.dataset.state = state; },
  };
}
