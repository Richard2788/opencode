/* Som sintetizado com Web Audio — sem arquivos externos */
window.Sound = (function () {
  let ctx = null;
  let master = null;
  let enabled = true;

  function ensure() {
    if (!enabled) return null;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!ctx) {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.55;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone({ freq = 440, dur = 0.1, type = 'sine', vol = 0.2, delay = 0, end = 0 }) {
    const c = ensure();
    if (!c) return;
    const t = c.currentTime + delay;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (end) osc.frequency.exponentialRampToValueAtTime(Math.max(30, end), t + dur);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.03);
  }

  function noise({ dur = 0.18, vol = 0.15, delay = 0, from = 1800, to = 300 }) {
    const c = ensure();
    if (!c) return;
    const t = c.currentTime + delay;
    const frames = Math.max(1, Math.floor(c.sampleRate * dur));
    const buffer = c.createBuffer(1, frames, c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
    }
    const src = c.createBufferSource();
    src.buffer = buffer;
    const filter = c.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(from, t);
    filter.frequency.exponentialRampToValueAtTime(to, t + dur);
    filter.Q.value = 0.9;
    const gain = c.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  const api = {
    setEnabled(value) {
      enabled = Boolean(value);
      if (!enabled && ctx) {
        ctx.suspend().catch(() => {});
      } else if (enabled) {
        ensure();
      }
    },
    unlock() {
      ensure();
    },
    beat(accent) {
      tone({ freq: accent ? 98 : 130, end: 52, dur: 0.18, type: 'sine', vol: accent ? 0.3 : 0.2 });
      tone({ freq: 1300, dur: 0.03, type: 'square', vol: 0.03 });
    },
    tick() {
      tone({ freq: 880, dur: 0.05, type: 'triangle', vol: 0.08 });
    },
    success(combo) {
      const base = 650 + Math.min(combo || 0, 8) * 45;
      tone({ freq: base, dur: 0.09, type: 'triangle', vol: 0.16 });
      tone({ freq: base * 1.5, dur: 0.12, type: 'triangle', vol: 0.12, delay: 0.055 });
    },
    error() {
      tone({ freq: 190, end: 90, dur: 0.22, type: 'sawtooth', vol: 0.11 });
    },
    swipe() {
      noise({ dur: 0.22, vol: 0.16, from: 2400, to: 260 });
      tone({ freq: 320, end: 520, dur: 0.16, type: 'sine', vol: 0.1 });
    },
    hint() {
      tone({ freq: 520, dur: 0.08, type: 'triangle', vol: 0.1 });
      tone({ freq: 700, dur: 0.1, type: 'triangle', vol: 0.09, delay: 0.08 });
    },
    count(go) {
      if (go) {
        tone({ freq: 660, dur: 0.18, type: 'triangle', vol: 0.18 });
        tone({ freq: 990, dur: 0.22, type: 'triangle', vol: 0.14, delay: 0.1 });
      } else {
        tone({ freq: 440, dur: 0.1, type: 'triangle', vol: 0.14 });
      }
    },
    fanfare(stars) {
      const notes = stars >= 3 ? [523, 659, 784, 1046] : stars === 2 ? [523, 659, 784] : [440, 554];
      notes.forEach((freq, i) => {
        tone({ freq, dur: 0.2, type: 'triangle', vol: 0.15, delay: i * 0.11 });
      });
      if (stars >= 3) noise({ dur: 0.5, vol: 0.06, from: 3200, to: 800, delay: 0.15 });
    },
    pop() {
      tone({ freq: 300, end: 600, dur: 0.1, type: 'sine', vol: 0.12 });
    }
  };

  return api;
})();
