/** Controller: Pontuações (C — validação de partidas e ranking). */
const Score = require('../models/score.model');
const Game = require('../models/game.model');

const MIN_INTERVAL_MS = 15 * 1000; // partida real dura > 15s em qualquer jogo

/** Última submissão por "game|player" (lowercase) — anti-cheat anti-replay. */
const lastSeen = new Map(); // chave -> timestamp

function limparAntigos(agora) {
  if (lastSeen.size < 500) return;
  for (const [k, ts] of lastSeen) {
    if (agora - ts > 10 * 60 * 1000) lastSeen.delete(k);
  }
}

/**
 * Anti-cheat mínimo (server-side, sem verificação de gameplay):
 * 1. gameId validado contra o catálogo (Game.find).
 * 2. pontos ≤ maxPoints plausível por jogo (game.model.js).
 * 3. mesmo jogador+jogo não reenvia em menos de MIN_INTERVAL_MS.
 * Retorna null se ok, ou uma mensagem de erro em pt-BR.
 */
function validaPartida({ game, player, points }) {
  const g = Game.find(game);
  if (!g) {
    return `Jogo inválido. Use um dos ids: ${Game.all()
      .map((x) => x.id)
      .join(', ')}.`;
  }

  const pts = Number(points);
  if (!Number.isInteger(pts) || pts < 0 || pts > g.maxPoints) {
    return `Pontuação deve ser um inteiro entre 0 e ${g.maxPoints}.`;
  }

  const name = String(player || '')
    .trim()
    .slice(0, 40);
  if (!name) return 'Informe o nome do jogador.';

  const agora = Date.now();
  const chave = `${g.id}|${name.toLowerCase()}`;
  const anterior = lastSeen.get(chave);
  if (anterior && agora - anterior < MIN_INTERVAL_MS) {
    return 'Pontuações do mesmo jogador no mesmo jogo devem ter pelo menos 15 segundos de intervalo.';
  }

  lastSeen.set(chave, agora);
  limparAntigos(agora);
  return null;
}

exports.validaPartida = validaPartida;

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

    const erro = validaPartida({ game, player, points });
    if (erro) return res.status(400).json({ ok: false, error: erro });

    const created = await Score.create({
      game,
      player: String(player).trim().slice(0, 40),
      points: Number(points),
    });
    res.status(201).json({ ok: true, score: created });
  } catch (err) {
    next(err);
  }
};
