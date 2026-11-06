import { DIFFICULTIES, RACK_ROWS, RACK_Z, RACK_Z_STEP, CUP_SPACING, PHYS } from './config.js';
import { BallSim, mToXu, mToZu, solveThrow, xuToM, zuToM } from './physics.js';
import { saveStore } from './store.js';

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

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
        state: 'up', // 'up' | 'down' (tombado) | 'hit' (sucumbido)
        anim: 0,
        wobble: 0,
        tilt: 0,
        tiltVel: 0,
        tipKick: 0,
        fallT: 0,
        fallDir: 1,
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

const isOut = (c) => c.state !== 'up';

function blankBall() {
  return { visible: false, x: 0, z: 0, h: PHYS.BALL_RADIUS, spin: 0, trail: [], fire: false };
}

function freshAim() {
  return { active: false, x: 0, z: 0.84, sx: 0, sy: 0, pointerId: null, touch: false };
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
    this.ball = blankBall();
    this.aim = freshAim();
    this.cpuThinking = false;

    this.sim = null;
    this.acc = 0;
    this.previewPoints = [];
    this.previewKey = '';
    this.pendingHit = null;
    this.lastRimCup = null;
    this.lastSound = 0;
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
    this.ball = blankBall();
    this.aim = freshAim();
    this.cpuThinking = false;
    this.sim = null;
    this.acc = 0;
    this.pendingHit = null;
    this.lastRimCup = null;
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
    this.ball = blankBall();
    this.aim = freshAim();
    this.cpuThinking = false;
    this.sim = null;
    this.acc = 0;
    this.pendingHit = null;
    this.lastRimCup = null;

    this.audio.unlock();
    this.audio.play('turn');
    this.hooks.onStart?.();
    this.pushHud();
    const label =
      safeMode === 'practice'
        ? 'Treino livre'
        : safeMode === 'local'
          ? 'Vez do Jogador 1'
          : 'Sua vez';
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
        // wobble decorativo
        if (cup.wobble > 0) cup.wobble = Math.max(0, cup.wobble - dt * 3.4);
        if (cup.state === 'down' && cup.fallT < 1) {
          cup.fallT = Math.min(1, cup.fallT + dt * 2.6);
        }
        // dinâmica de tombamento (mola + impulso da bola)
        if (
          cup.state === 'up' &&
          (cup.tipKick > 0 || Math.abs(cup.tilt) > 0.001 || Math.abs(cup.tiltVel) > 0.001)
        ) {
          cup.tiltVel += (cup.tipKick * 5.5 - cup.tilt * 170 - cup.tiltVel * 6.5) * dt;
          cup.tipKick = 0;
          cup.tilt += cup.tiltVel * dt;
          cup.tilt = clamp(cup.tilt, -1.3, 1.3);
          if (Math.abs(cup.tilt) > 1.05) {
            this.toppleCup(cup);
          }
        } else if (cup.state === 'up') {
          cup.tilt = 0;
          cup.tiltVel = 0;
        }
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

    if (this.phase === 'flight' && this.sim && !this.sim.done) {
      this.acc = Math.min(this.acc + dt, 0.05);
      let steps = 0;
      while (this.acc >= 1 / 360 && steps < 260) {
        this.sim.step(1 / 360);
        this.acc -= 1 / 360;
        steps += 1;
        if (this.sim.done) break;
      }
      const b = this.ball;
      const pos = this.sim.pos;
      b.x = pos.x;
      b.z = pos.z;
      b.h = pos.h;
      b.spin = this.sim.spin;
      b.trail.push({ x: b.x, z: b.z, h: b.h });
      if (b.trail.length > 10) b.trail.shift();
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

  pointerDown(sx, sy, pointerId, pointerType) {
    if (!this.canAim()) return;
    this.aim.active = true;
    this.aim.pointerId = pointerId;
    this.aim.touch = pointerType === 'touch';
    this.audio.unlock();
    this.updateAim(sx, sy);
  }

  pointerMove(sx, sy, pointerId, pointerType) {
    if (!this.aim.active || this.aim.pointerId !== pointerId) return;
    if (pointerType) this.aim.touch = pointerType === 'touch';
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
    // no touch o dedo esconde o alvo: reticula um pouco acima do dedo;
    // mouse/teclado miram exatamente onde o cursor está
    const offset = this.aim.touch ? this.aimOffset : 0;
    const plane = this.renderer.unproject(sx, sy - offset);
    this.aim.x = clamp(plane.x, -0.94, 0.94);
    this.aim.z = clamp(plane.z, 0.28, 0.965);
    this.aim.sx = sx;
    this.aim.sy = sy;
    this.updatePreview();
  }

  /* =========================================================
     Throws
     ========================================================= */

  updatePreview() {
    const key = `${this.aim.x.toFixed(2)}|${this.aim.z.toFixed(2)}`;
    if (key === this.previewKey) return;
    this.previewKey = key;
    this.previewPoints = solveThrow(this.aim.x, this.aim.z).path;
  }

  throwBall() {
    if (this.phase !== 'aim') return;
    const { x, z } = this.aim;
    const p = this.renderer.project(x, z);

    // Aimed shots are good but not perfect — tiny hand shake grows with distance.
    // σ em px de tela, mas compatível com a perspectiva do fundo da mesa:
    // mira central entra na boca na maioria das vezes; raspança na borda quica.
    const sigma = 2.6 + z * 3.4;
    const sx = p.x + gauss() * sigma;
    const sy = p.y + gauss() * sigma * 0.6;
    const landing = this.renderer.unproject(sx, sy);

    const tx = clamp(landing.x, -0.95, 0.95);
    const tz = clamp(landing.z, 0.5, 0.97);
    this.launch(tx, tz);
  }

  launch(tx, tz) {
    this.phase = 'flight';
    this.slowMoThisThrow = false;
    this.aim.active = false;
    this.aim.pointerId = null;

    // EXTREME FEVER: último copo em pé. A CÂMERA aproxima imediatamente e
    // passa a seguir a bola; o "EXTREME FEVER!" só estoura se a bola
    // ENTRAR na boca do copo (hook onEnter da física).
    const feverCup = this.rack.find((c) => c.state === 'up');
    this.feverThrow = feverCup && this.rack.filter((c) => c.state === 'up').length === 1;
    this.feverArmed = false;
    if (this.feverThrow) {
      this.feverCup = feverCup;
      this.renderer.camFollow = true;
    }
    this.thrower.throws += 1;
    this.session.throws += 1;

    // Arremesso resolvido pela física real: acha a velocidade inicial que
    // aterrissa no ponto visado e deixa a simulação decidir o resultado.
    const { v } = solveThrow(clamp(tx, -1.05, 1.05), clamp(tz, 0.02, 1));
    this.sim = new BallSim(
      this.rack
        .filter((c) => c.state === 'up')
        .map((cup) => ({ cup, cx: xuToM(cup.x), cd: zuToM(cup.z) })),
      {
        onTable: (xu, zu, strength) => this.onTableBounce(xu, zu, strength),
        onRail: () => this.playThrottled('bounce', 90),
        onRim: (cs, pos, imp) => this.onRimContact(cs, pos, imp),
        onEnter: (cs, pos) => this.onCupEnter(cs),
        onWallIn: () => this.playThrottled('rim', 90),
        onCupBody: (cs, imp) => {
          const cup = cs.cup;
          cup.wobble = Math.max(cup.wobble, imp * 0.8);
          this.playThrottled('rim', 120);
        },
        onCupBottom: () => this.playThrottled('splash', 120),
        onTip: (cs, kick) => {
          const cup = cs.cup;
          if (cup.state !== 'up') return;
          cup.tipKick += kick;
          cup.fallDir = Math.random() < 0.5 ? -1 : 1;
        },
        onRest: (result) => this.resolveThrow(result),
      }
    );
    this.sim.launch(v);
    this.acc = 0;
    this.pendingHit = null;
    this.lastRimCup = null;

    this.ball = {
      visible: true,
      x: 0,
      z: PHYS.RELEASE_D / PHYS.TABLE_DEPTH,
      h: PHYS.RELEASE_H,
      spin: 0,
      trail: [],
      fire: this.streak >= 2,
    };
    this.audio.play('throw');
    this.pushHud();
  }

  /* --- eventos físicos --- */

  playThrottled(name, gapMs) {
    const now = performance.now();
    if (now - this.lastSound < gapMs) return;
    this.lastSound = now;
    this.audio.play(name);
  }

  projectPos(xu, zu) {
    const p = this.renderer.project(clamp(xu, -1, 1), clamp(zu, 0, 1));
    return { x: p.x, y: p.y };
  }

  onTableBounce(xu, zu, strength) {
    this.playThrottled('bounce', 70);
    const pt = this.projectPos(xu, zu);
    this.renderer.bounce(pt.x, pt.y);
    this.hooks.vibrate?.(strength > 0.5 ? 12 : 0);
  }

  onRimContact(cs, pos, imp) {
    const cup = cs.cup;
    cup.wobble = Math.max(cup.wobble, Math.max(0.25, imp * 0.9));
    this.lastRimCup = cup;
    this.playThrottled('rim', 60);
    // no throw de fever a câmera já é dramática: sem slow-mo extra
    if (!this.feverThrow && !this.slowMoThisThrow) {
      this.slowMoThisThrow = true;
      this.renderer.slowMo?.();
    }
    const pt = this.projectPos(mToXu(pos.x), mToZu(pos.d));
    this.renderer.bounce(pt.x, pt.y - 12);
    this.hooks.vibrate?.(6);
  }

  /* bola cruzou o rim POR DENTRO>PONTO DE NÃO-RETORNO: estoura o EXTREME FEVER */
  onCupEnter(cs) {
    if (!this.feverThrow || this.feverArmed) return;
    this.feverArmed = true;
    this.renderer.startFever?.();
    this.audio.play('fever');
    this.hooks.vibrate?.([30, 60, 30, 60, 30]);
  }

  toppleCup(cup) {
    if (cup.state !== 'up') return;
    cup.state = 'down';
    cup.fallT = 0;
    if (!cup.fallDir) cup.fallDir = Math.random() < 0.5 ? -1 : 1;
    this.audio.play('bounce');
    const pt = this.projectPos(cup.x, cup.z);
    this.renderer.bounce(pt.x, pt.y + 8);
    this.renderer.shake = this.renderer.reducedMotion ? 0 : 6;
    if (!this.pendingHit) this.pendingHit = cup;
  }

  /* --- resolução do arremesso --- */

  resolveThrow(result) {
    if (this.phase !== 'flight') return;
    this.phase = 'resolve';
    this.throwsLeft = Math.max(0, this.throwsLeft - 1);
    const b = this.ball;
    const pos = this.sim ? this.sim.pos : { x: b.x, z: b.z };
    b.x = clamp(pos.x, -0.98, 0.98);
    b.z = clamp(pos.z, 0.01, 0.99);
    b.h = Math.max(0, pos.h);

    if (this.pendingHit) {
      // Copo derrubado pela bola (regra oficial: conta como copo feito)
      this.registerHit(this.pendingHit, b, true);
    } else if (result.kind === 'cup' && result.cup) {
      this.registerHit(result.cup, b, false);
    } else {
      // qualquer contato com o copo (rim, parede, garganta) vira "Na borda!"
      const touched =
        this.lastRimCup && this.lastRimCup.state === 'up'
          ? this.lastRimCup
          : this.sim && this.sim.lastCup && this.sim.lastCup.cup.state === 'up'
            ? this.sim.lastCup.cup
            : null;
      if (touched) this.registerRim(touched, b);
      else this.registerMiss(b);
    }

    // desfecho do EXTREME FEVER: só se a bola ENTROU na boca (feverArmed)
    if (this.feverArmed) {
      const win = result.kind === 'cup' || Boolean(this.pendingHit);
      const pt = win
        ? this.projectPos((result.cup || this.pendingHit).x, (result.cup || this.pendingHit).z)
        : this.projectPos(b.x, b.z);
      if (win) this.audio.play('feverWin');
      else this.audio.play('feverLose');
      this.renderer.endFever?.(win, pt);
      if (win) this.hooks.toast?.('EXTREME FEVER! 🔥🎉', 'hot');
      else this.hooks.toast?.('A bola escapou! 😱');
      this.hooks.vibrate?.(win ? [80, 40, 80, 120] : 40);
    }
    if (this.feverThrow || this.feverArmed) {
      this.renderer.camFollow = false; // câmera volta, com easing, ao enquadramento normal
      this.feverThrow = false;
      this.feverArmed = false;
      this.feverCup = null;
    }

    this.pushHud();
    this.schedule(0.95, () => this.afterThrow());
  }

  registerHit(cup, landing, knocked) {
    this.lastRimCup = null;

    const pt = this.projectPos(cup.x, cup.z);
    if (knocked) {
      this.audio.play('rim');
      this.renderer.float(pt.x, pt.y - 28, 'DERRUBOU!', '#ffd600');
      this.renderer.bounce(pt.x, pt.y);
    } else {
      cup.state = 'hit';
      cup.anim = 0;
      this.audio.play('splash');
      this.audio.play('fanfare');
      this.renderer.flash?.(0.5);
      this.renderer.splash(pt.x, pt.y, 1);
      this.renderer.float(
        pt.x,
        pt.y - 30,
        ['NA CESTA!', 'BOA!', '+1', 'CRAVOU!', 'PERFEITO!'][(Math.random() * 5) | 0],
        '#ffd166'
      );
    }

    this.renderer.shake = this.renderer.reducedMotion ? 0 : 11;
    this.renderer.setHeat?.(Math.min(1, this.streak / 5));
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

  registerRim(cup) {
    cup.wobble = 1;
    this.audio.play('rim');
    const pt = this.projectPos(cup.x, cup.z);
    this.renderer.bounce(pt.x, pt.y);
    this.renderer.float(pt.x, pt.y - 26, 'Na borda!', '#f6b3b0');
    this.streak = 0;
    this.renderer.setHeat?.(0);
    this.hooks.vibrate?.(10);
  }

  registerMiss(landing) {
    this.audio.play('bounce');
    const pt = this.projectPos(landing.x, landing.z);
    this.renderer.bounce(pt.x, pt.y);
    this.renderer.float(pt.x, pt.y - 20, 'Errou', '#8a6a63');
    this.streak = 0;
    this.renderer.setHeat?.(0);
  }

  /* =========================================================
     Turn flow
     ========================================================= */

  afterThrow() {
    this.ball.visible = false;

    if (this.mode === 'practice') {
      const cleared = this.rack.every(isOut);
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

    if (this.opponent.cups.every(isOut)) {
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
    this.previewKey = '';
    this.previewPoints = [];
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
    this.sim = null;

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

    const accuracy = statsPlayer.throws
      ? Math.round((statsPlayer.hits / statsPlayer.throws) * 100)
      : 0;
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
