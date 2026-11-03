import { CUP_RADIUS, MAX_PARTICLES } from './config.js';

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
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(W * this.dpr);
    this.canvas.height = Math.round(H * this.dpr);
    this.computeLayout();
    this.buildBackground();
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
    const rx = CUP_RADIUS * p.hw;
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
    base.addColorStop(0, '#0b1224');
    base.addColorStop(0.45, '#080d19');
    base.addColorStop(1, '#04060c');
    g.fillStyle = base;
    g.fillRect(0, 0, W, H);

    const glowPink = g.createRadialGradient(W * 0.1, H * 0.02, 0, W * 0.1, H * 0.02, W * 0.85);
    glowPink.addColorStop(0, 'rgba(255, 61, 113, 0.2)');
    glowPink.addColorStop(0.5, 'rgba(160, 30, 80, 0.07)');
    glowPink.addColorStop(1, 'rgba(0, 0, 0, 0)');
    g.fillStyle = glowPink;
    g.fillRect(0, 0, W, H * 0.75);

    const glowCyan = g.createRadialGradient(W * 0.94, H * 0.08, 0, W * 0.94, H * 0.08, W * 0.7);
    glowCyan.addColorStop(0, 'rgba(56, 225, 242, 0.14)');
    glowCyan.addColorStop(1, 'rgba(0, 0, 0, 0)');
    g.fillStyle = glowCyan;
    g.fillRect(0, 0, W, H * 0.6);

    // Party bokeh
    const rng = mulberry32(20261030);
    for (let i = 0; i < 16; i += 1) {
      const x = rng() * W;
      const y = rng() * (H * 0.55);
      const r = 2 + rng() * 8;
      const colors = ['255, 196, 92', '255, 61, 113', '56, 225, 242', '139, 92, 255'];
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
    wall.addColorStop(0, 'rgba(8, 12, 22, 0)');
    wall.addColorStop(0.6, 'rgba(16, 24, 42, 0.55)');
    wall.addColorStop(1, 'rgba(5, 8, 14, 0.1)');
    g.fillStyle = wall;
    g.fillRect(0, wallY, W, 120);

    const strip = g.createLinearGradient(W * 0.18, 0, W * 0.82, 0);
    strip.addColorStop(0, 'rgba(255, 61, 113, 0)');
    strip.addColorStop(0.28, 'rgba(255, 61, 113, 0.65)');
    strip.addColorStop(0.52, 'rgba(255, 196, 92, 0.85)');
    strip.addColorStop(0.76, 'rgba(56, 225, 242, 0.6)');
    strip.addColorStop(1, 'rgba(56, 225, 242, 0)');
    g.save();
    g.strokeStyle = strip;
    g.lineWidth = 2.5;
    g.shadowColor = 'rgba(255, 120, 120, 0.55)';
    g.shadowBlur = 20;
    g.beginPath();
    g.moveTo(W * 0.14, this.yFar - 42);
    g.lineTo(W * 0.86, this.yFar - 42);
    g.stroke();
    g.restore();

    // Floor glow under the table
    const floor = g.createRadialGradient(W / 2, H * 0.92, 0, W / 2, H * 0.92, W * 0.7);
    floor.addColorStop(0, 'rgba(120, 60, 30, 0.16)');
    floor.addColorStop(1, 'rgba(0, 0, 0, 0)');
    g.fillStyle = floor;
    g.fillRect(0, H * 0.6, W, H * 0.4);

    this.bg = bg;
  }

  /* =========================================================
     Main render
     ========================================================= */

  render(game, dt) {
    this.time += dt;
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

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
      ctx.fillStyle = '#070a12';
      ctx.fillRect(0, 0, this.W, this.H);
    }

    this.drawTable(game);
    this.drawCups(game, dt);
    this.drawBall(game);
    this.drawAim(game);
    this.updateEffects(dt);
    this.drawEffects();
  }

  /* =========================================================
     Table
     ========================================================= */

  drawTable(game) {
    const ctx = this.ctx;
    const { cx, yNear, yFar, halfNear, halfFar, W } = this;

    // floor shadow
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.filter = 'blur(18px)';
    ctx.beginPath();
    ctx.ellipse(cx, yNear + 12, halfNear * 1.05, 26, 0, 0, TAU);
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
    ctx.font = `900 ${Math.round(lhw * 0.2)}px "Segoe UI", system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255, 226, 190, 0.055)';
    ctx.letterSpacing = '4px';
    ctx.fillText('NEON PONG', 0, 0);
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

    // far edge neon
    ctx.save();
    const neon = ctx.createLinearGradient(cx - halfFar, 0, cx + halfFar, 0);
    neon.addColorStop(0, 'rgba(56, 225, 242, 0)');
    neon.addColorStop(0.35, 'rgba(56, 225, 242, 0.55)');
    neon.addColorStop(0.65, 'rgba(255, 61, 113, 0.55)');
    neon.addColorStop(1, 'rgba(255, 61, 113, 0)');
    ctx.strokeStyle = neon;
    ctx.lineWidth = 2;
    ctx.shadowColor = 'rgba(120, 220, 255, 0.5)';
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.moveTo(cx - halfFar, yFar);
    ctx.lineTo(cx + halfFar, yFar);
    ctx.stroke();
    ctx.restore();

    // vignette at the near edge
    const edge = ctx.createLinearGradient(0, yNear - 40, 0, yNear + 10);
    edge.addColorStop(0, 'rgba(0, 0, 0, 0)');
    edge.addColorStop(1, 'rgba(0, 0, 0, 0.35)');
    ctx.fillStyle = edge;
    ctx.fillRect(0, yNear - 40, W, 50);

    // decorative ball resting on the table when idle / aiming
    if (['menu', 'over', 'aim', 'cpu-aim'].includes(game.phase)) {
      const p = this.project(0.02, 0.115);
      const bob = this.reducedMotion ? 0 : Math.sin(this.time * 1.8) * 2.4;
      this.ctx.save();
      this.ctx.globalAlpha = 0.28;
      this.ctx.fillStyle = '#000';
      this.ctx.beginPath();
      this.ctx.ellipse(p.x, p.y + 1, 9, 3, 0, 0, TAU);
      this.ctx.fill();
      this.ctx.restore();
      this.drawBallSprite(p.x, p.y - 10 + bob, 9, false);
    }
  }

  /* =========================================================
     Cups
     ========================================================= */

  drawCups(game, dt) {
    const cups = game.rack || [];
    const sorted = [...cups].sort((a, b) => b.z - a.z);
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
    const hit = cup.state === 'hit';
    const t = hit ? cup.anim || 0 : 0;
    const alpha = 1 - t * t;
    const sink = t * t * 34;
    const wobble = cup.wobble ? Math.sin(this.time * 34) * cup.wobble * 3.5 : 0;
    const x = p.x + wobble;
    const y = p.y + sink;
    const bodyH = rx * 1.42;
    const tilt = hit ? Math.sin(t * Math.PI) * 0.24 : 0;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.rotate(tilt);
    ctx.translate(-x, -y);

    // shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.32)';
    ctx.beginPath();
    ctx.ellipse(x + rx * 0.16, y + bodyH * 0.86, rx * 1.02, ry * 1.25, 0, 0, TAU);
    ctx.fill();

    // cup body
    const body = new Path2D();
    body.moveTo(x - rx, y);
    body.bezierCurveTo(x - rx * 0.98, y + bodyH * 0.5, x - rx * 0.8, y + bodyH * 0.82, x - rx * 0.72, y + bodyH);
    body.quadraticCurveTo(x, y + bodyH + ry * 1.5, x + rx * 0.72, y + bodyH);
    body.bezierCurveTo(x + rx * 0.8, y + bodyH * 0.82, x + rx * 0.98, y + bodyH * 0.5, x + rx, y);
    body.closePath();

    const bodyGrad = ctx.createLinearGradient(x - rx, y, x + rx, y + bodyH);
    bodyGrad.addColorStop(0, '#ff6478');
    bodyGrad.addColorStop(0.22, '#ec2c4c');
    bodyGrad.addColorStop(0.62, '#bd1737');
    bodyGrad.addColorStop(0.9, '#8e0e28');
    bodyGrad.addColorStop(1, '#760a20');
    ctx.fillStyle = bodyGrad;
    ctx.fill(body);

    // glossy stripe
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

    // rim / opening
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
    ctx.fillStyle = '#7a1024';
    ctx.fill();

    const beer = ctx.createRadialGradient(x - rx * 0.2, y - ry * 0.3, ry * 0.1, x, y, rx * 0.9);
    beer.addColorStop(0, '#ffd27a');
    beer.addColorStop(0.5, '#f2a63b');
    beer.addColorStop(1, '#b96a14');
    ctx.beginPath();
    ctx.ellipse(x, y + ry * 0.1, rx * 0.82, ry * 0.78, 0, 0, TAU);
    ctx.fillStyle = beer;
    ctx.fill();

    // foam
    ctx.fillStyle = 'rgba(255, 246, 220, 0.7)';
    const foam = [
      [-0.34, -0.05, 0.18],
      [-0.02, -0.16, 0.2],
      [0.3, 0.02, 0.16],
      [0.08, 0.12, 0.12],
    ];
    for (const [fx, fy, fr] of foam) {
      ctx.beginPath();
      ctx.arc(x + fx * rx, y + fy * ry, fr * rx, 0, TAU);
      ctx.fill();
    }

    // rim highlight
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
    ctx.strokeStyle = 'rgba(255, 226, 226, 0.75)';
    ctx.lineWidth = Math.max(1.4, rx * 0.11);
    ctx.stroke();

    ctx.beginPath();
    ctx.ellipse(x, y + 0.6, rx * 0.98, ry * 0.98, 0, Math.PI * 0.15, Math.PI * 0.85);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.restore();
  }

  /* =========================================================
     Ball
     ========================================================= */

  drawBallSprite(x, y, r, onFire) {
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
    const height = ball.h || 0;
    const r = 8.4 + Math.min(2, height / 160);
    const sy = p.y - height;
    const shadowScale = clamp(1 - height / 420, 0.35, 1);

    // shadow
    ctx.save();
    ctx.globalAlpha = 0.3 * shadowScale;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, r * 1.05 * shadowScale, r * 0.34 * shadowScale, 0, 0, TAU);
    ctx.fill();
    ctx.restore();

    // trail
    if (ball.trail && ball.trail.length) {
      for (let i = 0; i < ball.trail.length; i += 1) {
        const t = ball.trail[i];
        const tp = this.project(t.x, t.z);
        const a = (i / ball.trail.length) * 0.24;
        ctx.globalAlpha = a;
        ctx.fillStyle = '#fff6df';
        ctx.beginPath();
        ctx.arc(tp.x, tp.y - t.h, r * (0.35 + (i / ball.trail.length) * 0.5), 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    this.drawBallSprite(p.x, sy, r, Boolean(ball.fire));
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
    const accent = cpu ? '255, 61, 113' : '255, 196, 92';

    // predicted arc
    const arc = 90 + aim.z * 80;
    ctx.save();
    for (let i = 1; i <= 15; i += 1) {
      const t = i / 15;
      const x = lerp(0, aim.x, t);
      const z = lerp(0.03, aim.z, t);
      const p = this.project(x, z);
      const h = 4 * arc * t * (1 - t);
      const rr = 1.4 + t * 1.8;
      ctx.globalAlpha = 0.1 + t * 0.5;
      ctx.fillStyle = `rgba(${accent}, 0.95)`;
      ctx.beginPath();
      ctx.arc(p.x, p.y - h, rr, 0, TAU);
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
        color: pick(['#ffd166', '#ffb03a', '#fff1cf', '#ff8a3d', '#f7d9a0']),
        shape: 'circle',
        spin: 0,
        rot: 0,
      });
    }
    this.rings.push({ x, y, t: 0, life: 0.5, r0: 6, r1: 46, color: '255, 210, 130' });
    this.rings.push({ x, y, t: 0, life: 0.65, r0: 2, r1: 28, color: '255, 255, 255' });
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

  float(x, y, text, color = '#ffd166') {
    this.floaters.push({ x, y, text, color, t: 0, life: 0.95 });
  }

  confetti() {
    if (this.reducedMotion) return;
    const colors = ['#ff3d71', '#ffc45c', '#38e1f2', '#8b5cff', '#4ade80', '#fff1cf'];
    for (let i = 0; i < 110; i += 1) {
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
    }
  }

  updateEffects(dt) {
    const max = MAX_PARTICLES;
    for (const p of this.particles) {
      p.t += dt;
      p.vy += p.g * dt;
      p.vx *= p.drag;
      p.vy *= p.drag;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.spin * dt;
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
      const radius = lerp(r.r0, r.r1, p);
      ctx.save();
      ctx.globalAlpha = (1 - p) * 0.7;
      ctx.strokeStyle = `rgb(${r.color})`;
      ctx.lineWidth = 2 * (1 - p) + 0.5;
      ctx.beginPath();
      ctx.arc(r.x, r.y, radius, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }

    for (const p of this.particles) {
      const alpha = clamp(1 - p.t / p.life, 0, 1);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      if (p.shape === 'rect') {
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
      ctx.font = '800 14px "Segoe UI", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(5, 8, 15, 0.75)';
      ctx.strokeText(f.text, 0, 0);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, 0, 0);
      ctx.restore();
    }
  }
}
