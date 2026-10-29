/** Controller: Prêmios (C — lógica de requisição/resposta). */
const Prize = require('../models/prize.model');

exports.list = async (req, res, next) => {
  try {
    const { type, q, page, limit, sort } = req.query;
    res.json(await Prize.all({ type, q, page, limit, sort }));
  } catch (err) {
    next(err);
  }
};

exports.featured = async (_req, res, next) => {
  try {
    res.json(await Prize.featured(3));
  } catch (err) {
    next(err);
  }
};

exports.byType = async (req, res, next) => {
  try {
    const allow = ['boneco', 'arma', 'acessorio'];
    if (!allow.includes(req.params.type)) {
      return res.status(400).json({ error: 'Tipo inválido' });
    }
    res.json(await Prize.findByType(req.params.type));
  } catch (err) {
    next(err);
  }
};
