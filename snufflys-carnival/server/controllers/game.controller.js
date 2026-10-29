/** Controller: Jogos (C — catálogo dos 4 jogos da empresa). */
const Game = require('../models/game.model');

exports.list = (_req, res) => res.json(Game.all());

exports.find = (req, res) => {
  const game = Game.find(req.params.id);
  if (!game) return res.status(404).json({ error: 'Jogo não encontrado' });
  res.json(game);
};
