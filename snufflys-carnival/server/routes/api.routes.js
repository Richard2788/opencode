/** Rotas da API (V de "porta de entrada" do MVC no HTTP). */
const router = require('express').Router();
const prize = require('../controllers/prize.controller');
const game = require('../controllers/game.controller');
const contact = require('../controllers/contact.controller');
const score = require('../controllers/score.controller');
const rateLimit = require('../middleware/rate-limit');
const pool = require('../db');

// Jogos
router.get('/games', game.list);
router.get('/games/:id', game.find);

// Prêmios (com ?type=&q=&page=&limit=&sort=)
router.get('/prizes', prize.list);
router.get('/prizes/featured', prize.featured);
router.get('/prizes/type/:type', prize.byType);

router.post(
  '/contact',
  rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 10,
    message: 'Muitas mensagens enviadas em pouco tempo. Aguarde alguns minutos antes de tentar novamente.',
  }),
  contact.create
);

// Pontuações / ranking (estrutura para os jogos futuros)
router.get('/scores/:gameId', score.top);
router.post('/scores', rateLimit({ windowMs: 60 * 1000, max: 30 }), score.create);

// Health check (Render) — inclui verificação do banco
router.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, service: "snuffly's carnival", db: true });
  } catch (err) {
    console.error('[health] banco indisponível:', err.message);
    res.status(503).json({ ok: false, service: "snuffly's carnival", db: false });
  }
});

module.exports = router;
