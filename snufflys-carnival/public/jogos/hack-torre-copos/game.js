/* =========================================================
   Hack da Torre de Copos — game.js
   O "hack" verdadeiro, com física realista de copos plásticos:

   - Pirâmide invertida (boca para baixo, aro no chão).
   - Captura APENAS por varredura real: a coluna precisa passar
     POR CIMA do copo com o gesto em movimento — proximidade não
     captura nada.
   - Copos capturados permanecem de BOCA PARA BAIXO: a coluna
     pende do cursor e cada copo novo entra pela parte inferior
     dela, ficando um anel abaixo do anterior (pilha aninhada
     real, com sobreposição alta).
   - Soltar é INSTANTÂNEO: a coluna desce na hora com gravidade,
     sem penalidade se o encaixe estiver correto — e pode ser
     recapturada.
   - O gesto tem consequências: arrastar rápido demais ou de
     forma errada inclina a coluna (pêndulo amortecido); se a
     inclinação passar do limite, A TORRE TOMBA (os copos caem,
     espalham e precisam ser recolhidos; +1s). Copos que passam
     da borda da mesa CAEM FORA (+2s cada, voltam à pirâmide).
   - Fim: todos os copos em UMA pilha estável no chão.
   ========================================================= */
(() => {
  "use strict";

  /* ---------------- Configuração ---------------- */

  const LS_KEY = "hack-torre-copos.v4";

  const DIFF = {
    ensaio:   { rows: 3, cap: 15000, stars: [7000, 11000], tip: "Pirâmide 3-2-1: varra com o gesto, sem sacudir a torre!" },
    bloco:    { rows: 4, cap: 22000, stars: [11000, 17000], tip: "Movimento firme: gesto rápido demais tomba a torre." },
    apoteose: { rows: 5, cap: 30000, stars: [15000, 22000], tip: "15 copos! Eficiência e mãos firmes valem o troféu." },
  };

  const FLOOR = 6;
  const G = 260;             // gravidade (%/s²)
  const BOUNCE = 0.22;       // restituição dos impactos
  const NEST_RATIO = 0.10;   // anel visível de cada copo (fração da altura)
  const MIN_SWEEP = 35;      // velocidade mínima do gesto para capturar (%/s)
  const TILT_LIMIT = 0.38;   // ~22°: limite para derrubar a coluna
  const TILT_IMPULSE = 0.006; // resposta do pêndulo à aceleração do gesto

  const PENALTY_TUMBLE = 1000;  // torre tombou
  const PENALTY_OFFTABLE = 2000; // copo caiu da mesa

  const PRIZES = [
    { id: "estandarte", name: "Estandarte", stars: 1, img: "papercrafts/preview-estandarte.png", pdf: "papercrafts/estandarte.pdf", svg: "papercrafts/estandarte.svg" },
    { id: "mascara",    name: "Máscara",    stars: 2, img: "papercrafts/preview-mascara.png",    pdf: "papercrafts/mascara.pdf",    svg: "papercrafts/mascara.svg" },
    { id: "trofeu",     name: "Copo-troféu", stars: 3, img: "papercrafts/preview-trofeu.png",    pdf: "papercrafts/trofeu.pdf",     svg: "papercrafts/trofeu.svg" },
  ];

  /* ---------------- Estado ---------------- */

  let cfg = loadCfg();
  let geom = null;
  let cups = [];
  let stack = [];            // 0 = copo âncora na mão; anéis descem a partir dele
  let mode = "countdown";    // countdown | ready | holding | dropping | done
  let gestos = 0;
  let elapsed = 0;
  let startedAt = 0;
  let lastT = 0;
  let loopRunning = false;
  let gameToken = 0;

  let pointerX = 50, pointerY = 50;
  let prevX = 50, prevY = 50;
  let vx = 0, vy = 0;
  let tilt = 0, tiltV = 0;

  const els = {};

  function loadCfg() {
    try {
      const raw = JSON.parse(localStorage.getItem(LS_KEY) || "{}");
      return {
        sound: raw.sound !== false,
        diff: DIFF[raw.diff] ? raw.diff : "bloco",
        best: raw.best || {},
      };
    } catch {
      return { sound: true, diff: "bloco", best: {} };
    }
  }

  function saveCfg() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(cfg)); } catch { /* quota */ }
  }

  /* ---------------- Utilidades ---------------- */

  const $ = (id) => document.getElementById(id);
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

  function fmtTime(ms) {
    const n = Number.isFinite(ms) ? Math.max(0, ms) : 0;
    return (n / 1000).toFixed(1) + "s";
  }

  function msNow() {
    return elapsed + (startedAt ? performance.now() - startedAt : 0);
  }

  function starsFor(ms, diff) {
    if (!Number.isFinite(ms)) return 1;
    const s = DIFF[diff].stars;
    if (ms <= s[0]) return 3;
    if (ms <= s[1]) return 2;
    return 1;
  }

  function pointsFor(ms, stars, diff) {
    if (!Number.isFinite(ms)) ms = DIFF[diff].cap;
    const eficiencia = Math.max(0, gestos - 1) * 100;
    return Math.max(0, Math.round(DIFF[diff].cap - ms)) + stars * 200 - eficiencia;
  }

  function vibrate(pattern) {
    if (navigator.vibrate) navigator.vibrate(pattern);
  }

  function setTip(text) {
    els.tip.textContent = text;
  }

  function penalize(ms, msg) {
    elapsed += ms;
    els.timer.classList.add("is-penalty");
    window.setTimeout(() => els.timer.classList.remove("is-penalty"), 600);
    if (msg) setTip(msg);
  }

  /* ---------------- Geometria ---------------- */

  function buildGeom() {
    const rows = DIFF[cfg.diff].rows;
    const cupW = 94 / (rows + 1);
    const cupH = cupW * 1.32;
    geom = { rows, cupW, cupH, nest: cupH * NEST_RATIO, rowStep: cupH * 0.62 };
    els.stage.style.setProperty("--cup-w", cupW + "%");
  }

  function buildStage() {
    buildGeom();
    cups = [];
    stack = [];
    gestos = 0;
    tilt = 0; tiltV = 0;
    const stage = els.stage;
    stage.querySelectorAll(".cup").forEach((el) => el.remove());

    for (let r = 0; r < geom.rows; r++) {
      const count = geom.rows - r;
      for (let c = 0; c < count; c++) {
        const spread = (count - 1) / 2;
        const homeX = 50 + (c - spread) * geom.cupW * 1.04 - geom.cupW / 2;
        const homeB = FLOOR + r * geom.rowStep;
        const el = document.createElement("div");
        el.className = "cup";
        el.innerHTML =
          '<span class="cup__body"><span class="cup__stripe"></span></span>' +
          '<span class="cup__rim" aria-hidden="true"></span>';
        stage.appendChild(el);
        cups.push({
          row: r, col: c,
          homeX, homeB,
          x: homeX, b: homeB,
          vx: 0, vy: 0, rot: 0, rotV: 0,
          wx: 0, wv: 0,
          struct: false, fallFrom: 0,
          spill: false, slot: -1, colGroup: null,
          state: "idle",   // idle | falling | held | placed | loose
          zi: 10 + r,
          el,
        });
      }
    }
    cups[cups.length - 1].el.classList.add("is-active");
    layout();
  }

  function layout() {
    for (const cup of cups) {
      const wob = cup.state === "idle" ? cup.wx : 0;
      cup.el.style.setProperty("--x", (cup.x + wob) + "%");
      cup.el.style.setProperty("--b", cup.b + "%");
      cup.el.style.setProperty("--rot", cup.rot + "deg");
      cup.el.style.zIndex = cup.zi;
      cup.el.classList.toggle("is-held", cup.state === "held" || (cup.state === "falling" && !cup.spill));
      cup.el.classList.toggle("is-placed", cup.state === "placed" || cup.state === "loose");
    }
  }

  /* ---------------- Ponteiro ↔ palco ---------------- */

  function toPercent(clientX, clientY) {
    const r = els.stage.getBoundingClientRect();
    return { x: ((clientX - r.left) / r.width) * 100,
             y: ((clientY - r.top) / r.height) * 100 };
  }

  function nearestAt(px, py, selector) {
    let best = null, bestD = Infinity;
    for (const cup of cups) {
      if (!selector(cup)) continue;
      const cx = cup.x + geom.cupW / 2;
      const cy = 100 - (cup.b + geom.cupH / 2);
      const d = Math.hypot(px - cx, py - cy);
      if (d < bestD) { bestD = d; best = cup; }
    }
    return { cup: best, dist: bestD };
  }

  const WOB_K = 60;
  const WOB_D = 7;

  const isIdle = (c) => c.state === "idle";
  const isGrabCandidate = (c) =>
    c.state === "idle" ||
    c.state === "loose" ||
    (c.state === "placed" && !cups.some((o) => o !== c && o.colGroup === c.colGroup && o.b > c.b));

  /* ---------------- Loop físico contínuo ---------------- */

  function startLoop() {
    if (loopRunning) return;
    loopRunning = true;
    lastT = performance.now();
    window.requestAnimationFrame(loop);
  }

  function loop(t) {
    window.requestAnimationFrame(loop);
    const dt = clamp((t - lastT) / 1000, 0.001, 0.05) || 0.016;
    lastT = t;

    // velocidade do gesto (%/s)
    vx = (pointerX - prevX) / dt;
    vy = (pointerY - prevY) / dt;
    prevX = pointerX;
    prevY = pointerY;

    if (mode === "holding") stepHolding(dt);
    stepWobble(dt);
    stepStructure();
    stepStructPhysics(dt);
    // física independente do modo: copos caindo soltos / tombados
    stepLoosePhysics(dt);

    layout();

    if (startedAt && mode !== "done") {
      els.timer.textContent = fmtTime(msNow());
    }
  }

  /* ---------------- Coluna na mão ---------------- */

  function stepHolding(dt) {
    if (!stack.length) return;
    const anchor = stack[0];

    // âncora segue o cursor
    anchor.x += ((pointerX - geom.cupW / 2) - anchor.x) * Math.min(1, dt * 30);
    anchor.b += ((100 - pointerY - geom.cupH * 0.55) - anchor.b) * Math.min(1, dt * 30);
    anchor.x = clamp(anchor.x, -geom.cupW * 0.6, 100 - geom.cupW * 0.4);

    // pêndulo da coluna: aceleração lateral do gesto inclina a torre
    const ax = vx - (stepHolding.pvx || 0);
    stepHolding.pvx = vx;
    tiltV += clamp(ax, -400, 400) * TILT_IMPULSE + tilt * (-20 * dt) - tiltV * 4 * dt;
    tilt += tiltV * dt;

    if (Math.abs(tilt) > TILT_LIMIT) {
      tumbleTower();
      return;
    }

    for (let i = 1; i < stack.length; i++) {
      const cup = stack[i];
      cup.rot = tilt * (180 / Math.PI) * (1 + i * 0.06);

      if (cup.state === "falling") {
        // queda LIVRE de verdade: sem ímã — gravidade e velocidade própria
        cup.vy += G * dt;
        cup.b -= cup.vy * dt;
        cup.x += cup.vx * dt;
        cup.vx *= 1 - dt * 1.5;
        cup.rot += cup.rotV * dt;
        cup.rotV *= 1 - dt * 2;
        if (cup.b < FLOOR) { cup.b = FLOOR; cup.vy = 0; }

        // ENCAIXE pelo aro: o copo precisa estar de fato sob/entrando
        // na boca da coluna; ao alcançar o plano do anel, os aros se
        // encostam e ele trava na cavidade (sem puxão à distância)
        const ringB = anchor.b - i * geom.nest;
        const inX = cup.x + geom.cupW > anchor.x + geom.cupW * 0.02 &&
                    cup.x < anchor.x + geom.cupW * 0.98;
        if (inX && Math.abs(cup.b - ringB) < geom.cupH * 0.85) {
          settleInColumn(cup, i);
        } else if (cup.b <= FLOOR + 1 && cup.vy === 0) {
          // errou a entrada: escapa e vai parar na mesa (fora da coluna)
          const idx = stack.indexOf(cup);
          if (idx >= 0) stack.splice(idx, 1);
          cup.spill = true;
          cup.struct = false;
          cup.vx = (Math.random() - 0.5) * 24;
          cup.rotV = (Math.random() - 0.5) * 300;
          Sound.error();
          setTip("O copo escapou da coluna — recolha-o da mesa!");
          break;
        }
      } else {
        // já encaixado: acompanha a coluna (paredes internas travam)
        cup.b = anchor.b - i * geom.nest;
        cup.x = anchor.x + Math.sin(tilt) * i * geom.nest * 0.9;
      }
    }

    captureSweep();
  }

  function settleInColumn(cup, i) {
    if (cup.state !== "held") {
      cup.state = "held";
      Sound.pop();
      vibrate(8);
    }
    const anchor = stack[0];
    cup.b = anchor.b - i * geom.nest;      // aros se encostam
    cup.x = anchor.x + Math.sin(tilt) * i * geom.nest * 0.9;
    cup.vy = 0;
    cup.vx = 0;
    cup.rotV = 0;
    cup.zi = 500 - i * 4; // copos de cima (externos) na frente
  }

  /* ---------------- Captura por varredura real ---------------- */

  function captureSweep() {
    const speed = Math.hypot(vx, vy);
    if (speed < MIN_SWEEP) return; // parado perto NÃO captura

    const anchor = stack[0];
    for (const cup of cups) {
      if (cup.state !== "idle") continue;
      // contato real: o aro da coluna desce sobre o copo (boca cobre o copo)
      const overX = pointerX > cup.x - geom.cupW * 0.05 &&
                    pointerX < cup.x + geom.cupW * 1.05;
      const cupTopY = 100 - (cup.b + geom.cupH);
      const mouthY = 100 - anchor.b - geom.nest * (stack.length - 1); // boca da coluna
      const overY = mouthY > cupTopY - geom.cupH * 0.15 &&
                    mouthY < 100 - cup.b + geom.cupH * 0.2;
      if (overX && overY) capture(cup);
    }

    if (cups.every((c) => c.state !== "idle")) {
      dropColumn(); // pirâmide desmontada: solta e finaliza na hora
    }
  }

  function capture(cup) {
    cup.state = "falling";
    cup.spill = false;
    cup.struct = false;
    cup.vy = clamp(Math.abs(vy) * 0.08, 0, 200);
    cup.vx = clamp(vx * 0.06, -60, 60); // entra com a velocidade do gesto, depois só gravidade
    cup.rotV = (Math.random() - 0.5) * 200;
    cup.zi = 500 - stack.length * 4;
    stack.push(cup);
    wobbleImpulse(cup);
    Sound.swipe();
    vibrate(10);
  }

  /* ---------------- Balanço da pirâmide ---------------- */

  function wobbleImpulse(cup) {    for (const o of cups) {
      if (o.state !== "idle" || o === cup) continue;
      const dist = Math.hypot(o.row - cup.row, (o.col - cup.col) * 0.9);
      if (dist > 3) continue;
      const forca = (1 - dist / 3) * 2.2;
      const direcao = (o.x + geom.cupW / 2) < (cup.x + geom.cupW / 2) ? -1 : 1;
      o.wv += direcao * forca;
    }
  }

  /* ---------------- Grab / soltar instantâneo ---------------- */

  function grab(cup) {
    if (startedAt === 0) { startedAt = performance.now(); lastT = startedAt; }
    gestos += 1;
    mode = "holding";
    tilt = 0; tiltV = 0; stepHolding.pvx = 0;
    els.stage.classList.add("is-grabbing");
    cups.forEach((c) => c.el.classList.remove("is-active"));

    stack = [];
    if (cup.state === "placed") {
      const grupo = cups.filter((c) => c.colGroup === cup.colGroup);
      grupo.sort((a, b) => b.b - a.b); // de cima para baixo: 0 = copo da mão
      grupo.forEach((c, i) => {
        c.state = "held";
        c.slot = i;
        c.zi = 500 - i * 4;
      });
      stack = grupo;
      Sound.swipe();
      setTip("Coluna recapturada — cuidado com a inclinação!");
    } else {
      cup.state = "held";
      cup.spill = false;
      cup.vy = 0;
      cup.zi = 500;
      stack = [cup];
      wobbleImpulse(cup);
      Sound.pop();
      setTip("Varra a face em diagonal; aro sobre copo em movimento captura!");
    }
    layout();
    vibrate(12);
  }

  function onPointerDown(e) {
    if (mode !== "ready") return;
    Sound.unlock();
    const p = toPercent(e.clientX, e.clientY);
    pointerX = p.x; pointerY = p.y;
    prevX = p.x; prevY = p.y;
    const reach = geom.cupW * 0.95;
    const { cup, dist } = nearestAt(p.x, p.y, isGrabCandidate);
    if (cup && dist <= reach) {
      try { els.stage.setPointerCapture(e.pointerId); } catch { /* ok */ }
      grab(cup);
      e.preventDefault();
    }
  }

  function onPointerMove(e) {
    if (mode !== "holding") return;
    const p = toPercent(e.clientX, e.clientY);
    pointerX = p.x;
    pointerY = p.y;
    e.preventDefault();
  }

  /** Soltura instantânea: sem atraso, sem punição por soltar direito. */
  function onPointerUp(e) {
    if (mode !== "holding") return;
    dropColumn();
    if (e && typeof e.preventDefault === "function") e.preventDefault();
  }

  /* ---------------- Queda da coluna ---------------- */

  /** Soltura instantânea: quem ainda não encaixou, escapa e cai. */
  function dropColumn() {
    const escapados = stack.filter((c) => c.state === "falling" || c.state === "loose");
    stack = stack.filter((c) => c.state !== "falling" && c.state !== "loose");
    escapados.forEach((c) => {
      c.spill = true;
      c.struct = false;
      c.vx = (Math.random() - 0.5) * 24;
      c.rotV = (Math.random() - 0.5) * 300;
      c.zi = 200 + Math.floor(Math.random() * 40);
    });
    if (!stack.length) { mode = "ready"; layout(); return; }
    mode = "dropping";
    tilt = 0;
    els.stage.classList.remove("is-grabbing");
    Sound.swipe();

    const n = stack.length;
    stack.forEach((cup, i) => { cup.slot = i; });

    const token = gameToken;
    let last = performance.now();
    const dropLoop = (t) => {
      if (token !== gameToken) return;
      const dt = clamp((t - last) / 1000, 0.001, 0.05);
      last = t;
      let moving = false;
      for (const cup of stack) {
        if (cup.state === "placed") continue;
        const targetB = FLOOR + (n - 1 - cup.slot) * geom.nest;
        if (cup.b > targetB + 0.05) {
          cup.vy += G * dt;
          cup.b -= cup.vy * dt;
          cup.rot += (0 - cup.rot) * Math.min(1, dt * 4);
          if (cup.b <= targetB) {
            if (cup.vy > 25) { cup.b = targetB; cup.vy = -cup.vy * BOUNCE; Sound.tick(); }
            else {
              cup.b = targetB; cup.vy = 0; cup.state = "placed";
              cup.rot = 0; cup.zi = 400 - (n - 1 - cup.slot) * 4;
              Sound.tick();
            }
          }
          moving = true;
        } else if (cup.state !== "placed") {
          cup.b = targetB; cup.state = "placed";
          cup.rot = 0; cup.zi = 400 - (n - 1 - cup.slot) * 4;
          Sound.tick();
        }
      }
      layout();
      if (moving) window.requestAnimationFrame(dropLoop);
      else afterDrop();
    };
    window.requestAnimationFrame(dropLoop);
  }

  function afterDrop() {
    for (const cup of cups) {
      if (cup.state !== "placed") continue;
      let group = null;
      for (const o of cups) {
        if (o.state === "placed" && o.colGroup && Math.abs(o.x - cup.x) < geom.cupW * 0.45) {
          group = o.colGroup;
          break;
        }
      }
      cup.colGroup = group || "g" + cup.x.toFixed(0) + "-" + Math.random().toString(36).slice(2, 6);
    }
    stack = [];
    mode = "ready";

    if (cups.every((c) => c.state === "placed")) {
      const groups = new Set(cups.map((c) => c.colGroup));
      if (groups.size <= 1) {
        finishGame();
        return;
      }
      setTip("Pirâmide vazia! Junte tudo em uma pilha só: recapture e varra as outras colunas.");
    } else if (cups.some(isIdle)) {
      setTip("Coluna no chão — pegue-a de novo e continue a desmontagem.");
    }
    layout();
  }

  /* ---------------- Tombamento e copos soltos ---------------- */

  /* ---------------- Gravidade estrutural da pirâmide ---------------- */

  /** Largura de sobreposição horizontal entre dois copos. */
  function overlapW(a, b) {
    return Math.min(a.x + geom.cupW, b.x + geom.cupW) - Math.max(a.x, b.x);
  }

  /** Copo perdeu todo apoio embaixo? Então ele desaba (gravidade real). */
  function stepStructure() {
    for (const cup of cups) {
      if (cup.state !== "idle" || cup.row === 0) continue; // fileira 0 = chão
      const apoiado = cups.some(
        (o) => o !== cup && o.state === "idle" && o.row < cup.row &&
              overlapW(o, cup) > geom.cupW * 0.3
      );
      if (apoiado) continue;
      // sem apoio: despenca, carregando a velocidade do balanço
      cup.state = "falling";
      cup.struct = true;
      cup.spill = false;
      cup.fallFrom = cup.b;
      cup.vy = 0;
      cup.vx = clamp(cup.wv * 12, -40, 40);
      cup.rotV = (Math.random() - 0.5) * 120;
      cup.zi = 300 + cup.row * 4;
      wobbleImpulse(cup);
      Sound.tick();
    }
  }

  /** Copo desabando: cai e pousa no primeiro apoio que encontrar
      embaixo; se não houver, deita na mesa (recapturável). */
  function stepStructPhysics(dt) {
    for (const cup of cups) {
      if (cup.state !== "falling" || !cup.struct) continue;
      cup.vy += G * dt;
      cup.b -= cup.vy * dt;
      cup.x += cup.vx * dt;
      cup.vx *= 1 - dt * 1.2;
      cup.rot += cup.rotV * dt;
      cup.rotV *= 1 - dt * 2;

      // apoios possíveis: copos estruturais com plano de pouso abaixo do início da queda
      const apoios = cups.filter(
        (o) => o !== cup && o.state === "idle" && o.row < cup.row &&
              overlapW(o, cup) > geom.cupW * 0.3 &&
              o.homeB + geom.rowStep <= cup.fallFrom + 0.5
      );
      if (apoios.length) {
        const plano = Math.max(...apoios.map((o) => o.homeB + geom.rowStep));
        if (cup.b <= plano) {
          const sup = apoios.reduce((m, o) =>
            Math.abs(o.homeX - cup.x) < Math.abs(m.homeX - cup.x) ? o : m);
          cup.x = sup.homeX;
          cup.b = plano;
          cup.state = "idle";
          cup.struct = false;
          cup.rot = 0;
          cup.rotV = 0;
          cup.vy = 0;
          cup.zi = 10 + cup.row;
          Sound.tick();
          vibrate(8);
          continue;
        }
      }

      if (cup.b <= FLOOR + 1) {
        cup.b = FLOOR + 1;
        cup.state = "loose";
        cup.struct = false;
        cup.rot = (cup.rot % 360 + 360) % 360 < 180 ? 80 : -80;
        cup.rotV = 0;
        cup.vy = 0;
        Sound.pop();
        setTip("Copos sem apoio tombam! Recolha o que caiu na mesa.");
      }
    }
  }

  /** A torre tombou: gestos bruscos derrubam os copos na mesa. */
  function tumbleTower() {
    const grupo = stack.slice();
    const impulso = tiltV;
    stack = [];
    mode = "ready";
    els.stage.classList.remove("is-grabbing");
    tilt = 0; tiltV = 0;
    Sound.error();
    vibrate([40, 30, 40]);
    penalize(PENALTY_TUMBLE, "A torre tombou! +1s — recolha os copos espalhados.");
    grupo.forEach((cup) => {
      cup.state = "falling";
      cup.spill = true;
      cup.vy = Math.max(20, Math.abs(vy) * 0.2);
      cup.vx = impulso * 30 + (Math.random() - 0.5) * 20;
      cup.rotV = (Math.random() - 0.5) * 400;
      cup.zi = 200 + Math.floor(Math.random() * 40);
      cup.colGroup = null;
    });
    layout();
  }

  /** Física dos copos tombados: caem, quicam, deitam e podem cair da mesa. */
  function stepLoosePhysics(dt) {
    for (const cup of cups) {
      if (cup.state !== "falling" || !cup.spill) continue;
      cup.vy += G * dt;
      cup.b -= cup.vy * dt;
      cup.x += cup.vx * dt;
      cup.vx *= 1 - dt * 1.5;
      cup.rot += cup.rotV * dt;
      cup.rotV *= 1 - dt * 2;

      if (cup.x < -geom.cupW * 0.7 || cup.x > 100 - geom.cupW * 0.3) {
        fellOffTable(cup);
        continue;
      }
      if (cup.b <= FLOOR + 1) {
        if (cup.vy > 30) {
          cup.b = FLOOR + 1;
          cup.vy = -cup.vy * BOUNCE;
          Sound.tick();
        } else {
          cup.b = FLOOR + 1;
          cup.rotV = 0;
          cup.rot = cup.rot % 360;
          // copo tombado descansa deitado
          cup.rot = Math.abs(((cup.rot % 360) + 360) % 360 - 180) < 90 ? -80 : 80;
          cup.state = "loose";
          cup.vy = 0;
          Sound.pop();
        }
      }
    }
  }

  /** Copo que ultrapassou a borda da mesa cai fora e volta à pirâmide. */
  function fellOffTable(cup) {
    Sound.error();
    vibrate([60, 40, 60]);
    penalize(PENALTY_OFFTABLE, "Copo caiu da mesa! +2s — ele voltou à pirâmide.");
    cup.state = "idle";
    cup.spill = false;
    cup.x = cup.homeX;
    cup.b = cup.homeB;
    cup.vx = 0; cup.vy = 0;
    cup.rot = 0; cup.rotV = 0;
    cup.zi = 10 + cup.row;
    cup.wx = 0; cup.wv = 0;
    wobbleImpulse(cup);
  }

  /* ---------------- Balanço ---------------- */

  function stepWobble(dt) {
    for (const cup of cups) {
      if (cup.state !== "idle") continue;
      const acc = -WOB_K * cup.wx - WOB_D * cup.wv;
      cup.wv += acc * dt;
      cup.wx += cup.wv * dt;
    }
  }

  /* ---------------- Cronômetro ---------------- */

  function stopClock() {
    elapsed = msNow();
    startedAt = 0;
    els.timer.textContent = fmtTime(elapsed);
    return elapsed;
  }

  function finishGame() {
    if (mode === "done") return;
    mode = "done";
    stopClock();
    const ms = Math.max(0, elapsed);
    const stars = starsFor(ms, cfg.diff);
    const points = Math.max(0, pointsFor(ms, stars, cfg.diff));

    const best = cfg.best[cfg.diff] || { points: 0, ms: 0, stars: 0 };
    const isRecord = points > (best.points || 0);
    if (isRecord) {
      cfg.best[cfg.diff] = { points, ms, stars };
      saveCfg();
    }
    renderPrizes();

    els.resultStars.textContent = "⭐".repeat(stars) + "✩".repeat(3 - stars);
    els.resultTitle.textContent = stars === 3 ? "Hack impecável!" : stars === 2 ? "Boa cascata!" : "Pirâmide desmontada!";
    els.resultText.innerHTML =
      `Tempo: <strong>${fmtTime(ms)}</strong> · ${points} pts · ${gestos} ${gestos === 1 ? "gesto" : "gestos"}` +
      (isRecord ? "<br />🏅 Novo recorde pessoal!" :
        best.ms ? `<br /><small>Seu recorde: ${fmtTime(best.ms)} (${best.points} pts)</small>` : "");
    els.resultKicker.textContent = "Hack da Torre de Copos";
    els.resultDialog.showModal();
    Sound.fanfare(stars);
    if (stars >= 2) confettiBurst();

    window.SnufflyScores.submitScore(points);
  }

  /* ---------------- Início ---------------- */

  function startGame() {
    gameToken += 1;
    stopClock();
    elapsed = 0;
    gestos = 0;
    mode = "countdown";
    pointerX = 50; pointerY = 50;
    prevX = 50; prevY = 50;
    tilt = 0; tiltV = 0;
    stepHolding.pvx = 0;
    els.stage.classList.remove("is-grabbing");
    buildStage();
    els.stageHelp.hidden = false;
    els.timer.textContent = "0,0s";
    setTip("Prepare os dedos…");
    startLoop();

    let n = 3;
    const token = gameToken;
    const tick = () => {
      if (token !== gameToken) return;
      if (n > 0) {
        els.stageHelp.firstElementChild.textContent = "🎵 " + n;
        Sound.count(false);
        n -= 1;
        window.setTimeout(tick, 700);
      } else {
        els.stageHelp.firstElementChild.textContent = "🎊 Já!";
        Sound.count(true);
        window.setTimeout(() => {
          if (token !== gameToken) return;
          els.stageHelp.hidden = true;
          mode = "ready";
          setTip(DIFF[cfg.diff].tip);
        }, 550);
      }
    };
    tick();
  }

  /* ---------------- Prêmios / confete ---------------- */

  function bestStars() {
    return Object.values(cfg.best).reduce((m, b) => Math.max(m, b.stars || 0), 0);
  }

  function renderPrizes() {
    const have = bestStars();
    els.prizeGrid.innerHTML = PRIZES.map((p) => {
      const unlocked = have >= p.stars;
      return `
        <article class="prize-item ${unlocked ? "" : "is-locked"}">
          <div class="prize-item__img-wrap">
            <img src="${p.img}" alt="${unlocked ? "Prévia do molde " + p.name : "Prêmio bloqueado"}" loading="lazy" />
            ${unlocked ? "" : '<span class="prize-item__lock" aria-hidden="true">🔒</span>'}
          </div>
          <h3 class="prize-item__name">${p.name}</h3>
          <p class="prize-item__req">${"⭐".repeat(p.stars)} para desbloquear</p>
          ${unlocked ? `
            <p class="prize-item__links">
              <a href="${p.pdf}" target="_blank" rel="noopener">📄 PDF</a> ·
              <a href="${p.svg}" target="_blank" rel="noopener">🖼️ SVG</a>
            </p>` : ""}
        </article>`;
    }).join("");
  }

  function confettiBurst() {
    const cv = els.confetti;
    if (!cv || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const ctx = cv.getContext("2d");
    const r = cv.getBoundingClientRect();
    cv.width = r.width; cv.height = r.height;
    const colors = ["#e53935", "#ffc93c", "#ffffff", "#ff8a80"];
    const parts = Array.from({ length: 90 }, () => ({
      x: r.width / 2 + (Math.random() - 0.5) * r.width * 0.4,
      y: r.height * 0.35,
      vx: (Math.random() - 0.5) * 9,
      vy: -4 - Math.random() * 6,
      s: 3 + Math.random() * 5,
      c: colors[(Math.random() * colors.length) | 0],
      a: 1,
      rot: Math.random() * Math.PI,
    }));
    let frames = 0;
    (function anim() {
      ctx.clearRect(0, 0, cv.width, cv.height);
      for (const p of parts) {
        p.vy += 0.22; p.x += p.vx; p.y += p.vy; p.rot += 0.1; p.a -= 0.008;
        ctx.save();
        ctx.globalAlpha = Math.max(0, p.a);
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.c;
        ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * 0.6);
        ctx.restore();
      }
      if (++frames < 130) window.requestAnimationFrame(anim);
      else ctx.clearRect(0, 0, cv.width, cv.height);
    })();
  }

  /* ---------------- Teclado ---------------- */

  function onKey(e) {
    if (els.resultDialog.open || (els.nameDialog && els.nameDialog.open)) return;
    if (mode === "ready" && (e.key === "Enter" || e.key === " ")) {
      let best = null;
      for (const cup of cups) {
        if (!isGrabCandidate(cup)) continue;
        if (!best || cup.b > best.b) best = cup;
      }
      if (!best) return;
      pointerX = best.x + geom.cupW / 2;
      pointerY = 100 - (best.b + geom.cupH * 0.55);
      prevX = pointerX; prevY = pointerY;
      grab(best);
      e.preventDefault();
      return;
    }
    if (mode === "holding") {
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        pointerX += e.key === "ArrowLeft" ? -7 : 7;
        e.preventDefault();
      } else if (e.key === "ArrowDown") {
        onPointerUp();
        e.preventDefault();
      }
    }
  }

  /* ---------------- UI ---------------- */

  function setDiff(diff) {
    if (!DIFF[diff]) return;
    cfg.diff = diff;
    saveCfg();
    document.querySelectorAll(".diff-btn").forEach((b) => {
      b.classList.toggle("is-on", b.dataset.diff === diff);
      b.setAttribute("aria-pressed", String(b.dataset.diff === diff));
    });
    startGame();
  }

  function setSound(on) {
    cfg.sound = on;
    saveCfg();
    Sound.setEnabled(on);
    els.soundBtn.setAttribute("aria-pressed", String(on));
    els.soundBtn.setAttribute("aria-label", on ? "Desligar sons" : "Ligar sons");
    els.soundIcon.textContent = on ? "🔊" : "🔇";
  }

  /* ---------------- Boot ---------------- */

  function init() {
    els.stage = $("stage");
    els.stageHelp = $("stageHelp");
    els.tip = $("stageTip");
    els.timer = $("timer");
    els.confetti = $("confetti");
    els.prizeGrid = $("prizeGrid");
    els.soundBtn = $("soundBtn");
    els.soundIcon = $("soundIcon");
    els.resultDialog = $("resultDialog");
    els.resultStars = $("resultStars");
    els.resultTitle = $("resultTitle");
    els.resultText = $("resultText");
    els.resultKicker = $("resultKicker");
    els.nameDialog = $("nameDialog");

    if (!els.stage) return;

    if (!els.confetti) {
      const cv = document.createElement("canvas");
      cv.id = "confetti";
      cv.setAttribute("aria-hidden", "true");
      document.body.prepend(cv);
      els.confetti = cv;
    }

    Sound.setEnabled(cfg.sound);

    els.stage.addEventListener("pointerdown", onPointerDown);
    els.stage.addEventListener("pointermove", onPointerMove);
    els.stage.addEventListener("pointerup", onPointerUp);
    els.stage.addEventListener("pointercancel", onPointerUp);
    els.stage.tabIndex = 0;
    document.addEventListener("keydown", onKey);

    document.querySelectorAll(".diff-btn").forEach((b) => {
      b.addEventListener("click", () => setDiff(b.dataset.diff));
    });
    $("restartBtn").addEventListener("click", startGame);
    els.soundBtn.addEventListener("click", () => setSound(!cfg.sound));
    $("resetBtn").addEventListener("click", () => {
      cfg.best = {};
      saveCfg();
      renderPrizes();
      window.SnufflyScores.loadRanking();
      setTip("Placar local zerado.");
    });
    $("resultAgain").addEventListener("click", () => {
      els.resultDialog.close();
      startGame();
    });
    $("resultClose").addEventListener("click", () => els.resultDialog.close());

    document.querySelectorAll(".diff-btn").forEach((b) => {
      b.classList.toggle("is-on", b.dataset.diff === cfg.diff);
      b.setAttribute("aria-pressed", String(b.dataset.diff === cfg.diff));
    });

    renderPrizes();
    startGame();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
