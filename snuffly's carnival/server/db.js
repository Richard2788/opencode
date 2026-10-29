/** Conexão com PostgreSQL (Render Database ou local). */
const { Pool } = require('pg');

const connectionString =
  process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/snuffly';

// Validação amigável da variável de ambiente (falha rápido, mensagem clara)
if (!/^postgres(ql)?:\/\//.test(connectionString)) {
  console.error(
    '✖ DATABASE_URL inválida. Use o formato postgresql://usuario:senha@host:porta/banco\n' +
      '  Valor recebido: ' +
      connectionString.replace(/:[^:@/]+@/, ':****@')
  );
  process.exit(1);
}

// SSL apenas quando a URL exigir (ex.: Render com ?sslmode=require)
const needsSsl = /sslmode=(require|verify-ca|verify-full)/.test(connectionString);

const pool = new Pool({
  connectionString,
  ssl: needsSsl ? { rejectUnauthorized: false } : false,
});

module.exports = pool;
