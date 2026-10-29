/** Controller: Pontuações (C — validação de partidas e ranking). */
const Score = require('../models/score.model');
const Game = require('../models/game.model');

exports.top = async (req, res, next) => {
  try {
    const game = Game.find(req.params.gameId);
    if (!game) return res.status(404).json({ error: 'Jogo não encontrado' });
    res.json(await Score.topByGame(game.id, req.query.limit));
  } catch (err) {
    next(err);
  }
};

exports.create = async (req, res, next) => {
  try {
    const { game, player, points } = req.body || {};

    if (!Game.find(game)) {
      return res.status(400).json({
        ok: false,
        error: `Jogo inválido. Use um dos ids: ${Game.all()
          .map((g) => g.id)
          .join(', ')}.`,
      });
    }
    const name = String(player || '')
      .trim()
      .slice(0, 40);
    if (!name) return res.status(400).json({ ok: false, error: 'Informe o nome do jogador.' });

    const pts = Number(points);
    if (!Number.isInteger(pts) || pts < 0 || pts > 100000) {
      return res
        .status(400)
        .json({ ok: false, error: 'Pontuação deve ser um inteiro entre 0 e 100000.' });
    }

    const created = await Score.create({ game, player: name, points: pts });
    res.status(201).json({ ok: true, score: created });
  } catch (err) {
    next(err);
  }
};
