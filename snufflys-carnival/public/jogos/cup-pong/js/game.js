import {
  DIFFICULTIES, PHYS,
  PRACTICE_MAX_CUPS, PRACTICE_SHAPES, rackPositions,
} from './config.js';
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

function makeCups(shape, count) {
  // forma: 'pyramid' (padrão da rack real) | diamond | line | circle | v | random
  const s = shape || 'pyramid';
  const n = s === 'pyramid' && count == null ? 10 : clampCount(count);
  const positions = rackPositions(s, n);
  const cups = [];
  positions.forEach(({ x, z }, idx) => {
    cups.push({
      id: `c-${idx}`,
      x,
      z,
      state: 'up', // 'up' | 'down' (tombado) | 'hit' (sucumbido)
      anim: 0,
      wobble: 0,
      tilt: 0,
      tiltVel: 0,
      tipKick: 0,
      fallT: 0,
      fallDir: 1,
    });
  });
  return cups;
}

function clampCount(n) {
  return Math.max(1, Math.min(PRACTICE_MAX_CUPS, Math.round(Number(n) || 10)));
}

function makePlayer(name, shape, count) {
  return {
    name,
    cups: makeCups(shape, count),
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
    // treino livre: forma + quantidade (persistem no store)
    const prac = this.store.settings.practice || {};
    this.practiceShape = PRACTICE_SHAPES.some((s) => s.id === prac.shape) ? prac.shape : 'pyramid';
    this.practiceCount = clampCount(prac.count);
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
    this.feverThrow = false;
    this.feverArmed = false;
    this.feverNear = false;
    this.feverOutcome = null;
    this.feverOutcomeT = 0;
    this.feverOutcomeHold = 0;
    this.feverWaitT = 0;
    this.cpuTarget = null;
    this.renderer.resetStates?.();
  }

  /* treino: ajustar forma/quantidade dos copos (aplica no rack imediatamente) */
  setPractice(shape, count) {
    if (shape && PRACTICE_SHAPES.some((s) => s.id === shape)) this.practiceShape = shape;
    if (count != null) this.practiceCount = clampCount(count);
    this.store.settings.practice = { shape: this.practiceShape, count: this.practiceCount };
    saveStore(this.store);
    if (this.mode === 'practice') {
      this.players[1].cups = makeCups(this.practiceShape, this.practiceCount);
      this.pushHud();
    }
  }

  start(mode) {
    const safeMode = mode === 'local' || mode === 'practice' ? mode : 'cpu';
    this.mode = safeMode;
    this.lastMode = safeMode;
    const p2name = safeMode === 'local' ? 'Jogador 2' : safeMode === 'practice' ? 'Alvos' : 'CPU';
    this.players = [
      makePlayer('Você'),
      makePlayer(p2name, safeMode === 'practice' ? this.practiceShape : undefined,
        safeMode === 'practice' ? this.practiceCount : undefined),
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
    this.feverNear = false;
    this.feverThrow = false;
    this.feverArmed = false;
    this.feverOutcome = null;
    this.feverOutcomeT = 0;
    this.feverOutcomeHold = 0;
    this.feverWaitT = 0;
    this.renderer.resetStates?.(); // câmera/zoom/fever/slow-mo de volta ao neutro

    this.audio.unlock();
    this.audio.play('turn');
    this.audio.stopFeverMusic(600); // nada de música órfã de partida anterior
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
    this.audio.stopFeverMusic(600);
    this.resetDemo(); // reset completo de estado + câmera, conserva stats
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

    // veredito do último copo: aplica APÓS o hold de slow-mo (tempo em
    // real — o dt chega escalado pelo timeScale do renderer); fail-safe
    // força o veredito se o relógio ficar preso (pause/throttle/tab)
    if (this.feverOutcome) {
      if (this.feverOutcomeHold > 0) {
        const ts = this.renderer.timeScale > 0 ? this.renderer.timeScale : 1;
        this.feverOutcomeT += dt / ts;
        if (this.feverOutcomeT >= this.feverOutcomeHold + 1.5) {
          this.feverOutcomeT = this.feverOutcomeHold; // força o veredito
        }
      }
      this.applyFeverOutcome(); // guarda interno respeita o relógio
    } else {
      this.checkFeverTimeout(dt); // 1.5s sem entrar = veredito de erro
    }

    // mira da CPU: desliza do centro ao alvo; pontos do preview acompanham
    if (this.phase === 'cpu-aim' && this.cpuThinking && this.cpuTarget) {
      this.cpuAimT = Math.min(1.05, (this.cpuAimT || 0) + dt);
      const t = Math.min(1, this.cpuAimT / 1.0);
      const e = 1 - (1 - t) * (1 - t); // ease-out
      this.aim.x = this.cpuAimFrom.x + (this.cpuTarget.x - this.cpuAimFrom.x) * e;
      this.aim.z = this.cpuAimFrom.z + (this.cpuTarget.z - this.cpuAimFrom.z) * e;
      this.cpuPrevTimer = (this.cpuPrevTimer || 0) + dt;
      if (this.cpuPrevTimer > 0.09) {
        this.cpuPrevTimer = 0;
        this.updatePreview();
      }
    }

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
        onApproach: (cs, pos) => this.onFeverApproach(cs, pos),
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
    // ÚLTIMO COPO: TOCA A BORDA = ERRO — encerra a cena AGORA no contato
    // (não espera a bola rolar pela mesa); se depois cair dentro, o fever
    // volta a ser montado pelo onCupEnter e a música estoura de novo.
    if (this.feverThrow && !this.feverArmed && this.feverNear) {
      this.closeFeverOnRim(pos);
    }
    const pt = this.projectPos(mToXu(pos.x), mToZu(pos.d));
    this.renderer.bounce(pt.x, pt.y - 12);
    this.hooks.vibrate?.(6);
  }

  /* ÚLTIMO COPO: TOCA A BORDA OU ERRA — o desfecho NÃO é instantâneo:
     estaga o resultado, dá 1s de slow-mo pino (tempo real) e aí aplica.
     Se no meio do suspense a bola cair dentro, o outcome estagado é
     cancelado e o EXTREME FEVER toma conta (música estoura de novo). */
  closeFeverOnRim(pos) {
    this.stageFeverOutcome(mToXu(pos.x), mToZu(pos.d));
  }

  stageFeverOutcome(xu, zu) {
    if (!this.feverNear || this.feverOutcome) return; // 1 vez; onEnter cancela
    const pt = this.projectPos(xu, zu);
    const hold = this.renderer.reducedMotion ? 0 : 1.5;
    this.feverOutcome = { win: false, pt };
    this.feverOutcomeT = 0;
    this.feverOutcomeHold = hold;
    if (hold > 0) this.renderer.slowMo?.(0.22, hold); // 1.5s pino antes do veredito
  }

  /* relógio da cena: se em 1.5s a bola NÃO entrou no buraco, o veredito
     de erro é aplicado na hora e o EXTREME FEVER é invalidado (o guard
     `!feverThrow` impede o onCupEnter de remontar depois do prazo). */
  checkFeverTimeout(dt) {
    if (!this.feverThrow || !this.feverNear || this.feverArmed || this.feverOutcome) return;
    const ts = this.renderer.timeScale > 0 ? this.renderer.timeScale : 1;
    this.feverWaitT += dt / ts;
    if (this.feverWaitT < 1.5) return;
    this.feverThrow = false; // invalida o fever: nada mais remonta a cena
    this.feverOutcome = { win: false, pt: this.projectPos(this.ball.x, this.ball.z) };
    this.feverOutcomeT = 0;
    this.feverOutcomeHold = 0; // sem hold extra: o prazo de 1.5s já passou
    this.applyFeverOutcome();
  }

  applyFeverOutcome() {
    const o = this.feverOutcome;
    if (!o) return;
    if (this.feverOutcomeT < this.feverOutcomeHold) return; // guarda pelo relógio
    this.feverOutcome = null;
    this.feverOutcomeT = 0;
    this.feverOutcomeHold = 0;
    this.feverNear = false; // resolveThrow não refaz o desfecho de derrota
    this.renderer.camFollow = false; // timeout encerra o throw antes do fim
    this.renderer.endFever?.(false, o.pt);
    this.audio.duckFeverMusic();
    this.hooks.toast?.('A bola escapou! 😱');
    this.hooks.vibrate?.(40);
  }

  /* cena de PÂNICO no último copo: a bola está caindo quase na boca —
     música já estoura e slow-mo garante ~1s de tempo real ANTES do contato
     (entre ou raspe, a plateia já gritou) */
  onFeverApproach() {
    if (!this.feverThrow || this.feverNear) return;
    this.feverNear = true;
    this.feverWaitT = 0;
    this.renderer.slowMo?.(0.22, 1.0); // 1s de slow-mo pino (tempo real)
    this.renderer.startFever?.(); // dramaturgia: banner + calor já entram
    this.audio.playFeverMusic();
  }

  /* bola cruzou o rim POR DENTRO>PONTO DE NÃO-RETORNO: estoura o EXTREME FEVER */
  onCupEnter(cs) {
    if (!this.feverThrow || this.feverArmed) return;
    this.feverArmed = true;
    this.feverOutcome = null; // cancela veredito estagado: entrou = vitória
    this.feverOutcomeT = 0;
    this.feverWaitT = 0; // cena vencida na vitória: relógio de não-entrada para
    this.renderer.startFever?.();
    this.audio.play('fever');
    this.audio.playFeverMusic(); // MÚSICA estoura com o fever
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
      let pt = win
        ? this.projectPos((result.cup || this.pendingHit).x, (result.cup || this.pendingHit).z)
        : this.projectPos(b.x, b.z);
      if (win) {
        // escala de tela do copo para os efeitos (estrelas nascem na boca)
        const cupRef = result.cup || this.pendingHit || this.feverCup;
        const cs = cupRef && this.renderer.cupScreen ? this.renderer.cupScreen(cupRef) : null;
        if (cs) pt = { ...pt, rx: cs.rx, ry: cs.ry };
      }
      if (win) {
        this.audio.play('feverWin');
        this.audio.play('feverStars'); // camada das estrelas nascendo do copo
        // música SEGUE tocando: começa a diminuir só no fim da partida
      } else {
        this.audio.play('feverLose');
        this.audio.duckFeverMusic(); // TOM desce rápido até sumir
      }
      this.renderer.endFever?.(win, pt);
      if (win) this.hooks.toast?.('EXTREME FEVER! 🔥🎉', 'hot');
      else this.hooks.toast?.('A bola escapou! 😱');
      this.hooks.vibrate?.(win ? [80, 40, 80, 120] : 40);
    }
    // RASPA/ERRO no último copo (não entrou): se a plateia já viu a bola
    // quase entrar (feverNear), NÃO aplica na hora — 1s de slow-mo pino
    // e o veredito cai depois (applyFeverOutcome); erros distantes seguem
    // sem estardalhaço.
    if (this.feverThrow && !this.feverArmed && this.feverNear) {
      this.stageFeverOutcome(b.x, b.z);
    }
    if (this.feverThrow || this.feverArmed) {
      this.renderer.camFollow = false; // câmera volta, com easing, ao enquadramento normal
      this.feverThrow = false;
      this.feverArmed = false;
      this.feverNear = false;
      this.feverOutcome = null;
      this.feverOutcomeT = 0;
      this.feverOutcomeHold = 0;
      this.feverWaitT = 0;
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
          this.players[1].cups = makeCups(this.practiceShape, this.practiceCount);
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
      this.cpuTarget = {
        x: clamp(plane.x, -0.94, 0.94),
        z: clamp(plane.z, 0.56, 0.965),
      };
    } else {
      this.cpuTarget = { x: 0, z: 0.84 };
    }

    // desliza da mira neutra até o alvo; pontos do preview seguem os passos
    this.cpuAimFrom = { x: this.aim.x || 0, z: this.aim.z || 0.84 };
    this.cpuAimT = 0;
    this.cpuPrevTimer = 0;
    this.aim.x = this.cpuAimFrom.x;
    this.aim.z = this.cpuAimFrom.z;
    this.updatePreview();

    this.pushHud();
    this.schedule(1.15, () => {
      this.cpuThinking = false;
      this.aim.active = false;
      this.cpuTarget = null;
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
    // música do fever SEGUE na tela de resultado: só para (fade) numa nova
    // partida ou ao voltar para o menu (start()/toMenu() chamam o stop)
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
      totals: this.players.map((p) => p.cups.length),
      turn: this.turn,
      throwsLeft: this.throwsLeft,
      streak: this.streak,
      accuracy,
      phase: this.phase,
      cpuThinking: this.cpuThinking,
    });
  }
}
