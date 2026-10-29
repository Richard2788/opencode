-- Snuffly's Carnival — esquema PostgreSQL
CREATE TABLE IF NOT EXISTS prizes (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(80)  NOT NULL,
  type        VARCHAR(20)  NOT NULL CHECK (type IN ('boneco', 'arma', 'acessorio')),
  description TEXT,
  rarity      VARCHAR(12)  DEFAULT 'comum' CHECK (rarity IN ('comum', 'raro', 'lendário')),
  emoji       VARCHAR(8),
  image_url   TEXT,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS contacts (
  id         SERIAL PRIMARY KEY,
  nome       VARCHAR(80)  NOT NULL,
  email      VARCHAR(120) NOT NULL,
  mensagem   TEXT         NOT NULL,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Pontuações/partidas — estrutura pronta para os 4 jogos futuros
CREATE TABLE IF NOT EXISTS scores (
  id         SERIAL PRIMARY KEY,
  game       VARCHAR(40)  NOT NULL CHECK (game IN ('tomba-copos', 'hack-torre-copos', 'adivinha-numero', 'beer-pong')),
  player     VARCHAR(40)  NOT NULL,
  points     INTEGER      NOT NULL CHECK (points >= 0),
  created_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Índices (item: performance nas consultas da vitrine e do ranking)
CREATE INDEX IF NOT EXISTS idx_prizes_type       ON prizes (type);
CREATE INDEX IF NOT EXISTS idx_prizes_created_at ON prizes (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scores_game_pts   ON scores (game, points DESC);
