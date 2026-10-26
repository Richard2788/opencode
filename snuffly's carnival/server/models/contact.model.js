/** Model: Mensagens de contato (M — acesso ao PostgreSQL). */
const pool = require('../db');

class Contact {
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
