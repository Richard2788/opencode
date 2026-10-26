/**
 * Snuffly's Carnival — Web service (API REST)
 * Arquitetura MVC: routes → controllers → models → PostgreSQL
 */
require('dotenv').config();
const express = require('express');
const path = require('path');
const routes = require('./routes/api.routes');

const app = express();

app.use(express.json());

// Front-end estático (PWA) servido pela mesma origem da API
app.use(express.static(path.join(__dirname, '..', 'public')));

// API
app.use('/api', routes);

// 404 da API
app.use('/api', (_req, res) => res.status(404).json({ error: 'Recurso não encontrado' }));

// Erros
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Erro interno' });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`🎪 Snuffly's Carnival na porta ${port}`));
