import { knob } from './knob.js';
import { VOICES, ROWS, PRESET_NAMES, presetPattern } from '../pattern.js';
import { DENSITIES, generateDrums, mutateDrums } from '../generate.js';
import { KITS, CHARACTERS, findKit, hasCharacters } from '../kits.js';
import { DRUM_VOICE } from '../project.js';
import { powerButton, renderPower, chanceRow } from './note-view.js';

const ROW_INFO = [{ id: 'ac', short: 'AC', name: 'Accent' }, ...VOICES];
const VOICE_KNOBS = [
  { id: 'level', label: 'Level', min: 0, max: 100, step: 1, format: (v) => `${v}` },
  { id: 'tune', label: 'Tune', min: -12, max: 12, step: 1, format: (v) => `${v > 0 ? '+' : ''}${v} st` },
  { id: 'decay', label: 'Decay', min: 0, max: 100, step: 1, format: (v) => (v === 100 ? 'Full' : `${v}`) },
  { id: 'tone', label: 'Tone', min: 0, max: 100, step: 1, format: (v) => (v === 100 ? 'Open' : `${v}`) },
];

// TR-style editing: pick a sound, then its 16 step keys show and toggle that sound only.
export function createDrumView(root, app) {
  let density = 'some'; // how busy Random makes the groove; not saved
  let editing = false; // Edit steps: tapping a pad picks a hit, and the knobs and Chance edit that hit only
  let editStep = 0;
  let paint = null; // while a finger strokes across pads: the value every pad it crosses gets
  root.classList.add('machine', 'rhythm');
  root.innerHTML = `
    <header class="plate-head">
      <h2 class="logo">Rhythm Composer</h2>
      ${powerButton('Rhythm Composer')}
      <label class="kit-select"><span class="visually-hidden">Drum machine</span><select data-kit></select></label>
    </header>
    <div class="seg character" role="group" aria-label="Character of the samples">${CHARACTERS.map((c) => `<button type="button" data-character="${c.id}">${c.name}</button>`).join('')}</div>
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
      <div class="row step-extra">
        <button type="button" class="toggle" data-edit-steps aria-pressed="false">Edit steps</button>
        <button type="button" data-clear-hit>Clear locks</button>
        ${chanceRow()}
      </div>
    </div>
    <div class="row tools">
      <select data-tool="preset" aria-label="Load a drum pattern"><option value="">Load a pattern…</option></select>
      <button type="button" data-tool="random">Random</button>
      <button type="button" data-tool="mutate" aria-label="Mutate: change a few hits">Mutate</button>
      <div class="seg density" role="group" aria-label="Random density">${DENSITIES.map(([id, text]) => `<button type="button" data-density="${id}">${text}</button>`).join('')}</div>
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
      onInput: (v) => {
        const hit = editedHit(true);
        if (hit) { hit[k.id] = v; app.changed('pattern'); renderPads(); } else { app.project.drums.voices[app.project.drums.selected][k.id] = v; app.changed('sound'); }
      },
      onChange: () => app.rack?.auditionDrum(app.project.drums.selected, { ...app.project.drums.voices[app.project.drums.selected], ...editedHit() }),
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
      b.innerHTML = `<span class="pad-led"></span><span class="pad-mark"></span><span class="pad-num">${i + 1}</span>`;
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

  // The hit being edited in Edit steps mode (its locks and chance), or null. `create` makes room for new values.
  function editedHit(create = false) {
    const scene = app.scene();
    const sel = app.project.drums.selected;
    if (!editing || sel === 'ac' || !scene.drums[sel][editStep]) return null;
    const meta = scene.drumMeta[sel]?.[editStep];
    if (meta || !create) return meta ?? null;
    return ((scene.drumMeta[sel] ??= {})[editStep] = {});
  }

  function renderPads() {
    const scene = app.scene();
    const sel = app.project.drums.selected;
    const row = scene.drums[sel];
    pads.forEach((p, i) => {
      const meta = scene.drumMeta[sel]?.[i];
      p.ariaPressed = String(row[i]);
      p.classList.toggle('selected', editing && i === editStep);
      p.classList.toggle('locks', row[i] && !!meta && Object.keys(meta).some((k) => k !== 'prob'));
      p.classList.toggle('chance', row[i] && meta?.prob < 1);
    });
    for (const id of ROWS) cells[id].forEach((c, i) => c.classList.toggle('on', scene.drums[id][i]));
  }

  function render() {
    const scene = app.scene();
    if (pads.length !== scene.steps) build();
    renderPower(root, app.project.power.drums);
    editStep = Math.min(editStep, scene.steps - 1);
    for (const b of root.querySelectorAll('[data-density]')) b.ariaPressed = String(b.dataset.density === density);
    const sel = app.project.drums.selected;
    const kit = findKit(app.project.drums.kit);
    kitSelect.value = kit.id;
    // Only the sampler-era kits were recorded in every Character; the others play as they are.
    characterEl.hidden = !hasCharacters(kit);
    for (const b of characterEl.children) b.ariaPressed = String(b.dataset.character === app.project.drums.character);
    const info = ROW_INFO.find((v) => v.id === sel);
    for (const [id, chip] of Object.entries(chips)) {
      chip.ariaPressed = String(id === sel);
      chip.classList.toggle('missing', id !== 'ac' && !kit.map[id]);
      chip.classList.toggle('muted', id !== 'ac' && app.project.drums.voices[id].mute);
    }
    pads.forEach((p, i) => p.setAttribute('aria-label', `${info.name}, step ${i + 1}`));
    renderPads();
    for (const r of overview.children) r.classList.toggle('selected', r.dataset.voice === sel);
    const panel = root.querySelector('.voice-panel');
    panel.hidden = sel === 'ac';
    root.querySelector('.voice-name').textContent = kit.map[sel] || sel === 'ac' ? info.name : `${info.name} (not on the ${kit.name})`;
    if (sel !== 'ac') {
      const v = app.project.drums.voices[sel];
      const hit = editedHit();
      for (const k of knobs) {
        k.update(hit?.[k.dataset.knob] ?? v[k.dataset.knob]);
        k.classList.toggle('locked', hit?.[k.dataset.knob] !== undefined);
      }
      root.querySelector('[data-edit-steps]').ariaPressed = String(editing);
      root.querySelector('[data-clear-hit]').disabled = !hit;
      const canEdit = editing && scene.drums[sel][editStep];
      for (const b of root.querySelectorAll('[data-chance]')) {
        b.disabled = !canEdit;
        b.ariaPressed = String(canEdit && Number(b.dataset.chance) === (hit?.prob ?? 1));
      }
      for (const b of root.querySelectorAll('[data-flag]')) b.ariaPressed = String(v[b.dataset.flag]);
    }
  }

  voicesEl.addEventListener('click', (e) => {
    const chip = e.target.closest('.voice-chip');
    if (!chip) return;
    app.project.drums.selected = chip.dataset.voice;
    app.changed('ui');
    const rec = app.recordStep();
    if (rec !== null) { app.scene().drums[chip.dataset.voice][rec] = true; app.changed('pattern'); } // live recording
    if (chip.dataset.voice !== 'ac') app.rack?.auditionDrum(chip.dataset.voice, app.project.drums.voices[chip.dataset.voice]);
    render();
  });
  overview.addEventListener('click', (e) => {
    const row = e.target.closest('.ov-row');
    if (row) chips[row.dataset.voice].click();
  });
  // Steps: a tap toggles, a stroke paints every pad it crosses with the first pad's new value.
  // Vertical strokes still scroll the page (touch-action: pan-y in style.css).
  function setPad(i) {
    const row = app.scene().drums[app.project.drums.selected];
    if (row[i] === paint) return;
    row[i] = paint;
    app.haptic();
    app.changed('pattern');
    renderPads();
  }
  padsEl.addEventListener('pointerdown', (e) => {
    const pad = e.target.closest('.pad');
    if (!pad) return;
    const i = Number(pad.dataset.step);
    if (editing) { editStep = i; render(); return; }
    paint = !app.scene().drums[app.project.drums.selected][i];
    setPad(i);
  });
  padsEl.addEventListener('pointermove', (e) => {
    if (paint === null) return;
    const pad = document.elementFromPoint(e.clientX, e.clientY)?.closest('.drum-pads .pad');
    if (pad) setPad(Number(pad.dataset.step));
  });
  for (const type of ['pointerup', 'pointercancel']) addEventListener(type, () => (paint = null));
  padsEl.addEventListener('click', (e) => { // keyboard (Enter/Space) only: pointers were handled above
    const pad = e.target.closest('.pad');
    if (!pad || e.detail !== 0) return;
    const i = Number(pad.dataset.step);
    if (editing) { editStep = i; render(); return; }
    paint = !app.scene().drums[app.project.drums.selected][i];
    setPad(i);
    paint = null;
  });
  root.querySelector('.voice-panel .step-extra').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const scene = app.scene();
    const sel = app.project.drums.selected;
    if (b.hasAttribute('data-edit-steps')) editing = !editing;
    else if (b.hasAttribute('data-clear-hit')) { delete scene.drumMeta[sel]?.[editStep]; app.changed('pattern'); }
    else if (b.dataset.chance) { editedHit(true).prob = Number(b.dataset.chance); app.changed('pattern'); }
    render();
  });
  root.querySelector('.power').addEventListener('click', () => {
    app.project.power.drums = !app.project.power.drums;
    app.changed('power');
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
  const characterEl = root.querySelector('.character');
  characterEl.addEventListener('click', (e) => {
    const id = e.target.closest('[data-character]')?.dataset.character;
    if (!id || id === app.project.drums.character) return;
    app.project.drums.character = id;
    app.changed('kit');
    render();
  });
  kitSelect.addEventListener('change', () => {
    app.project.drums.kit = kitSelect.value;
    app.changed('kit');
    render();
  });
  root.querySelector('.tools').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b?.dataset.density) { density = b.dataset.density; render(); return; }
    const tool = b?.dataset.tool;
    const scene = app.scene();
    if (tool === 'random') Object.assign(scene, { drums: generateDrums({ steps: scene.steps, density }), drumMeta: {} });
    else if (tool === 'mutate') scene.drums = mutateDrums(scene.drums);
    else if (tool === 'clear-voice') { scene.drums[app.project.drums.selected].fill(false); delete scene.drumMeta[app.project.drums.selected]; }
    else if (tool === 'clear-all') { for (const id of ROWS) scene.drums[id].fill(false); scene.drumMeta = {}; }
    else return;
    app.changed('pattern');
    render();
  });
  root.querySelector('[data-tool="preset"]').addEventListener('change', (e) => {
    if (!e.target.value) return;
    const rows = presetPattern(e.target.value).rows;
    const scene = app.scene();
    for (const id of ROWS) scene.drums[id] = Array.from({ length: scene.steps }, (_, i) => rows[id][i % 16]);
    scene.drumMeta = {};
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
