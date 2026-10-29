/**
 * Garante o banco pronto na inicialização: aplica schema.sql e seed.sql.
 * Idempotente — seguro rodar a cada boot (ex.: deploy no Render).
 * O Render Free não suporta preDeployCommand, por isso o app mesmo
 * prepara o banco antes de ouvir a porta.
 */
const fs = require('fs');
const path = require('path');
const pool = require('./db');

async function ensureDb() {
  const sqlDir = path.join(__dirname, 'sql');
  const schema = fs.readFileSync(path.join(sqlDir, 'schema.sql'), 'utf8');
  await pool.query(schema);
  const seed = fs.readFileSync(path.join(sqlDir, 'seed.sql'), 'utf8');
  await pool.query(seed);
}

module.exports = ensureDb;
