import { createProject, normalizeProject, migrateV1, SCENES } from './project.js';
import { BPM, parseInRange } from './pattern.js';
import { findKit } from './kits.js';
import { createRack } from './rack.js';
import { createBassView } from './ui/bass-view.js';
import { createDrumView } from './ui/drum-view.js';
import { createMixerView } from './ui/mixer-view.js';
import { createSongView } from './ui/song-view.js';

const STORAGE_KEY = 'drum_seq:v2';
const LEGACY_KEY = 'drum_seq:v1';
const TAB_KEY = 'drum_seq:tab';
const $ = (selector) => document.querySelector(selector);

// ---------- Project (saved in this browser) ----------

function readJson(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } // private mode or bad JSON
}
function loadProject() {
  const saved = readJson(STORAGE_KEY);
  if (saved) return normalizeProject(saved);
  const legacy = readJson(LEGACY_KEY);
  return legacy ? migrateV1(legacy) : createProject();
}

let saveTimer;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 300);
}
function flush() {
  clearTimeout(saveTimer);
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(app.project)); } catch { /* storage full or blocked */ }
}
addEventListener('pagehide', flush);

// ---------- App context shared by the views ----------

let playingScene = -1; // scene heard right now, or -1 when stopped
let queuedScene = null; // scene waiting for the next bar

const app = {
  project: loadProject(),
  rack: null,
  sceneIndex: () => (playingScene >= 0 ? playingScene : app.project.scene),
  scene: () => app.project.scenes[app.sceneIndex()],
  changed(kind) {
    save();
    if (kind === 'sound' || kind === 'mix') app.rack?.apply(app.project);
    if (kind === 'kit') loadKit();
    if (kind === 'song') { renderScenes(); views.song.render(); }
    if (kind === 'structure') rebuildAll();
  },
  haptic: (ms = 8) => navigator.vibrate?.(ms),
  toast(text) {
    const t = $('#toast');
    t.textContent = text;
    t.classList.add('show');
    clearTimeout(t.timer);
    t.timer = setTimeout(() => t.classList.remove('show'), 2200);
  },
};

const views = {
  bass1: createBassView($('#view-bass1'), app, 0),
  bass2: createBassView($('#view-bass2'), app, 1),
  drums: createDrumView($('#view-drums'), app),
  mixer: createMixerView($('#view-mixer'), app),
  song: createSongView($('#view-song'), app),
};
const rebuildAll = () => { Object.values(views).forEach((v) => v.rebuild()); renderScenes(); };

// ---------- Tabs ----------

const tabs = [...document.querySelectorAll('[data-tab]')];
let currentTab = 'bass1';
function showTab(id) {
  currentTab = id in views ? id : 'bass1';
  for (const t of tabs) t.ariaCurrent = t.dataset.tab === currentTab ? 'page' : null;
  for (const v of document.querySelectorAll('.view')) v.hidden = v.dataset.view !== currentTab;
  views[currentTab].render();
  try { localStorage.setItem(TAB_KEY, currentTab); } catch { /* per-viewer convenience only */ }
}
$('.tabs').addEventListener('click', (e) => {
  const tab = e.target.closest('[data-tab]');
  if (tab) showTab(tab.dataset.tab);
});
const tabLeds = Object.fromEntries(tabs.map((t) => [t.dataset.tab, t.querySelector('.tab-led')]).filter(([, led]) => led));
const flash = (el) => el?.animate([{ opacity: 1 }, { opacity: 0.25 }], { duration: 140 });

// ---------- Scenes ----------

const scenesEl = $('#scenes');
scenesEl.append(...SCENES.map((name, i) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = name;
  b.dataset.scene = i;
  b.setAttribute('aria-label', `Scene ${name}`);
  return b;
}));
function renderScenes() {
  for (const b of scenesEl.children) {
    const i = Number(b.dataset.scene);
    b.ariaPressed = String(i === app.sceneIndex());
    b.classList.toggle('queued', i === queuedScene);
  }
  scenesEl.classList.toggle('song-mode', app.project.songMode);
}
scenesEl.addEventListener('click', (e) => {
  const i = Number(e.target.closest('[data-scene]')?.dataset.scene ?? NaN);
  if (Number.isNaN(i)) return;
  if (app.rack?.playing) {
    if (app.project.songMode) {
      app.project.songMode = false;
      app.toast('Song mode off: the scene changes at the next bar');
      views.song.render();
    }
    queuedScene = i === playingScene ? null : i; // changes at the next bar, like the hardware
    app.project.scene = i;
  } else {
    app.project.scene = i;
    queuedScene = null;
    rebuildAll();
  }
  save();
  renderScenes();
});

// ---------- Tempo ----------

const bpmEl = $('#bpm');
function showBpm() {
  bpmEl.querySelector('.lcd-digits').textContent = app.project.bpm;
  bpmEl.setAttribute('aria-valuenow', app.project.bpm);
}
function setBpm(value) {
  app.project.bpm = parseInRange(value, BPM.min, BPM.max, app.project.bpm); // invalid input keeps the last tempo
  showBpm();
  app.changed('sound');
}
// Drag the display up or down, like a data wheel.
let bpmDrag = null;
bpmEl.addEventListener('pointerdown', (e) => {
  bpmEl.setPointerCapture(e.pointerId);
  bpmDrag = { y: e.clientY, bpm: app.project.bpm };
});
bpmEl.addEventListener('pointermove', (e) => bpmDrag && setBpm(bpmDrag.bpm + Math.round((bpmDrag.y - e.clientY) / 4)));
bpmEl.addEventListener('pointerup', () => (bpmDrag = null));
bpmEl.addEventListener('pointercancel', () => (bpmDrag = null));
bpmEl.addEventListener('keydown', (e) => {
  const moves = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1, PageUp: 10, PageDown: -10 };
  if (!(e.key in moves)) return;
  e.preventDefault();
  setBpm(app.project.bpm + moves[e.key]);
});
// Hold a nudge button to keep changing the tempo.
for (const [id, delta] of [['#bpm-down', -1], ['#bpm-up', 1]]) {
  const b = $(id);
  let repeat;
  const stop = () => clearInterval(repeat);
  b.addEventListener('pointerdown', () => {
    setBpm(app.project.bpm + delta);
    repeat = setInterval(() => setBpm(app.project.bpm + delta), 120);
  });
  for (const type of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(type, stop);
  b.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && setBpm(app.project.bpm + delta));
}
// Tap tempo: average of the last taps; a pause over 2 s starts a new count.
let taps = [];
$('#tap').addEventListener('click', () => {
  const now = performance.now();
  taps = [...taps.filter((t) => now - t < 2000), now].slice(-5);
  if (taps.length > 1) setBpm(60000 / ((taps.at(-1) - taps[0]) / (taps.length - 1)));
  flash($('#tap'));
});

// ---------- Transport ----------

const playButton = $('#play');
let wakeLock = null;

async function togglePlay() {
  if (!app.rack) return app.toast('Audio is still starting…');
  if (app.rack.playing) {
    app.rack.stop();
    playingScene = -1;
    queuedScene = null;
    drawQueue.length = 0;
    Object.values(views).forEach((v) => v.playhead?.(-1));
    views.song.position(-1);
    wakeLock?.release().catch(() => {});
    wakeLock = null;
    rebuildAll();
  } else {
    if (navigator.audioSession) navigator.audioSession.type = 'playback'; // iOS: play even with the ring switch on silent
    await app.rack.start();
    wakeLock = await navigator.wakeLock?.request('screen').catch(() => null); // keep the screen on while jamming
  }
  playButton.ariaPressed = String(app.rack.playing);
  playButton.setAttribute('aria-label', app.rack.playing ? 'Stop' : 'Play');
  renderScenes();
}
playButton.addEventListener('click', togglePlay);
document.addEventListener('keydown', (e) => {
  if (e.code !== 'Space' || e.repeat || e.target.closest('button, input, select, textarea, [role="slider"]')) return;
  e.preventDefault();
  togglePlay();
});
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'visible' && app.rack?.playing && !wakeLock) wakeLock = await navigator.wakeLock?.request('screen').catch(() => null);
});

// ---------- Display, in sync with what is heard ----------

const drawQueue = [];
function draw() {
  const now = app.rack?.now() ?? 0;
  let last = null;
  while (drawQueue.length && drawQueue[0].time <= now) {
    const ev = drawQueue.shift();
    last = ev;
    if (ev.drums.length) { flash(tabLeds.drums); views.drums.hits(ev.drums); }
    ev.bass.forEach((on, i) => on && flash(tabLeds[`bass${i + 1}`]));
  }
  if (last && app.rack?.playing) {
    if (last.scene !== playingScene) {
      const resized = playingScene < 0 || app.project.scenes[last.scene].steps !== app.project.scenes[playingScene].steps;
      playingScene = last.scene;
      if (queuedScene === playingScene) queuedScene = null;
      Object.values(views).forEach((v) => (resized ? v.rebuild() : v.render()));
      renderScenes();
    }
    for (const id of ['bass1', 'bass2', 'drums']) views[id].playhead(last.pos);
    views.song.position(last.songIndex);
  }
  if (currentTab === 'mixer' && app.rack) views.mixer.meters(app.rack.levels());
  requestAnimationFrame(draw);
}

// ---------- Audio ----------

async function loadKit() {
  if (!app.rack) return;
  const kit = findKit(app.project.drums.kit);
  views.drums.setStatus(`Loading ${kit.name}…`, 'loading');
  try {
    await app.rack.loadKit(kit.id, ({ loaded, total }) => {
      if (app.project.drums.kit === kit.id) views.drums.setStatus(`Loading ${kit.name}… ${loaded}/${total}`, 'loading');
    });
    if (app.project.drums.kit === kit.id) views.drums.setStatus(`${kit.name} ready`, 'ready');
  } catch (error) {
    console.error(error);
    if (app.project.drums.kit === kit.id) views.drums.setStatus(`Couldn't load the ${kit.name}. Check your connection and pick it again.`, 'error');
  }
}

async function startAudio() {
  try {
    app.rack = await createRack({
      project: () => app.project,
      queued: () => queuedScene,
      onStep: (ev) => drawQueue.push(ev),
    });
    app.rack.apply(app.project);
  } catch (error) {
    console.error(error);
    app.toast('This browser cannot run the audio engine (AudioWorklet is missing).');
    return;
  }
  await loadKit();
}

// ---------- Start ----------

showBpm();
let savedTab = null;
try { savedTab = localStorage.getItem(TAB_KEY); } catch { /* ignore */ }
rebuildAll();
showTab(savedTab);
startAudio();
requestAnimationFrame(draw);

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => {}); // offline app shell where supported
}
