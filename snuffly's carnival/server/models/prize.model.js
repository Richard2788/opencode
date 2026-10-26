/** Model: Prêmios (M — acesso ao PostgreSQL). */
const pool = require('../db');

class Prize {
  static async all() {
    const { rows } = await pool.query(
      `SELECT id, name, type, description, rarity, emoji, image_url, created_at
         FROM prizes
        ORDER BY created_at DESC`
    );
    return rows;
  }

  static async featured(limit = 3) {
    const { rows } = await pool.query(
      `SELECT id, name, type, description, rarity, emoji, image_url, created_at
         FROM prizes
        ORDER BY created_at DESC
        LIMIT $1`,
      [limit]
    );
    return rows;
  }

  static async findByType(type) {
    const { rows } = await pool.query(
      `SELECT id, name, type, description, rarity, emoji, image_url, created_at
         FROM prizes
        WHERE type = $1
        ORDER BY created_at DESC`,
      [type]
    );
    return rows;
  }
}

module.exports = Prize;
