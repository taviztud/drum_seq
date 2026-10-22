import { knob } from './knob.js';
import { CHANNELS, DELAY_DIVISIONS } from '../project.js';
import { SWING } from '../pattern.js';

const NAMES = { bass1: 'Bass 1', bass2: 'Bass 2', drums: 'Drums' };
const pct = (v) => `${Math.round(v * 100)}`;
const panText = (v) => (Math.abs(v) < 0.02 ? 'C' : `${v < 0 ? 'L' : 'R'}${Math.round(Math.abs(v) * 100)}`);
const dbText = (v) => (v === 0 ? '−∞' : `${(20 * Math.log10(v * v)).toFixed(1)}`); // the fader has an audio (squared) taper

function meter() {
  const m = document.createElement('div');
  m.className = 'meter';
  m.setAttribute('aria-hidden', 'true');
  m.innerHTML = '<span class="meter-fill"></span>';
  return m;
}

export function createMixerView(root, app) {
  root.classList.add('console');
  root.innerHTML = `
    <header class="plate-head"><h2 class="logo">Mixer</h2></header>
    <div class="strips"></div>
    <section class="master" aria-label="Master">
      <h3>Master</h3>
      <div class="master-grid">
        <div class="knobs master-knobs"></div>
        <div class="delay-time">
          <span class="field-label" id="delay-time-label">Delay time</span>
          <div class="seg" role="group" aria-labelledby="delay-time-label"></div>
        </div>
      </div>
    </section>`;

  const strips = root.querySelector('.strips');
  const meters = {};
  const controls = [];

  const stripFor = (id) => {
    const m = () => app.project.mixer[id];
    const strip = document.createElement('section');
    strip.className = 'strip';
    strip.setAttribute('aria-label', NAMES[id]);
    strip.innerHTML = `<h3>${NAMES[id]}</h3><div class="fader-wrap"></div>
      <div class="seg stack"><button type="button" class="toggle mute" data-flag="mute">M</button><button type="button" class="toggle solo" data-flag="solo">S</button></div>
      <div class="strip-knobs"></div>`;
    strip.querySelectorAll('[data-flag]').forEach((b) => b.setAttribute('aria-label', `${b.dataset.flag === 'mute' ? 'Mute' : 'Solo'} ${NAMES[id]}`));

    const fader = document.createElement('input');
    fader.type = 'range';
    fader.className = 'fader';
    fader.min = 0; fader.max = 1; fader.step = 0.01;
    fader.setAttribute('aria-label', `${NAMES[id]} level`);
    const readout = document.createElement('output');
    readout.className = 'fader-db';
    fader.addEventListener('input', () => {
      m().level = Number(fader.value);
      readout.textContent = dbText(m().level);
      app.changed('mix');
    });
    meters[id] = meter();
    strip.querySelector('.fader-wrap').append(meters[id], fader, readout);

    const knobDefs = [
      { key: 'pan', label: 'Pan', min: -1, max: 1, format: panText, defaultValue: 0 },
      { key: 'delay', label: 'Delay', min: 0, max: 1, format: pct, defaultValue: 0 },
    ];
    if (id !== 'drums') knobDefs.push({ key: 'drive', label: 'Drive', min: 0, max: 1, format: pct, defaultValue: 0 });
    const knobs = knobDefs.map((d) => {
      const k = knob({ ...d, value: m()[d.key], className: 'small', onInput: (v) => { m()[d.key] = v; app.changed('mix'); } });
      k.dataset.key = d.key;
      return k;
    });
    strip.querySelector('.strip-knobs').append(...knobs);
    strip.querySelector('.seg').addEventListener('click', (e) => {
      const flag = e.target.closest('[data-flag]')?.dataset.flag;
      if (!flag) return;
      m()[flag] = !m()[flag];
      app.changed('mix');
      render();
    });
    controls.push(() => {
      fader.value = m().level;
      readout.textContent = dbText(m().level);
      for (const k of knobs) k.update(m()[k.dataset.key]);
      for (const b of strip.querySelectorAll('[data-flag]')) b.ariaPressed = String(m()[b.dataset.flag]);
    });
    return strip;
  };
  strips.append(...CHANNELS.map(stripFor));

  // Master section
  const p = () => app.project;
  const masterKnobs = [
    { label: 'Volume', min: 0, max: 100, step: 1, get: () => p().volume, set: (v) => { p().volume = v; }, format: (v) => (v === 0 ? 'Off' : `${((v / 100 - 1) * 48).toFixed(1)} dB`), defaultValue: 88 },
    { label: 'Comp', min: 0, max: 1, get: () => p().fx.comp, set: (v) => { p().fx.comp = v; }, format: pct, defaultValue: 0.4 },
    { label: 'Feedback', min: 0, max: 0.9, get: () => p().fx.feedback, set: (v) => { p().fx.feedback = v; }, format: pct, defaultValue: 0.4 },
    { label: 'Swing', min: SWING.min, max: SWING.max, step: 1, get: () => p().swing, set: (v) => { p().swing = v; }, format: (v) => `${v}%`, defaultValue: SWING.default },
  ].map((d) => {
    const k = knob({ ...d, value: d.get(), onInput: (v) => { d.set(v); app.changed('mix'); } });
    k.sync = () => k.update(d.get());
    return k;
  });
  meters.master = meter();
  meters.master.classList.add('horizontal');
  root.querySelector('.master-knobs').before(meters.master);
  root.querySelector('.master-knobs').append(...masterKnobs);

  const seg = root.querySelector('.delay-time .seg');
  seg.append(...Object.keys(DELAY_DIVISIONS).map((d) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.division = d;
    b.textContent = d;
    return b;
  }));
  seg.addEventListener('click', (e) => {
    const d = e.target.closest('[data-division]')?.dataset.division;
    if (!d) return;
    p().fx.delayDivision = d;
    app.changed('mix');
    render();
  });

  function render() {
    controls.forEach((fn) => fn());
    masterKnobs.forEach((k) => k.sync());
    for (const b of seg.children) b.ariaPressed = String(b.dataset.division === p().fx.delayDivision);
  }

  // Peak meters with a quick attack and a slow fall, like LED ladders.
  const shown = {};
  function updateMeters(levels) {
    for (const [id, el] of Object.entries(meters)) {
      const target = Math.min(1, levels[id] ?? 0);
      shown[id] = Math.max(target, (shown[id] ?? 0) * 0.86);
      el.style.setProperty('--level', shown[id].toFixed(3));
      el.classList.toggle('clip', target >= 0.99);
    }
  }

  return { id: 'mixer', render, rebuild: render, meters: updateMeters };
}
