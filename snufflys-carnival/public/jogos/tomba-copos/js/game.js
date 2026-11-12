/* ============================================================
   Tomba-Copos de Carnaval — motor do jogo (Canvas 2D)
   - Pirâmide 3-2-1 de copos carnavalescos sobre uma mesa
   - Bola de tênis de mesa lançada por gesto (slingshot) com física própria
   - Copos derrubados derrubam copos de cima (reação em cadeia)
   - Pontuação: TODO copo que cair vale 1 ponto (direto pela bola ou
     em cascata) — ver docs/casos-de-teste.md (CT-01)
   ============================================================ */
(function () {
  'use strict';

  // ---------- Referências ----------
  // Fallback: roundRect não existe em navegadores mais antigos
  if (
    typeof CanvasRenderingContext2D !== 'undefined' &&
    !CanvasRenderingContext2D.prototype.roundRect
  ) {
    CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
      r = Math.min(r, w / 2, h / 2);
      this.moveTo(x + r, y);
      this.arcTo(x + w, y, x + w, y + h, r);
      this.arcTo(x + w, y + h, x, y + h, r);
      this.arcTo(x, y + h, x, y, r);
      this.arcTo(x, y, x + w, y, r);
      this.closePath();
      return this;
    };
  }

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const hudBalls = document.getElementById('hud-balls');
  const hudCups = document.getElementById('hud-cups');
  const hint = document.getElementById('hint');

  // ---------- Áudio (WebAudio, sem arquivos) ----------
  let actx = null;
  function audio() {
    if (!actx) {
      try {
        actx = new (window.AudioContext || window.webkitAudioContext)();
      } catch (e) {
        return null;
      }
    }
    if (actx.state === 'suspended') actx.resume();
    return actx;
  }
  function beep(freq, dur, type, vol, slideTo) {
    const a = audio();
    if (!a) return;
    const o = a.createOscillator(),
      g = a.createGain();
    o.type = type || 'triangle';
    o.frequency.setValueAtTime(freq, a.currentTime);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, a.currentTime + dur);
    g.gain.setValueAtTime(vol || 0.15, a.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + dur);
    o.connect(g);
    g.connect(a.destination);
    o.start();
    o.stop(a.currentTime + dur);
  }
  const sfx = {
    whoosh: () => beep(500, 0.28, 'sine', 0.08, 130),
    knock: (i) => beep(150 + i * 25, 0.16, 'square', 0.16, 70),
    bounce: () => beep(220, 0.08, 'triangle', 0.08, 140),
    win: () => {
      [523, 659, 784, 1046, 784, 1046].forEach((f, i) =>
        setTimeout(() => beep(f, 0.18, 'square', 0.12), i * 120)
      );
    },
    lose: () => {
      [392, 330, 262].forEach((f, i) => setTimeout(() => beep(f, 0.3, 'sawtooth', 0.1), i * 220));
    },
    chain: (i) => beep(200 + i * 40, 0.12, 'square', 0.12, 90),
  };

  // ---------- Estado global ----------
  const TOTAL_BALLS = 3;
  const TOTAL_CUPS = 6;
  const WIN_CUPS = 5; // precisos para ganhar

  let W = 0,
    H = 0,
    dpr = 1;
  let mode = 'start'; // start | play | ended
  let ballsLeft = TOTAL_BALLS;
  let knocked = 0; // TOTAL de copos derrubados (direto ou em cascata) — todos pontuam
  let directHits = 0; // copos derrubados DIRETO pela bola (estatística do resumo)
  let cascade = 0; // copos que caíram por reação em cadeia (também pontuam)
  let throwIndex = 0; // nº do arremesso atual (1-based)
  let cups = [];
  let ball = null;
  let dragging = null; // {x0,y0,x1,y1}
  let celebrate = false;
  let confetti = [];
  let lastTime = 0;
  let hooks = null; // callbacks da UI (app.js)

  // ---------- Configuração da pirâmide ----------
  // rows: 0 = base (3 copos), 1 = meio (2), 2 = topo (1)
  const SUPPORTS = [[], [], [], [0, 1], [1, 2], [3, 4]];

  function layout() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.parentElement.getBoundingClientRect();
    W = rect.width;
    H = rect.height;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const u = Math.min(W, H * 0.72); // unidade de escala
    cupW = u * 0.135;
    cupH = cupW * 1.28;
    cupGap = cupW * 0.14;
    tableY = H * 0.52;
    tableW = u * 0.86;
    launch.x = W * 0.5;
    launch.y = H * 0.9;
    ballR = u * 0.052;
    maxPull = H * 0.24;
    maxSpeed = H * 1.78; // garante alcance até o topo da pirâmide
    grav = H * 2.1;
    groundY = H * 0.965; // linha do chão do jogo

    // recoloca copos em pé
    buildCupPositions();
  }

  let cupW = 40,
    cupH = 52,
    cupGap = 6,
    tableY = 0,
    tableW = 300,
    ballR = 16;
  const launch = { x: 0, y: 0 };
  let maxPull = 100,
    maxSpeed = 800,
    grav = 1200,
    groundY = 0;

  function makeCup(index, row, x) {
    const palettes = [
      { a: '#ff5fa2', b: '#c2185b', deco: '#ffd600' },
      { a: '#ff8a80', b: '#b71c1c', deco: '#ffd600' },
      { a: '#e53935', b: '#7f1010', deco: '#ffd600' },
      { a: '#ffd600', b: '#f2a900', deco: '#b71c1c' },
      { a: '#ffab91', b: '#d84315', deco: '#ffd600' },
      { a: '#ffcdd2', b: '#e53935', deco: '#7f1010' },
    ];
    return {
      id: index,
      row,
      x0: x,
      y0: tableY - cupH / 2 - row * (cupH * 0.88),
      x,
      y: tableY - cupH / 2 - row * (cupH * 0.88),
      w: cupW,
      h: cupH,
      pal: palettes[index % palettes.length],
      state: 'standing', // standing | falling | rest | gone
      angle: 0,
      va: 0,
      vx: 0,
      vy: 0,
      dir: 1,
      alpha: 1,
      scheduledAt: 0,
      hitFlash: 0,
      calm: 0, // acumulador de "tempo calmo" até apoiar em repouso
      tippedUp: false, // garante 1 único empurrão do equilíbrio instável
    };
  }

  function buildCupPositions() {
    const cx = W * 0.5;
    const s = cupW + cupGap;
    const old = cups;
    cups = [
      makeCup(0, 0, cx - s),
      makeCup(1, 0, cx),
      makeCup(2, 0, cx + s),
      makeCup(3, 1, cx - s / 2),
      makeCup(4, 1, cx + s / 2),
      makeCup(5, 2, cx),
    ];
    // preserva copos já derrubados ao redimensionar
    if (old && old.length === 6) {
      for (let i = 0; i < 6; i++) {
        if (old[i].state !== 'standing') {
          cups[i].state = 'gone';
          cups[i].alpha = 0;
        }
      }
    }
  }

  // ---------- Confete de fundo (sempre caindo, clima de folia) ----------
  const bgConfetti = [];
  function seedBackgroundConfetti() {
    bgConfetti.length = 0;
    const n = Math.round((W * H) / 9000);
    for (let i = 0; i < n; i++) {
      bgConfetti.push({
        x: Math.random() * W,
        y: Math.random() * H,
        s: 3 + Math.random() * 5,
        vy: 12 + Math.random() * 26,
        vx: (Math.random() - 0.5) * 14,
        rot: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 3,
        c: ['#ffd600', '#ffffff', '#e53935', '#ff8a80', '#f2a900'][(Math.random() * 5) | 0],
      });
    }
  }

  function burstConfetti(n) {
    for (let i = 0; i < n; i++) {
      confetti.push({
        x: W * (0.2 + Math.random() * 0.6),
        y: H * 0.45 - Math.random() * H * 0.2,
        vx: (Math.random() - 0.5) * W * 0.45,
        vy: -H * (0.25 + Math.random() * 0.5),
        s: 4 + Math.random() * 7,
        rot: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 8,
        c: ['#ffd600', '#ffffff', '#e53935', '#ff8a80', '#fff8f0'][(Math.random() * 5) | 0],
        life: 3.2 + Math.random() * 1.6,
      });
    }
  }

  // ---------- Controle de partida ----------
  function newGame() {
    mode = 'play';
    ballsLeft = TOTAL_BALLS;
    knocked = 0;
    directHits = 0;
    cascade = 0;
    throwIndex = 0;
    cups = [];
    buildCupPositions();
    ball = null;
    dragging = null;
    celebrate = false;
    confetti.length = 0;
    seedBackgroundConfetti();
    hint.classList.remove('hidden');
    updateHUD();
  }

  function updateHUD() {
    let s = '';
    for (let i = 0; i < TOTAL_BALLS; i++) s += i < ballsLeft ? '🏓' : '💤';
    hudBalls.textContent = s;
    hudCups.textContent = knocked + '/' + TOTAL_CUPS;
    if (hooks && hooks.onStats) hooks.onStats(knocked, ballsLeft);
  }

  function standsOn(i) {
    const sup = SUPPORTS[i];
    if (!sup.length) return true; // base sempre apoiada
    return sup.some((j) => cups[j].state === 'standing');
  }

  function checkChains(now) {
    let changed = false;
    for (const c of cups) {
      if (c.state === 'standing' && !standsOn(c.id)) {
        c.state = 'falling';
        c.scheduledAt = now + 120 + Math.random() * 160;
        // tomba para um dos lados ao perder sustentação
        c.dir = Math.random() < 0.5 ? -1 : 1;
        c.va = c.dir * (2 + Math.random() * 2.5);
        c.vx = c.dir * W * 0.04;
        c.vy = 0;
        // cascata: copo que cai porque perdeu o apoio (não foi atingido pela
        // bola). Também pontua: todo copo derrubado conta (CT-01), por isso
        // incrementa `knocked` junto com `cascade` (estatística do resumo).
        c.byCascade = true;
        c.cascadeThrow = throwIndex;
        cascade++;
        knocked++;
        sfx.chain(Math.min(cascade, 6));
        changed = true;
      }
    }
    // cascata multinível: reavalia o apoio até a pirâmide estabilizar
    if (changed) {
      // pontuação visível imediatamente: cada copo de cascata soma no HUD
      // e nos stats da UI assim que começa a cair (CT-01)
      updateHUD();
      setTimeoutWorld(() => checkChains(perfNow()), 260);
    }
    return changed;
  }

  function knockCup(c, fromX, power, bvx, bvy, bY) {
    // Impulso da bola aplicado no ponto de contato (corpo rígido com inércia)
    const invI = 12 / (c.h * c.h); // haste de comprimento h, massa 1
    const rx = Math.max(-c.w * 0.4, Math.min(c.w * 0.4, fromX - c.x)); // lado atingido
    const ry = Math.max(-c.h * 0.45, Math.min(c.h * 0.45, (bY || c.y) - c.y)); // altura do impacto
    const jx = (bvx || 0) * 0.8; // impulso calibrado para a jogabilidade (bola de tênis de mesa, 2,7 g)
    const jy = (bvy || 0) * 0.5;
    c.vx += jx;
    c.vy += jy * 0.4; // copo leve pode dar um pequeno "salto"
    c.va += (rx * jy - ry * jx) * invI; // torque: copo tomba natualmente
    c.dir = c.x >= fromX ? 1 : -1;
    c.state = 'falling';
    c.hitFlash = 1;
    c.hitThrow = throwIndex; // arremesso que derrubou o copo diretamente
    knocked++;
    directHits++;
    sfx.knock(Math.min(knocked, 6));
    updateHUD();
    burstConfetti(6);
    // reação em cadeia
    setTimeoutWorld(() => checkChains(perfNow()), 30);
  }

  // agendador simples baseado em tempo de jogo
  const timers = [];
  function setTimeoutWorld(fn, ms) {
    timers.push({ at: perfNow() + ms, fn });
  }
  function perfNow() {
    return performance.now();
  }

  // ---------- Lançamento (slingshot) ----------
  function pointerPos(e) {
    const r = canvas.getBoundingClientRect();
    const t = e.touches ? e.touches[0] : e;
    return { x: t.clientX - r.left, y: t.clientY - r.top };
  }

  canvas.addEventListener('touchstart', onDown, { passive: false });
  canvas.addEventListener('touchmove', onMove, { passive: false });
  canvas.addEventListener('touchend', onUp);
  canvas.addEventListener('mousedown', onDown);
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);

  function onDown(e) {
    if (mode !== 'play' || ball || dragging) return;
    e.preventDefault();
    const p = pointerPos(e);
    if (p.y > H * 0.55) {
      // zona de lançamento: metade de baixo
      dragging = { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
      audio();
      hint.classList.add('hidden');
    }
  }
  function onMove(e) {
    if (!dragging) return;
    e.preventDefault();
    const p = pointerPos(e);
    dragging.x1 = p.x;
    dragging.y1 = p.y;
  }
  function onUp() {
    if (!dragging) return;
    const dx = dragging.x0 - dragging.x1;
    const dy = dragging.y0 - dragging.y1; // puxou para baixo => dy < 0 => joga para cima
    const len = Math.hypot(dx, dy);
    if (len >= maxPull * 0.18 && mode === 'play' && !ball) {
      throwIndex++; // novo arremesso — cascata a partir dele é do throwIndex
      const k = Math.min(len, maxPull) / maxPull;
      const n = Math.max(len, 1);
      // Gesto de estilingue: o lançamento vai no SENTIDO OPOSTO ao arraste
      // (puxa para baixo => dy < 0 => vy negativo => sobe). Antes o sinal de
      // vy estava invertido e "puxar para baixo" jogava a bola para baixo.
      const vx = (dx / n) * maxSpeed * k;
      const vy = (dy / n) * maxSpeed * k;
      ball = {
        x: launch.x,
        y: launch.y - ballR,
        vx,
        vy,
        spin: 0,
        vspin: vx * 0.03,
        rest: 0,
        alive: true,
      };
      ballsLeft--;
      updateHUD();
      sfx.whoosh();
    }
    dragging = null;
  }

  // ---------- Simulação ----------
  function step(dt, now) {
    // timers de cadeia
    for (let i = timers.length - 1; i >= 0; i--) {
      if (now >= timers[i].at) {
        const f = timers[i].fn;
        timers.splice(i, 1);
        f();
      }
    }

    // copos: corpo rígido tipo "haste" (copo visto de lado)
    // gravidade, inércia rotacional, impulso normal com restituição e atrito
    const INV_I = 12 / (cupH * cupH); // 1/I da haste de comprimento cupH
    for (const c of cups) {
      if (c.state === 'falling' && now >= c.scheduledAt) {
        c.vy += grav * dt;
        c.vx *= 1 - 0.3 * dt; // arrasto do ar
        c.va *= 1 - 0.4 * dt;
        c.x += c.vx * dt;
        c.y += c.vy * dt;
        c.angle += c.va * dt;

        const st = Math.sin(c.angle),
          ct = Math.cos(c.angle);
        // extremos do eixo do copo (borda e base), a partir do centro
        const axL = (st * c.h) / 2,
          ayL = (-ct * c.h) / 2; // borda (topo)
        // ponto de contato = extremo mais baixo
        const rimLow = ayL > -ayL;
        const rx = rimLow ? axL : -axL;
        const ry = Math.max(ayL, -ayL);

        // chão: mesa quando derrapa sobre o tampo, senão o piso do jogo
        const onTableX = c.x + rx > W / 2 - tableW / 2 && c.x + rx < W / 2 + tableW / 2;
        const overTable = c.y + ry < tableY + cupH && c.y > tableY - cupH * 2;
        const floorAt = onTableX && overTable ? tableY : groundY;

        // espessura do copo: deitado, o centro fica ~metade da largura acima
        const lowY = c.y + ry;
        if (lowY > floorAt - c.w * 0.35) {
          c.y -= lowY - (floorAt - c.w * 0.35); // resolve penetração

          // velocidade do ponto de contato (v + ω × r)
          const pvy = c.vy + c.va * rx;

          if (pvy > 0) {
            if (pvy < H * 0.06) {
              // Contato de repouso: sem quique (elimina o tremor no chão).
              // Zera a componente normal da velocidade no ponto de contato e
              // aplica atrito de rolagem forte.
              c.vy -= pvy;
              if (c.vy > 0) c.vy = 0;
              c.va *= 1 - Math.min(3 * dt, 0.4);
              const pvx2r = c.vx - c.va * ry;
              const invMefftr = 1 + ry * ry * INV_I;
              const jtr = Math.max(-H * 0.05, Math.min(H * 0.05, -pvx2r / invMefftr));
              c.vx += jtr;
              c.vx *= 1 - Math.min(4 * dt, 0.5); // arrasto do apoio
              c.va += -ry * jtr * INV_I;
            } else {
              // impulso normal com restituição (plástico quica pouco)
              const invMeff = 1 + rx * rx * INV_I;
              const jn = (-(1 + 0.35) * pvy) / invMeff;
              c.vy += jn;
              c.va += rx * jn * INV_I;
              // atrito no ponto de contato (faz o copo girar/parar de girar)
              const pvx2 = c.vx - c.va * ry;
              const invMefft = 1 + ry * ry * INV_I;
              let jt = -pvx2 / invMefft;
              const maxF = 0.5 * Math.abs(jn);
              jt = Math.max(-maxF, Math.min(maxF, jt));
              c.vx += jt;
              c.va += -ry * jt * INV_I;
              sfx.bounce();
            }
          }

          // copo quase "em pé" sobre a base tomba sozinho (equilíbrio instável):
          // empurrão determinístico aplicado UMA vez por copo — o impulso
          // aleatório repetido a cada contato reanimava copos quase parados
          // e era a causa do tremor perpétuo no chão
          if (Math.abs(ct) > 0.55 && Math.abs(c.va) < 0.6 && !c.tippedUp) {
            c.tippedUp = true;
            c.calm = 0;
            c.va += c.dir * (2.2 + Math.random() * 1.2);
          }

          // repouso por tempo calmo: frames consecutivos de energia baixa e
          // quase deitado — o teste instantâneo de limiar oscilava (velocidade
          // gravitacional por frame roça o limiar), mantendo copos tremendo
          const calm = Math.abs(c.vy) < H * 0.1 && Math.abs(c.vx) < 14 && Math.abs(c.va) < 1.2;
          if (calm && Math.abs(ct) < 0.75) {
            c.calm += dt;
            if (c.calm > 0.22) {
              c.state = 'rest';
              c.angle = Math.round((c.angle - Math.PI / 2) / Math.PI) * Math.PI + Math.PI / 2;
              c.vx = 0;
              c.vy = 0;
              c.va = 0;
              c.calm = 0;
            }
          } else {
            c.calm = 0;
          }
        }

        // some só se sair da tela
        if (c.x < -cupW || c.x > W + cupW) {
          c.state = 'gone';
          c.alpha = 0;
        }
      }
      if (c.hitFlash > 0) c.hitFlash -= dt * 3;
    }

    // bola
    if (ball && ball.alive) {
      ball.vy += grav * dt;
      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt;
      ball.spin += ball.vspin * dt;

      // quique na mesa
      const tableTop = tableY;
      const onTableX = Math.abs(ball.x - W / 2) < tableW / 2;
      if (
        ball.y + ballR > tableTop &&
        ball.vy > 0 &&
        onTableX &&
        ball.y + ballR < tableTop + cupH
      ) {
        ball.y = tableTop - ballR;
        ball.vy *= -0.45;
        ball.vx *= 0.8;
        ball.vspin *= 0.7;
        if (Math.abs(ball.vy) < H * 0.03) ball.vy = 0;
        sfx.bounce();
      }

      // colisão com copos em pé
      for (const c of cups) {
        if (c.state !== 'standing') continue;
        const hw = c.w / 2 + ballR * 0.8;
        const hh = c.h / 2 + ballR * 0.8;
        if (Math.abs(ball.x - c.x) < hw && Math.abs(ball.y - c.y) < hh) {
          const speed = Math.hypot(ball.vx, ball.vy);
          knockCup(c, ball.x, Math.min(speed / maxSpeed, 1), ball.vx, ball.vy, ball.y);
          // impulso calibrado: a bola leve desvia pouco ao acertar o copo
          ball.vx *= 0.8;
          ball.vy *= 0.8;
          ball.vspin = (Math.random() - 0.5) * 6;
        }
      }

      // quique no chão do jogo
      if (ball.y + ballR > groundY && ball.vy > 0) {
        ball.y = groundY - ballR;
        ball.vy *= -0.5;
        ball.vx *= 0.85;
        ball.vspin *= 0.7;
        if (Math.abs(ball.vy) < H * 0.025) ball.vy = 0;
        sfx.bounce();
      }

      // fim da vida da bola
      if (ball.x < -ballR * 3 || ball.x > W + ballR * 3 || ball.y < -H) {
        ball.alive = false;
        ball = null;
        setTimeoutWorld(() => endOfThrow(), 350);
      }

      // trava de segurança: bola muito lenta (inclui os micro-quiques de
      // repouso na mesa; antes ela ficava presa e travava a partida)
      if (ball && Math.hypot(ball.vx, ball.vy) < H * 0.045) {
        ball.rest += dt;
        if (ball.rest > 0.6) {
          ball.alive = false;
          ball = null;
          setTimeoutWorld(() => endOfThrow(), 250);
        }
      } else if (ball) {
        ball.rest = 0;
      }
    }

    // confete de fundo
    for (const f of bgConfetti) {
      f.y += f.vy * dt;
      f.x += f.vx * dt + Math.sin(now / 700 + f.rot) * 0.3;
      f.rot += f.vr * dt;
      if (f.y > H + 10) {
        f.y = -10;
        f.x = Math.random() * W;
      }
    }
    // confete de vitória
    if (celebrate) {
      for (const f of confetti) {
        f.vy += grav * 0.55 * dt;
        f.x += f.vx * dt;
        f.y += f.vy * dt;
        f.vx *= 0.995;
        f.rot += f.vr * dt;
        f.life -= dt;
      }
      confetti = confetti.filter((f) => f.life > 0 && f.y < H + 20);
    }
  }

  function endOfThrow() {
    checkChains(perfNow());
    updateHUD();
    if (mode !== 'play') return;
    // Todo copo que caiu pontua (direto pela bola ou em cascata) — CT-01.
    if (knocked >= WIN_CUPS) {
      setTimeoutWorld(() => finish(true), 700);
    } else if (ballsLeft <= 0) {
      setTimeoutWorld(() => finish(false), 700);
    } else hint.classList.remove('hidden');
  }

  /** Resumo por jogada: copos individuais (bola) e em cascata, por arremesso. */
  function throwsBreakdown() {
    const list = [];
    for (let i = 1; i <= throwIndex; i++) {
      const direct = cups.filter((c) => c.hitThrow === i).length;
      const casc = cups.filter((c) => c.cascadeThrow === i).length;
      if (direct || casc) list.push({ n: i, direct, casc });
    }
    return list;
  }

  function finish(won) {
    if (mode === 'ended') return;
    mode = 'ended';
    if (won) {
      celebrate = true;
      burstConfetti(90);
      sfx.win();
    } else {
      sfx.lose();
    }
    // copos derrubados no total (diretos + cascata) e detalhe por jogada
    const stats = { knocked, direct: directHits, cascade, throws: throwsBreakdown() };
    if (hooks && hooks.onFinish) hooks.onFinish(won, stats);
    // Ranking global (API do site): pontos pelos copos derrubados e bolas sobrando
    const bridge = window.SnufflyScores;
    if (bridge) {
      const points = won ? 300 + knocked * 50 + ballsLeft * 100 : knocked * 25;
      bridge.submitScore(points);
    }
  }

  // ---------- Desenho ----------
  function drawFloor() {
    // chão do jogo
    const g = ctx.createLinearGradient(0, groundY - 6, 0, H);
    g.addColorStop(0, '#55220a');
    g.addColorStop(1, '#2b0a04');
    ctx.fillStyle = g;
    ctx.fillRect(0, groundY, W, H - groundY + 2);
    ctx.fillStyle = 'rgba(255,201,60,.25)';
    ctx.fillRect(0, groundY, W, 3);
  }

  function drawTable() {
    const x = W / 2 - tableW / 2;
    // tampo
    ctx.fillStyle = '#4a1500';
    ctx.beginPath();
    ctx.roundRect(x, tableY, tableW, 14, 6);
    ctx.fill();
    // saia franciscana dourada
    ctx.fillStyle = '#ff8a00';
    ctx.beginPath();
    ctx.moveTo(x, tableY + 14);
    const scallops = 8,
      sw = tableW / scallops;
    for (let i = 0; i < scallops; i++) {
      ctx.arc(x + sw * (i + 0.5), tableY + 14, sw / 2, 0, Math.PI, false);
    }
    ctx.lineTo(x, tableY + 14 + sw / 2);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#ffc93c';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  function drawCup(c) {
    if (c.state === 'gone') return;
    ctx.save();
    ctx.globalAlpha = Math.max(0, c.alpha);
    ctx.translate(c.x, c.y);
    ctx.rotate(c.angle);
    const w = c.w,
      h = c.h;
    const topW = w,
      botW = w * 0.78;

    // corpo do copo (trapézio invertido)
    const g = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
    g.addColorStop(0, c.pal.a);
    g.addColorStop(1, c.pal.b);
    ctx.fillStyle = g;
    ctx.strokeStyle = 'rgba(255,255,255,.55)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-topW / 2, -h / 2);
    ctx.lineTo(topW / 2, -h / 2);
    ctx.lineTo(botW / 2, h / 2);
    ctx.lineTo(-botW / 2, h / 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // borda superior
    ctx.fillStyle = 'rgba(255,255,255,.35)';
    ctx.beginPath();
    ctx.roundRect(-topW / 2, -h / 2, topW, h * 0.16, 3);
    ctx.fill();

    // máscara estampada (copos alternados)
    if (c.id % 2 === 0) {
      ctx.fillStyle = c.pal.deco;
      // olhos da máscara
      ctx.beginPath();
      ctx.ellipse(-w * 0.16, 0, w * 0.13, h * 0.1, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(w * 0.16, 0, w * 0.13, h * 0.1, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,.75)';
      ctx.beginPath();
      ctx.arc(-w * 0.16, 0, w * 0.055, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(w * 0.16, 0, w * 0.055, 0, Math.PI * 2);
      ctx.fill();
      // sorriso da máscara
      ctx.strokeStyle = c.pal.deco;
      ctx.lineWidth = Math.max(1.4, w * 0.05);
      ctx.beginPath();
      ctx.arc(0, h * 0.14, w * 0.2, Math.PI * 0.15, Math.PI * 0.85);
      ctx.stroke();
    } else {
      // confete estampado
      ctx.fillStyle = c.pal.deco;
      for (let i = 0; i < 7; i++) {
        const rx = ((i * 37) % 100) / 100 - 0.5;
        const ry = ((i * 61) % 100) / 100 - 0.5;
        ctx.beginPath();
        ctx.arc(rx * w * 0.6, ry * h * 0.55, w * 0.045, 0, Math.PI * 2);
        ctx.fill();
      }
      // fita de purpurina
      ctx.fillStyle = 'rgba(255,255,255,.5)';
      ctx.fillRect(-w * 0.5, h * 0.22, w, h * 0.06);
    }

    // flash de impacto
    if (c.hitFlash > 0) {
      ctx.globalAlpha = c.hitFlash * 0.7;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(0, 0, w * 0.7, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawBall(b) {
    ctx.save();
    ctx.translate(b.x, b.y);
    // bola de tênis de mesa: esfera branca lisa com sombreado e brilho
    // (sem girar visivelmente — esfera lisa, então o spin não desenha costura)
    ctx.fillStyle = '#fff8f0';
    ctx.beginPath();
    ctx.arc(0, 0, ballR, 0, Math.PI * 2);
    ctx.fill();
    // sombreado inferior (esfera, luz de cima)
    const sh = ctx.createRadialGradient(
      -ballR * 0.35,
      -ballR * 0.4,
      ballR * 0.2,
      0,
      0,
      ballR * 1.05
    );
    sh.addColorStop(0, 'rgba(255,255,255,.95)');
    sh.addColorStop(0.6, 'rgba(255,255,255,.35)');
    sh.addColorStop(1, 'rgba(160,120,60,.55)');
    ctx.fillStyle = sh;
    ctx.beginPath();
    ctx.arc(0, 0, ballR, 0, Math.PI * 2);
    ctx.fill();
    // brilho especular
    ctx.fillStyle = 'rgba(255,255,255,.9)';
    ctx.beginPath();
    ctx.arc(-ballR * 0.32, -ballR * 0.38, ballR * 0.2, 0, Math.PI * 2);
    ctx.fill();
    // contorno sutil
    ctx.strokeStyle = 'rgba(127,16,16,.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, ballR - 0.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawAim() {
    // sem indicador de mira ou força: apenas a bola apoiada no ponto de lançamento
    if (mode === 'play' && !ball) {
      const ghost = { x: launch.x, y: launch.y - ballR, spin: now() / 900 };
      drawBall(ghost);
    }
  }

  function draw() {
    // fundo
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#b71c1c');
    bg.addColorStop(0.65, '#7f1010');
    bg.addColorStop(1, '#3a0606');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // holofotes carnaval
    ctx.save();
    ctx.globalAlpha = 0.1;
    const spot = ctx.createRadialGradient(W / 2, -H * 0.2, 10, W / 2, -H * 0.2, H * 0.75);
    spot.addColorStop(0, '#ffe08a');
    spot.addColorStop(1, 'transparent');
    ctx.fillStyle = spot;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();

    // confete de fundo
    for (const f of bgConfetti) {
      ctx.save();
      ctx.translate(f.x, f.y);
      ctx.rotate(f.rot);
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = f.c;
      ctx.fillRect(-f.s / 2, -f.s / 4, f.s, f.s / 2);
      ctx.restore();
    }

    // faixa decorativa no topo
    ctx.fillStyle = 'rgba(255,214,0,.14)';
    ctx.fillRect(0, 0, W, H * 0.012);

    drawTable();
    drawFloor();
    for (const c of cups) drawCup(c);
    drawAim();
    if (ball && ball.alive) drawBall(ball);

    // confete de vitória (primeiro plano)
    if (celebrate) {
      for (const f of confetti) {
        ctx.save();
        ctx.translate(f.x, f.y);
        ctx.rotate(f.rot);
        ctx.globalAlpha = Math.min(1, f.life);
        ctx.fillStyle = f.c;
        ctx.fillRect(-f.s / 2, -f.s / 4, f.s, f.s / 2);
        ctx.restore();
      }
    }
  }

  // ---------- Integração ----------
  function loop(ts) {
    const dt = Math.min((ts - lastTime) / 1000, 0.05);
    lastTime = ts;
    if (mode === 'play' || mode === 'ended') step(dt, performance.now());
    draw();
    requestAnimationFrame(loop);
  }

  // ---------- Integração ----------
  function now() {
    return performance.now();
  }
  window.TombaCarnaval = {
    start() {
      newGame();
    },
    setHooks(h) {
      hooks = h;
    },
    resize() {
      layout();
      seedBackgroundConfetti();
    },
  };

  // ---------- Inicialização ----------
  layout();
  seedBackgroundConfetti();
  buildCupPositions();
  updateHUD();
  lastTime = performance.now();
  requestAnimationFrame(loop);

  let rzT;
  window.addEventListener('resize', () => {
    clearTimeout(rzT);
    rzT = setTimeout(() => window.TombaCarnaval.resize(), 150);
  });
})();
