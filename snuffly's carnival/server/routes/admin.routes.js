/** Rotas do painel admin (/admin) — protegidas por ADMIN_PASS. */
const router = require('express').Router();
const express = require('express');
const admin = require('../controllers/admin.controller');
const rateLimit = require('../middleware/rate-limit');

// Parse de formulário apenas para as rotas admin
router.use(express.urlencoded({ extended: false }));

router.get('/login', admin.loginPage);
router.post('/login', rateLimit({ windowMs: 10 * 60 * 1000, max: 10, message: 'Muitas tentativas. Aguarde alguns minutos.' }), admin.login);
router.get('/logout', admin.logout);

// Middleware de proteção: sem cookie válido, manda para o login
router.use((req, res, next) => {
  const crypto = require('crypto');
  const expected = crypto
    .createHash('sha256')
    .update(`snuffly-admin:${process.env.ADMIN_PASS || ''}`)
    .digest('hex');
  if (req.cookies.snuffly_admin === expected) return next();
  res.redirect('/admin/login');
});

router.get('/contatos', admin.listPage);

module.exports = router;
