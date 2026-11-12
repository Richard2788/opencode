/**
 * Snuffly's Carnival — Web service (API REST)
 * Arquitetura MVC: routes → controllers → models → PostgreSQL
 */
require('dotenv').config();
const createApp = require('./app');

// Monta o app (rotas, middlewares) — separado do boot para facilitar testes
const app = createApp();

const port = process.env.PORT || 3000;

// Verifica o banco e aplica schema/seed (idempotente) na inicialização
(async () => {
  try {
    await app.locals.pool.query('SELECT 1');
    console.log('✔ Conexão com o PostgreSQL OK.');
  } catch (err) {
    console.error(
      '✖ Não foi possível conectar ao banco de dados:\n' +
        `  ${err.message}\n` +
        '  Dica local: confira as credenciais em .env (usuário/senha/porta)\n' +
        '  e rode "npm run db:init -- --seed" para criar as tabelas.'
    );
    process.exit(1);
  }

  try {
    await app.locals.ensureDb();
    console.log('✔ Schema e seed prontos.');
  } catch (err) {
    console.error('✖ Falha ao aplicar schema/seed:', err.message);
    process.exit(1);
  }

  const server = app.listen(port, () => console.log(`🎪 Snuffly's Carnival na porta ${port}`));

  // Graceful shutdown (SIGTERM no Render, Ctrl+C local): para de aceitar
  // conexões, fecha o pool do banco e sai — sem requisições cortadas.
  async function shutdown(signal) {
    console.log(`\n${signal} recebido — encerrando com elegância...`);
    const timer = setTimeout(() => process.exit(1), 10_000);
    timer.unref();
    try {
      await new Promise((resolve) => server.close(resolve));
      await app.locals.pool.end();
      console.log('✔ Servidor e pool de conexões encerrados.');
      process.exit(0);
    } catch (err) {
      console.error('✖ Falha no encerramento:', err.message);
      process.exit(1);
    }
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
})();
