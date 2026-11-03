import { DIFFICULTIES, RACK_ROWS, RACK_Z, RACK_Z_STEP, CUP_SPACING } from './config.js';
import { saveStore } from './store.js';

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const lerp = (a, b, t) => a + (b - a) * t;

function gauss() {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function makeCups() {
  const cups = [];
  RACK_ROWS.forEach((count, row) => {
    for (let i = 0; i < count; i += 1) {
      cups.push({
        id: `c-${row}-${i}`,
        x: (i - (count - 1) / 2) * CUP_SPACING,
        z: RACK_Z + row * RACK_Z_STEP,
        state: 'up',
        anim: 0,
        wobble: 0,
      });
    }
  });
  return cups;
}

function makePlayer(name) {
  return {
    name,
    cups: makeCups(),
    throws: 0,
    hits: 0,
  };
}

export class Game {
  constructor(renderer, audio, store, hooks = {}) {
    this.renderer = renderer;
    this.audio = audio;
    this.store = store;
    this.hooks = hooks;

    this.mode = 'cpu';
    this.lastMode = 'cpu';
    this.phase = 'menu';
    this.paused = false;
    this.players = [makePlayer('Você'), makePlayer('CPU')];
    this.turn = 0;
    this.throwsLeft = 2;
    this.hitsThisTurn = 0;
    this.streak = 0;
    this.bestStreak = 0;
    this.session = { throws: 0, hits: 0 };
    this.timer = 0;
    this.pending = null;
    this.aimOffset = 56;
    this.ball = { visible: false, x: 0, z: 0, h: 0, trail: [], fire: false };
    this.aim = { active: false, x: 0, z: 0.84, sx: 0, sy: 0, pointerId: null };
    this.cpuThinking = false;
  }

  get rack() {
    return this.players[1 - this.turn].cups;
  }

  get opponent() {
    return this.players[1 - this.turn];
  }

  get thrower() {
    return this.players[this.turn];
  }

  resetDemo() {
    this.mode = 'cpu';
    this.phase = 'menu';
    this.paused = false;
    this.players = [makePlayer('Você'), makePlayer('CPU')];
    this.turn = 0;
    this.throwsLeft = 2;
    this.hitsThisTurn = 0;
    this.streak = 0;
    this.bestStreak = 0;
    this.session = { throws: 0, hits: 0 };
    this.timer = 0;
    this.pending = null;
    this.ball = { visible: false, x: 0, z: 0, h: 0, trail: [], fire: false };
    this.aim = { active: false, x: 0, z: 0.84, sx: 0, sy: 0, pointerId: null };
    this.cpuThinking = false;
  }

  start(mode) {
    const safeMode = mode === 'local' || mode === 'practice' ? mode : 'cpu';
    this.mode = safeMode;
    this.lastMode = safeMode;
    this.players = [
      makePlayer('Você'),
      makePlayer(safeMode === 'local' ? 'Jogador 2' : safeMode === 'practice' ? 'Alvos' : 'CPU'),
    ];
    if (safeMode === 'local') this.players[0].name = 'Jogador 1';

    this.turn = 0;
    this.throwsLeft = 2;
    this.hitsThisTurn = 0;
    this.streak = 0;
    this.bestStreak = 0;
    this.session = { throws: 0, hits: 0 };
    this.timer = 0;
    this.pending = null;
    this.paused = false;
    this.phase = 'aim';
    this.ball = { visible: false, x: 0, z: 0, h: 0, trail: [], fire: false };
    this.aim = { active: false, x: 0, z: 0.84, sx: 0, sy: 0, pointerId: null };
    this.cpuThinking = false;

    this.audio.unlock();
    this.audio.play('turn');
    this.hooks.onStart?.();
    this.pushHud();
    const label = safeMode === 'practice' ? 'Treino livre' : safeMode === 'local' ? 'Vez do Jogador 1' : 'Sua vez';
    this.hooks.toast?.(label, 'turn');
  }

  restart() {
    this.start(this.lastMode);
  }

  toMenu() {
    this.resetDemo();
    this.pushHud();
  }

  pause() {
    if (this.phase === 'over' || this.phase === 'menu') return;
    this.paused = true;
  }

  resume() {
    this.paused = false;
    this.audio.unlock();
  }

  setDifficulty(difficulty) {
    if (DIFFICULTIES[difficulty]) {
      this.store.settings.difficulty = difficulty;
      saveStore(this.store);
    }
  }

  /* =========================================================
     Loop
     ========================================================= */

  update(dt) {
    if (this.paused) return;

    for (const player of this.players) {
      for (const cup of player.cups) {
        if (cup.wobble > 0) cup.wobble = Math.max(0, cup.wobble - dt * 3.4);
      }
    }

    if (this.timer > 0) {
      this.timer -= dt;
      if (this.timer <= 0 && this.pending) {
        const action = this.pending;
        this.pending = null;
        this.timer = 0;
        action();
      }
    }

    if (this.phase === 'flight') {
      const b = this.ball;
      b.p = Math.min(1, b.p + dt / b.T);
      const t = b.p;
      b.x = lerp(b.x0, b.x1, t);
      b.z = lerp(b.z0, b.z1, t);
      b.h = 4 * b.arc * t * (1 - t);
      b.trail.push({ x: b.x, z: b.z, h: b.h });
      if (b.trail.length > 9) b.trail.shift();
      if (b.p >= 1) this.land();
    }
  }

  schedule(delay, action) {
    this.timer = delay;
    this.pending = action;
  }

  /* =========================================================
     Input
     ========================================================= */

  canAim() {
    return this.phase === 'aim' && !this.paused && !(this.mode === 'cpu' && this.turn === 1);
  }

  pointerDown(sx, sy, pointerId) {
    if (!this.canAim()) return;
    this.aim.active = true;
    this.aim.pointerId = pointerId;
    this.audio.unlock();
    this.updateAim(sx, sy);
  }

  pointerMove(sx, sy, pointerId) {
    if (!this.aim.active || this.aim.pointerId !== pointerId) return;
    this.updateAim(sx, sy);
  }

  pointerUp(sx, sy, pointerId) {
    if (!this.aim.active || this.aim.pointerId !== pointerId) return;
    this.aim.pointerId = null;
    this.updateAim(sx, sy);
    this.aim.active = false;
    this.throwBall();
  }

  pointerCancel(pointerId) {
    if (this.aim.pointerId !== pointerId) return;
    this.aim.pointerId = null;
    this.aim.active = false;
  }

  updateAim(sx, sy) {
    const plane = this.renderer.unproject(sx, sy - this.aimOffset);
    this.aim.x = clamp(plane.x, -0.94, 0.94);
    this.aim.z = clamp(plane.z, 0.28, 0.965);
    this.aim.sx = sx;
    this.aim.sy = sy;
  }

  /* =========================================================
     Throws
     ========================================================= */

  throwBall() {
    if (this.phase !== 'aim') return;
    const { x, z } = this.aim;
    const p = this.renderer.project(x, z);

    // Aimed shots are good but not perfect — tiny hand shake grows with distance.
    const sigma = 4.2 + z * 6;
    const sx = p.x + gauss() * sigma;
    const sy = p.y + gauss() * sigma * 0.8;
    const landing = this.renderer.unproject(sx, sy);

    const tx = clamp(landing.x, -0.95, 0.95);
    const tz = clamp(landing.z, 0.5, 0.97);
    this.launch(tx, tz);
  }

  launch(tx, tz) {
    this.phase = 'flight';
    this.aim.active = false;
    this.aim.pointerId = null;
    this.thrower.throws += 1;
    this.session.throws += 1;

    this.ball = {
      visible: true,
      x: 0,
      z: 0.02,
      h: 0,
      x0: 0,
      z0: 0.02,
      x1: tx,
      z1: tz,
      p: 0,
      T: 0.6 + tz * 0.42,
      arc: 92 + tz * 92,
      trail: [],
      fire: this.streak >= 2,
    };
    this.audio.play('throw');
    this.pushHud();
  }

  land() {
    const b = this.ball;
    b.visible = false;
    this.phase = 'resolve';

    const landing = this.renderer.project(b.x1, b.z1);
    let best = null;
    let bestDist = Infinity;

    for (const cup of this.rack) {
      if (cup.state !== 'up') continue;
      const cs = this.renderer.cupScreen(cup);
      const dx = (landing.x - cs.x) / cs.rx;
      const dy = (landing.y - cs.y) / (cs.ry * 2.05);
      const dist = Math.hypot(dx, dy);
      if (dist < bestDist) {
        bestDist = dist;
        best = cup;
      }
    }

    this.throwsLeft -= 1;

    if (best && bestDist <= 1) {
      this.registerHit(best, landing);
    } else if (best && bestDist <= 1.65) {
      this.registerRim(best, landing);
    } else {
      this.registerMiss(landing);
    }

    this.pushHud();
    this.schedule(0.95, () => this.afterThrow());
  }

  registerHit(cup, landing) {
    cup.state = 'hit';
    cup.anim = 0;

    this.audio.play('splash');
    this.renderer.splash(landing.x, landing.y, 1);
    this.renderer.shake = this.renderer.reducedMotion ? 0 : 11;
    this.renderer.float(
      landing.x,
      landing.y - 32,
      ['NA CESTA!', 'BOA!', '+1', 'CRAVOU!', 'PERFEITO!'][(Math.random() * 5) | 0],
      '#ffd166',
    );

    this.streak += 1;
    this.bestStreak = Math.max(this.bestStreak, this.streak);
    this.hitsThisTurn += 1;
    this.thrower.hits += 1;
    this.session.hits += 1;

    this.hooks.vibrate?.(28);
    if (this.streak === 3) {
      this.hooks.toast?.('Em chamas! 🔥', 'hot');
    }
  }

  registerRim(cup, landing) {
    cup.wobble = 1;
    this.audio.play('rim');
    this.renderer.bounce(landing.x, landing.y);
    this.renderer.float(landing.x, landing.y - 26, 'Na borda!', '#ff8fa3');
    this.streak = 0;
    this.hooks.vibrate?.(10);
  }

  registerMiss(landing) {
    this.audio.play('bounce');
    this.renderer.bounce(landing.x, landing.y);
    this.renderer.float(landing.x, landing.y - 20, 'Errou', '#a7b6ca');
    this.streak = 0;
  }

  /* =========================================================
     Turn flow
     ========================================================= */

  afterThrow() {
    if (this.mode === 'practice') {
      const cleared = this.rack.every((c) => c.state === 'hit');
      if (cleared) {
        this.hooks.toast?.('Rack limpo! Novo rack…', 'good');
        this.audio.play('refill');
        this.schedule(0.55, () => {
          this.players[1].cups = makeCups();
          this.throwsLeft = 2;
          this.phase = 'aim';
          this.pushHud();
        });
        return;
      }
      this.throwsLeft = 2;
      this.phase = 'aim';
      this.pushHud();
      return;
    }

    if (this.opponent.cups.every((c) => c.state === 'hit')) {
      this.finish(this.turn);
      return;
    }

    if (this.throwsLeft > 0) {
      this.beginTurnFor(this.turn, false);
      return;
    }

    if (this.hitsThisTurn >= 2) {
      this.hooks.toast?.('Bolas de volta!', 'good');
      this.audio.play('ballback');
      this.throwsLeft = 2;
      this.hitsThisTurn = 0;
      this.schedule(0.6, () => this.beginTurnFor(this.turn, false));
      return;
    }

    this.turn = 1 - this.turn;
    this.throwsLeft = 2;
    this.hitsThisTurn = 0;
    this.streak = 0;
    this.beginTurnFor(this.turn);
  }

  beginTurnFor(turn, announce = true) {
    const isCpu = this.mode === 'cpu' && turn === 1;
    if (isCpu) {
      this.beginCpuTurn();
      return;
    }
    this.phase = 'aim';
    this.aim.active = false;
    this.aim.x = 0;
    this.aim.z = 0.84;
    this.aim.sx = 0;
    this.aim.sy = 0;
    if (announce) {
      this.audio.play('turn');
      if (this.mode === 'local') {
        this.hooks.toast?.(`Vez do ${this.players[turn].name}`, 'turn');
      } else if (this.turn === 0) {
        this.hooks.toast?.('Sua vez', 'turn');
      }
    }
    this.pushHud();
  }

  beginCpuTurn() {
    this.phase = 'cpu-aim';
    this.aim.active = true;
    this.aim.pointerId = null;
    this.aim.sx = 0;
    this.aim.sy = 0;
    this.cpuThinking = true;

    const cups = this.rack.filter((c) => c.state === 'up');
    const target = cups.length ? cups[(Math.random() * cups.length) | 0] : null;
    const diff = DIFFICULTIES[this.store.settings.difficulty] || DIFFICULTIES.normal;
    const sigma = diff.cpuSigma;

    if (target) {
      const cs = this.renderer.cupScreen(target);
      const sx = cs.x + gauss() * sigma;
      const sy = cs.y + gauss() * sigma * 0.8;
      const plane = this.renderer.unproject(sx, sy);
      this.aim.x = clamp(plane.x, -0.94, 0.94);
      this.aim.z = clamp(plane.z, 0.56, 0.965);
    } else {
      this.aim.x = 0;
      this.aim.z = 0.84;
    }

    this.pushHud();
    this.schedule(1.15, () => {
      this.cpuThinking = false;
      this.aim.active = false;
      this.launch(this.aim.x, this.aim.z);
    });
  }

  finish(winnerIndex) {
    this.phase = 'over';
    this.aim.active = false;
    this.ball.visible = false;
    this.cpuThinking = false;
    this.timer = 0;
    this.pending = null;

    const winner = this.players[winnerIndex];
    const statsPlayer = this.mode === 'local' ? winner : this.players[0];
    const playerWon = this.mode === 'cpu' ? winnerIndex === 0 : true;

    this.store.stats.games += 1;
    if (this.mode === 'cpu' && winnerIndex === 0) this.store.stats.wins += 1;
    this.store.stats.throws += statsPlayer.throws;
    this.store.stats.hits += statsPlayer.hits;
    this.store.stats.bestStreak = Math.max(this.store.stats.bestStreak, this.bestStreak);
    saveStore(this.store);

    this.audio.play(playerWon ? 'win' : 'lose');
    this.renderer.confetti();
    this.renderer.shake = this.renderer.reducedMotion ? 0 : 14;
    this.hooks.vibrate?.([40, 60, 60]);

    const accuracy = statsPlayer.throws ? Math.round((statsPlayer.hits / statsPlayer.throws) * 100) : 0;
    this.hooks.gameOver?.({
      mode: this.mode,
      winnerName: winner.name,
      playerWon,
      throws: statsPlayer.throws,
      hits: statsPlayer.hits,
      accuracy,
      bestStreak: this.bestStreak,
      names: this.players.map((p) => p.name),
      cups: this.players.map((p) => p.cups.filter((c) => c.state === 'up').length),
    });
    this.pushHud();
  }

  /* =========================================================
     HUD
     ========================================================= */

  pushHud() {
    const accuracy = this.session.throws
      ? Math.round((this.session.hits / this.session.throws) * 100)
      : 0;
    this.hooks.hud?.({
      mode: this.mode,
      names: this.players.map((p) => p.name),
      cups: this.players.map((p) => p.cups.filter((c) => c.state === 'up').length),
      turn: this.turn,
      throwsLeft: this.throwsLeft,
      streak: this.streak,
      accuracy,
      phase: this.phase,
      cpuThinking: this.cpuThinking,
    });
  }
}
