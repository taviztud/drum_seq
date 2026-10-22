// Rotary knob: drag up/right to raise, down/left to lower; double-tap resets; arrow keys step.
// It is an ARIA slider, so screen readers and keyboards can use it like a range input.

const DRAG_RANGE = 220; // pixels of drag for the full range

export function knob({ label, min = 0, max = 1, value, defaultValue = value, step = 0, format = (v) => v.toFixed(2), onInput, onChange, className = '' }) {
  const el = document.createElement('div');
  el.className = `knob ${className}`;
  el.tabIndex = 0;
  el.setAttribute('role', 'slider');
  el.setAttribute('aria-label', label);
  el.setAttribute('aria-valuemin', min);
  el.setAttribute('aria-valuemax', max);
  el.innerHTML = '<span class="knob-cap"><span class="knob-pointer"></span></span><span class="knob-label"></span><output class="knob-value"></output>';
  el.querySelector('.knob-label').textContent = label;
  const out = el.querySelector('output');

  let current = value;
  const snap = (v) => {
    const clamped = Math.min(max, Math.max(min, v));
    return step ? Math.round(clamped / step) * step : clamped;
  };
  function show(v) {
    current = v;
    el.style.setProperty('--turn', `${-135 + ((v - min) / (max - min)) * 270}deg`);
    el.setAttribute('aria-valuenow', v);
    el.setAttribute('aria-valuetext', format(v));
    out.textContent = format(v);
  }
  function set(v, final = false) {
    const next = snap(v);
    if (next !== current) { show(next); onInput?.(next); }
    if (final) onChange?.(current);
  }
  show(snap(value));

  let drag = null;
  let lastTap = 0;
  el.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    const now = performance.now();
    if (now - lastTap < 300) { set(defaultValue, true); lastTap = 0; return; }
    lastTap = now;
    el.setPointerCapture(e.pointerId);
    drag = { x: e.clientX, y: e.clientY, value: current };
    el.classList.add('active');
  });
  el.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const fine = e.shiftKey ? 0.2 : 1;
    const delta = (drag.y - e.clientY + (e.clientX - drag.x)) / DRAG_RANGE;
    set(drag.value + delta * (max - min) * fine);
  });
  const end = () => {
    if (!drag) return;
    drag = null;
    el.classList.remove('active');
    onChange?.(current);
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  el.addEventListener('keydown', (e) => {
    const unit = step || (max - min) / 100;
    const moves = { ArrowUp: unit, ArrowRight: unit, ArrowDown: -unit, ArrowLeft: -unit, PageUp: unit * 10, PageDown: -unit * 10 };
    if (e.key in moves) set(current + moves[e.key], true);
    else if (e.key === 'Home') set(min, true);
    else if (e.key === 'End') set(max, true);
    else return;
    e.preventDefault();
  });

  el.update = show; // reflect a value changed elsewhere (scene switch, reset) without firing callbacks
  return el;
}
