/* ------------------------------------------------------------------ *
 * Procedural audio. All music and sound effects are synthesised live
 * with the Web Audio API — no audio files, no licensing, adaptive music
 * that reacts to depth, danger and boss fights.
 * ------------------------------------------------------------------ */

const SCALES = {
  minor: [0, 2, 3, 5, 7, 8, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  hungarian: [0, 2, 3, 6, 7, 8, 11],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  locrian: [0, 1, 3, 5, 6, 8, 10],
};

// i–VI–III–VII style minor progressions, in scale degrees
const PROGRESSIONS = [
  [0, 5, 3, 4],
  [0, 3, 5, 4],
  [0, 4, 5, 3],
  [0, 2, 5, 6],
  [0, 6, 3, 4],
];

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

export class AudioEngine {
  constructor() {
    this.ready = false;
    this.muted = false;
    this.musicOn = false;
    this.ctx = null;
    this._timer = null;
    this._step = 0;
    this._nextTime = 0;
    this.depth = 1;
    this.boss = false;
    this.danger = 0;
    this.intensity = 0;
    this.rng = Math.random;
  }

  init() {
    if (this.ready) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(this.ctx.destination);

    // gentle bus compression keeps the mix from clipping
    this.comp = this.ctx.createDynamicsCompressor();
    this.comp.threshold.value = -16;
    this.comp.ratio.value = 6;
    this.comp.attack.value = 0.003;
    this.comp.release.value = 0.22;
    this.comp.connect(this.master);

    this.sfxBus = this.ctx.createGain();
    this.sfxBus.gain.value = 0.85;
    this.sfxBus.connect(this.comp);

    this.musicBus = this.ctx.createGain();
    this.musicBus.gain.value = 0.0;
    this.musicBus.connect(this.comp);

    // shared reverb (small procedural impulse)
    this.verb = this.ctx.createConvolver();
    this.verb.buffer = this._impulse(1.6, 2.6);
    this.verbGain = this.ctx.createGain();
    this.verbGain.gain.value = 0.3;
    this.verb.connect(this.verbGain);
    this.verbGain.connect(this.comp);

    this.noiseBuf = this._noise(2);
    this.ready = true;
  }

  resume() {
    if (!this.ready) this.init();
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  _impulse(dur, decay) {
    const rate = this.ctx.sampleRate;
    const len = Math.floor(rate * dur);
    const buf = this.ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  }

  _noise(dur) {
    const rate = this.ctx.sampleRate;
    const len = Math.floor(rate * dur);
    const buf = this.ctx.createBuffer(1, len, rate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  get t() {
    return this.ctx.currentTime;
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.9;
  }

  /* ------------------------- SFX ------------------------- */

  _env(node, t0, a, d, peak, dest) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
    node.connect(g);
    g.connect(dest || this.sfxBus);
    return g;
  }

  tone(freq, dur, type = 'square', peak = 0.25, opts = {}) {
    if (!this.ready || this.muted) return;
    const t0 = this.t + (opts.delay || 0);
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (opts.glide) o.frequency.exponentialRampToValueAtTime(Math.max(20, opts.glide), t0 + dur);
    const g = this._env(o, t0, opts.attack || 0.005, dur, peak, opts.bus || this.sfxBus);
    if (opts.verb) g.connect(this.verb);
    o.start(t0);
    o.stop(t0 + dur + 0.1);
  }

  noiseHit(dur, peak = 0.3, filterHz = 2400, opts = {}) {
    if (!this.ready || this.muted) return;
    const t0 = this.t + (opts.delay || 0);
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = opts.filterType || 'bandpass';
    f.frequency.setValueAtTime(filterHz, t0);
    if (opts.filterGlide) f.frequency.exponentialRampToValueAtTime(opts.filterGlide, t0 + dur);
    f.Q.value = opts.q || 1;
    src.connect(f);
    const g = this._env(f, t0, 0.004, dur, peak, opts.bus || this.sfxBus);
    if (opts.verb) g.connect(this.verb);
    src.start(t0);
    src.stop(t0 + dur + 0.1);
  }

  sfx(name) {
    if (!this.ready || this.muted) return;
    const R = () => Math.random() * 100 - 50;
    switch (name) {
      case 'eat':
        this.tone(520 + Math.random() * 90, 0.09, 'square', 0.2, { glide: 900 });
        break;
      case 'grow':
        this.tone(300, 0.16, 'triangle', 0.24, { glide: 720, delay: 0.02 });
        this.noiseHit(0.12, 0.1, 900);
        break;
      case 'chomp':
        this.noiseHit(0.13, 0.32, 700, { filterGlide: 260 });
        this.tone(150, 0.14, 'sawtooth', 0.18, { glide: 70 });
        break;
      case 'bite':
        this.tone(220, 0.2, 'sawtooth', 0.2, { glide: 90 });
        this.noiseHit(0.18, 0.22, 500, { filterGlide: 180 });
        break;
      case 'hurt':
        this.tone(180, 0.28, 'sawtooth', 0.3, { glide: 70 });
        this.noiseHit(0.22, 0.18, 1200, { filterGlide: 300 });
        break;
      case 'dash':
        this.noiseHit(0.26, 0.2, 400, { filterGlide: 4200, filterType: 'bandpass', q: 3 });
        break;
      case 'pickup':
        this.tone(880, 0.08, 'triangle', 0.2);
        this.tone(1320, 0.1, 'triangle', 0.16, { delay: 0.07 });
        break;
      case 'xp':
        this.tone(1200 + R() * 200, 0.06, 'sine', 0.12);
        break;
      case 'level':
        [0, 4, 7, 12].forEach((n, i) =>
          this.tone(midi(64 + n), 0.3, 'square', 0.16, { delay: i * 0.08, verb: true })
        );
        break;
      case 'relic':
        [0, 7, 12, 16, 19].forEach((n, i) =>
          this.tone(midi(60 + n), 0.5, 'triangle', 0.14, { delay: i * 0.1, verb: true })
        );
        break;
      case 'portal':
        this.tone(180, 0.7, 'sine', 0.22, { glide: 1400, verb: true });
        this.noiseHit(0.6, 0.12, 600, { filterGlide: 4000, verb: true });
        break;
      case 'descend':
        this.tone(700, 0.5, 'sine', 0.2, { glide: 120, verb: true });
        break;
      case 'shoot':
        this.tone(700, 0.12, 'sawtooth', 0.13, { glide: 260 });
        break;
      case 'explode':
        this.noiseHit(0.5, 0.4, 900, { filterGlide: 90, filterType: 'lowpass' });
        this.tone(90, 0.45, 'square', 0.2, { glide: 40 });
        break;
      case 'die':
        this.tone(330, 0.9, 'sawtooth', 0.26, { glide: 55, verb: true });
        this.noiseHit(0.8, 0.2, 1600, { filterGlide: 120, verb: true });
        break;
      case 'boss':
        this.tone(70, 1.1, 'sawtooth', 0.3, { glide: 130, verb: true });
        this.noiseHit(1.0, 0.18, 300, { filterGlide: 1800, verb: true });
        break;
      case 'ui':
        this.tone(660, 0.05, 'square', 0.1);
        break;
      case 'uiok':
        this.tone(520, 0.07, 'square', 0.12);
        this.tone(780, 0.09, 'square', 0.1, { delay: 0.06 });
        break;
      case 'deny':
        this.tone(180, 0.14, 'square', 0.14, { glide: 120 });
        break;
      default:
        break;
    }
  }

  /* ------------------------- generative music ------------------------- */

  configure({ depth, boss, danger }) {
    this.depth = depth || 1;
    this.boss = !!boss;
    this.danger = danger || 0;
    if (!this.running) this.startMusic();
  }

  startMusic() {
    if (!this.ready || this.running) return;
    this.running = true;
    const scaleKeys = Object.keys(SCALES);
    this.scaleName = scaleKeys[(this.depth - 1) % scaleKeys.length];
    this.scale = SCALES[this.scaleName];
    this.prog = PROGRESSIONS[(this.depth - 1) % PROGRESSIONS.length];
    this.root = 45 + ((this.depth - 1) % 3) * 2; // bass register root
    this.bpm = this.boss ? 148 : 104 + Math.min(30, this.depth * 2.2) + this.danger * 8;
    this._step = 0;
    this._nextTime = this.t + 0.1;
    this.musicBus.gain.cancelScheduledValues(this.t);
    this.musicBus.gain.setValueAtTime(0.0001, this.t);
    this.musicBus.gain.linearRampToValueAtTime(this.boss ? 0.5 : 0.38, this.t + 1.6);
    this._timer = setInterval(() => this._schedule(), 25);
  }

  stopMusic(fade = 0.5) {
    if (!this.running) return;
    const t = this.t;
    this.musicBus.gain.cancelScheduledValues(t);
    this.musicBus.gain.setValueAtTime(this.musicBus.gain.value, t);
    this.musicBus.gain.linearRampToValueAtTime(0.0001, t + fade);
    clearInterval(this._timer);
    this._timer = null;
    this.running = false;
  }

  _scaleNote(deg, oct = 0) {
    const s = this.scale;
    const n = s.length;
    const idx = ((deg % n) + n) % n;
    const wrap = Math.floor(deg / n);
    return this.root + s[idx] + 12 * (oct + wrap);
  }

  _schedule() {
    if (!this.running) return;
    const spb = 60 / this.bpm / 4; // 16th note
    while (this._nextTime < this.t + 0.12) {
      this._playStep(this._step, this._nextTime, spb);
      this._nextTime += spb;
      this._step = (this._step + 1) % 64;
    }
  }

  _playStep(step, time, spb) {
    const s16 = step % 16;
    const bar = Math.floor(step / 16) % 4;
    const chordDeg = this.prog[bar];
    const boss = this.boss;
    const M = this.musicBus;
    const N = (d, o = 0) => midi(this._scaleNote(d, o));

    // --- drums
    if (s16 === 0 || s16 === 8 || (boss && s16 === 14)) {
      // kick
      const o = this.ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(150, time);
      o.frequency.exponentialRampToValueAtTime(42, time + 0.11);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.9, time);
      g.gain.exponentialRampToValueAtTime(0.001, time + 0.18);
      o.connect(g); g.connect(M);
      o.start(time); o.stop(time + 0.22);
    }
    if (s16 === 4 || s16 === 12) {
      // snare
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      const f = this.ctx.createBiquadFilter();
      f.type = 'highpass';
      f.frequency.value = 1500;
      src.connect(f);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.34, time);
      g.gain.exponentialRampToValueAtTime(0.001, time + 0.16);
      f.connect(g); g.connect(M);
      const gs = this.ctx.createGain(); gs.gain.value = 0.18; g.connect(gs); gs.connect(this.verb);
      src.start(time); src.stop(time + 0.2);
    }
    // hats
    if (s16 % 2 === 1 || (boss && s16 % 4 === 2)) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      const f = this.ctx.createBiquadFilter();
      f.type = 'highpass';
      f.frequency.value = 7000;
      src.connect(f);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.075, time);
      g.gain.exponentialRampToValueAtTime(0.001, time + 0.045);
      f.connect(g); g.connect(M);
      src.start(time); src.stop(time + 0.06);
    }

    // --- bass
    const bassPattern = boss
      ? [0, null, 0, null, 0, 0, null, 0, 0, null, 0, 0, null, 0, 0, null]
      : [0, null, null, 0, null, null, 0, null, 0, null, null, 0, null, 0, null, null];
    if (bassPattern[s16] !== null) {
      const o = this.ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = N(chordDeg, -1);
      const flt = this.ctx.createBiquadFilter();
      flt.type = 'lowpass';
      flt.frequency.setValueAtTime(700 + (boss ? 900 : 300), time);
      flt.frequency.exponentialRampToValueAtTime(180, time + spb * 2.4);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, time);
      g.gain.exponentialRampToValueAtTime(0.3, time + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, time + spb * 2.2);
      o.connect(flt); flt.connect(g); g.connect(M);
      o.start(time); o.stop(time + spb * 3);
    }

    // --- arp / lead
    const arpSeq = boss
      ? [0, 2, 4, 6, 4, 2, 0, 2]
      : [0, 4, 2, 6, 4, 0, 2, 4];
    if (s16 % 2 === 0) {
      const deg = chordDeg + arpSeq[(step / 2) % arpSeq.length | 0];
      const o = this.ctx.createOscillator();
      o.type = boss ? 'sawtooth' : 'triangle';
      o.frequency.value = N(deg, 1);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, time);
      g.gain.exponentialRampToValueAtTime(0.13, time + 0.008);
      g.gain.exponentialRampToValueAtTime(0.001, time + spb * 1.6);
      o.connect(g); g.connect(M);
      const gs = this.ctx.createGain(); gs.gain.value = 0.35; g.connect(gs); gs.connect(this.verb);
      o.start(time); o.stop(time + spb * 2);
    }

    // --- pad on bar starts
    if (s16 === 0) {
      [0, 2, 4].forEach((iv) => {
        const o = this.ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(N(chordDeg + iv, 0), time);
        o.detune.value = (iv - 2) * 6;
        const flt = this.ctx.createBiquadFilter();
        flt.type = 'lowpass';
        flt.frequency.setValueAtTime(500, time);
        flt.frequency.linearRampToValueAtTime(1400, time + spb * 8);
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.0001, time);
        g.gain.linearRampToValueAtTime(0.055, time + spb * 4);
        g.gain.linearRampToValueAtTime(0.0001, time + spb * 15.5);
        o.connect(flt); flt.connect(g); g.connect(M);
        const gs = this.ctx.createGain(); gs.gain.value = 0.6; g.connect(gs); gs.connect(this.verb);
        o.start(time); o.stop(time + spb * 16);
      });
    }
  }
}

export const audio = new AudioEngine();
