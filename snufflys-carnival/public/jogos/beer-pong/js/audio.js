/**
 * Tiny synthesized sound engine — no audio files, works offline.
 */
export class AudioEngine {
  constructor(store) {
    this.store = store;
    this.enabled = Boolean(store.settings.sound);
    this.ctx = null;
    this.master = null;
    this.noiseBuffer = null;
  }

  unlock() {
    if (!this.enabled) return;
    try {
      if (!this.ctx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        this.ctx = new AudioCtx();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.5;
        this.master.connect(this.ctx.destination);
        this.noiseBuffer = this._makeNoise();
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
    } catch {
      this.ctx = null;
    }
  }

  setEnabled(value) {
    this.enabled = Boolean(value);
    this.store.settings.sound = this.enabled;
    if (this.enabled) this.unlock();
    if (this.master) {
      this.master.gain.setTargetAtTime(this.enabled ? 0.5 : 0, this.ctx.currentTime, 0.02);
    }
  }

  _makeNoise() {
    const length = Math.floor(this.ctx.sampleRate * 1.5);
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i += 1) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = white * 0.7 + last * 3;
    }
    return buffer;
  }

  _tone(freq, options = {}) {
    if (!this.ctx || !this.enabled) return;
    const {
      type = 'sine',
      dur = 0.2,
      gain = 0.15,
      delay = 0,
      slideTo = null,
    } = options;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const amp = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, freq), t0);
    if (slideTo) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    }
    amp.gain.setValueAtTime(0.0001, t0);
    amp.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t0 + 0.012);
    amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(amp);
    amp.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  }

  _noise(options = {}) {
    if (!this.ctx || !this.enabled) return;
    const {
      dur = 0.2,
      gain = 0.12,
      type = 'bandpass',
      freq = 900,
      q = 1.2,
      slideTo = null,
      delay = 0,
    } = options;
    const t0 = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(Math.max(40, freq), t0);
    filter.Q.value = q;
    if (slideTo) {
      filter.frequency.exponentialRampToValueAtTime(Math.max(40, slideTo), t0 + dur);
    }
    const amp = this.ctx.createGain();
    amp.gain.setValueAtTime(0.0001, t0);
    amp.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t0 + 0.015);
    amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter);
    filter.connect(amp);
    amp.connect(this.master);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  play(name) {
    if (!this.enabled) return;
    if (!this.ctx) this.unlock();
    if (!this.ctx) return;

    switch (name) {
      case 'ui':
        this._tone(640, { type: 'sine', dur: 0.06, gain: 0.07 });
        break;

      case 'throw':
        this._noise({ dur: 0.24, gain: 0.1, type: 'bandpass', freq: 420, slideTo: 1500, q: 1.6 });
        break;

      case 'bounce':
        this._tone(190, { type: 'triangle', dur: 0.11, gain: 0.14, slideTo: 105 });
        this._noise({ dur: 0.05, gain: 0.05, type: 'lowpass', freq: 1100 });
        break;

      case 'rim':
        this._tone(1520, { type: 'sine', dur: 0.16, gain: 0.09, slideTo: 1180 });
        this._tone(2100, { type: 'sine', dur: 0.1, gain: 0.05, delay: 0.02 });
        this._noise({ dur: 0.08, gain: 0.04, type: 'highpass', freq: 2400 });
        break;

      case 'splash':
        this._noise({ dur: 0.34, gain: 0.18, type: 'lowpass', freq: 2600, slideTo: 600 });
        this._tone(170, { type: 'sine', dur: 0.26, gain: 0.16, slideTo: 58 });
        this._tone(880, { type: 'triangle', dur: 0.12, gain: 0.06, delay: 0.02, slideTo: 420 });
        break;

      case 'turn':
        this._tone(480, { type: 'sine', dur: 0.09, gain: 0.07 });
        this._tone(660, { type: 'sine', dur: 0.11, gain: 0.07, delay: 0.1 });
        break;

      case 'ballback':
        [660, 880, 1100].forEach((f, i) => {
          this._tone(f, { type: 'triangle', dur: 0.12, gain: 0.09, delay: i * 0.08 });
        });
        break;

      case 'win':
        [523, 659, 784, 1047].forEach((f, i) => {
          this._tone(f, { type: 'triangle', dur: 0.4, gain: 0.13, delay: i * 0.1 });
          this._tone(f / 2, { type: 'sine', dur: 0.4, gain: 0.06, delay: i * 0.1 });
        });
        break;

      case 'lose':
        [392, 330, 262].forEach((f, i) => {
          this._tone(f, { type: 'sawtooth', dur: 0.34, gain: 0.06, delay: i * 0.14 });
        });
        break;

      case 'refill':
        [440, 587, 880].forEach((f, i) => {
          this._tone(f, { type: 'sine', dur: 0.16, gain: 0.07, delay: i * 0.07 });
        });
        break;

      default:
        break;
    }
  }
}
