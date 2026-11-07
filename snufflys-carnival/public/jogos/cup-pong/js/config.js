export const APP_VERSION = '2.0.0';
export const STORAGE_KEY = 'cuppong.neon.v1';

export const DIFFICULTIES = {
  easy: { label: 'Tranquilo', cpuSigma: 30 },
  normal: { label: 'Equilibrado', cpuSigma: 15 },
  hard: { label: 'Insano', cpuSigma: 7 },
};

/* =========================================================
   Física — unidades SI (metros, segundos, radianos)
   Mesa real de cup pong: 2,44 m × 0,61 m; copos ~cônica;
   bola de ping-pong r=19 mm; copo plástico: topo 48 mm,
   base 34,5 mm, altura 118 mm.
   ========================================================= */
export const PHYS = {
  G: 9.81, // gravidade (m/s²)
  DRAG: 0.1, // arrasto quadrático da bola de ping-pong (1/m)
  BALL_RADIUS: 0.019, // raio da bola (m)
  RELEASE_H: 0.26, // altura de solto da mão (m)
  RELEASE_D: 0.05, // profundidade de solto (m)

  /* escala: 1 unidade lateral do jogo (x∈[-1,1]) = XU_M metros */
  XU_M: 0.33, // semilargura da mesa (m)
  TABLE_WIDTH: 0.33, // semilargura (m)
  TABLE_DEPTH: 2.4, // comprimento útil (m)

  /* copo (tronco de cone) */
  CUP_TOP: 0.048, // raio da boca (m)
  CUP_BOTTOM: 0.0345, // raio da base (m)
  CUP_HEIGHT: 0.118, // altura (m)
  RIM_RADIUS: 0.0045, // espessura da borda (m)

  /* restituições / atritos */
  TABLE_REST: 0.72, // quique na mesa
  RAIL_REST: 0.5, // rebote nas bordas da mesa
  ROLL_FRICTION: 0.45, // desaceleração de rolamento (m/s²)
  RIM_REST: 0.62, // quique na borda do copo
  WALL_IN_REST: 0.42, // parede interna (rebote mais seco)
  WALL_OUT_REST: 0.55, // parede externa
  CUP_BOTTOM_REST: 0.24, // fundo do copo (quica pouco)

  TIP_THRESHOLD: 1.35, // |vn| (m/s) que começa a derrubar o copo
  TIMEOUT: 7, // s máximos de simulação por arremesso

  LAUNCH_ANGLE: 0.85, // ângulo de solução de mira (~49°, arco de lob)
};

/* unidades do jogo (mantidas compatíveis com o render antigo) */
export const CUP_RADIUS = 0.048 / 0.33; // ≈ 0.1455 xu
export const CUP_SPACING = CUP_RADIUS * 2.0; // copos encostados, como na rack real
export const RACK_Z = 0.785;
export const RACK_Z_STEP = 0.038;
export const RACK_ROWS = [1, 2, 3, 4];

/* =========================================================
   Treino livre: formas de distribuição dos copos
   ========================================================= */
export const PRACTICE_MAX_CUPS = 15;
export const PRACTICE_SHAPES = [
  { id: 'pyramid', label: 'Pirâmide' },
  { id: 'diamond', label: 'Diamante' },
  { id: 'line', label: 'Linha' },
  { id: 'circle', label: 'Círculo' },
  { id: 'v', label: 'V' },
  { id: 'random', label: 'Aleatória' },
];

/** Casino de posições {x, z} (xu) para N copos numa forma. */
export function rackPositions(shape, n) {
  const count = clampInt(n, 1, PRACTICE_MAX_CUPS);
  const rackCenterZ = RACK_Z + 1.5 * RACK_Z_STEP;
  const positions = [];

  const push = (x, z) => {
    positions.push({ x: Math.max(-0.9, Math.min(0.9, x)), z: Math.max(0.22, Math.min(0.97, z)) });
  };

  switch (shape) {
    case 'line': {
      // fileira única na frente; espaçamento encolhe se necessário
      const sx = count > 1 ? Math.min(CUP_SPACING, 1.7 / (count - 1)) : 0;
      for (let i = 0; i < count; i += 1) {
        push((i - (count - 1) / 2) * sx, RACK_Z);
      }
      break;
    }

    case 'diamond': {
      // losango: fileiras 1..k..1, copos distribuídos em serpentina
      const half = Math.ceil((-1 + Math.sqrt(1 + 4 * count)) / 2);
      const rows = 2 * half - 1;
      let placed = 0;
      for (let r = 0; r < rows && placed < count; r += 1) {
        const w = Math.min(r + 1, rows - r);
        for (let i = 0; i < w && placed < count; i += 1, placed += 1) {
          push((i - (w - 1) / 2) * CUP_SPACING, RACK_Z + r * RACK_Z_STEP * 0.9);
        }
      }
      break;
    }

    case 'circle': {
      // elipse (mesa é 2D: x largo, z estreito) centrada na rack
      const rx = count >= 8 ? 0.32 : 0.24;
      const rz = RACK_Z_STEP * 1.35;
      for (let i = 0; i < count; i += 1) {
        const a = (i / count) * Math.PI * 2 + Math.PI / 2;
        push(Math.cos(a) * rx, rackCenterZ + Math.sin(a) * rz);
      }
      break;
    }

    case 'v': {
      // dois braços diagonais convergindo na frente
      for (let i = 0; i < count; i += 1) {
        const side = i % 2 ? -1 : 1;
        const d = Math.ceil(i / 2);
        push(side * d * CUP_SPACING * 0.85, RACK_Z + d * RACK_Z_STEP * 1.15);
      }
      break;
    }

    case 'random': {
      // aleatório com separação mínima (não solapado)
      const minDist = CUP_SPACING * 1.05;
      guard: for (let i = 0; i < count; i += 1) {
        let best = null;
        let bestD = -1;
        for (let tries = 0; tries < 80; tries += 1) {
          const x = rand(-0.72, 0.72);
          const z = rand(RACK_Z, RACK_Z + 6 * RACK_Z_STEP);
          let d = Infinity;
          for (const p of positions) d = Math.min(d, Math.hypot(p.x - x, p.z - z));
          if (d >= minDist) {
            best = { x, z };
            break;
          }
          if (d > bestD) {
            bestD = d;
            best = { x, z };
          }
        }
        if (!best) break guard;
        push(best.x, best.z);
      }
      break;
    }

    case 'pyramid':
    default: {
      // pirâmide clássica: fileiras 1,2,3… para trás
      let remaining = count;
      let row = 0;
      while (remaining > 0) {
        const w = Math.min(row + 1, remaining);
        for (let i = 0; i < w; i += 1) {
          push((i - (w - 1) / 2) * CUP_SPACING, RACK_Z + row * RACK_Z_STEP);
        }
        remaining -= w;
        row += 1;
      }
      break;
    }
  }
  return positions;
}

function clampInt(v, min, max) {
  return Math.max(min, Math.min(max, Math.round(v)));
}

function rand(min, max) {
  return min + Math.random() * (max - min);
}

export const MAX_PARTICLES = 220;
