import { PHYS, MAX_PARTICLES } from './config.js';

const TAU = Math.PI * 2;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const rand = (min, max) => min + Math.random() * (max - min);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];

function mulberry32(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.particles = [];
    this.rings = [];
    this.floaters = [];
    this.shake = 0;
    this.time = 0;
    this.flashAlpha = 0; // flash branco no acerto
    this.zoom = 0; // zoom dramático (slow-mo)
    this.timeScale = 1; // 1 = normal, <1 = slow-mo
    this.slowHold = 0; // segundos (tempo REAL) restantes de slow-mo garantido
    this.slowHoldScale = 0.35;
    this.heat = 0; // vinheta de streak (0..1)
    this.fever = false; // modo EXTREME FEVER (último copo)
    this.fpsAvg = 60; // média deslizante de FPS (guard anti-crash)
    this.lowPerf = false;
    this.dprCap = null; // engrenagem de qualidade (lowPerf → 1.5)
    this.rainbowCache = null;
    this.cupSprites = new Map(); // sprite cache por raio (cupinho em offscreen)
    this.spawnTasks = []; // spawns escalonados (anti-hitch)
    this.feverT = 0; // tempo do banner de fever
    this.feverFail = 0; // tint de derrota dramática
    this.feverResult = ''; // '' | 'win' | 'lose'
    this.cam = { x: -1, y: -1, zoom: 0 }; // câmera; zoom 0 = centrado normal
    this.camFollow = false; // perseguição da bola no fever-throw
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.W = 390;
    this.H = 760;
    this.dpr = 1;
    this.resize();
    window.addEventListener('resize', () => this.resize());
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', () => this.resize());
    }
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const W = Math.max(300, rect.width || window.innerWidth);
    const H = Math.max(420, rect.height || window.innerHeight);
    if (Math.abs(W - this.W) < 1 && Math.abs(H - this.H) < 1 && this.bg) return;

    this.W = W;
    this.H = H;
    // engrenage de qualidade: lowPerf pode derrubar o DPR (fpsAvg no render)
    this.dpr = Math.min(window.devicePixelRatio || 1, this.dprCap || 2);
    this.canvas.width = Math.round(W * this.dpr);
    this.canvas.height = Math.round(H * this.dpr);
    this.computeLayout();
    this.buildBackground();
    this.buildTable();
    this.cupSprites.clear();
    this.rainbowCache = null;
    this.cam = { x: -1, y: -1, zoom: 0 };
  }

  /* recria o backbuffer e os caches em offscreen com o DPR atual */
  downscaleToDpr() {
    this.dpr = Math.min(window.devicePixelRatio || 1, this.dprCap || 2);
    this.canvas.width = Math.round(this.W * this.dpr);
    this.canvas.height = Math.round(this.H * this.dpr);
    this.buildBackground();
    this.buildTable();
    this.buildSpotlights();
    this.cupSprites.clear();
    this.rainbowCache = null;
    this.heatGradKey = null;
    this.failGradKey = null;
    this.bannerGradKey = null;
  }

  computeLayout() {
    const { W, H } = this;
    const compact = H < 640;
    const topSpace = compact ? 92 : 112;
    const yFar = Math.max(topSpace + 34, H * 0.285);
    const yNear = H - (compact ? 8 : 14);
    const depth = yNear - yFar;
    const halfNear = Math.min(W * 0.47, depth * 0.5, 340);
    const halfFar = halfNear * 0.6;

    this.cx = W / 2;
    this.yNear = yNear;
    this.yFar = yFar;
    this.depth = depth;
    this.halfNear = halfNear;
    this.halfFar = halfFar;
  }

  project(x, z) {
    const y = lerp(this.yNear, this.yFar, z);
    const hw = lerp(this.halfNear, this.halfFar, z);
    return { x: this.cx + x * hw, y, hw };
  }

  unproject(sx, sy) {
    const z = clamp((this.yNear - sy) / this.depth, 0, 1);
    const hw = lerp(this.halfNear, this.halfFar, z);
    return { x: (sx - this.cx) / hw, z, hw };
  }

  halfWAt(z) {
    return lerp(this.halfNear, this.halfFar, clamp(z, 0, 1));
  }

  cupScreen(cup) {
    const p = this.project(cup.x, cup.z);
    const rx = (PHYS.CUP_TOP / PHYS.XU_M) * p.hw;
    return { x: p.x, y: p.y, rx, ry: rx * 0.36, hw: p.hw };
  }

  /* =========================================================
     Background (pre-rendered)
     ========================================================= */

  buildBackground() {
    const { W, H, dpr } = this;
    const bg = document.createElement('canvas');
    bg.width = Math.round(W * dpr);
    bg.height = Math.round(H * dpr);
    const g = bg.getContext('2d');
    g.scale(dpr, dpr);

    const base = g.createLinearGradient(0, 0, 0, H);
    base.addColorStop(0, '#fff8f0');
    base.addColorStop(0.45, '#ffe9d8');
    base.addColorStop(1, '#fdd9b8');
    g.fillStyle = base;
    g.fillRect(0, 0, W, H);

    const glowPink = g.createRadialGradient(W * 0.1, H * 0.02, 0, W * 0.1, H * 0.02, W * 0.85);
    glowPink.addColorStop(0, 'rgba(229, 57, 53, 0.16)');
    glowPink.addColorStop(0.5, 'rgba(183, 28, 28, 0.06)');
    glowPink.addColorStop(1, 'rgba(0, 0, 0, 0)');
    g.fillStyle = glowPink;
    g.fillRect(0, 0, W, H * 0.75);

    const glowCyan = g.createRadialGradient(W * 0.94, H * 0.08, 0, W * 0.94, H * 0.08, W * 0.7);
    glowCyan.addColorStop(0, 'rgba(255, 214, 0, 0.18)');
    glowCyan.addColorStop(1, 'rgba(0, 0, 0, 0)');
    g.fillStyle = glowCyan;
    g.fillRect(0, 0, W, H * 0.6);

    // Confetes estáticos (bokeh de festa)
    const rng = mulberry32(20261030);
    for (let i = 0; i < 16; i += 1) {
      const x = rng() * W;
      const y = rng() * (H * 0.55);
      const r = 2 + rng() * 8;
      const colors = ['229, 57, 53', '255, 214, 0', '183, 28, 28', '255, 255, 255'];
      g.save();
      g.globalAlpha = 0.1 + rng() * 0.18;
      g.fillStyle = `rgb(${colors[(rng() * colors.length) | 0]})`;
      g.shadowColor = g.fillStyle;
      g.shadowBlur = 18 + rng() * 20;
      g.beginPath();
      g.arc(x, y, r, 0, TAU);
      g.fill();
      g.restore();
    }

    // Back wall band + neon strip behind the table
    const wallY = Math.max(0, this.yFar - 74);
    const wall = g.createLinearGradient(0, wallY, 0, this.yFar + 40);
    wall.addColorStop(0, 'rgba(255, 232, 208, 0)');
    wall.addColorStop(0.6, 'rgba(240, 200, 168, 0.5)');
    wall.addColorStop(1, 'rgba(255, 240, 222, 0.1)');
    g.fillStyle = wall;
    g.fillRect(0, wallY, W, 120);

    const strip = g.createLinearGradient(W * 0.18, 0, W * 0.82, 0);
    strip.addColorStop(0, 'rgba(229, 57, 53, 0)');
    strip.addColorStop(0.28, 'rgba(229, 57, 53, 0.7)');
    strip.addColorStop(0.52, 'rgba(255, 214, 0, 0.9)');
    strip.addColorStop(0.76, 'rgba(183, 28, 28, 0.65)');
    strip.addColorStop(1, 'rgba(183, 28, 28, 0)');
    g.save();
    g.strokeStyle = strip;
    g.lineWidth = 2.5;
    g.shadowColor = 'rgba(255, 160, 60, 0.55)';
    g.shadowBlur = 20;
    g.beginPath();
    g.moveTo(W * 0.14, this.yFar - 42);
    g.lineTo(W * 0.86, this.yFar - 42);
    g.stroke();
    g.restore();

    // Floor glow under the table
    const floor = g.createRadialGradient(W / 2, H * 0.92, 0, W / 2, H * 0.92, W * 0.7);
    floor.addColorStop(0, 'rgba(183, 28, 28, 0.14)');
    floor.addColorStop(1, 'rgba(0, 0, 0, 0)');
    g.fillStyle = floor;
    g.fillRect(0, H * 0.6, W, H * 0.4);

    this.bg = bg;
  }

  flash(strength = 0.5) {
    if (!this.reducedMotion) this.flashAlpha = strength;
  }

  slowMo(scale = 0.35, hold = 0) {
    if (!this.reducedMotion) {
      this.timeScale = scale;
      this.zoom = 1;
      this.slowHold = hold;
      this.slowHoldScale = scale;
    }
  }

  setHeat(v) {
    this.heat = this.reducedMotion ? 0 : clamp(v, 0, 1);
  }

  /* reset total de câmera e estados dramáticos (nova partida / menu) */
  resetStates() {
    this.cam = { x: -1, y: -1, zoom: 0 };
    this.camFollow = false;
    this.fever = false;
    this.feverResult = '';
    this.feverFail = 0;
    this.feverT = 0;
    this.timeScale = 1;
    this.slowHold = 0;
    this.zoom = 0;
    this.heat = 0;
    this.shake = 0;
  }

  /* =========================================================
     EXTREME FEVER (Peggle-style)
     ========================================================= */

  startFever() {
    if (this.reducedMotion) return;
    this.fever = true;
    this.feverResult = '';
    this.feverFail = 0;
    this.timeScale = 0.25;
    this.zoom = 1;
    this.heat = 1;
  }

  endFever(win, pt) {
    if (!this.fever) return;
    this.fever = false;
    if (win) {
      this.feverResult = 'win';
      this.feverT = 0;
      this.flash(0.65);
      this.confetti();
      if (!this.reducedMotion && pt) this.goldRain(pt);
      if (pt) this.starBurst(pt);
      this.shake = this.reducedMotion ? 0 : 16;
    } else {
      this.feverResult = 'lose';
      this.feverT = 0;
      this.feverFail = 1;
      this.timeScale = 0.4;
      if (!this.reducedMotion) this.shake = 7;
    }
  }

  /* chuva dourada derrapando em direção ao copo final */
  goldRain(pt) {
    this.queueGen(() => {
      this.particles.push({
        x: rand(0, this.W),
        y: rand(-this.H * 0.4, -10),
        vx: rand(-70, 70),
        vy: rand(140, 340),
        g: 340,
        drag: 0.998,
        t: 0,
        life: rand(1.4, 2.6),
        size: rand(2, 6),
        color: pick(['#ffd600', '#f2a900', '#fff0a8', '#ffffff']),
        shape: 'rect',
        spin: rand(-12, 12),
        rot: rand(0, TAU),
      });
    }, 45, 15);
  }

  /* estrelas de carnaval: saem de dentro do copo no fecho do EXTREME FEVER
     (15–20 por disparo) — trail degradê arco-íris + giro, estilo Peggle */
  /* Spawns escalonados: nada de 170 partículas num frame só (anti-hitch) */
  queueGen(gen, count, per) {
    this.spawnTasks.push({ gen, left: count, per });
  }

  drainSpawns() {
    for (let i = this.spawnTasks.length - 1; i >= 0; i -= 1) {
      const task = this.spawnTasks[i];
      const n = Math.min(task.per, task.left);
      for (let k = 0; k < n; k += 1) task.gen();
      task.left -= n;
      if (task.left <= 0) this.spawnTasks.splice(i, 1);
    }
  }

  starBurst(pt) {
    const rx = pt.rx || 24;
    const ry = pt.ry || 8;
    const count = 15 + ((Math.random() * 6) | 0);
    const bigTarget = Math.ceil(count * 0.4);
    this.queueGen(() => {
      const idx = Math.floor(rand(0, count)); // determina grandeza só na amostra
      const big = idx < bigTarget;
      const ang = -Math.PI * rand(0.05, 0.95);
      this.particles.push({
        x: pt.x + rand(-rx * 0.6, rx * 0.6),
        y: pt.y + rand(-ry * 0.5, 0),
        vx: Math.cos(ang) * rand(60, 150),
        vy: Math.sin(ang) * rand(150, 320),
        g: 300,
        drag: 0.995,
        t: 0,
        life: rand(1.1, 2.2),
        size: big ? rand(9, 15) : rand(4.5, 8),
        color: '#ffd600',
        hue: rand(0, 360),
        shape: 'star',
        trail: [],
        spin: rand(-14, 14),
        rot: rand(0, TAU),
        starDelay: big ? 0 : rand(0, 0.25),
      });
    }, count, 8);
  }

  /* raios elétricos nas laterais, estilo Peggle */
  addBolt() {
    if (this.reducedMotion) return;
    const side = this.boltSide ? 1 : 0;
    this.boltSide = !this.boltSide;
    const x0 = side ? this.W : 0;
    const pts = [];
    let x = x0;
    let y = rand(this.H * 0.2, this.H * 0.35);
    for (let i = 0; i < 6; i += 1) {
      pts.push({ x, y });
      x += ((this.W * 0.55) / 6) * (side ? -1 : 1) + rand(-14, 14);
      y += rand(30, 70);
    }
    this.rings.push({ bolt: pts, t: 0, life: 0.22, color: '255, 240, 140', hueCycle: this.fever });
  }

  /* ===== roda arco-íris pré-renderizada (luz do buraco no EXTREME FEVER) ===== */
  buildFeverWheel() {
    const size = 256;
    const cv = document.createElement('canvas');
    cv.width = size;
    cv.height = size;
    const g = cv.getContext('2d');
    const c = size / 2;
    const wedges = 40;
    for (let i = 0; i < wedges; i += 1) {
      const a0 = (i / wedges) * TAU;
      const a1 = ((i + 1) / wedges) * TAU;
      g.beginPath();
      g.moveTo(c, c);
      g.arc(c, c, c, a0, a1);
      g.closePath();
      g.fillStyle = `hsl(${Math.round((i / wedges) * 360)}, 100%, 58%)`;
      g.fill();
    }
    // furo central: vira anel (o buraco do copo continua visível)
    g.globalCompositeOperation = 'destination-out';
    g.beginPath();
    g.arc(c, c, c * 0.55, 0, TAU);
    g.fill();
    // amacia o contorno do anel (fade das bordas)
    for (const [rc, alpha] of [[c * 0.92, 0.3], [c * 0.96, 0.5]]) {
      g.lineWidth = 4;
      g.strokeStyle = `rgba(0, 0, 0, ${alpha})`;
      g.beginPath();
      g.arc(c, c, rc, 0, TAU);
      g.stroke();
    }
    this.feverWheel = cv;
  }

  /** Luz arco-íris GIRANDO E BRILHANDO na boca do último copo (2 drawImage/frame). */
  drawFeverCupLight(game) {
    if (!this.fever || this.lowPerf || !game.feverCup) return;
    if (!this.feverWheel) this.buildFeverWheel();
    const ctx = this.ctx;
    const cs = this.cupScreen(game.feverCup);
    const spinSpeed = this.reducedMotion ? 0.4 : 2.5;
    const pulse = 0.62 + 0.3 * Math.sin(this.time * 7);
    const r = cs.rx * 2.3;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    // glow radial pulsante por baixo (disco branco-quente)
    if (!this.feverGlow) {
      const cv = document.createElement('canvas');
      cv.width = 128;
      cv.height = 128;
      const g = cv.getContext('2d');
      const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      gr.addColorStop(0, 'rgba(255, 255, 255, 0.85)');
      gr.addColorStop(0.4, 'rgba(255, 240, 170, 0.4)');
      gr.addColorStop(1, 'rgba(255, 255, 255, 0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, 128, 128);
      this.feverGlow = cv;
    }
    const gr2 = cs.rx * 3.4;
    ctx.globalAlpha = pulse * 0.55;
    ctx.drawImage(this.feverGlow, cs.x - gr2, cs.y - gr2, gr2 * 2, gr2 * 2);

    // roda arco-íris girando sobre a boca
    ctx.globalAlpha = pulse * 0.9;
    ctx.translate(cs.x, cs.y);
    ctx.rotate(this.time * spinSpeed);
    ctx.drawImage(this.feverWheel, -r, -r, r * 2, r * 2);
    ctx.restore();

    // anel arco-íris expandindo a cada ~0.5s (pool de rings, custo ~0)
    if (!this.reducedMotion && this.time - (this.feverRingT || 0) > 0.5) {
      this.feverRingT = this.time;
      this.rings.push({
        x: cs.x,
        y: cs.y,
        t: 0,
        life: 0.8,
        r0: cs.rx,
        r1: cs.rx * 7,
        color: '255, 214, 0',
        hueCycle: true,
      });
    }
  }

  /* =========================================================
     Main render
     ========================================================= */

  render(game, dt) {
    this.time += dt;

    // guard de performance: média deslizante de FPS (anti-crash)
    if (dt > 0) {
      const fps = 1 / dt;
      this.fpsAvg = this.fpsAvg + (fps - this.fpsAvg) * 0.06;
      // histerese: desliga qualidade abaixo de 45fps, volta acima de 56
      if (this.fpsAvg < 45) this.lowPerf = true;
      else if (this.fpsAvg > 56 && this.lowPerf) {
        this.lowPerf = false;
        this.rainbowCache = null; // regenera optando pela alta qualidade
      }
      // engrenagem de resolução: <40fps sustentados → DPR 1.5 (rebuild sprites)
      if (this.fpsAvg < 40 && this.dprCap !== 1.5) {
        this.dprCap = 1.5;
        this.downscaleToDpr();
      } else if (this.fpsAvg > 55 && this.dprCap === 1.5 && this.lowPerf === false) {
        this.dprCap = null; // volta ao DPR nativo (≤2)
        this.downscaleToDpr();
      }
    }

    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    // === câmera com follow (EXTREME FEVER throw) ===
    let camTarget = { x: this.cx, y: this.H / 2, zoom: 1 };
    if (this.camFollow && !this.reducedMotion) {
      const b = game.ball && game.ball.visible ? this.project(game.ball.x, game.ball.z) : null;
      const cupP = game.feverCup ? this.cupScreen(game.feverCup) : null;
      let fx;
      let fy;
      if (b) {
        fx = cupP ? b.x * 0.68 + cupP.x * 0.32 : b.x;
        fy = cupP ? b.y * 0.68 + (cupP.y + cupP.rx * 0.6) * 0.32 : b.y;
      } else if (cupP) {
        fx = cupP.x;
        fy = cupP.y + cupP.rx;
      } else {
        fx = this.cx;
        fy = (this.yFar + this.yNear) / 2;
      }
      const zoom = 2.2;
      camTarget = {
        x: clamp(fx, this.W / (zoom * 2) + 6, this.W - this.W / (zoom * 2) - 6),
        y: clamp(fy, this.H / (zoom * 2), this.H - this.H / (zoom * 2)),
        zoom,
      };
    }
    if (this.cam.zoom === 0) {
      this.cam = { x: camTarget.x, y: camTarget.y, zoom: 1 };
    }
    const camEase = this.camFollow ? Math.min(1, dt * 4.5) : Math.min(1, dt * 3.5);
    this.cam.x += (camTarget.x - this.cam.x) * camEase;
    this.cam.y += (camTarget.y - this.cam.y) * camEase;
    this.cam.zoom += (camTarget.zoom - this.cam.zoom) * camEase;
    if (this.cam.zoom > 1.001) {
      ctx.translate(this.W / 2, this.H / 2);
      ctx.scale(this.cam.zoom, this.cam.zoom);
      ctx.translate(-this.cam.x, -this.cam.y);
    }

    // zoom dramático (câmera aproxima no slow-mo)
    if (this.zoom > 0.001) {
      this.zoom = Math.max(0, this.zoom - dt * 2.2);
      const z = 1 + 0.045 * Math.sin(Math.min(1, this.zoom) * Math.PI);
      ctx.translate(this.W / 2, this.H / 2);
      ctx.scale(z, z);
      ctx.translate(-this.W / 2, -this.H / 2);
    }

    if (this.shake > 0.2 && !this.reducedMotion) {
      const s = this.shake;
      ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
      this.shake = Math.max(0, this.shake - dt * 55);
    } else {
      this.shake = 0;
    }

    if (this.bg) {
      ctx.drawImage(this.bg, 0, 0, this.W, this.H);
    } else {
      ctx.fillStyle = '#fff8f0';
      ctx.fillRect(0, 0, this.W, this.H);
    }

    this.drawTable(game);
    this.drawSpotlights(dt);
    this.drawCups(game, dt);
    this.drawFeverCupLight(game);
    this.drawBall(game);
    this.drawAim(game);
    this.updateEffects(dt);
    this.drawEffects();
    this.drawOverlays(dt);
  }

  /* =========================================================
     Spotlights girando no fundo (luz de festa)
     ========================================================= */

  /* sprite de spotlight pré-renderizado (antes: 2 gradientes radiais
     full-canvas por frame) */
  buildSpotlights() {
    const size = 256;
    for (const [name, col] of [['spotRed', '229, 57, 53'], ['spotGold', '255, 214, 0']]) {
      const cv = document.createElement('canvas');
      cv.width = size;
      cv.height = size;
      const g = cv.getContext('2d');
      const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      grad.addColorStop(0, `rgba(${col}, 0.10)`);
      grad.addColorStop(0.5, `rgba(${col}, 0.035)`);
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, size, size);
      this[name] = cv;
    }
  }

  drawSpotlights(dt) {
    // desenhados depois da mesa para dar vida; são suaves e giram devagar
    if (!this.bg || this.reducedMotion || this.lowPerf) return;
    if (!this.spotRed) this.buildSpotlights();
    const ctx = this.ctx;
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    for (let i = 0; i < 2; i += 1) {
      const ang = this.time * (0.5 + i * 0.23) + i * Math.PI;
      const px = this.cx + Math.sin(ang) * this.W * 0.36;
      const py = this.yFar - 30 + Math.cos(ang * 1.3) * 24;
      const r = this.W * (0.5 + i * 0.1);
      const sprite = i === 0 ? this.spotRed : this.spotGold;
      ctx.drawImage(sprite, px - r, py - r, r * 2, r * 2);
    }
    ctx.restore();
  }

  /* =========================================================
     Overlays: flash, vinheta de streak
     ========================================================= */

  drawOverlays(dt) {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    if (this.heat > 0.01) {
      const pulse = 0.55 + 0.45 * Math.sin(this.time * 4.2);
      // alpha quantizado em 32 passos: gradiente fica em cache (sem alloc/frame)
      const a = this.heat * (0.12 + 0.12 * pulse);
      const key = Math.max(1, Math.round(a * 32));
      const aq = key / 32;
      if (this.heatGradKey !== key) {
        const g = ctx.createRadialGradient(
          this.W / 2,
          this.H / 2,
          Math.min(this.W, this.H) * 0.32,
          this.W / 2,
          this.H / 2,
          Math.max(this.W, this.H) * 0.72
        );
        g.addColorStop(0, 'rgba(255, 214, 0, 0)');
        g.addColorStop(0.75, `rgba(255, 214, 0, ${aq.toFixed(4)})`);
        g.addColorStop(1, `rgba(229, 57, 53, ${(aq * 1.3).toFixed(4)})`);
        this.heatGrad = g;
        this.heatGradKey = key;
      }
      ctx.fillStyle = this.heatGrad;
      ctx.fillRect(0, 0, this.W, this.H);
    }

    if (this.flashAlpha > 0.005) {
      ctx.fillStyle = `rgba(255, 255, 255, ${this.flashAlpha.toFixed(3)})`;
      ctx.fillRect(0, 0, this.W, this.H);
      this.flashAlpha = Math.max(0, this.flashAlpha - dt * 2.6);
    } else {
      this.flashAlpha = 0;
    }

    // tint dramático da FALHA no fever (gradiente em cache por bucket)
    if (this.feverFail > 0.005) {
      ctx.fillStyle = `rgba(183, 28, 28, ${(this.feverFail * 0.16).toFixed(3)})`;
      ctx.fillRect(0, 0, this.W, this.H);
      const failKey = Math.round(this.feverFail * 12);
      if (this.failGradKey !== failKey) {
        const g2 = ctx.createRadialGradient(
          this.W / 2,
          this.H / 2,
          Math.min(this.W, this.H) * 0.3,
          this.W / 2,
          this.H / 2,
          Math.max(this.W, this.H) * 0.7
        );
        g2.addColorStop(0, 'rgba(0,0,0,0)');
        g2.addColorStop(1, `rgba(127, 16, 16, ${(12 / 12 * 0.4).toFixed(4)})`);
        this.failGrad = g2;
        this.failGradKey = failKey;
      }
      if (this.failGrad) {
        // alpha dinâmico por camada global (gradiente fixo no máximo)
        ctx.save();
        ctx.globalAlpha = 0.05 + this.feverFail * 0.95;
        ctx.fillStyle = this.failGrad;
        ctx.fillRect(0, 0, this.W, this.H);
        ctx.restore();
      }
    }

    // painéis de luz ARCO-ÍRIS nas bordas (Peggle SUPER FEVER) durante o fever
    if (this.fever) {
      this.drawFeverRainbow(this.feverT);
    }

    // banner EXTREME FEVER / FESTA TOTAL / QUASE!
    if (this.fever || this.feverResult) {
      const isLose = this.feverResult === 'lose';
      const isWin = this.feverResult === 'win';
      const banner = isLose ? 'QUASE!' : isWin ? 'FESTA TOTAL!' : 'EXTREME FEVER!';
      const life = isLose ? 1.2 : isWin ? 2.2 : -1; // -1 = enquanto durar o fever
      const tt = this.feverT;
      if (life < 0 || tt < life) {
        const pop = Math.min(1, tt * 5);
        const scale =
          (isWin ? 2.4 : 1.9) -
          (1 - pop) * 0.9 +
          (isWin || isLose ? Math.sin(tt * 5) * 0.03 : Math.sin(tt * 8) * 0.04);
        const alpha = life < 0 ? 1 : tt > life - 0.35 ? (life - tt) / 0.35 : 1;
        const ty = this.H * 0.24 + Math.sin(tt * 6) * 5;
        ctx.save();
        ctx.globalAlpha = clamp(alpha, 0, 1);
        ctx.translate(this.W / 2, ty);
        ctx.scale(scale * 0.62, scale * 0.62);
        ctx.font = '900 46px "Trebuchet MS", "Segoe UI", system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 9;
        ctx.strokeStyle = 'rgba(42, 20, 20, 0.85)';
        ctx.strokeText(banner, 0, 0);
        // gradiente ARCO-ÍRIS vibrante animado (matiz girando) — em cache
        // por bucket de 100ms em vez de por frame
        const bKey = `${isLose ? 'L' : 'F'}${Math.round(this.time * 10)}`;
        if (this.bannerGradKey !== bKey) {
          this.bannerGradKey = bKey;
          if (!isLose) {
            const bg = ctx.createLinearGradient(-190, -26, 190, 26);
            const hueShift = this.time * 140;
            for (let s = 0; s <= 6; s += 1) {
              bg.addColorStop(s / 6, `hsl(${(hueShift + s * 60) % 360}, 100%, 60%)`);
            }
            this.bannerGrad = bg;
          } else {
            const bg = ctx.createLinearGradient(0, -26, 0, 26);
            bg.addColorStop(0, '#b71c1c');
            bg.addColorStop(0.5, '#e53935');
            bg.addColorStop(1, '#7f1010');
            this.bannerGrad = bg;
          }
        }
        ctx.fillStyle = this.bannerGrad;
        ctx.fillText(banner, 0, 0);
        ctx.restore();
        // raios elétricos durante o fever
        if (!isWin && !isLose && Math.random() < 0.12) this.addBolt();
      } else if (!this.fever) {
        this.feverResult = '';
      }
    }
  }

  /* painéis de luz arco-íris animados nas bordas + overlay em onda,
     estilo Peggle SUPER FEVER (mais vibrante) */
  /* painéis de luz arco-íris nas bordas, estilo Peggle SUPER FEVER.
     Custo controlado: gradientes cacheados e regenerados a cada ~100ms
     (não por frame); sem overlay full-canvas. */
  drawFeverRainbow(tt) {
    if (this.fpsAvg < 45) return; // guard: sem painéis em queda de FPS
    const ctx = this.ctx;
    const BUCKET = 0.1; // s

    // regenera gradientes apenas 1x por bucket de 100ms
    if (!this.rainbowCache || this.time - this.rainbowCache.at > BUCKET) {
      const hue0 = this.time * 180;
      const bands = 6;
      const build = (side) => {
        const edgeX = side ? this.W : 0;
        const g = ctx.createLinearGradient(edgeX, 0, side ? this.W * 0.84 : this.W * 0.16, 0);
        for (let s = 0; s <= bands; s += 1) {
          const hue = (hue0 + s * 60 + (side ? 30 : 0)) % 360;
          g.addColorStop(s / bands, `hsla(${hue}, 100%, 62%, 0.5)`);
        }
        g.addColorStop(1, 'rgba(255, 255, 255, 0)');
        return g;
      };
      const sc = ctx.createLinearGradient(0, -60, 0, 60);
      sc.addColorStop(0, 'rgba(255, 255, 255, 0)');
      sc.addColorStop(0.5, 'hsla(54, 100%, 80%, 0.45)');
      sc.addColorStop(1, 'rgba(255, 255, 255, 0)');
      this.rainbowCache = { at: this.time, left: build(0), right: build(1), strike: sc };
    }

    // alpha respirando altera só globalAlpha (grátis), não o gradiente
    const breathe = 0.6 + Math.sin(tt * 9) * 0.3;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = breathe;
    ctx.fillStyle = this.rainbowCache.left;
    ctx.fillRect(0, 0, this.W * 0.16, this.H);
    ctx.fillStyle = this.rainbowCache.right;
    ctx.fillRect(this.W * 0.84, 0, this.W * 0.16, this.H);
    // strike de luz compartilhado: posição ondulante por translate
    ctx.globalAlpha = breathe * 0.8;
    const strikeY = this.H * 0.5 + Math.sin(tt * 5.2) * this.H * 0.3;
    ctx.translate(0, strikeY);
    ctx.fillStyle = this.rainbowCache.strike;
    ctx.fillRect(0, 0, this.W * 0.16, 120);
    ctx.fillRect(this.W * 0.84, 0, this.W * 0.16, 120);
    ctx.restore();
  }

  /* =========================================================
     Table
     ========================================================= */

  /* Pre-render da mesa NUMA VEZ por resize (era o hotspot nº 1: blur + shadow
     + ~7 gradientes por frame). No frame, drawTable = 1 drawImage. */
  buildTable() {
    const { cx, yNear, yFar, halfNear, halfFar, W, H, dpr } = this;
    const cv = document.createElement('canvas');
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
    const ctx = cv.getContext('2d');
    ctx.scale(dpr, dpr);

    // sombra no chão: pintada em camadas (SEM ctx.filter — blur de FILTER
    // roda no CPU e era o maior custo do jogo)
    ctx.save();
    ctx.fillStyle = 'rgba(127, 16, 16, 0.10)';
    ctx.beginPath();
    ctx.ellipse(cx, yNear + 12, halfNear * 1.14, 32, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(127, 16, 16, 0.14)';
    ctx.beginPath();
    ctx.ellipse(cx, yNear + 12, halfNear * 1.08, 28, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(127, 16, 16, 0.14)';
    ctx.beginPath();
    ctx.ellipse(cx, yNear + 12, halfNear * 1.02, 24, 0, 0, TAU);
    ctx.fill();
    ctx.restore();

    const tablePath = new Path2D();
    tablePath.moveTo(cx - halfNear, yNear);
    tablePath.lineTo(cx + halfNear, yNear);
    tablePath.lineTo(cx + halfFar, yFar);
    tablePath.lineTo(cx - halfFar, yFar);
    tablePath.closePath();

    const wood = ctx.createLinearGradient(0, yFar, 0, yNear);
    wood.addColorStop(0, '#2a1a13');
    wood.addColorStop(0.4, '#4a2a1c');
    wood.addColorStop(0.78, '#633720');
    wood.addColorStop(1, '#714026');
    ctx.save();
    ctx.fillStyle = wood;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
    ctx.shadowBlur = 26;
    ctx.shadowOffsetY = 8;
    ctx.fill(tablePath);
    ctx.restore();

    // subtle sheen
    ctx.save();
    ctx.clip(tablePath);
    const sheen = ctx.createLinearGradient(cx - halfNear, yFar, cx + halfNear, yNear);
    sheen.addColorStop(0, 'rgba(255, 210, 160, 0.05)');
    sheen.addColorStop(0.4, 'rgba(255, 255, 255, 0)');
    sheen.addColorStop(0.75, 'rgba(255, 190, 120, 0.045)');
    sheen.addColorStop(1, 'rgba(0, 0, 0, 0.12)');
    ctx.fillStyle = sheen;
    ctx.fillRect(cx - halfNear, yFar, halfNear * 2, yNear - yFar);

    // grain lines
    for (let i = 1; i < 18; i += 1) {
      const t = i / 18;
      const y = lerp(yFar, yNear, t);
      const hw = lerp(halfFar, halfNear, t);
      ctx.strokeStyle = i % 2 === 0 ? 'rgba(0, 0, 0, 0.11)' : 'rgba(255, 205, 150, 0.035)';
      ctx.lineWidth = i % 2 === 0 ? 1.4 : 1;
      ctx.beginPath();
      ctx.moveTo(cx - hw, y);
      ctx.lineTo(cx + hw, y);
      ctx.stroke();
    }

    // perspective planks
    for (const px of [-0.55, 0.55]) {
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(cx + px * halfNear, yNear);
      ctx.lineTo(cx + px * halfFar, yFar);
      ctx.stroke();
    }

    // center line + circle
    ctx.strokeStyle = 'rgba(255, 235, 210, 0.055)';
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 12]);
    ctx.beginPath();
    ctx.moveTo(cx, yNear - 8);
    ctx.lineTo(cx, yFar + 8);
    ctx.stroke();
    ctx.setLineDash([]);

    const cz = 0.53;
    const cy = lerp(yNear, yFar, cz);
    const chw = lerp(halfNear, halfFar, cz);
    ctx.strokeStyle = 'rgba(255, 235, 210, 0.05)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.ellipse(cx, cy, chw * 0.3, chw * 0.3 * 0.34, 0, 0, TAU);
    ctx.stroke();

    // logo on the wood
    const lz = 0.64;
    const ly = lerp(yNear, yFar, lz);
    const lhw = lerp(halfNear, halfFar, lz);
    ctx.save();
    ctx.translate(cx, ly);
    ctx.scale(1, 0.42);
    ctx.font = `900 ${Math.round(lhw * 0.2)}px "Trebuchet MS", "Segoe UI", system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(160, 60, 20, 0.1)';
    ctx.letterSpacing = '3px';
    ctx.fillText("SNUFFLY'S CARNIVAL", 0, 0);
    ctx.restore();

    ctx.restore();

    // rails
    ctx.save();
    const rail = ctx.createLinearGradient(0, yFar, 0, yNear);
    rail.addColorStop(0, '#7a4a30');
    rail.addColorStop(0.5, '#96603c');
    rail.addColorStop(1, '#a96c43');
    ctx.strokeStyle = rail;
    ctx.lineWidth = 9;
    ctx.lineJoin = 'round';
    ctx.stroke(tablePath);
    ctx.strokeStyle = 'rgba(255, 220, 180, 0.22)';
    ctx.lineWidth = 1.4;
    ctx.stroke(tablePath);
    ctx.restore();

    // far edge neon (fita de fita-metrica carnaval)
    ctx.save();
    const neon = ctx.createLinearGradient(cx - halfFar, 0, cx + halfFar, 0);
    neon.addColorStop(0, 'rgba(255, 214, 0, 0)');
    neon.addColorStop(0.35, 'rgba(255, 214, 0, 0.7)');
    neon.addColorStop(0.65, 'rgba(229, 57, 53, 0.7)');
    neon.addColorStop(1, 'rgba(229, 57, 53, 0)');
    ctx.strokeStyle = neon;
    ctx.lineWidth = 2.5;
    ctx.shadowColor = 'rgba(255, 150, 0, 0.5)';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.moveTo(cx - halfFar, yFar);
    ctx.lineTo(cx + halfFar, yFar);
    ctx.stroke();
    ctx.restore();

    // vignette at the near edge
    const edge = ctx.createLinearGradient(0, yNear - 40, 0, yNear + 10);
    edge.addColorStop(0, 'rgba(0, 0, 0, 0)');
    edge.addColorStop(1, 'rgba(190, 60, 40, 0.24)');
    ctx.fillStyle = edge;
    ctx.fillRect(0, yNear - 40, W, 50);

    this.tableCanvas = cv;
  }

  drawTable(game) {
    const ctx = this.ctx;
    if (this.tableCanvas) {
      ctx.drawImage(this.tableCanvas, 0, 0, this.W, this.H);
    } else {
      this.buildTable();
      ctx.drawImage(this.tableCanvas, 0, 0, this.W, this.H);
    }

    // decorative ball resting on the table when idle / aiming
    if (['menu', 'over', 'aim', 'cpu-aim'].includes(game.phase)) {
      const p = this.project(0.02, 0.115);
      const bob = this.reducedMotion ? 0 : Math.sin(this.time * 1.8) * 2.4;
      this.ctx.save();
      this.ctx.globalAlpha = 0.28;
      this.ctx.fillStyle = 'rgba(127, 16, 16, 0.9)';
      this.ctx.beginPath();
      this.ctx.ellipse(p.x, p.y + 1, 9, 3, 0, 0, TAU);
      this.ctx.fill();
      this.ctx.restore();
      this.drawBallSprite(p.x, p.y - 10 + bob, 9, false);
    }
  }

  /* =========================================================
     Cups — vazios, com inclinação real e tombamento animado
     ========================================================= */

  drawCups(game, dt) {
    const cups = game.rack || [];
    // desenha do fundo para a frente (profundidade); caídos por último
    const sorted = [...cups].sort(
      (a, b) => (a.state === 'down') - (b.state === 'down') || b.z - a.z
    );
    for (const cup of sorted) {
      if (cup.state === 'hit') {
        cup.anim = Math.min(1, (cup.anim || 0) + dt * 2.4);
        if (cup.anim >= 1) continue;
      }
      this.drawCup(cup);
    }
  }

  drawCup(cup) {
    const ctx = this.ctx;
    const p = this.cupScreen(cup);
    const { rx, ry } = p;
    const bodyH = rx * 1.42;
    const down = cup.state === 'down';

    // sombra no chão (vinho translúcido, coerente com fundo creme)
    ctx.save();
    ctx.fillStyle = 'rgba(127, 16, 16, 0.25)';
    if (down) {
      const spread = 1 + (cup.fallT || 0) * 1.6;
      ctx.beginPath();
      ctx.ellipse(
        p.x + (cup.fallDir || 1) * rx * 0.9 * (cup.fallT || 0),
        p.y + bodyH * 0.72,
        rx * spread,
        ry * 1.25,
        0,
        0,
        TAU
      );
    } else {
      ctx.beginPath();
      ctx.ellipse(p.x + rx * 0.16, p.y + bodyH * 0.86, rx * 1.02, ry * 1.25, 0, 0, TAU);
    }
    ctx.fill();
    ctx.restore();

    if (down) {
      // copo tombando: rotação em torno da base + encurtamento de perspectiva
      const t = Math.min(1, cup.fallT || 0);
      const ease = 1 - (1 - t) * (1 - t);
      const angle = (cup.fallDir || 1) * (Math.PI / 2) * ease;
      const squash = lerp(1, 0.55, ease);
      ctx.save();
      ctx.translate(p.x, p.y + bodyH * 0.8);
      ctx.rotate(angle);
      ctx.scale(1, squash);
      const s = this.cupSprite(rx, ry, bodyH);
      ctx.drawImage(s.canvas, -s.ox, -bodyH - s.oy, s.w, s.h);
      ctx.restore();
      return;
    }

    const hit = cup.state === 'hit';
    const t = hit ? cup.anim || 0 : 0;
    const alpha = hit ? 1 - t * t : 1;
    const sink = hit ? t * t * 34 : 0;
    const wobble = cup.wobble ? Math.sin(this.time * 30) * cup.wobble * 2.6 : 0;
    const tilt = (cup.tilt || 0) * 0.85 + (hit ? Math.sin(t * Math.PI) * 0.24 : 0);

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(p.x + wobble, p.y + sink);
    ctx.rotate(tilt);
    const s = this.cupSprite(rx, ry, bodyH);
    ctx.drawImage(s.canvas, -s.ox, -s.oy, s.w, s.h);
    ctx.restore();
  }

  /* Sprite do copo VAZIO pré-renderizado por raio (antes: 2 gradientes +
     5 paths por copo, por frame). Origem do sprite = centro da boca. */
  cupSprite(rx, ry, bodyH) {
    // bucket sempre PARA CIMA (nunca menor que o raio real) — evita aro cortado
    const bucket = Math.max(8, Math.ceil(rx * 2) / 2);
    let s = this.cupSprites.get(bucket);
    if (s) return s;

    const rb = bucket;
    const rr = rb * 0.36;
    const bh = rb * 1.42;
    const pad = 6;
    const w = Math.ceil(rb * 2 + pad * 2);
    const oy = Math.ceil(rr + pad);   // espaço TOTAL acima da boca: aro ±ry
    const bot = Math.ceil(bh + rr * 1.9 + pad);
    const h = oy + bot;
    const ox = w / 2;   // centro da boca dentro do sprite

    const cv = document.createElement('canvas');
    cv.width = Math.round(w * this.dpr);
    cv.height = Math.round(h * this.dpr);
    const ctx = cv.getContext('2d');
    ctx.scale(this.dpr, this.dpr);
    this.paintCupBody(ctx, ox, oy, rb, rr, bh);

    s = { canvas: cv, w, h, ox, oy, key: bucket };
    this.cupSprites.set(bucket, s);
    // sem clear por tamanho: buckets são poucos e discretos; o cache só
    // evapora em resize/DPR-gear (evitar thrash justo no pico do fever)
    return s;
  }

  paintCupBody(ctx, x, y, rx, ry, bodyH) {
    // corpo (tronco de cone)
    const body = new Path2D();
    body.moveTo(x - rx, y);
    body.bezierCurveTo(
      x - rx * 0.98,
      y + bodyH * 0.5,
      x - rx * 0.8,
      y + bodyH * 0.82,
      x - rx * 0.72,
      y + bodyH
    );
    body.quadraticCurveTo(x, y + bodyH + ry * 1.5, x + rx * 0.72, y + bodyH);
    body.bezierCurveTo(x + rx * 0.8, y + bodyH * 0.82, x + rx * 0.98, y + bodyH * 0.5, x + rx, y);
    body.closePath();

    const bodyGrad = ctx.createLinearGradient(x - rx, y, x + rx, y + bodyH);
    bodyGrad.addColorStop(0, '#f97a6d');
    bodyGrad.addColorStop(0.22, '#ea4a44');
    bodyGrad.addColorStop(0.62, '#e53935');
    bodyGrad.addColorStop(0.9, '#b71c1c');
    bodyGrad.addColorStop(1, '#7f1010');
    ctx.fillStyle = bodyGrad;
    ctx.fill(body);

    // brilho e ranhuras do plástico
    ctx.save();
    ctx.clip(body);
    const gloss = ctx.createLinearGradient(x - rx, 0, x - rx * 0.15, 0);
    gloss.addColorStop(0, 'rgba(255, 255, 255, 0.24)');
    gloss.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = gloss;
    ctx.fillRect(x - rx, y, rx * 0.8, bodyH + ry * 2);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    for (let i = 1; i <= 2; i += 1) {
      const yy = y + bodyH * (0.3 + i * 0.22);
      ctx.beginPath();
      ctx.moveTo(x - rx * 0.92, yy);
      ctx.lineTo(x + rx * 0.92, yy);
      ctx.stroke();
    }
    ctx.restore();

    // interior VAZIO: parede interna + fundo sombreado (tons quentes)
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
    ctx.fillStyle = '#a3272a';
    ctx.fill();

    const inner = ctx.createRadialGradient(x, y + ry * 0.5, ry * 0.12, x, y + ry * 0.14, rx * 0.92);
    inner.addColorStop(0, 'rgba(105, 18, 20, 0.92)');
    inner.addColorStop(0.55, 'rgba(140, 28, 28, 0.85)');
    inner.addColorStop(1, 'rgba(183, 28, 28, 0.7)');
    ctx.beginPath();
    ctx.ellipse(x, y + ry * 0.12, rx * 0.86, ry * 0.74, 0, 0, TAU);
    ctx.fillStyle = inner;
    ctx.fill();

    // fundo do copo vazio, lá no fundo do cone
    ctx.beginPath();
    ctx.ellipse(x, y + ry * 0.52, rx * 0.42, ry * 0.24, 0, 0, TAU);
    ctx.fillStyle = 'rgba(80, 10, 12, 0.6)';
    ctx.fill();

    // borda (rim) amarela de festa
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
    ctx.strokeStyle = '#ffe14d';
    ctx.lineWidth = Math.max(1.6, rx * 0.13);
    ctx.stroke();

    ctx.beginPath();
    ctx.ellipse(x, y + 0.6, rx * 0.98, ry * 0.98, 0, Math.PI * 0.15, Math.PI * 0.85);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  /* =========================================================
     Ball
     ========================================================= */

  drawBallSprite(x, y, r, onFire, spin = 0) {
    const ctx = this.ctx;
    ctx.save();
    if (onFire) {
      ctx.shadowColor = 'rgba(255, 154, 61, 0.9)';
      ctx.shadowBlur = 22;
    }
    const grad = ctx.createRadialGradient(x - r * 0.38, y - r * 0.42, r * 0.08, x, y, r);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.55, '#f6f2e6');
    grad.addColorStop(0.86, '#d8d1bd');
    grad.addColorStop(1, '#b2a992');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
    // contorno ink para contraste no fundo creme
    ctx.strokeStyle = 'rgba(42, 20, 20, 0.45)';
    ctx.lineWidth = Math.max(0.8, r * 0.12);
    ctx.stroke();
    ctx.restore();

    // costura da bola girando (espin)
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(spin % TAU);
    ctx.strokeStyle = 'rgba(150, 140, 120, 0.55)';
    ctx.lineWidth = Math.max(0.8, r * 0.09);
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.94, r * 0.34, 0, 0, TAU);
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.beginPath();
    ctx.ellipse(x - r * 0.32, y - r * 0.36, r * 0.24, r * 0.18, -0.6, 0, TAU);
    ctx.fill();
  }

  drawBall(game) {
    const ball = game.ball;
    if (!ball.visible) return;
    const ctx = this.ctx;
    const p = this.project(ball.x, ball.z);
    // escala isométrica: px por metro derivado da perspectiva da mesa
    const pxPerM = p.hw / PHYS.XU_M;
    const r = Math.max(4, PHYS.BALL_RADIUS * pxPerM);
    const sy = p.y - (ball.h || 0) * pxPerM;
    const shadowScale = clamp(1 - (ball.h || 0) / 0.45, 0.35, 1);

    // shadow
    ctx.save();
    ctx.globalAlpha = 0.3 * shadowScale;
    ctx.fillStyle = 'rgba(127, 16, 16, 0.9)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, r * 1.05 * shadowScale, r * 0.34 * shadowScale, 0, 0, TAU);
    ctx.fill();
    ctx.restore();

    // trail
    if (ball.trail && ball.trail.length) {
      for (let i = 0; i < ball.trail.length; i += 1) {
        const t = ball.trail[i];
        const tp = this.project(t.x, t.z);
        const a = (i / ball.trail.length) * (this.fever ? 0.55 : 0.24);
        ctx.globalAlpha = a;
        // trail ARCO-ÍRIS no EXTREME FEVER: cada ponto com matiz ciclada
        if (this.fever) {
          ctx.fillStyle = `hsl(${(this.time * 220 + i * 45) % 360}, 100%, 62%)`;
        } else {
          ctx.fillStyle = '#fff6df';
        }
        ctx.beginPath();
        ctx.arc(
          tp.x,
          tp.y - t.h * (tp.hw / PHYS.XU_M),
          r * (0.35 + (i / ball.trail.length) * 0.5),
          0,
          TAU
        );
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    this.drawBallSprite(p.x, sy, r, Boolean(ball.fire || this.fever), ball.spin || 0);
  }

  /* =========================================================
     Aim
     ========================================================= */

  drawAim(game) {
    const aim = game.aim;
    if (!aim || !aim.active) return;
    const ctx = this.ctx;
    const target = this.project(aim.x, aim.z);
    const cpu = game.mode === 'cpu' && game.turn === 1;
    const accent = cpu ? '183, 28, 28' : '255, 214, 0';

    // trajetória prevista (simulada pela MESMA física do arremesso)
    ctx.save();
    const pts = game.previewPoints || [];
    for (let i = 0; i < pts.length; i += 1) {
      const t = pts[i];
      const pp = this.project(t.x, t.z);
      const hpx = t.h * (pp.hw / PHYS.XU_M);
      const prog = i / Math.max(1, pts.length - 1);
      ctx.globalAlpha = 0.12 + prog * 0.55;
      ctx.fillStyle = `rgba(${accent}, 0.95)`;
      ctx.beginPath();
      ctx.arc(pp.x, pp.y - hpx, 1.3 + prog * 1.9, 0, TAU);
      ctx.fill();
    }
    ctx.restore();

    // tether to finger
    if (aim.sx && aim.sy) {
      ctx.save();
      ctx.strokeStyle = `rgba(${accent}, 0.22)`;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 6]);
      ctx.beginPath();
      ctx.moveTo(aim.sx, aim.sy);
      ctx.lineTo(target.x, target.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(aim.sx, aim.sy, 20, 0, TAU);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.fill();
      ctx.restore();
    }

    // reticle
    const pulse = this.reducedMotion ? 0 : Math.sin(this.time * 5) * 2;
    ctx.save();
    ctx.translate(target.x, target.y);
    ctx.shadowColor = `rgba(${accent}, 0.7)`;
    ctx.shadowBlur = 16;

    ctx.strokeStyle = `rgba(${accent}, 0.95)`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 17 + pulse, 0, TAU);
    ctx.stroke();

    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.arc(0, 0, 25 + pulse * 1.5, 0, TAU);
    ctx.stroke();

    ctx.globalAlpha = 1;
    ctx.lineWidth = 2;
    for (const [x1, y1, x2, y2] of [
      [-30, 0, -21, 0],
      [21, 0, 30, 0],
      [0, -30, 0, -21],
      [0, 21, 0, 30],
    ]) {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }

    ctx.fillStyle = `rgba(${accent}, 1)`;
    ctx.beginPath();
    ctx.arc(0, 0, 3.4, 0, TAU);
    ctx.fill();
    ctx.restore();

    // landing line
    ctx.save();
    ctx.strokeStyle = `rgba(${accent}, 0.35)`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(target.x, target.y + 4);
    ctx.lineTo(target.x, target.y + 16);
    ctx.stroke();
    ctx.restore();
  }

  /* =========================================================
     Effects
     ========================================================= */

  splash(x, y, power = 1) {
    const count = this.reducedMotion ? 8 : Math.round(20 * power);
    for (let i = 0; i < count; i += 1) {
      const angle = -Math.PI / 2 + rand(-1.25, 1.25);
      const speed = rand(50, 250);
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        g: 640,
        drag: 0.99,
        t: 0,
        life: rand(0.45, 0.9),
        size: rand(1.4, 4),
        color: pick(['#ffd600', '#f2a900', '#ffffff', '#e53935', '#fff0a8']),
        shape: 'circle',
        spin: 0,
        rot: 0,
      });
    }
    this.rings.push({ x, y, t: 0, life: 0.5, r0: 14, r1: 62, color: '255, 214, 0' });
    this.rings.push({ x, y, t: 0, life: 0.65, r0: 2, r1: 40, color: '255, 255, 255' });
    this.rings.push({ x, y, t: 0, life: 0.8, r0: 4, r1: 90, color: '229, 57, 53' });
  }

  bounce(x, y) {
    for (let i = 0; i < (this.reducedMotion ? 4 : 10); i += 1) {
      const angle = -Math.PI / 2 + rand(-1, 1);
      const speed = rand(20, 90);
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed * 0.6,
        g: 300,
        drag: 0.98,
        t: 0,
        life: rand(0.25, 0.55),
        size: rand(1, 2.6),
        color: pick(['#c9a77f', '#9c7b57', '#e2c9a5']),
        shape: 'circle',
        spin: 0,
        rot: 0,
      });
    }
  }

  float(x, y, text, color = '#f2a900') {
    this.floaters.push({ x, y, text, color, t: 0, life: 0.95 });
  }

  confetti() {
    if (this.reducedMotion) return;
    const colors = ['#e53935', '#ffd600', '#b71c1c', '#fff1bf', '#f2a900', '#ffffff'];
    this.queueGen(() => {
      this.particles.push({
        x: rand(0, this.W),
        y: rand(-this.H * 0.25, -10),
        vx: rand(-40, 40),
        vy: rand(60, 190),
        g: 160,
        drag: 0.995,
        t: 0,
        life: rand(2.2, 3.8),
        size: rand(3, 7),
        color: pick(colors),
        shape: 'rect',
        spin: rand(-8, 8),
        rot: rand(0, TAU),
      });
    }, 110, 22);
  }

  updateEffects(dt) {
    const max = MAX_PARTICLES;
    this.drainSpawns(); // spawns escalonados: máx ~n por frame
    // slow-mo GARANTIDO (cena de pânico do último copo): pinado em tempo REAL
    if (this.slowHold > 0 && !this.reducedMotion) {
      this.slowHold = Math.max(0, this.slowHold - dt);
      this.timeScale = Math.min(this.timeScale, this.slowHoldScale);
      if (this.slowHold <= 0) this.slowHoldScale = 0.35;
    }
    // EXTREME FEVER: tempo travado em 0.25 até o desfecho
    if (this.fever) {
      this.timeScale = Math.min(this.timeScale, 0.25);
      this.heat = Math.max(this.heat, 0.9);
      this.feverT += dt;
    } else if (this.timeScale < 1) {
      // slow-mo retorna suavemente ao normal
      this.timeScale = Math.min(1, this.timeScale + dt * 2.6);
    }
    if (this.feverResult) this.feverT += dt;
    if (this.feverFail > 0) this.feverFail = Math.max(0, this.feverFail - dt * 0.8);
    for (const p of this.particles) {
      p.t += dt;
      if (p.t <= (p.starDelay || 0)) continue; // estrela pequena ainda nasceu
      p.vy += p.g * dt;
      p.vx *= p.drag;
      p.vy *= p.drag;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.spin * dt;
      if (p.shape === 'star' && !this.reducedMotion && !this.lowPerf) {
        p.trail.push({ x: p.x, y: p.y });
        if (p.trail.length > 11) p.trail.shift();
      }
    }
    if (this.particles.length > max) {
      this.particles.splice(0, this.particles.length - max);
    }
    this.particles = this.particles.filter((p) => p.t < p.life);

    for (const r of this.rings) r.t += dt;
    this.rings = this.rings.filter((r) => r.t < r.life);

    for (const f of this.floaters) {
      f.t += dt;
      f.y -= 34 * dt;
    }
    this.floaters = this.floaters.filter((f) => f.t < f.life);
  }

  drawEffects() {
    const ctx = this.ctx;

    for (const r of this.rings) {
      const p = r.t / r.life;
      const ctx2 = ctx;
      // cor: aceita "r,g,b" legado OU color CSS completo (hsl etc.)
      const stroke = r.color.includes('(') ? r.color : `rgb(${r.color})`;
      if (r.bolt) {
        // raio elétrico (Peggle lightning)
        ctx2.save();
        ctx2.globalAlpha = (1 - p) * 0.95;
        ctx2.strokeStyle = r.hueCycle
          ? `hsl(${(this.time * 240) % 360}, 100%, 66%)`
          : stroke;
        ctx2.lineWidth = 2.4;
        ctx2.shadowColor = stroke;
        ctx2.shadowBlur = r.hueCycle ? 10 : 12;
        ctx2.beginPath();
        ctx2.moveTo(r.bolt[0].x, r.bolt[0].y);
        for (const seg of r.bolt.slice(1)) ctx2.lineTo(seg.x, seg.y);
        ctx2.stroke();
        ctx2.restore();
        continue;
      }
      const radius = lerp(r.r0, r.r1, p);
      ctx.save();
      ctx.globalAlpha = (1 - p) * 0.7;
      ctx.strokeStyle = r.hueCycle
        ? `hsl(${(this.time * 240 + (r.x + r.y) * 0.7) % 360}, 100%, 64%)`
        : stroke;
      ctx.lineWidth = 2 * (1 - p) + 0.5;
      ctx.beginPath();
      ctx.arc(r.x, r.y, radius, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }

    for (const p of this.particles) {
      const alpha = clamp(1 - p.t / p.life, 0, 1);
      if (p.t <= (p.starDelay || 0)) continue; // ainda não nasceu
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;

      if (p.shape === 'star') {
        // estrela de 5 pontas — trail em UM caminho contínuo (anti-lag:
        // sem shadowBlur por segmento, cor única por estrela)
        ctx.globalCompositeOperation = 'lighter';
        const hueNow = (p.hue + this.time * 140) % 360;
        const accent = `hsl(${hueNow}, 100%, 62%)`;
        if (p.trail && p.trail.length > 2) {
          // stride 2: metade dos pontos, traço contínuo
          ctx.save();
          ctx.globalAlpha = alpha * 0.45;
          ctx.strokeStyle = accent;
          ctx.lineWidth = p.size * 0.55;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.beginPath();
          for (let i = 0; i < p.trail.length; i += 2) {
            if (i === 0) ctx.moveTo(p.trail[0].x, p.trail[0].y);
            else ctx.lineTo(p.trail[i].x, p.trail[i].y);
          }
          if ((p.trail.length - 1) % 2) ctx.lineTo(p.trail[p.trail.length - 1].x, p.trail[p.trail.length - 1].y);
          ctx.stroke();
          // núcleo claro interno (2º stroke, barato)
          ctx.globalAlpha = alpha * 0.65;
          ctx.strokeStyle = '#fff7d6';
          ctx.lineWidth = Math.max(1, p.size * 0.16);
          ctx.stroke();
          ctx.restore();
        }
        // corpo: gradiente dourado→arco-íris; glow sombrio só se haute perf
        ctx.globalAlpha = alpha;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        const sg = ctx.createLinearGradient(0, -p.size, 0, p.size);
        sg.addColorStop(0, '#fff7d6');
        sg.addColorStop(0.45, accent);
        sg.addColorStop(1, '#ffd600');
        ctx.fillStyle = sg;
        if (!this.lowPerf && p.size > 8) {
          ctx.shadowColor = accent;
          ctx.shadowBlur = 6;
        }
        ctx.beginPath();
        for (let k = 0; k < 10; k += 1) {
          const rr = k % 2 ? p.size * 0.42 : p.size;
          const aa = -Math.PI / 2 + (k * Math.PI) / 5;
          if (k === 0) ctx.moveTo(Math.cos(aa) * rr, Math.sin(aa) * rr);
          else ctx.lineTo(Math.cos(aa) * rr, Math.sin(aa) * rr);
        }
        ctx.closePath();
        ctx.fill();
      } else if (p.shape === 'rect') {
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size * 0.5);
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }

    for (const f of this.floaters) {
      const p = f.t / f.life;
      const alpha = p < 0.15 ? p / 0.15 : 1 - (p - 0.15) / 0.85;
      const scale = 1 + Math.sin(Math.min(1, p * 2.2) * Math.PI * 0.5) * 0.1;
      ctx.save();
      ctx.globalAlpha = clamp(alpha, 0, 1);
      ctx.translate(f.x, f.y);
      ctx.scale(scale, scale);
      ctx.font = '800 14px "Trebuchet MS", "Segoe UI", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(42, 20, 20, 0.7)';
      ctx.strokeText(f.text, 0, 0);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, 0, 0);
      ctx.restore();
    }
  }
}
