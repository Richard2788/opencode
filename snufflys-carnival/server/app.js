/**
 * Montagem do Express app (rotas + middlewares), separada do boot do servidor
 * para poder ser usada em testes (supertest) sem precisar de start/listen.
 */
const express = require('express');
const path = require('path');
const helmet = require('helmet');
const routes = require('./routes/api.routes');
const pool = require('./db');
const ensureDb = require('./ensure-db');

module.exports = function createApp() {
  const app = express();

  // Render fica atrás de proxy — necessário para req.ip no rate limit
  app.set('trust proxy', 1);

  // Headers de segurança. O site não usa recursos externos, então a CSP pode ser
  // restritiva; 'unsafe-inline' fica só no style (atributos style= gerados pelo app).
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:'],
          fontSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          frameAncestors: ["'none'"],
          upgradeInsecureRequests: [],
        },
      },
      crossOriginEmbedderPolicy: false,
    })
  );

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

  // Testes/boot utilizam: app.locals.pool (verificar banco) e app.locals.ensureDb
  app.locals.pool = pool;
  app.locals.ensureDb = ensureDb;

  return app;
};
