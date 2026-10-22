import { knob } from './knob.js';
import { VOICES, ROWS, PRESET_NAMES, presetPattern } from '../pattern.js';
import { KITS, findKit } from '../kits.js';
import { DRUM_VOICE } from '../project.js';

const ROW_INFO = [{ id: 'ac', short: 'AC', name: 'Accent' }, ...VOICES];
const VOICE_KNOBS = [
  { id: 'level', label: 'Level', min: 0, max: 100, step: 1, format: (v) => `${v}` },
  { id: 'tune', label: 'Tune', min: -12, max: 12, step: 1, format: (v) => `${v > 0 ? '+' : ''}${v} st` },
  { id: 'decay', label: 'Decay', min: 0, max: 100, step: 1, format: (v) => (v === 100 ? 'Full' : `${v}`) },
  { id: 'tone', label: 'Tone', min: 0, max: 100, step: 1, format: (v) => (v === 100 ? 'Open' : `${v}`) },
];

// TR-style editing: pick a sound, then its 16 step keys show and toggle that sound only.
export function createDrumView(root, app) {
  root.classList.add('machine', 'rhythm');
  root.innerHTML = `
    <header class="plate-head">
      <h2 class="logo">Rhythm Composer</h2>
      <label class="kit-select"><span class="visually-hidden">Drum machine</span><select data-kit></select></label>
    </header>
    <p class="kit-status" role="status"></p>
    <div class="voices" role="group" aria-label="Sound to edit"></div>
    <div class="pads drum-pads" role="group" aria-label="Steps"></div>
    <div class="overview" aria-hidden="true"></div>
    <div class="voice-panel">
      <div class="voice-head">
        <h3 class="voice-name"></h3>
        <div class="seg">
          <button type="button" class="toggle mute" data-flag="mute">Mute</button>
          <button type="button" class="toggle solo" data-flag="solo">Solo</button>
        </div>
      </div>
      <div class="knobs"></div>
    </div>
    <div class="row tools">
      <select data-tool="preset" aria-label="Load a drum pattern"><option value="">Load a pattern…</option></select>
      <button type="button" data-tool="clear-voice">Clear sound</button>
      <button type="button" data-tool="clear-all">Clear all</button>
    </div>`;

  const kitSelect = root.querySelector('[data-kit]');
  kitSelect.append(...KITS.map((k) => new Option(`${k.name} (${k.year})`, k.id)));
  root.querySelector('[data-tool="preset"]').append(...PRESET_NAMES.map((n) => new Option(n, n)));
  const status = root.querySelector('.kit-status');

  const voicesEl = root.querySelector('.voices');
  voicesEl.append(...ROW_INFO.map((v) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'voice-chip';
    b.dataset.voice = v.id;
    b.innerHTML = `<span class="chip-led"></span><span class="chip-short">${v.short}</span><span class="chip-name">${v.name}</span>`;
    return b;
  }));
  const chips = Object.fromEntries([...voicesEl.children].map((c) => [c.dataset.voice, c]));

  const knobs = VOICE_KNOBS.map((k) => {
    const el = knob({
      ...k, value: DRUM_VOICE[k.id], defaultValue: DRUM_VOICE[k.id],
      onInput: (v) => { app.project.drums.voices[app.project.drums.selected][k.id] = v; app.changed('sound'); },
      onChange: () => app.rack?.auditionDrum(app.project.drums.selected, app.project.drums.voices[app.project.drums.selected]),
    });
    el.dataset.knob = k.id;
    return el;
  });
  root.querySelector('.knobs').append(...knobs);

  const padsEl = root.querySelector('.pads');
  const overview = root.querySelector('.overview');
  let pads = [];
  let cells = {};

  function build() {
    const steps = app.scene().steps;
    padsEl.replaceChildren(...Array.from({ length: steps }, (_, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `pad step g${Math.floor(i / 4) % 4}`;
      b.dataset.step = i;
      b.innerHTML = `<span class="pad-led"></span><span class="pad-num">${i + 1}</span>`;
      return b;
    }));
    pads = [...padsEl.children];
    overview.style.setProperty('--steps', steps);
    cells = {};
    overview.replaceChildren(...ROWS.map((id) => {
      const row = document.createElement('div');
      row.className = 'ov-row';
      row.dataset.voice = id;
      cells[id] = Array.from({ length: steps }, (_, i) => {
        const c = document.createElement('span');
        c.className = `ov-cell g${Math.floor(i / 4) % 4}`;
        row.append(c);
        return c;
      });
      return row;
    }));
  }

  function render() {
    const scene = app.scene();
    if (pads.length !== scene.steps) build();
    const sel = app.project.drums.selected;
    const kit = findKit(app.project.drums.kit);
    kitSelect.value = kit.id;
    const info = ROW_INFO.find((v) => v.id === sel);
    for (const [id, chip] of Object.entries(chips)) {
      chip.ariaPressed = String(id === sel);
      chip.classList.toggle('missing', id !== 'ac' && !kit.map[id]);
      chip.classList.toggle('muted', id !== 'ac' && app.project.drums.voices[id].mute);
    }
    const row = scene.drums[sel];
    pads.forEach((p, i) => {
      p.ariaPressed = String(row[i]);
      p.setAttribute('aria-label', `${info.name}, step ${i + 1}`);
    });
    for (const id of ROWS) cells[id].forEach((c, i) => c.classList.toggle('on', scene.drums[id][i]));
    for (const r of overview.children) r.classList.toggle('selected', r.dataset.voice === sel);
    const panel = root.querySelector('.voice-panel');
    panel.hidden = sel === 'ac';
    root.querySelector('.voice-name').textContent = kit.map[sel] || sel === 'ac' ? info.name : `${info.name} (not on the ${kit.name})`;
    if (sel !== 'ac') {
      const v = app.project.drums.voices[sel];
      for (const k of knobs) k.update(v[k.dataset.knob]);
      for (const b of root.querySelectorAll('[data-flag]')) b.ariaPressed = String(v[b.dataset.flag]);
    }
  }

  voicesEl.addEventListener('click', (e) => {
    const chip = e.target.closest('.voice-chip');
    if (!chip) return;
    app.project.drums.selected = chip.dataset.voice;
    app.changed('ui');
    if (chip.dataset.voice !== 'ac') app.rack?.auditionDrum(chip.dataset.voice, app.project.drums.voices[chip.dataset.voice]);
    render();
  });
  overview.addEventListener('click', (e) => {
    const row = e.target.closest('.ov-row');
    if (row) chips[row.dataset.voice].click();
  });
  padsEl.addEventListener('click', (e) => {
    const pad = e.target.closest('.pad');
    if (!pad) return;
    const row = app.scene().drums[app.project.drums.selected];
    const i = Number(pad.dataset.step);
    row[i] = !row[i];
    app.haptic();
    app.changed('pattern');
    render();
  });
  root.querySelector('.voice-head .seg').addEventListener('click', (e) => {
    const flag = e.target.closest('[data-flag]')?.dataset.flag;
    if (!flag) return;
    const v = app.project.drums.voices[app.project.drums.selected];
    v[flag] = !v[flag];
    app.changed('sound');
    render();
  });
  kitSelect.addEventListener('change', () => {
    app.project.drums.kit = kitSelect.value;
    app.changed('kit');
    render();
  });
  root.querySelector('.tools').addEventListener('click', (e) => {
    const tool = e.target.closest('button')?.dataset.tool;
    const scene = app.scene();
    if (tool === 'clear-voice') scene.drums[app.project.drums.selected].fill(false);
    else if (tool === 'clear-all') for (const id of ROWS) scene.drums[id].fill(false);
    else return;
    app.changed('pattern');
    render();
  });
  root.querySelector('[data-tool="preset"]').addEventListener('change', (e) => {
    if (!e.target.value) return;
    const rows = presetPattern(e.target.value).rows;
    const scene = app.scene();
    for (const id of ROWS) scene.drums[id] = Array.from({ length: scene.steps }, (_, i) => rows[id][i % 16]);
    e.target.value = '';
    app.changed('pattern');
    render();
  });

  return {
    id: 'drums',
    render,
    rebuild() { build(); render(); },
    playhead(pos) { pads.forEach((p, i) => p.classList.toggle('now', i === pos)); },
    hits(voices) {
      for (const id of voices) chips[id].querySelector('.chip-led').animate([{ opacity: 1 }, { opacity: 0.2 }], { duration: 160 });
    },
    setStatus(text, state) { status.textContent = text; status.dataset.state = state; },
  };
}
