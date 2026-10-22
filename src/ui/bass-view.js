import { knob } from './knob.js';
import { NOTE_NAMES, keyOf, randomBass, presetBass, BASS_PRESET_NAMES, emptyStep } from '../bass.js';
import { BASS_KNOBS } from '../project.js';

const pct = (v) => `${Math.round(v * 100)}`;
const KNOBS = [
  { id: 'tune', label: 'Tune', format: (v) => `${v > 0 ? '+' : ''}${Math.round(v)} st`, step: 1 },
  { id: 'cutoff', label: 'Cutoff', format: pct },
  { id: 'resonance', label: 'Reso', format: pct },
  { id: 'envMod', label: 'Env mod', format: pct },
  { id: 'decay', label: 'Decay', format: (v) => `${Math.round(200 * 10 ** v)} ms` },
  { id: 'accent', label: 'Accent', format: pct },
];
const WHITE = [0, 2, 4, 5, 7, 9, 11, 12];
const BLACK = [[1, 1], [3, 2], [6, 4], [8, 5], [10, 6]]; // [note, white keys to its left]
const SPOKEN = ['C', 'C sharp', 'D', 'D sharp', 'E', 'F', 'F sharp', 'G', 'G sharp', 'A', 'A sharp', 'B', 'high C'];

function describe(step, i) {
  if (!step.on) return `Step ${i + 1}: rest`;
  const parts = [SPOKEN[step.note]];
  if (step.oct) parts.push(step.oct > 0 ? 'up' : 'down');
  if (step.accent) parts.push('accent');
  if (step.slide) parts.push('slide');
  return `Step ${i + 1}: ${parts.join(', ')}`;
}

export function createBassView(root, app, index) {
  const machine = `bass${index + 1}`;
  let selected = 0;
  root.classList.add('machine', 'bassline', index ? 'black' : 'silver');
  root.innerHTML = `
    <header class="plate-head">
      <h2 class="logo">Bass Line <span class="logo-num">${index + 1}</span></h2>
      <p class="maker">Computer controlled</p>
    </header>
    <div class="knobs"></div>
    <div class="row wave-row">
      <div class="seg" role="group" aria-label="Waveform">
        <button type="button" data-wave="0">Saw</button><button type="button" data-wave="1">Square</button>
      </div>
      <span class="hint">Tap a step, then play its note</span>
    </div>
    <div class="pads bass-pads" role="group" aria-label="Steps"></div>
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
    </div>
    <div class="row tools">
      <button type="button" data-tool="random">Random</button>
      <button type="button" data-tool="left" aria-label="Shift steps left">◀</button>
      <button type="button" data-tool="right" aria-label="Shift steps right">▶</button>
      <button type="button" data-tool="clear">Clear</button>
      <select data-tool="preset" aria-label="Load a bass line"><option value="">Load a line…</option></select>
    </div>`;

  const bass = () => app.scene().bass[index];
  const knobs = KNOBS.map((k) => {
    const r = BASS_KNOBS[k.id];
    const el = knob({
      label: k.label, min: r.min, max: r.max, step: k.step, value: app.project.bass[index].knobs[k.id], defaultValue: r.default, format: k.format,
      onInput: (v) => { app.project.bass[index].knobs[k.id] = v; app.changed('sound'); },
    });
    el.dataset.knob = k.id;
    return el;
  });
  root.querySelector('.knobs').append(...knobs);

  const keys = root.querySelector('.keys');
  for (const note of WHITE) keys.insertAdjacentHTML('beforeend', `<button type="button" class="key white" data-note="${note}" aria-label="${SPOKEN[note]}"><span>${NOTE_NAMES[note]}</span></button>`);
  for (const [note, left] of BLACK) keys.insertAdjacentHTML('beforeend', `<button type="button" class="key black" data-note="${note}" aria-label="${SPOKEN[note]}" style="--left:${left}"></button>`);
  root.querySelector('[data-tool="preset"]').append(...BASS_PRESET_NAMES.map((n) => new Option(n, n)));

  const padsEl = root.querySelector('.pads');
  let pads = [];

  function buildPads() {
    const line = bass();
    padsEl.replaceChildren(...line.map((_, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'pad';
      b.dataset.step = i;
      b.innerHTML = '<span class="pad-led"></span><span class="pad-note"></span><span class="pad-oct"></span>';
      return b;
    }));
    pads = [...padsEl.children];
    selected = Math.min(selected, line.length - 1);
  }

  function render() {
    const line = bass();
    if (pads.length !== line.length) buildPads();
    line.forEach((s, i) => {
      const pad = pads[i];
      pad.classList.toggle('on', s.on);
      pad.classList.toggle('accent', s.on && s.accent);
      pad.classList.toggle('slide', s.on && s.slide && line[(i + 1) % line.length].on);
      pad.classList.toggle('selected', i === selected);
      pad.querySelector('.pad-note').textContent = s.on ? NOTE_NAMES[s.note] : '–';
      pad.querySelector('.pad-oct').textContent = s.on && s.oct ? (s.oct > 0 ? '▲' : '▼') : '';
      pad.setAttribute('aria-label', describe(s, i));
      pad.ariaCurrent = i === selected ? 'true' : null;
    });
    const s = line[selected];
    for (const k of keys.children) k.ariaPressed = String(s.on && Number(k.dataset.note) === s.note);
    for (const b of root.querySelectorAll('[data-oct]')) b.ariaPressed = String(Number(b.dataset.oct) === s.oct);
    root.querySelector('[data-mod="accent"]').ariaPressed = String(s.accent);
    root.querySelector('[data-mod="slide"]').ariaPressed = String(s.slide);
    root.querySelector('[data-mod="rest"]').ariaPressed = String(!s.on);
    const wave = app.project.bass[index].knobs.waveform;
    for (const b of root.querySelectorAll('[data-wave]')) b.ariaPressed = String(Number(b.dataset.wave) === Math.round(wave));
    for (const k of knobs) k.update(app.project.bass[index].knobs[k.dataset.knob]);
  }

  const edit = (fn) => { fn(bass()[selected]); app.changed('pattern'); render(); };
  const audition = (step) => step.on && app.rack?.auditionBass(index, keyOf(step), step.accent);

  padsEl.addEventListener('click', (e) => {
    const pad = e.target.closest('.pad');
    if (!pad) return;
    selected = Number(pad.dataset.step);
    audition(bass()[selected]);
    app.haptic();
    render();
  });
  keys.addEventListener('click', (e) => {
    const key = e.target.closest('.key');
    if (!key) return;
    edit((s) => { s.on = true; s.note = Number(key.dataset.note); });
    audition(bass()[selected]);
    app.haptic();
    selected = (selected + 1) % bass().length; // step entry moves on, as on the TB-303
    render();
  });
  root.querySelector('.mods').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.oct) edit((s) => { s.oct = Number(b.dataset.oct); s.on = true; });
    else if (b.dataset.mod === 'rest') edit((s) => { s.on = !s.on; });
    else edit((s) => { s[b.dataset.mod] = !s[b.dataset.mod]; if (s[b.dataset.mod]) s.on = true; });
    if (!b.dataset.mod || b.dataset.mod === 'accent') audition(bass()[selected]);
  });
  root.querySelector('.wave-row .seg').addEventListener('click', (e) => {
    const b = e.target.closest('[data-wave]');
    if (!b) return;
    app.project.bass[index].knobs.waveform = Number(b.dataset.wave);
    app.changed('sound');
    render();
  });

  const setLine = (line) => { app.scene().bass[index] = line; app.changed('pattern'); render(); };
  root.querySelector('.tools').addEventListener('click', (e) => {
    const tool = e.target.closest('button')?.dataset.tool;
    const line = bass();
    if (tool === 'random') setLine(randomBass(line.length));
    else if (tool === 'left') setLine([...line.slice(1), line[0]]);
    else if (tool === 'right') setLine([line.at(-1), ...line.slice(0, -1)]);
    else if (tool === 'clear') setLine(line.map(emptyStep));
  });
  root.querySelector('[data-tool="preset"]').addEventListener('change', (e) => {
    if (!e.target.value) return;
    setLine(presetBass(e.target.value, bass().length));
    e.target.value = '';
  });

  return {
    id: machine,
    render,
    rebuild() { buildPads(); render(); },
    playhead(pos) {
      pads.forEach((p, i) => p.classList.toggle('now', i === pos));
    },
  };
}
