// TB-303 style bass voice: a JavaScript port of the Open303 DSP core.
// Open303 © 2009 Robin Schmidt (www.rs-met.com), MIT License: https://github.com/RobinSchmidt/Open303
// Ported parts: TeeBeeFilter (TB_303 mode), BlendOscillator with mip-mapped 303 saw/square tables,
// DecayEnvelope, AnalogEnvelope, LeakyIntegrator, OnePoleFilter, BiquadFilter and the 4x
// oversampling decimator (EllipticQuarterBandFilter). Note handling follows Open303::noteOn.

const NO_LOCKS = Object.freeze({});
const OVERSAMPLING = 4;
const TABLE_LENGTH = 2048;
const NUM_TABLES = 12;
const TINY = 1.1754943508222875e-38; // FLT_MIN, keeps filters out of denormals
const dB2amp = (dB) => Math.exp(dB * 0.11512925464970228);
const pitchToFreq = (pitch, a4) => a4 * 0.018581361171917516 * Math.exp(0.05776226504666211 * pitch);
const linToExp = (x, min, max) => min * Math.exp(x * Math.log(max / min));
const expToLin = (x, min, max) => Math.log(x / min) / Math.log(max / min);
const clip = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);

// ---------- Wavetables ----------

function fft(re, im, inverse) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((inverse ? 2 : -2) * Math.PI) / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr; im[b] = im[a] - xi;
        re[a] += xr; im[a] += xi;
        const t = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = t;
      }
    }
  }
}

// Table 0 is the raw prototype; table t keeps harmonics below TABLE_LENGTH / 2^(t+1).
function mipMap(prototype) {
  const N = TABLE_LENGTH;
  const re = Float64Array.from(prototype), im = new Float64Array(N);
  fft(re, im, false);
  const tables = [];
  for (let t = 0; t < NUM_TABLES; t++) {
    const table = new Float64Array(N + 4);
    if (t === 0) table.set(prototype);
    else {
      const keep = N / 2 ** (t + 1);
      const r = new Float64Array(N), i = new Float64Array(N);
      for (let k = 1; k < keep; k++) {
        r[k] = re[k]; i[k] = im[k];
        r[N - k] = re[N - k]; i[N - k] = im[N - k];
      }
      fft(r, i, true);
      for (let n = 0; n < N; n++) table[n] = r[n] / N;
    }
    for (let n = 0; n < 4; n++) table[N + n] = table[n]; // guard points for interpolation
    tables.push(table);
  }
  return tables;
}

function saw303() {
  const N = TABLE_LENGTH;
  const N1 = clip(Math.round(0.5 * (N - 1)), 1, N - 1);
  const N2 = N - N1;
  const t = new Float64Array(N);
  for (let n = 0; n < N1; n++) t[n] = n / (N1 - 1);
  for (let n = N1; n < N; n++) t[n] = -1 + (n - N1) / N2;
  return t;
}

function square303(phaseShiftDegrees = 180) {
  const N = TABLE_LENGTH;
  const saw = saw303();
  const shaped = saw.map((x) => -Math.tanh(dB2amp(36.9) * x + 4.37));
  const shift = Math.round((N * phaseShiftDegrees) / 360);
  const out = new Float64Array(N);
  for (let n = 0; n < N; n++) out[(n + shift) % N] = shaped[n];
  return out;
}

// ---------- Small DSP blocks ----------

class OnePole {
  constructor(mode, cutoff, fs) { this.mode = mode; this.x1 = 0; this.y1 = 0; this.set(cutoff, fs); }
  set(cutoff, fs) {
    if (this.mode === 'allpass') {
      const t = Math.tan((Math.PI * cutoff) / fs), x = (t - 1) / (t + 1);
      this.b0 = x; this.b1 = 1; this.a1 = -x;
    } else { // highpass
      const x = Math.exp((-2 * Math.PI * cutoff) / fs);
      this.b0 = 0.5 * (1 + x); this.b1 = -0.5 * (1 + x); this.a1 = x;
    }
  }
  reset() { this.x1 = 0; this.y1 = 0; }
  tick(x) {
    this.y1 = this.b0 * x + this.b1 * this.x1 + this.a1 * this.y1 + TINY;
    this.x1 = x;
    return this.y1;
  }
}

class Biquad {
  constructor(mode, freq, fs, { gainDb = 0, bandwidth = 1 } = {}) {
    const w = (2 * Math.PI * freq) / fs, s = Math.sin(w), c = Math.cos(w);
    if (mode === 'lowpass12') {
      const alpha = s / (2 * dB2amp(gainDb)), scale = 1 / (1 + alpha);
      this.a1 = 2 * c * scale; this.a2 = (alpha - 1) * scale;
      this.b1 = (1 - c) * scale; this.b0 = 0.5 * this.b1; this.b2 = this.b0;
    } else { // bandreject
      const alpha = s * Math.sinh((0.5 * Math.log(2) * bandwidth * w) / s), scale = 1 / (1 + alpha);
      this.a1 = 2 * c * scale; this.a2 = (alpha - 1) * scale;
      this.b0 = scale; this.b1 = -2 * c * scale; this.b2 = scale;
    }
    this.reset();
  }
  reset() { this.x1 = this.x2 = this.y1 = this.y2 = 0; }
  tick(x) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 + this.a1 * this.y1 + this.a2 * this.y2 + TINY;
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y;
    return y;
  }
}

class Leaky { // RC lowpass with a time constant in ms
  constructor(tauMs, fs) { this.y1 = 0; this.fs = fs; this.setTau(tauMs); }
  setTau(tauMs) { this.coeff = tauMs > 0 ? Math.exp(-1 / (this.fs * 0.001 * tauMs)) : 0; }
  tick(x) { return (this.y1 = x + this.coeff * (this.y1 - x)); }
}

class DecayEnvelope {
  constructor(fs) { this.fs = fs; this.y = 1; this.setDecay(200); }
  setDecay(tauMs) { this.c = Math.exp(-1 / (0.001 * tauMs * this.fs)); this.yInit = 1 / this.c; }
  trigger() { this.y = this.yInit; }
  tick() { return (this.y *= this.c); }
}

class AmpEnvelope { // AnalogEnvelope with attack 0, sustain 0, as configured by Open303
  constructor(fs) {
    this.fs = fs; this.increment = 1000 / fs; this.time = 0; this.out = 0; this.noteIsOn = false;
    this.decayTime = 1230; this.decayCoeff = this.coeff(1230); this.setRelease(0.5);
  }
  coeff(ms) { return ms > 0 ? 1 - Math.exp(-1 / (this.fs * 0.001 * ms)) : 1; }
  setRelease(ms) { this.releaseTime = ms; this.releaseCoeff = this.coeff(ms); }
  noteOn() { this.time = 0; this.noteIsOn = true; }
  noteOff() { this.noteIsOn = false; this.time = this.decayTime + this.increment; }
  tick() {
    if (this.time <= 0) { this.out = 1; this.time += this.increment; } // attack 0: jump to peak
    else if (this.time <= this.decayTime || this.noteIsOn) {
      this.out += this.decayCoeff * (0 - this.out);
      if (this.time <= this.decayTime) this.time += this.increment;
    } else { this.out += this.releaseCoeff * (0 - this.out); this.time += this.increment; }
    return this.out;
  }
}

class TeeBeeFilter { // TB_303 mode
  constructor(fs) {
    this.fs = fs; this.cutoff = 1000; this.r = 0;
    this.feedbackHighpass = new OnePole('highpass', 150, fs);
    this.y1 = this.y2 = this.y3 = this.y4 = 0;
    this.calc();
  }
  setResonance(percent) {
    const raw = 0.01 * percent;
    this.r = (1 - Math.exp(-3 * raw)) / (1 - Math.exp(-3));
    this.calc();
  }
  setCutoff(hz) {
    const c = clip(hz, 200, 20000);
    if (c !== this.cutoff) { this.cutoff = c; this.calc(); }
  }
  calc() {
    const wc = (2 * Math.PI * this.cutoff) / this.fs;
    const fx = (wc * Math.SQRT1_2) / (2 * Math.PI);
    this.b0 = (0.00045522346 + 6.1922189 * fx) / (1 + 12.358354 * fx + 4.4156345 * (fx * fx));
    let k = fx * (fx * (fx * (fx * (fx * (fx + 7198.6997) - 5837.7917) - 476.47308) + 614.95611) + 213.87126) + 16.998792;
    let g = k * 0.058823529411764705;
    g = (g - 1) * this.r + 1;
    this.g = g * (1 + this.r);
    this.k = k * this.r;
  }
  reset() { this.feedbackHighpass.reset(); this.y1 = this.y2 = this.y3 = this.y4 = 0; }
  tick(x) {
    const b0 = this.b0;
    const y0 = x - this.feedbackHighpass.tick(this.k * this.y4);
    this.y1 += 2 * b0 * (y0 - this.y1 + this.y2);
    this.y2 += b0 * (this.y1 - 2 * this.y2 + this.y3);
    this.y3 += b0 * (this.y2 - 2 * this.y3 + this.y4);
    this.y4 += b0 * (this.y3 - 2 * this.y4);
    return 2 * this.g * this.y4;
  }
}

class Decimator { // 12th order elliptic quarter-band lowpass (Direct Form II)
  constructor() { this.w = new Float64Array(12); }
  reset() { this.w.fill(0); }
  tick(x) {
    const w = this.w;
    const tmp = x + TINY
      - (-9.1891604652189471 * w[0] + 40.177553696870497 * w[1] - 110.11636661771178 * w[2] + 210.18506612078195 * w[3])
      - (-293.8474477190324 * w[4] + 308.16345558359234 * w[5] - 244.06786780384243 * w[6] + 144.81877911392738 * w[7])
      - (-62.770692151724198 * w[8] + 18.867762095902137 * w[9] - 3.5327094230551848 * w[10] + 0.31183189275203149 * w[11]);
    const y = 0.00013671732099945628 * tmp
      + (-0.00055538501265606384 * w[0] + 0.0013681887636296387 * w[1] - 0.0022158566490711852 * w[2] + 0.0028320091007278322 * w[3])
      + (-0.0029776933151090413 * w[4] + 0.0030283628243514991 * w[5] - 0.0029776933151090413 * w[6] + 0.0028320091007278331 * w[7])
      + (-0.0022158566490711861 * w[8] + 0.0013681887636296393 * w[9] - 0.00055538501265606384 * w[10] + 0.00013671732099945636 * w[11]);
    w.copyWithin(1, 0, 11);
    w[0] = tmp;
    return y;
  }
}

// ---------- The voice ----------

const SAW_TABLES = mipMap(saw303());
const SQUARE_TABLES = mipMap(square303());

class Open303 {
  constructor(fs) {
    const os = fs * OVERSAMPLING;
    this.fs = fs;
    this.tuning = 440;
    this.cutoff = 1000; this.envMod = 25; this.accent = 0; this.blend = 0;
    this.normalDecay = 1000; this.accentDecay = 200;
    this.normalAmpRelease = 1; this.accentAmpRelease = 50;
    this.accentGain = 0; this.oscFreq = 440; this.phase = 0;
    this.notes = []; // held keys, most recent first
    this.idle = true;
    this.ampScaler = dB2amp(-12); // Open303's default level
    this.mainEnv = new DecayEnvelope(fs);
    this.ampEnv = new AmpEnvelope(fs);
    this.pitchSlew = new Leaky(0.2 * 60, fs); // 60 ms slide, as on the TB-303
    this.rc1 = new Leaky(0, fs);
    this.rc2 = new Leaky(15, fs);
    this.ampDeClicker = new Biquad('lowpass12', 200, fs, { gainDb: 20 * Math.log10(Math.SQRT1_2) });
    this.highpass1 = new OnePole('highpass', 44.486, os);
    this.highpass2 = new OnePole('highpass', 24.167, fs);
    this.allpass = new OnePole('allpass', 14.008, fs);
    this.notch = new Biquad('bandreject', 7.5164, fs, { bandwidth: 4.7 });
    this.filter = new TeeBeeFilter(os);
    this.decimator = new Decimator();
    this.osRate = os;
    this.updateEnvMod();
  }

  setCutoff(hz) { if (hz !== this.cutoff) { this.cutoff = hz; this.updateEnvMod(); } }
  setEnvMod(percent) { if (percent !== this.envMod) { this.envMod = percent; this.updateEnvMod(); } }
  updateEnvMod() { // measured mapping from the real TB-303
    const e = this.envMod / 100;
    const c = expToLin(clip(this.cutoff, 313.8152786059267, 2394.411986817546), 313.8152786059267, 2394.411986817546);
    const sLo = 3.773996325111173 * e + 0.736965594166206;
    const sHi = 4.194548788411135 * e + 0.864344900642434;
    this.envScaler = (1 - c) * sLo + c * sHi;
    this.envOffset = 0.048292930943553 * c + 0.294391201442418;
  }

  setNoteParams(accented) {
    this.accentGain = accented ? this.accent : 0;
    this.mainEnv.setDecay(accented ? this.accentDecay : this.normalDecay);
    this.ampEnv.setRelease(accented ? this.accentAmpRelease : this.normalAmpRelease);
  }

  noteOn(key, accented) {
    if (this.notes.length === 0) { // trigger
      if (this.idle) { // reset only when silent, to avoid clicks
        this.phase = 0;
        for (const f of [this.filter, this.highpass1, this.highpass2, this.allpass, this.notch, this.decimator, this.ampDeClicker]) f.reset();
      }
      this.setNoteParams(accented);
      this.oscFreq = pitchToFreq(key, this.tuning);
      this.pitchSlew.y1 = this.oscFreq;
      this.mainEnv.trigger();
      this.ampEnv.noteOn();
    } else { // slide: the previous note is still held
      this.oscFreq = pitchToFreq(key, this.tuning);
      this.setNoteParams(accented);
    }
    this.notes.unshift(key);
    this.idle = false;
  }

  noteOff(key) {
    const i = this.notes.lastIndexOf(key); // drop the oldest copy, so a slide onto the same note holds
    if (i >= 0) this.notes.splice(i, 1);
    if (this.notes.length === 0) this.ampEnv.noteOff();
    else this.oscFreq = pitchToFreq(this.notes[0], this.tuning); // slide back to the held note
  }

  allNotesOff() { this.notes = []; this.ampEnv.noteOff(); }

  tick() {
    if (this.idle) return 0;
    const freq = this.pitchSlew.tick(this.oscFreq);
    const increment = (TABLE_LENGTH * freq) / this.osRate;
    const tableIndex = clip(Math.floor(Math.log2(increment)) + 2, 0, NUM_TABLES - 1);
    const saw = SAW_TABLES[tableIndex], square = SQUARE_TABLES[tableIndex];

    const mainEnvOut = this.mainEnv.tick();
    let t1 = this.rc1.tick(mainEnvOut);
    let t2 = this.rc2.tick(this.accentGain > 0 ? mainEnvOut : 0);
    t1 = this.envScaler * (t1 - this.envOffset);
    t2 = this.accentGain * t2;
    this.filter.setCutoff(this.cutoff * 2 ** (t1 + t2));

    let amp = this.ampEnv.tick();
    if (this.ampEnv.noteIsOn) amp += 0.45 * mainEnvOut + this.accentGain * 4 * mainEnvOut;
    amp = this.ampDeClicker.tick(amp);

    let out = 0;
    for (let i = 0; i < OVERSAMPLING; i++) {
      while (this.phase >= TABLE_LENGTH) this.phase -= TABLE_LENGTH;
      const n = this.phase | 0, frac = this.phase - n;
      const s1 = saw[n] + frac * (saw[n + 1] - saw[n]);
      const s2 = square[n] + frac * (square[n + 1] - square[n]);
      this.phase += increment;
      let x = -((1 - this.blend) * s1 + this.blend * 0.5 * s2);
      x = this.highpass1.tick(x);
      x = this.filter.tick(x);
      out = this.decimator.tick(x);
    }
    out = this.notch.tick(this.highpass2.tick(this.allpass.tick(out)));
    out *= amp * this.ampScaler;
    // Go quiet once the note has fully died away; the next trigger then starts from a clean state.
    if (!this.ampEnv.noteIsOn && this.notes.length === 0 && Math.abs(amp) < 1e-6) this.idle = true;
    return out;
  }
}

// ---------- AudioWorklet wrapper ----------

// Knob values are 0..1 like the hardware panel; ranges match the Open303 plugin.
class Open303Processor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'cutoff', defaultValue: 0.3, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'resonance', defaultValue: 0.6, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'envMod', defaultValue: 0.5, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'decay', defaultValue: 0.3, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'accent', defaultValue: 0.6, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'waveform', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'tune', defaultValue: 0, minValue: -12, maxValue: 12, automationRate: 'k-rate' },
    ];
  }

  constructor(options) {
    super();
    this.voice = new Open303(sampleRate);
    this.lock = NO_LOCKS; // parameter locks of the note playing: they win over the knobs until the next note
    this.queue = (options.processorOptions?.events ?? []).slice().sort((a, b) => a.time - b.time);
    this.port.onmessage = ({ data }) => {
      if (data.type === 'events') {
        this.queue.push(...data.events);
        this.queue.sort((a, b) => a.time - b.time); // stable: same-time events keep their order
      } else if (data.type === 'stop') {
        this.queue = [];
        this.voice.allNotesOff();
      }
    };
  }

  applyParams(p) {
    const v = this.voice;
    const lock = this.lock;
    v.setCutoff(linToExp(lock.cutoff ?? p.cutoff[0], 314, 2394));
    v.filter.setResonance((lock.resonance ?? p.resonance[0]) * 100);
    v.setEnvMod((lock.envMod ?? p.envMod[0]) * 100);
    v.normalDecay = linToExp(lock.decay ?? p.decay[0], 200, 2000);
    v.accent = p.accent[0];
    v.blend = p.waveform[0];
    v.tuning = 440 * 2 ** (p.tune[0] / 12);
  }

  process(_inputs, outputs, params) {
    const out = outputs[0][0];
    this.applyParams(params);
    const blockStart = currentTime;
    let e = 0;
    for (let i = 0; i < out.length; i++) {
      const t = blockStart + i / sampleRate;
      while (e < this.queue.length && this.queue[e].time <= t) {
        const ev = this.queue[e++];
        if (ev.kind === 'on') {
          this.lock = ev.locks ?? NO_LOCKS;
          this.applyParams(params); // locks take effect on this very sample
          this.voice.noteOn(ev.key, ev.accent);
        } else this.voice.noteOff(ev.key);
      }
      out[i] = this.voice.tick();
    }
    if (e) this.queue.splice(0, e);
    for (let c = 1; c < outputs[0].length; c++) outputs[0][c].set(out);
    return true;
  }
}

registerProcessor('open303', Open303Processor);
