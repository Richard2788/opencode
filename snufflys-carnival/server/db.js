/** Conexão com PostgreSQL (Render Database, Postgres embutido ou local). */
const { Pool } = require('pg');

function connectionStringAtual() {
  return process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/snuffly';
}

// Validação amigável da variável de ambiente (falha rápido, mensagem clara)
if (!/^postgres(ql)?:\/\//.test(connectionStringAtual())) {
  const connectionString = connectionStringAtual();
  console.error(
    '✖ DATABASE_URL inválida. Use o formato postgresql://usuario:senha@host:porta/banco\n' +
      '  Valor recebido: ' +
      connectionString.replace(/:[^:@/]+@/, ':****@')
  );
  process.exit(1);
}

/**
 * Pool criado sob demanda (lazy): nos testes/dev, o Postgres embutido pode
 * definir DATABASE_URL depois do require deste módulo; a URL é lida de novo
 * (e o pool só é construído) na primeira consulta.
 */
let pool;

function getPool() {
  if (!pool) {
    const connectionString = connectionStringAtual();
    // SSL apenas quando a URL exigir (ex.: Render com ?sslmode=require)
    const needsSsl = /sslmode=(require|verify-ca|verify-full)/.test(connectionString);
    pool = new Pool({
      connectionString,
      // Verifica o certificado do servidor (https://api.render.com usa CA pública)
      ssl: needsSsl ? { rejectUnauthorized: true } : false,
    });
  }
  return pool;
}

module.exports = new Proxy(
  {},
  {
    get(_target, prop) {
      const real = getPool();
      const value = real[prop];
      return typeof value === 'function' ? value.bind(real) : value;
    },
  }
);
