/**
 * Snuffly's Carnival — Web service (API REST)
 * Arquitetura MVC: routes → controllers → models → PostgreSQL
 */
require('dotenv').config();
const express = require('express');
const path = require('path');
const routes = require('./routes/api.routes');
const pool = require('./db');

const app = express();

// Render fica atrás de proxy — necessário para req.ip no rate limit
app.set('trust proxy', 1);

app.use(express.json({ limit: '32kb' }));

// Cookies sem dependência externa (usado pelo painel admin)
app.use((req, _res, next) => {
  const raw = req.headers.cookie || '';
  req.cookies = Object.fromEntries(
    raw.split(';').map((pair) => {
      const idx = pair.indexOf('=');
      return idx === -1
        ? [pair.trim(), '']
        : [pair.slice(0, idx).trim(), decodeURIComponent(pair.slice(idx + 1).trim())];
    })
  );
  next();
});

// Front-end estático (PWA) servido pela mesma origem da API
app.use(express.static(path.join(__dirname, '..', 'public')));

// Painel admin (/admin) — protegido por ADMIN_PASS
app.use('/admin', require('./routes/admin.routes'));

// API
app.use('/api', routes);

// 404 da API
app.use('/api', (_req, res) => res.status(404).json({ error: 'Recurso não encontrado' }));

// Erros
app.use((err, _req, res, _next) => {
  console.error(err);
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Corpo da requisição muito grande' });
  }
  res.status(500).json({ error: 'Erro interno' });
});

const port = process.env.PORT || 3000;

// Verifica o banco na inicialização (mensagem amigável em vez de falha silenciosa)
(async () => {
  try {
    await pool.query('SELECT 1');
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

  app.listen(port, () => console.log(`🎪 Snuffly's Carnival na porta ${port}`));
})();
