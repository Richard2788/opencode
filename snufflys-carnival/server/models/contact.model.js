/** Model: Mensagens de contato (M — acesso ao PostgreSQL). */
const pool = require('../db');

class Contact {
  static async list(limit = 100) {
    const { rows } = await pool.query(
      `SELECT id, nome, email, mensagem, created_at
         FROM contacts
        ORDER BY created_at DESC
        LIMIT $1`,
      [Math.min(Math.max(parseInt(limit, 10) || 100, 1), 500)]
    );
    return rows;
  }

  static async create({ nome, email, mensagem }) {
    const { rows } = await pool.query(
      `INSERT INTO contacts (nome, email, mensagem)
       VALUES ($1, $2, $3)
       RETURNING id, created_at`,
      [nome, email, mensagem]
    );
    return rows[0];
  }
}

module.exports = Contact;
