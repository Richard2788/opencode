/**
 * `npm run db:up` — sobe apenas o Postgres embutido (sem o servidor),
 * aplica schema/seed e fica rodando até Ctrl+C. Útil para psql/DBeaver
 * ou para depurar o banco isoladamente.
 */
const { ensureEmbeddedDbUrl, stopEmbeddedDb } = require('./db-embedded');
const ensureDb = require('../ensure-db');

async function main() {
  const embedded = await ensureEmbeddedDbUrl();
  if (!embedded) {
    console.log('ℹ DATABASE_URL definida — usando o banco externo em vez do embutido.');
  }
  await ensureDb();
  console.log(`✔ Banco pronto (${process.env.DATABASE_URL.replace(/:[^:@/]+@/, ':****@')}).`);
  console.log('  Ctrl+C para encerrar.');

  const desligar = async () => {
    if (embedded) await stopEmbeddedDb();
    process.exit(0);
  };
  process.on('SIGINT', desligar);
  process.on('SIGTERM', desligar);
}

main().catch((err) => {
  console.error('✖ db:up falhou:', err.message);
  process.exit(1);
});
