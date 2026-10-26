/**
 * Inicializa o banco: aplica schema.sql e (opcionalmente) seed.sql.
 * Uso: npm run db:init [-- --seed]
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('../db');

async function run() {
  const doSeed = process.argv.includes('--seed');
  try {
    const schema = fs.readFileSync(path.join(__dirname, '..', 'sql', 'schema.sql'), 'utf8');
    await pool.query(schema);
    console.log('✔ Schema aplicado.');
    if (doSeed) {
      const seed = fs.readFileSync(path.join(__dirname, '..', 'sql', 'seed.sql'), 'utf8');
      await pool.query(seed);
      console.log('✔ Seed aplicado.');
    }
  } catch (err) {
    console.error('✖ Falha:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

run();
