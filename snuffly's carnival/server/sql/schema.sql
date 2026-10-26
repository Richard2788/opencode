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
