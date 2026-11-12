/**
 * Garante o banco pronto na inicialização: aplica schema.sql e seed.sql.
 * Idempotente — seguro rodar a cada boot (ex.: deploy no Render).
 * O Render Free não suporta preDeployCommand, por isso o app mesmo
 * prepara o banco antes de ouvir a porta.
 *
 * Schema e seed rodam em uma transação explícita: se qualquer statement
 * falhar, nada é aplicado pela metade e o erro indica o passo exato.
 */
const fs = require('fs');
const path = require('path');
const pool = require('./db');

async function runFile(client, name, sql) {
  try {
    await client.query(sql);
  } catch (err) {
    err.message = `[${name}] ${err.message}`;
    throw err;
  }
}

async function ensureDb() {
  const sqlDir = path.join(__dirname, 'sql');
  const schema = fs.readFileSync(path.join(sqlDir, 'schema.sql'), 'utf8');
  const seed = fs.readFileSync(path.join(sqlDir, 'seed.sql'), 'utf8');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await runFile(client, 'schema.sql', schema);
    await runFile(client, 'seed.sql', seed);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

module.exports = ensureDb;
