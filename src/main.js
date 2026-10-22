import {
  VOICES, ROWS, STEP_OPTIONS, PATTERN_SLOTS, PRESET_NAMES, BPM, SWING,
  createPattern, resize, presetPattern, normalizePattern, parseInRange,
} from './pattern.js';
import { KITS, findKit } from './kits.js';
import { createEngine } from './engine.js';

const STORAGE_KEY = 'drum_seq:v1';
const DEFAULT_VOICE = { level: 80, tune: 0, decay: 100, tone: 100, mute: false, solo: false };
const $ = (selector) => document.querySelector(selector);

// ---------- State (saved in this browser) ----------

function defaultState() {
  return {
    kit: 'tr808', bpm: BPM.default, swing: SWING.default, volume: 80, slot: 0, selected: 'bd',
    patterns: ['Electro (808)', 'House (909)', 'Boom bap (SP-12)', 'Breakbeat'].map(presetPattern),
    voices: Object.fromEntries(VOICES.map((v) => [v.id, { ...DEFAULT_VOICE }])),
  };
}

// localStorage is untrusted: every field is validated, anything odd falls back to the default.
function loadState() {
  const state = defaultState();
  let saved;
  try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch { /* private mode or bad JSON */ }
  if (!saved || typeof saved !== 'object') return state;
  state.kit = findKit(saved.kit).id;
  state.bpm = parseInRange(saved.bpm, BPM.min, BPM.max, state.bpm);
  state.swing = parseInRange(saved.swing, SWING.min, SWING.max, state.swing);
  state.volume = parseInRange(saved.volume, 0, 100, state.volume);
  state.slot = parseInRange(saved.slot, 0, PATTERN_SLOTS.length - 1, 0);
  if (VOICES.some((v) => v.id === saved.selected)) state.selected = saved.selected;
  if (Array.isArray(saved.patterns)) {
    state.patterns = state.patterns.map((p, i) => (saved.patterns[i] ? normalizePattern(saved.patterns[i]) : p));
  }
  for (const { id } of VOICES) {
    const v = saved.voices?.[id] ?? {};
    state.voices[id] = {
      level: parseInRange(v.level, 0, 100, DEFAULT_VOICE.level),
      tune: parseInRange(v.tune, -12, 12, DEFAULT_VOICE.tune),
      decay: parseInRange(v.decay, 0, 100, DEFAULT_VOICE.decay),
      tone: parseInRange(v.tone, 0, 100, DEFAULT_VOICE.tone),
      mute: v.mute === true,
      solo: v.solo === true,
    };
  }
  return state;
}

const state = loadState();
const save = () => {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* storage full or blocked */ }
};
const pattern = () => state.patterns[state.slot];
let queuedSlot = null; // pattern change waiting for the next bar, as on the hardware

// ---------- Audio ----------

const drawQueue = [];
const engine = createEngine({
  stateFor(barStart) {
    if (barStart && queuedSlot !== null) {
      state.slot = queuedSlot;
      queuedSlot = null;
      save();
    }
    return { pattern: pattern(), voices: state.voices, swing: state.swing };
  },
  onStep: (step, time) => drawQueue.push({ step, time, slot: state.slot }),
});
engine.bpm = state.bpm;
engine.volume = volumeToGain(state.volume);

// Master: 0 = silent, 100 = 0 dB, linear in dB over 48 dB.
function volumeToGain(v) { return v === 0 ? 0 : 10 ** (volumeToDb(v) / 20); }
function volumeToDb(v) { return (v / 100 - 1) * 48; }

// ---------- Grid ----------

const grid = $('#grid');
let columns = []; // columns[step] = elements to light when the playhead is there
let shownSlot = -1;
let playhead = -1;

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

function buildGrid() {
  const p = pattern();
  const kit = findKit(state.kit);
  shownSlot = state.slot;
  playhead = -1;
  columns = Array.from({ length: p.steps }, () => []);
  grid.style.setProperty('--steps', p.steps);

  const leds = el('div', { className: 'row leds', ariaHidden: 'true' }, el('div', { className: 'head' }));
  for (let s = 0; s < p.steps; s++) {
    const led = el('span', { className: `led g${Math.floor(s / 4) % 4}`, textContent: s + 1 });
    columns[s].push(led);
    leds.append(led);
  }

  const rows = ROWS.map((id) => {
    const voice = VOICES.find((v) => v.id === id);
    const name = voice?.name ?? 'Accent';
    const row = el('div', { className: 'row', role: 'group', ariaLabel: name });
    row.dataset.row = id;
    if (voice) {
      const missing = !kit.map[id];
      const v = state.voices[id];
      row.classList.toggle('missing', missing);
      row.append(el('div', { className: 'head' },
        el('button', {
          type: 'button', className: 'voice', ariaLabel: name, innerHTML: `<span class="long">${name}</span><span class="short" aria-hidden="true">${voice.short}</span>`,
          title: missing ? `${kit.name} has no ${name.toLowerCase()}` : `Play ${name.toLowerCase()} and edit its sound`,
          ariaPressed: String(state.selected === id),
        }),
        el('button', { type: 'button', className: 'mute', textContent: 'M', ariaLabel: `Mute ${name}`, ariaPressed: String(v.mute) }),
        el('button', { type: 'button', className: 'solo', textContent: 'S', ariaLabel: `Solo ${name}`, ariaPressed: String(v.solo) }),
      ));
    } else {
      row.classList.add('accent');
      row.append(el('div', { className: 'head' }, el('span', { className: 'voice', title: 'Accented steps play louder', innerHTML: '<span class="long">Accent</span><span class="short" aria-hidden="true">AC</span>' })));
    }
    for (let s = 0; s < p.steps; s++) {
      const cell = el('button', {
        type: 'button', className: `cell g${Math.floor(s / 4) % 4}`, tabIndex: -1,
        ariaLabel: `${name}, step ${s + 1}`, ariaPressed: String(p.rows[id][s]),
      });
      cell.dataset.step = s;
      columns[s].push(cell);
      row.append(cell);
    }
    return row;
  });

  grid.replaceChildren(leds, ...rows);
  grid.querySelector('.cell').tabIndex = 0; // roving tabindex: one tab stop, arrows move inside
}

function setPlayhead(step) {
  columns[playhead]?.forEach((c) => c.classList.remove('now'));
  playhead = step;
  columns[playhead]?.forEach((c) => c.classList.add('now'));
}

grid.addEventListener('click', (e) => {
  const button = e.target.closest('button');
  if (!button) return;
  const id = button.closest('.row').dataset.row;
  if (button.classList.contains('cell')) {
    const row = pattern().rows[id];
    const s = Number(button.dataset.step);
    row[s] = !row[s];
    button.ariaPressed = String(row[s]);
  } else if (button.classList.contains('voice')) {
    state.selected = id;
    grid.querySelectorAll('.voice[aria-pressed]').forEach((b) => (b.ariaPressed = String(b === button)));
    renderVoicePanel();
    engine.audition(id, state.voices[id]);
  } else {
    const key = button.classList.contains('mute') ? 'mute' : 'solo';
    state.voices[id][key] = !state.voices[id][key];
    button.ariaPressed = String(state.voices[id][key]);
  }
  save();
});

// Arrow keys move between cells; Space/Enter toggle (native button behaviour).
grid.addEventListener('keydown', (e) => {
  const cell = e.target.closest('.cell');
  const move = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] }[e.key];
  if (!cell || !move) return;
  e.preventDefault();
  const rows = [...grid.querySelectorAll('.row:not(.leds)')];
  const r = (rows.indexOf(cell.closest('.row')) + move[0] + rows.length) % rows.length;
  const s = (Number(cell.dataset.step) + move[1] + pattern().steps) % pattern().steps;
  const next = rows[r].querySelector(`.cell[data-step="${s}"]`);
  cell.tabIndex = -1;
  next.tabIndex = 0;
  next.focus();
});

function draw() {
  const now = engine.now();
  let event;
  while (drawQueue.length && drawQueue[0].time <= now) event = drawQueue.shift();
  if (event) {
    if (event.slot !== shownSlot) renderPattern();
    setPlayhead(event.step);
  }
  requestAnimationFrame(draw);
}

// ---------- Controls ----------

const controls = {
  kit: $('#kit'), status: $('#status'), play: $('#play'), bpm: $('#bpm'), tap: $('#tap'),
  swing: $('#swing'), swingOut: $('#swing-out'), steps: $('#steps'), volume: $('#volume'), volumeOut: $('#volume-out'),
  slots: $('#slots'), preset: $('#preset'), clear: $('#clear'),
};

controls.kit.append(...KITS.map((k) => el('option', { value: k.id, textContent: `${k.name} · ${k.year}` })));
controls.steps.append(...STEP_OPTIONS.map((n) => el('option', { value: n, textContent: n })));
controls.preset.append(...PRESET_NAMES.map((n) => el('option', { value: n, textContent: n })));
controls.slots.append(...PATTERN_SLOTS.map((name, i) => {
  const b = el('button', { type: 'button', textContent: name, ariaLabel: `Pattern ${name}` });
  b.dataset.slot = i;
  return b;
}));
controls.bpm.min = BPM.min;
controls.bpm.max = BPM.max;
controls.swing.min = SWING.min;
controls.swing.max = SWING.max;

async function loadKit() {
  const kit = findKit(state.kit);
  controls.status.textContent = `Loading ${kit.name}…`;
  controls.status.dataset.state = 'loading';
  try {
    await engine.loadKit(kit.id, ({ loaded, total }) => {
      if (state.kit === kit.id) controls.status.textContent = `Loading ${kit.name}… ${loaded}/${total}`;
    });
    if (state.kit !== kit.id) return; // the user picked another kit meanwhile
    controls.status.textContent = `${kit.name} ready`;
    controls.status.dataset.state = 'ready';
  } catch (error) {
    console.error(error);
    if (state.kit !== kit.id) return;
    controls.status.textContent = `Couldn't load ${kit.name}. Check your connection and pick it again.`;
    controls.status.dataset.state = 'error';
  }
}

controls.kit.addEventListener('change', () => {
  state.kit = controls.kit.value;
  save();
  buildGrid(); // rows the machine lacks are dimmed
  renderVoicePanel();
  loadKit();
});

async function togglePlay() {
  if (engine.playing) {
    engine.stop();
    drawQueue.length = 0;
    queuedSlot = null;
    setPlayhead(-1);
    renderSlots();
  } else {
    await engine.start();
  }
  controls.play.ariaPressed = String(engine.playing);
  controls.play.querySelector('.label').textContent = engine.playing ? 'Stop' : 'Play';
}
controls.play.addEventListener('click', togglePlay);
document.addEventListener('keydown', (e) => {
  if (e.code !== 'Space' || e.repeat || e.target.closest('button, input, select, textarea')) return;
  e.preventDefault();
  togglePlay();
});

function setBpm(value) {
  state.bpm = parseInRange(value, BPM.min, BPM.max, state.bpm); // invalid input restores the last tempo
  controls.bpm.value = state.bpm;
  engine.bpm = state.bpm;
  save();
}
controls.bpm.addEventListener('change', () => setBpm(controls.bpm.value));

// Tap tempo: average of the last taps; a pause over 2 s starts a new count.
let taps = [];
controls.tap.addEventListener('click', () => {
  const now = performance.now();
  taps = [...taps.filter((t) => now - t < 2000), now].slice(-5);
  if (taps.length > 1) setBpm(60000 / ((taps.at(-1) - taps[0]) / (taps.length - 1)));
});

controls.swing.addEventListener('input', () => {
  state.swing = Number(controls.swing.value);
  controls.swingOut.textContent = `${state.swing}%`;
  save();
});

controls.steps.addEventListener('change', () => {
  state.patterns[state.slot] = resize(pattern(), Number(controls.steps.value));
  save();
  buildGrid();
});

controls.volume.addEventListener('input', () => {
  state.volume = Number(controls.volume.value);
  engine.volume = volumeToGain(state.volume);
  controls.volumeOut.textContent = state.volume === 0 ? 'Off' : `${volumeToDb(state.volume).toFixed(1)} dB`;
  save();
});

controls.slots.addEventListener('click', (e) => {
  const slot = Number(e.target.closest('button')?.dataset.slot ?? NaN);
  if (Number.isNaN(slot)) return;
  if (engine.playing && slot !== state.slot) queuedSlot = slot;
  else {
    queuedSlot = null;
    state.slot = slot;
    save();
    renderPattern();
  }
  renderSlots();
});

controls.preset.addEventListener('change', () => {
  if (!controls.preset.value) return;
  state.patterns[state.slot] = presetPattern(controls.preset.value);
  controls.preset.value = '';
  save();
  renderPattern();
});

controls.clear.addEventListener('click', () => {
  state.patterns[state.slot] = createPattern(pattern().steps);
  save();
  buildGrid();
});

function renderSlots() {
  for (const b of controls.slots.children) {
    const i = Number(b.dataset.slot);
    b.ariaPressed = String(i === state.slot);
    b.classList.toggle('queued', i === queuedSlot);
  }
}

function renderPattern() {
  controls.steps.value = pattern().steps;
  renderSlots();
  buildGrid();
}

// ---------- Voice panel ----------

const knobs = {
  level: (v) => `${v}%`,
  tune: (v) => (v === 0 ? '0 st' : `${v > 0 ? '+' : '−'}${Math.abs(v)} st`),
  decay: (v) => (v === 100 ? 'Full' : `${v}%`),
  tone: (v) => (v === 100 ? 'Open' : `${v}%`),
};

function renderVoicePanel() {
  const voice = VOICES.find((v) => v.id === state.selected);
  const kit = findKit(state.kit);
  $('#voice-name').textContent = voice.name;
  $('#voice-note').textContent = kit.map[voice.id] ? '' : `Not on the ${kit.name}`;
  for (const [key, format] of Object.entries(knobs)) {
    const value = state.voices[voice.id][key];
    $(`#knob-${key}`).value = value;
    $(`#knob-${key}-out`).textContent = format(value);
  }
}

for (const [key, format] of Object.entries(knobs)) {
  const input = $(`#knob-${key}`);
  input.addEventListener('input', () => {
    const value = Number(input.value);
    state.voices[state.selected][key] = value;
    $(`#knob-${key}-out`).textContent = format(value);
    save();
  });
  // Releasing a knob plays the voice so the change is heard right away.
  input.addEventListener('change', () => engine.audition(state.selected, state.voices[state.selected]));
}

$('#voice-reset').addEventListener('click', () => {
  state.voices[state.selected] = { ...DEFAULT_VOICE, mute: state.voices[state.selected].mute, solo: state.voices[state.selected].solo };
  save();
  renderVoicePanel();
});

// ---------- Start ----------

controls.kit.value = state.kit;
controls.bpm.value = state.bpm;
controls.swing.value = state.swing;
controls.swing.dispatchEvent(new Event('input'));
controls.volume.value = state.volume;
controls.volume.dispatchEvent(new Event('input'));
renderPattern();
renderVoicePanel();
loadKit();
requestAnimationFrame(draw);
