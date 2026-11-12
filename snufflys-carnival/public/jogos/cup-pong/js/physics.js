/**
 * Física realista 2.5D — bola de tênis de mesa + copos vazios.
 *
 * Espaço sim em SI: x lateral (mesa ±PHYS.TABLE_WIDTH), d profundidade
 * [0, PHYS.TABLE_DEPTH], h altura (m). Conversão para as unidades do jogo:
 *   xu = x / PHYS.XU_M      (x do jogo ∈ [-1, 1])
 *   zu = d / PHYS.TABLE_DEPTH
 *
 * A bola é integrada por Euler semi-implícito com arrasto quadrático
 * (comportamento de bola de ping-pong) e colide de verdade com:
 *   - a BORDA do copo (toro): quica, rola e pode cair de qualquer lado;
 *   - o BURACO (boca + parede cônica interna): entra, bate no fundo e
 *     pode pular para fora ("in-and-out");
 *   - a PAREDE EXTERNA do copo;
 *   - a MESA: quique com restituição de madeira, rolamento com atrito;
 *   - as BORDAS da mesa (rebote lateral).
 * Impulso na borda forte TUMBA o copo (que quica na mesa ao cair).
 */
import { PHYS } from './config.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const hyp2 = (a, b) => Math.sqrt(a * a + b * b);

export const xuToM = (xu) => xu * PHYS.XU_M;
export const zuToM = (zu) => zu * PHYS.TABLE_DEPTH;
export const mToXu = (m) => m / PHYS.XU_M;
export const mToZu = (m) => m / PHYS.TABLE_DEPTH;

/** raio interno do copo em uma altura h (cone) */
export const cupRadiusAt = (h) =>
  PHYS.CUP_BOTTOM +
  (PHYS.CUP_TOP - PHYS.CUP_BOTTOM) * (clamp(h, 0, PHYS.CUP_HEIGHT) / PHYS.CUP_HEIGHT);

/* inclinação da parede do copo (dR/dh) */
const WALL_TAN = (PHYS.CUP_TOP - PHYS.CUP_BOTTOM) / PHYS.CUP_HEIGHT; // ≈ 0.114
const WALL_COS = 1 / Math.sqrt(1 + WALL_TAN * WALL_TAN); // componente radial da normal
const WALL_SIN = WALL_TAN * WALL_COS; // componente vertical da normal

const DT = 1 / 360; // passo fixo da simulação

/* =========================================================
   Trajetória livre (sem copos) — usada pelo solver de mira
   ========================================================= */

function integrateFree(vx, vd, vh, x, d, h, opts = {}) {
  const collect = opts.path ? [] : null;
  let landing = null;
  const maxT = opts.maxT || 4;
  const planeH = opts.planeH ?? PHYS.BALL_RADIUS; // altura-alvo do cruzamento
  for (let i = 0, n = Math.round(maxT / DT); i < n; i += 1) {
    const sp = hyp2(hyp2(vx, vd), vh);
    const k = PHYS.DRAG * sp;
    vx += -k * vx * DT;
    vd += -k * vd * DT;
    vh += (-PHYS.G - k * vh) * DT;
    x += vx * DT;
    d += vd * DT;
    h += vh * DT;
    if (collect && i % 6 === 0) collect.push({ x: mToXu(x), z: mToZu(d), h });
    if (vh < 0 && h <= planeH) {
      landing = { x, d };
      if (collect) collect.push({ x: mToXu(x), z: mToZu(d), h });
      break;
    }
  }
  return { landing, path: collect };
}

/**
 * Resolve um arremesso que aterrissa em (txu, tzu) — unidades do jogo.
 * Retorna { v: [vx, vd, vh], path } com arrasto incluído.
 */
export function solveThrow(txu, tzu) {
  const ox = 0;
  const od = PHYS.RELEASE_D;
  const oh = PHYS.RELEASE_H;
  const tx = xuToM(txu);
  const td = zuToM(tzu);

  const ang = PHYS.LAUNCH_ANGLE;
  const cosA = Math.cos(ang);
  const sinA = Math.sin(ang);

  // direção horizontal apontando do solto ao alvo
  let dirAng = Math.atan2(tx - ox, Math.max(td - od, 1e-4));

  const shoot = (da, speed, withPath) => {
    const hs = speed * cosA;
    // dirAng: 0 = reta em profundidade (+d), positivo = para +x;
    // alvo é o cruzamento do plano da BOCA do copo (é por ali que se entra)
    return integrateFree(Math.sin(da) * hs, Math.cos(da) * hs, speed * sinA, ox, od, oh, {
      maxT: 3.5,
      planeH: PHYS.CUP_HEIGHT,
      path: withPath,
    });
  };

  let speed = 3;
  for (let iter = 0; iter < 6; iter += 1) {
    // velocidade por bisseção (alcance cresce com velocidade)
    let lo = 0.7;
    let hi = 8;
    let land = null;
    for (let i = 0; i < 16; i += 1) {
      speed = 0.5 * (lo + hi);
      const r = shoot(dirAng, speed);
      land = r.landing;
      if (!land || land.d > td) hi = speed;
      else lo = speed;
    }
    if (!land) break;
    // corrige a direção horizontal pelo erro em x
    const err = land.x - tx;
    if (Math.abs(err) < 0.0015) break;
    dirAng -= Math.atan2(err, Math.max(land.d - od, 0.3)) * 0.9;
    dirAng = clamp(dirAng, -1.2, 1.2);
  }

  const final = shoot(dirAng, speed, true);
  const hs = speed * cosA;
  return {
    v: [Math.sin(dirAng) * hs, Math.cos(dirAng) * hs, speed * sinA],
    path: final.path || [],
  };
}

/* =========================================================
   Simulação completa (com copos) — guiada pelo Game
   ========================================================= */

export class BallSim {
  /**
   * cupsSim: [{ cup, cx, cd }] em metros (cx = xuToM(cup.x), cd = zuToM(cup.z)).
   * hooks: onTable(xu, zu, strength), onRail(side), onRim(cs, pos, imp),
   *        onWallIn(cs, imp), onCupBody(cs, imp), onCupBottom(cs, imp),
   *        onTip(cs, kick), onRest(result)
   */
  constructor(cupsSim, hooks) {
    this.cups = cupsSim;
    this.hooks = hooks || {};
    this.p = [0, PHYS.RELEASE_D, PHYS.RELEASE_H];
    this.v = [0, 0, 0];
    this.spin = 0;
    this.t = 0;
    this.rolling = false;
    this.done = false;
    this.result = null;
    this.lastCup = null;
    this.lastInsideT = -9; // momento em que a bola esteve pela última vez na cavidade
    this.insideNow = null; // copo em que a bola está na cavidade (ou null)
  }

  launch(v) {
    this.v = [v[0], v[1], v[2]];
  }

  /** posição em unidades do jogo: { x, z, h } */
  get pos() {
    return { x: mToXu(this.p[0]), z: mToZu(this.p[1]), h: this.p[2] };
  }

  step(dt = DT) {
    if (this.done) return;
    this.t += dt;
    const p = this.p;
    const v = this.v;
    const r = PHYS.BALL_RADIUS;

    // integração: gravidade + arrasto quadrático (bola leve de ping-pong)
    const sp = Math.max(1e-6, hyp2(hyp2(v[0], v[1]), v[2]));
    const k = PHYS.DRAG * sp;
    v[0] += -k * v[0] * dt;
    v[1] += -k * v[1] * dt;
    v[2] += (-PHYS.G - k * v[2]) * dt;
    p[0] += v[0] * dt;
    p[1] += v[1] * dt;
    p[2] += v[2] * dt;
    this.spin += hyp2(v[0], v[1]) * 22 * dt;

    // copos
    let insideAny = false;
    for (const cs of this.cups) {
      if (cs.cup.state === 'up' && this.collideCup(cs, r)) insideAny = true;
    }
    if (!insideAny) this.insideNow = null;

    // mesa: quique + rolamento
    const onTable = Math.abs(p[0]) <= PHYS.TABLE_WIDTH && p[1] >= 0 && p[1] <= PHYS.TABLE_DEPTH;
    if (this.rolling) {
      p[2] = r;
      v[2] = 0;
      const s = hyp2(v[0], v[1]);
      if (s > 1e-5) {
        const ns = Math.max(0, s - PHYS.ROLL_FRICTION * dt);
        v[0] *= ns / s;
        v[1] *= ns / s;
      }
    } else if (onTable && p[2] < r && v[2] < 0) {
      p[2] = r;
      const impact = Math.abs(v[2]);
      if (impact < 0.4) {
        this.rolling = true;
        v[2] = 0;
      } else {
        v[2] = impact * PHYS.TABLE_REST;
        v[0] *= 0.93;
        v[1] *= 0.93;
      }
      this.hooks.onTable?.(mToXu(p[0]), mToZu(p[1]), Math.min(1, impact / 2.2));
    }

    // bordas da mesa (rebote de trilho)
    if (p[2] < 0.12) {
      const e = PHYS.RAIL_REST;
      if (Math.abs(p[0]) > PHYS.TABLE_WIDTH) {
        p[0] = Math.sign(p[0]) * PHYS.TABLE_WIDTH;
        v[0] = -Math.abs(v[0]) * e;
        this.hooks.onRail?.('side');
      }
      if (p[1] < 0) {
        p[1] = 0;
        v[1] = -Math.abs(v[1]) * e;
        this.hooks.onRail?.('near');
      }
      if (p[1] > PHYS.TABLE_DEPTH) {
        p[1] = PHYS.TABLE_DEPTH;
        v[1] = -Math.abs(v[1]) * e;
        this.hooks.onRail?.('far');
      }
    } else if (
      Math.abs(p[0]) > PHYS.TABLE_WIDTH + 0.4 ||
      p[1] < -0.4 ||
      p[1] > PHYS.TABLE_DEPTH + 0.4
    ) {
      this._end({ kind: 'floor' });
      return;
    }

    // repouso?
    const sSpeed = hyp2(hyp2(v[0], v[1]), v[2]);
    const rollSpeed = hyp2(v[0], v[1]);
    if ((this.rolling && rollSpeed < 0.055) || sSpeed < 0.04) {
      const cup = this._cupOfRest();
      this._end({ kind: cup ? 'cup' : 'floor', cup });
      return;
    }
    if (this.t > PHYS.TIMEOUT) {
      this._end({ kind: 'floor', cup: this._cupOfRest() });
    }
  }

  _cupOfRest() {
    const p = this.p;
    const r = PHYS.BALL_RADIUS;
    if (p[2] > PHYS.CUP_HEIGHT) return null;
    for (const cs of this.cups) {
      if (cs.cup.state !== 'up') continue;
      const rh = hyp2(p[0] - cs.cx, p[1] - cs.cd);
      if (rh + r * 0.6 < PHYS.CUP_TOP) return cs.cup;
    }
    return null;
  }

  _end(result) {
    this.done = true;
    this.result = result;
    this.hooks.onRest?.(result);
  }

  /* -------------------------------------------------------
     Colisão bola × copo (vazio): toro da borda, boca, paredes
     ------------------------------------------------------- */
  collideCup(cs, r) {
    const p = this.p;
    const v = this.v;
    const RT = PHYS.CUP_TOP;
    const HC = PHYS.CUP_HEIGHT;
    const dx = p[0] - cs.cx;
    const dd = p[1] - cs.cd;
    const rh = hyp2(dx, dd);
    const rc = cupRadiusAt(p[2]);

    // APROXIMAÇÃO (cena de pânico do último copo): bola DESCENDO com menos
    // de ~2 raios da boca e caindo na altura da garganta — dispara UMA vez
    // antes de qualquer colisão/entrada (aqui ou raspa, ainda não se sabe).
    if (!cs.nearFired && v[2] < 0 && p[2] < HC * 1.7 && p[2] > HC * 0.25 && rh < RT * 1.9) {
      cs.nearFired = true;
      this.hooks.onApproach?.(cs, { x: p[0], d: p[1], h: p[2] });
    }

    // bem acima do copo e longe da boca: nada a fazer
    if (p[2] > HC + r + PHYS.RIM_RADIUS && rh > RT + r) return;

    // restituições temperadas quando a bola acabou de passar pela garganta
    const recentInside = this.t - this.lastInsideT < 0.4;
    const rimRest = recentInside ? 0.3 : PHYS.RIM_REST;
    const rimTangent = recentInside ? 0.7 : 0.9;

    /* --- boca / interior do copo (inclui a "garganta" perto do rim) --- */
    if (p[2] < HC + r * 0.4 && rh < RT - r * 0.3) {
      if (this.insideNow !== cs && this.t - this.lastInsideT > 0.05) {
        // bola cruzou o rim POR DENTRO — ponto de não-retorno (EXTREME FEVER)
        this.hooks.onEnter?.(cs, { x: p[0], d: p[1], h: p[2] });
      }
      this.insideNow = cs;
      this.lastCup = cs;
      this.lastInsideT = this.t;
      const rr = Math.max(rh, 1e-6);
      // parede cônica interna (o buraco estreita para baixo)
      if (rh + r * 0.72 > rc && p[2] > r + 0.003) {
        const kFit = (rc - r * 0.72) / rr;
        p[0] = cs.cx + dx * kFit;
        p[1] = cs.cd + dd * kFit;
        const hu0 = dx / rr;
        const hu1 = dd / rr;
        const nx = -hu0 * WALL_COS;
        const nd = -hu1 * WALL_COS;
        const nh = WALL_SIN;
        const vn = v[0] * nx + v[1] * nd + v[2] * nh;
        if (vn < 0) {
          const e = PHYS.WALL_IN_REST;
          v[0] -= (1 + e) * vn * nx;
          v[1] -= (1 + e) * vn * nd;
          v[2] -= (1 + e) * vn * nh;
          // atrito tangencial dentro do copo (amortece o "ping-pong" na parede)
          const vn2 = v[0] * nx + v[1] * nd + v[2] * nh;
          v[0] = nx * vn2 + (v[0] - nx * vn2) * 0.8;
          v[1] = nd * vn2 + (v[1] - nd * vn2) * 0.8;
          v[2] = nh * vn2 + (v[2] - nh * vn2) * 0.8;
          this.hooks.onWallIn?.(cs, Math.abs(vn));
        }
      } else if (rh + r * 0.72 > rc) {
        // espremido entre parede e fundo (bola maior que o espelho do cone)
        const kFit = (rc - r * 0.72) / rh;
        p[0] = cs.cx + dx * kFit;
        p[1] = cs.cd + dd * kFit;
      }
      // fundo do copo (vazio): batida seca
      if (p[2] <= r + 0.003 && v[2] < 0) {
        p[2] = r + 0.003;
        const impact = Math.abs(v[2]);
        v[2] = impact * PHYS.CUP_BOTTOM_REST;
        if (v[2] < 0.12) v[2] = 0;
        v[0] *= 0.8;
        v[1] *= 0.8;
        this.hooks.onCupBottom?.(cs, Math.min(1, impact / 1.5));
      }
      return;
    }

    /* --- borda (toro) e parede externa --- */
    if (rh > 1e-6) {
      const kx = cs.cx + (dx / rh) * RT;
      const kd = cs.cd + (dd / rh) * RT;
      const qx = p[0] - kx;
      const qd = p[1] - kd;
      const qh = p[2] - HC;
      const q = Math.sqrt(qx * qx + qd * qd + qh * qh);
      if (q > 1e-9 && q < r + PHYS.RIM_RADIUS) {
        const nx = qx / q;
        const nd = qd / q;
        const nh = qh / q;
        const vn = v[0] * nx + v[1] * nd + v[2] * nh;
        if (vn < 0) {
          // reflete com restituição de plástico (temperada p/ bola que chacoalhou no copo)
          v[0] -= (1 + rimRest) * vn * nx;
          v[1] -= (1 + rimRest) * vn * nd;
          v[2] -= (1 + rimRest) * vn * nh;
          // amortecimento tangencial
          const vn2 = v[0] * nx + v[1] * nd + v[2] * nh;
          v[0] = nx * vn2 + (v[0] - nx * vn2) * rimTangent;
          v[1] = nd * vn2 + (v[1] - nd * vn2) * rimTangent;
          v[2] = nh * vn2 + (v[2] - nh * vn2) * rimTangent;
          const pad = (r + PHYS.RIM_RADIUS) * 1.02;
          p[0] = kx + nx * pad;
          p[1] = kd + nd * pad;
          p[2] = HC + nh * pad;
          const imp = Math.abs(vn);
          if (imp > PHYS.TIP_THRESHOLD) {
            this.hooks.onTip?.(cs, (imp - PHYS.TIP_THRESHOLD) * 0.75 + imp * 0.1);
          }
          this.hooks.onRim?.(cs, { x: p[0], d: p[1], h: p[2] }, Math.min(1, imp / 3));
          this.lastCup = cs;
          return;
        }
      }
      // parede externa do copo (temperada quando a bola sai do copo)
      // só quando o centro da bola está REALMENTE encostado na parede:
      // |rh - rc| < r*0.8 (senão bolas distantes eram puxadas para a parede)
      if (p[2] < HC - 0.004 && rh + r * 0.8 > rc && rh < rc + r * 0.8 && rh < RT + r * 1.6) {
        const rr = Math.max(rh, 1e-6);
        const hu0 = dx / rr;
        const hu1 = dd / rr;
        const nx = hu0 * WALL_COS;
        const nd = hu1 * WALL_COS;
        const nh = -WALL_SIN;
        const vn = v[0] * nx + v[1] * nd + v[2] * nh;
        if (vn < 0) {
          const eOut = recentInside ? 0.35 : PHYS.WALL_OUT_REST;
          const tangentOut = recentInside ? 0.7 : 0.95;
          v[0] -= (1 + eOut) * vn * nx;
          v[1] -= (1 + eOut) * vn * nd;
          v[2] -= (1 + eOut) * vn * nh;
          const vn3 = v[0] * nx + v[1] * nd + v[2] * nh;
          v[0] = nx * vn3 + (v[0] - nx * vn3) * tangentOut;
          v[1] = nd * vn3 + (v[1] - nd * vn3) * tangentOut;
          v[2] = nh * vn3 + (v[2] - nh * vn3) * tangentOut;
          const kFit = (rc + r * 0.8) / rr;
          p[0] = cs.cx + dx * kFit;
          p[1] = cs.cd + dd * kFit;
          const imp = Math.abs(vn);
          if (imp > PHYS.TIP_THRESHOLD) {
            this.hooks.onTip?.(cs, (imp - PHYS.TIP_THRESHOLD) * 0.6);
          }
          if (imp > 0.6) this.hooks.onCupBody?.(cs, Math.min(1, imp / 2.5));
          this.lastCup = cs;
        }
      }
    }
    return this.insideNow === cs;
  }
}
