/** Rotas da API (V de "porta de entrada" do MVC no HTTP). */
const router = require('express').Router();
const prize = require('../controllers/prize.controller');
const game = require('../controllers/game.controller');
const contact = require('../controllers/contact.controller');

// Jogos
router.get('/games', game.list);
router.get('/games/:id', game.find);

// Prêmios
router.get('/prizes', prize.list);
router.get('/prizes/featured', prize.featured);
router.get('/prizes/type/:type', prize.byType);

// Contato
router.post('/contact', contact.create);

// Health check (Render)
router.get('/health', (_req, res) => res.json({ ok: true, service: "snuffly's carnival" }));

module.exports = router;
