/**
 * PostgreSQL embutido para desenvolvimento/testes locais.
 *
 * Baixa e roda os binários oficiais do Postgres (embedded-postgres) em
 * `.pgdata/`, sem exigir instalação do Postgres no sistema. Usado por:
 *  - `npm run dev`  (quando DATABASE_URL não está definida)
 *  - `npm run db:up` (só o banco, sem o servidor)
 *  - `npm test`     (testes de integração sem DATABASE_URL externa)
 *
 * Produção (Render) nunca passa por aqui: DATABASE_URL vem do blueprint.
 *
 * Uso:
 *   const { startEmbeddedDb, stopEmbeddedDb } = require('./db-embedded');
 *   await startEmbeddedDb(); // define process.env.DATABASE_URL se ausente
 *   ...
 *   await stopEmbeddedDb();  // encerra o Postgres (idempotente)
 */
const fs = require('fs');
const net = require('net');
const path = require('path');

const EmbeddedPostgres = require('embedded-postgres').default;

const DATA_DIR = path.join(__dirname, '..', '..', '.pgdata');
const PORT = Number(process.env.PG_EMBEDDED_PORT) || 54329;
const DATABASE = 'snuffly';
const DEFAULT_URL = `postgresql://postgres:postgres@localhost:${PORT}/${DATABASE}`;

let instance = null; // { pg, started }
let starting = null; // promessa em curso (evita boot duplo em paralelo)

/** Verifica se algo já está escutando na porta do PG embutido. */
function portaOcupada(porta) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port: porta, timeout: 500 });
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('timeout', onFail);
    socket.once('error', onFail);
    function onFail() {
      socket.destroy();
      resolve(false);
    }
  });
}

/** Sobe o Postgres embutido (singleton). Idempotente. */
async function startEmbeddedDb() {
  if (instance?.started) return instance;
  if (starting) return starting;

  // Outro processo (ex.: arquivo de teste anterior) já subiu o banco?
  // Nesse caso apenas o reutilizamos — sem "posse" para parar depois.
  if (await portaOcupada(PORT)) {
    instance = { pg: null, started: true };
    process.env.DATABASE_URL = process.env.DATABASE_URL || DEFAULT_URL;
    return instance;
  }

  starting = (async () => {
    const firstRun = !fs.existsSync(path.join(DATA_DIR, 'PG_VERSION'));
    const pg = new EmbeddedPostgres({
      databaseDir: DATA_DIR,
      user: 'postgres',
      password: 'postgres',
      port: PORT,
      persistent: true,
    });

    if (firstRun) {
      await pg.initialise();
    }
    await pg.start();
    if (firstRun) {
      try {
        await pg.createDatabase(DATABASE);
      } catch (err) {
        if (!/already exists/i.test(String(err.message || err))) throw err;
      }
    }

    instance = { pg, started: true };
    console.log(`✔ PostgreSQL embutido pronto em .pgdata/ (porta ${PORT}).`);
    return instance;
  })();

  try {
    return await starting;
  } finally {
    starting = null;
  }
}

/** Encerra o Postgres embutido, se estiver rodando. Idempotente. */
async function stopEmbeddedDb() {
  if (!instance?.started) return;
  const { pg } = instance;
  instance = null;
  try {
    await pg.stop();
    console.log('✔ PostgreSQL embutido encerrado.');
  } catch (err) {
    console.error('✖ Falha ao encerrar o PostgreSQL embutido:', err.message);
  }
}

/**
 * Garante DATABASE_URL apontando para o Postgres embutido quando nenhuma
 * foi definida (dev local sem Postgres instalado). Retorna true se o
 * banco embutido for o caminho usado.
 */
async function ensureEmbeddedDbUrl() {
  require('dotenv').config();
  if (process.env.DATABASE_URL) return false;
  await startEmbeddedDb();
  process.env.DATABASE_URL = DEFAULT_URL;
  return true;
}

module.exports = { startEmbeddedDb, stopEmbeddedDb, ensureEmbeddedDbUrl, DEFAULT_URL };
