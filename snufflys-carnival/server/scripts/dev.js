/**
 * `npm run dev` — desenvolvimento local com Postgres embutido.
 *
 * Se DATABASE_URL não estiver definida (.env ou ambiente), sobe o Postgres
 * embutido (server/scripts/db-embedded.js) e aponta o servidor para ele.
 * Depois inicia `node --watch server/server.js` como subprocesso.
 * Ao encerrar (Ctrl+C ou saída do servidor), o Postgres é parado limpo.
 *
 * Se DATABASE_URL existir, comporta-se como antes (só o servidor).
 */
const { spawn } = require('child_process');
const { ensureEmbeddedDbUrl, stopEmbeddedDb } = require('./db-embedded');

async function main() {
  const embedded = await ensureEmbeddedDbUrl();

  const child = spawn(process.execPath, ['--watch', 'server/server.js'], {
    stdio: 'inherit',
    env: process.env,
  });

  let encerrando = false;
  const desligar = async (codigo) => {
    if (encerrando) return;
    encerrando = true;
    if (child.exitCode === null && !child.killed) child.kill('SIGTERM');
    if (embedded) await stopEmbeddedDb();
    process.exit(typeof codigo === 'number' ? codigo : 0);
  };

  child.on('exit', (code, signal) => {
    // --watch reinicia por conta própria; saída real encerra o dev.
    if (code !== null || signal === 'SIGTERM' || signal === 'SIGINT') {
      desligar(code ?? 0);
    }
  });
  process.on('SIGINT', () => desligar(130));
  process.on('SIGTERM', () => desligar(143));
}

main().catch((err) => {
  console.error('✖ Falha ao iniciar o ambiente de dev:', err.message);
  process.exit(1);
});
