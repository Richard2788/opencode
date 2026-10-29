/** Model: Pontuações (M — ranking das partidas; pronto para os 4 jogos futuros). */
const pool = require('../db');

const FIELDS = 'id, game, player, points, created_at';

class Score {
  /** Top pontuações de um jogo. */
  static async topByGame(game, limit = 10) {
    const { rows } = await pool.query(
      `SELECT ${FIELDS}
         FROM scores
        WHERE game = $1
        ORDER BY points DESC, created_at ASC
        LIMIT $2`,
      [game, Math.min(Math.max(parseInt(limit, 10) || 10, 1), 100)]
    );
    return rows;
  }

  static async create({ game, player, points }) {
    const { rows } = await pool.query(
      `INSERT INTO scores (game, player, points)
       VALUES ($1, $2, $3)
       RETURNING ${FIELDS}`,
      [game, player, points]
    );
    return rows[0];
  }
}

module.exports = Score;
