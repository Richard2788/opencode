export const APP_VERSION = '2.0.0';
export const STORAGE_KEY = 'beerpong.neon.v1';

export const DIFFICULTIES = {
  easy: { label: 'Tranquilo', cpuSigma: 30 },
  normal: { label: 'Equilibrado', cpuSigma: 15 },
  hard: { label: 'Insano', cpuSigma: 7 },
};

/* =========================================================
   Física — unidades SI (metros, segundos, radianos)
   Mesa real de beer pong: 2,44 m × 0,61 m; copos ~cônica;
   bola de ping-pong r=19 mm; copo plástico: topo 48 mm,
   base 34,5 mm, altura 118 mm.
   ========================================================= */
export const PHYS = {
  G: 9.81,              // gravidade (m/s²)
  DRAG: 0.10,           // arrasto quadrático da bola de ping-pong (1/m)
  BALL_RADIUS: 0.019,   // raio da bola (m)
  RELEASE_H: 0.26,      // altura de solto da mão (m)
  RELEASE_D: 0.05,      // profundidade de solto (m)

  /* escala: 1 unidade lateral do jogo (x∈[-1,1]) = XU_M metros */
  XU_M: 0.33,           // semilargura da mesa (m)
  TABLE_WIDTH: 0.33,    // semilargura (m)
  TABLE_DEPTH: 2.4,     // comprimento útil (m)

  /* copo (tronco de cone) */
  CUP_TOP: 0.048,       // raio da boca (m)
  CUP_BOTTOM: 0.0345,   // raio da base (m)
  CUP_HEIGHT: 0.118,    // altura (m)
  RIM_RADIUS: 0.0045,   // espessura da borda (m)

  /* restituições / atritos */
  TABLE_REST: 0.72,     // quique na mesa
  RAIL_REST: 0.5,       // rebote nas bordas da mesa
  ROLL_FRICTION: 0.45,  // desaceleração de rolamento (m/s²)
  RIM_REST: 0.62,       // quique na borda do copo
  WALL_IN_REST: 0.42,   // parede interna (rebote mais seco)
  WALL_OUT_REST: 0.55,  // parede externa
  CUP_BOTTOM_REST: 0.24,// fundo do copo (quica pouco)

  TIP_THRESHOLD: 1.35,  // |vn| (m/s) que começa a derrubar o copo
  TIMEOUT: 7,           // s máximos de simulação por arremesso

  LAUNCH_ANGLE: 0.85,   // ângulo de solução de mira (~49°, arco de lob)
};

/* unidades do jogo (mantidas compatíveis com o render antigo) */
export const CUP_RADIUS = 0.048 / 0.33;      // ≈ 0.1455 xu
export const CUP_SPACING = CUP_RADIUS * 2.0; // copos encostados, como na rack real
export const RACK_Z = 0.785;
export const RACK_Z_STEP = 0.038;
export const RACK_ROWS = [1, 2, 3, 4];

export const MAX_PARTICLES = 220;
