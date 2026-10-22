// Virtual analog synth: a Minimoog-style mono lead/bass or a Juno/Jupiter-style 6-voice poly.
// Per voice: two PolyBLEP oscillators (saw to pulse, detuned) plus a sub in mono, a 4-pole ladder
// filter (zero-delay-feedback, saturating input) and filter/amp envelopes. Same note events as Open303.

const POLY_VOICES = 6;
const CONTROL_EVERY = 8; // samples between pitch/filter/envelope-shape updates
const midiToHz = (p) => 440 * 2 ** ((p - 69) / 12);

// Band-limited step correction for saw and pulse edges.
function polyBlep(t, dt) {
  if (t < dt) { t /= dt; return t + t - t * t - 1; }
  if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
  return 0;
}

// Saw morphing into a 50% pulse as `wave` goes from 0 to 1.
function osc(phase, dt, wave) {
  let saw = 0, pulse = 0;
  if (wave < 1) saw = 2 * phase - 1 - polyBlep(phase, dt);
  if (wave > 0) {
    let half = phase + 0.5;
    if (half >= 1) half -= 1;
    pulse = (phase < 0.5 ? 1 : -1) + polyBlep(phase, dt) - polyBlep(half, dt);
  }
  return saw + (pulse - saw) * wave;
}

// tanh, close enough for saturation (exact at 0 and ±3) and several times cheaper.
const softClip = (x) => (x <= -3 ? -1 : x >= 3 ? 1 : (x * (27 + x * x)) / (27 + 9 * x * x));

// ADSR shape as per-sample coefficients; computed once per control step and shared by all voices.
function envShape(fs, attack, decay, sustain, release) {
  return {
    attackStep: 1 / Math.max(1, attack * fs),
    decayCoef: 1 - Math.exp(-5 / Math.max(1, decay * fs)), // ~ -43 dB after `decay` seconds
    sustain,
    releaseCoef: 1 - Math.exp(-5 / Math.max(1, release * fs)),
  };
}

class Envelope { // ADSR: linear attack, exponential decay and release
  constructor(fs) { this.value = 0; this.stage = 'idle'; Object.assign(this, envShape(fs, 0.01, 0.3, 1, 0.3)); }
  set(shape) { Object.assign(this, shape); }
  gate(on) {
    if (on) this.stage = 'attack';
    else if (this.stage !== 'idle') this.stage = 'release';
  }
  tick() {
    switch (this.stage) {
      case 'attack':
        this.value += this.attackStep;
        if (this.value >= 1) { this.value = 1; this.stage = 'decay'; }
        break;
      case 'decay': this.value += (this.sustain - this.value) * this.decayCoef; break;
      case 'release':
        this.value -= this.value * this.releaseCoef;
        if (this.value < 1e-4) { this.value = 0; this.stage = 'idle'; }
        break;
    }
    return this.value;
  }
}

class Ladder { // Moog-style 4-pole lowpass, topology-preserving transform with resonance feedback
  constructor(fs) { this.fs = fs; this.s = new Float64Array(4); this.setCutoff(1000); }
  setCutoff(hz) {
    const g = Math.tan((Math.PI * Math.min(hz, this.fs * 0.45)) / this.fs);
    this.G = g / (1 + g);
  }
  reset() { this.s.fill(0); }
  tick(x, k) {
    const { G, s } = this;
    const b = 1 - G;
    const G2 = G * G;
    const sigma = b * (G2 * G * s[0] + G2 * s[1] + G * s[2] + s[3]);
    const y4 = (G2 * G2 * x + sigma) / (1 + k * G2 * G2);
    let u = softClip(x - k * y4); // saturating input: the Moog's growl, and it keeps resonance stable
    for (let i = 0; i < 4; i++) {
      const v = (u - s[i]) * G;
      const y = v + s[i];
      s[i] = y + v;
      u = y;
    }
    return u;
  }
}

class Voice {
  constructor(fs) {
    this.fs = fs;
    this.amp = new Envelope(fs);
    this.filterEnv = new Envelope(fs);
    this.filter = new Ladder(fs);
    this.key = -1;
    this.pitch = 60;
    this.target = 60;
    this.p1 = 0; this.p2 = 0.37; this.pSub = 0; // free-running phases, like analog oscillators
    this.velocity = 0.75;
    this.age = 0;
    this.released = true;
  }
  get active() { return this.amp.stage !== 'idle'; }
  trigger(key, accent, age, retrigger = true) {
    if (!this.active) { this.filter.reset(); this.pitch = key; }
    this.key = key;
    this.target = key;
    this.velocity = accent ? 1 : 0.75;
    this.accent = accent;
    this.age = age;
    this.released = false;
    if (retrigger) { this.amp.gate(true); this.filterEnv.gate(true); }
  }
  release() { this.released = true; this.amp.gate(false); this.filterEnv.gate(false); }
}

class Synth {
  constructor(fs) {
    this.fs = fs;
    this.voices = Array.from({ length: POLY_VOICES }, () => new Voice(fs));
    this.mono = false;
    this.held = []; // mono mode: held keys, most recent first
    this.age = 0;
    this.counter = 0;
    this.p = { wave: 0, detune: 0.3, cutoff: 0.5, reso: 0.2, env: 0.5, attack: 0.02, release: 0.3, glide: 0 };
  }

  setMono(mono) {
    if (mono === this.mono) return;
    this.mono = mono;
    this.held = [];
    for (const v of this.voices) v.release();
  }

  noteOn(key, accent) {
    this.age++;
    this.counter = 0; // set the new pitch and envelope times on the very next sample
    if (this.mono) {
      const v = this.voices[0];
      const legato = this.held.length > 0; // Minimoog-style: overlapping notes glide without retriggering
      this.held.unshift(key);
      v.trigger(key, accent, this.age, !legato);
      return;
    }
    // Poly: a free voice, else the oldest released one, else the oldest overall.
    const free = this.voices.find((v) => !v.active)
      ?? this.voices.filter((v) => v.released).sort((a, b) => a.age - b.age)[0]
      ?? this.voices.slice().sort((a, b) => a.age - b.age)[0];
    free.trigger(key, accent, this.age);
    free.pitch = key; // poly voices don't glide
  }

  noteOff(key) {
    this.counter = 0;
    if (this.mono) {
      const i = this.held.lastIndexOf(key); // drop the oldest copy, so a slide onto the same note holds
      if (i >= 0) this.held.splice(i, 1);
      const v = this.voices[0];
      if (this.held.length === 0) v.release();
      else v.target = this.held[0]; // glide back to the note still held
      return;
    }
    const v = this.voices.filter((x) => x.key === key && !x.released).sort((a, b) => a.age - b.age)[0];
    v?.release();
  }

  allNotesOff() { this.held = []; for (const v of this.voices) v.release(); }

  // Knob values (0..1) to times and amounts. Called every CONTROL_EVERY samples.
  control() {
    const p = this.p;
    const attack = 0.001 + p.attack ** 2 * 3;
    const release = 0.02 + p.release ** 2 * 4;
    const glideCoef = p.glide > 0 && this.mono ? 1 - Math.exp(-CONTROL_EVERY / (p.glide ** 2 * 0.3 * this.fs)) : 1;
    const ampShape = envShape(this.fs, attack, 0.4, 1, release);
    const filterShape = envShape(this.fs, attack, 0.12 + p.release * 1.2, 0.25, release);
    for (const v of this.voices) {
      if (!v.active) continue;
      v.amp.set(ampShape);
      v.filterEnv.set(filterShape);
      v.pitch += (v.target - v.pitch) * glideCoef;
      const tracking = 2 ** ((v.pitch - 60) / 24); // half key tracking keeps high notes bright
      const env = v.filterEnv.value * p.env * (v.accent ? 8.5 : 6.5); // octaves of sweep
      v.filter.setCutoff(30 * 2 ** (p.cutoff * 9.4) * tracking * 2 ** env);
      v.freq = midiToHz(v.pitch);
    }
  }

  tick() {
    if (this.counter-- <= 0) { this.control(); this.counter = CONTROL_EVERY - 1; }
    const p = this.p;
    const k = p.reso * 4.2; // self-oscillates near the top, as the hardware does
    const cents = p.detune * 25;
    const up = 2 ** (cents / 2400), down = 1 / up;
    let out = 0;
    for (const v of this.voices) {
      if (!v.active) continue;
      const dt1 = (v.freq * down) / this.fs;
      const dt2 = (v.freq * up) / this.fs;
      let x = 0.5 * (osc(v.p1, dt1, p.wave) + osc(v.p2, dt2, p.wave));
      if (this.mono) x += 0.35 * (v.pSub < 0.5 ? 1 : -1);
      v.p1 += dt1; if (v.p1 >= 1) v.p1 -= 1;
      v.p2 += dt2; if (v.p2 >= 1) v.p2 -= 1;
      v.pSub += dt1 / 2; if (v.pSub >= 1) v.pSub -= 1;
      v.filterEnv.tick();
      const y = v.filter.tick(x * (1 + k * 0.3), k);
      out += y * v.amp.tick() * v.velocity;
    }
    return out * (this.mono ? 0.8 : 0.4); // one voice can run hotter than six
  }
}

// ---------- AudioWorklet wrapper ----------

const PARAMS = ['wave', 'detune', 'cutoff', 'reso', 'env', 'attack', 'release', 'glide'];

class VaProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      ...PARAMS.map((name) => ({ name, defaultValue: 0.3, minValue: 0, maxValue: 1, automationRate: 'k-rate' })),
      { name: 'mono', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
    ];
  }

  constructor(options) {
    super();
    this.synth = new Synth(sampleRate);
    this.queue = (options.processorOptions?.events ?? []).slice().sort((a, b) => a.time - b.time);
    this.port.onmessage = ({ data }) => {
      if (data.type === 'events') {
        this.queue.push(...data.events);
        this.queue.sort((a, b) => a.time - b.time); // stable: same-time events keep their order
      } else if (data.type === 'stop') {
        this.queue = [];
        this.synth.allNotesOff();
      }
    };
  }

  process(_inputs, outputs, params) {
    const out = outputs[0][0];
    const synth = this.synth;
    for (const name of PARAMS) synth.p[name] = params[name][0];
    synth.setMono(params.mono[0] >= 0.5);
    let e = 0;
    for (let i = 0; i < out.length; i++) {
      const t = currentTime + i / sampleRate;
      while (e < this.queue.length && this.queue[e].time <= t) {
        const ev = this.queue[e++];
        if (ev.kind === 'on') synth.noteOn(ev.key, ev.accent);
        else synth.noteOff(ev.key);
      }
      out[i] = synth.tick();
    }
    if (e) this.queue.splice(0, e);
    for (let c = 1; c < outputs[0].length; c++) outputs[0][c].set(out);
    return true;
  }
}

registerProcessor('va-synth', VaProcessor);
