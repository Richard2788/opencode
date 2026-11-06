/** Model: Prêmios (M — acesso ao PostgreSQL). */
const pool = require('../db');

const FIELDS = 'id, name, type, description, rarity, emoji, image_url, created_at';

/** Só expõe image_url http(s) — dados suspeitos viram null (defesa extra contra XSS). */
function safeImageUrl(url) {
  const s = String(url || '').trim();
  return /^https?:\/\//i.test(s) ? s : null;
}

function withSafeImage(row) {
  if (!row) return row;
  return { ...row, image_url: safeImageUrl(row.image_url) };
}
const TYPES = ['boneco', 'arma', 'acessorio'];
const SORTS = {
  recent: 'created_at DESC',
  name: 'name ASC',
};

/**
 * Lista com filtros opcionais:
 *   type  — boneco | arma | acessorio
 *   q     — busca por nome/descrição (ILIKE)
 *   page  — 1..n
 *   limit — 1..60 (default 12)
 *   sort  — recent (default) | name
 * Retorna { items, total, page, limit, pages }.
 */
class Prize {
  static async all({ type, q, page = 1, limit = 12, sort = 'recent' } = {}) {
    const where = [];
    const params = [];

    if (type && TYPES.includes(type)) {
      params.push(type);
      where.push(`type = $${params.length}`);
    }
    if (q) {
      params.push(`%${q}%`);
      where.push(`(name ILIKE $${params.length} OR description ILIKE $${params.length})`);
    }
    const whereSQL = where.length ? `WHERE ${where.join(' AND ')}` : '';

    // COUNT com os mesmos filtros
    const countParams = params.slice();
    const { rows: countRows } = await pool.query(
      `SELECT count(*)::int AS total FROM prizes ${whereSQL}`,
      countParams
    );
    const total = countRows[0].total;

    // Ordenação e paginação (valores interpolados são inteiros validados)
    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 12, 1), 60);
    const totalPages = Math.max(Math.ceil(total / safeLimit), 1);
    const safePage = Math.min(Math.max(parseInt(page, 10) || 1, 1), totalPages);
    const orderSQL = SORTS[sort] || SORTS.recent;

    params.push(safeLimit);
    const limitSQL = `$${params.length}`;
    params.push((safePage - 1) * safeLimit);
    const offsetSQL = `$${params.length}`;

    const { rows } = await pool.query(
      `SELECT ${FIELDS}
         FROM prizes
         ${whereSQL}
        ORDER BY ${orderSQL}
        LIMIT ${limitSQL} OFFSET ${offsetSQL}`,
      params
    );

    return {
      items: rows.map(withSafeImage),
      total,
      page: safePage,
      limit: safeLimit,
      pages: totalPages,
    };
  }

  static async featured(limit = 3) {
    const { rows } = await pool.query(
      `SELECT ${FIELDS}
         FROM prizes
        ORDER BY created_at DESC
        LIMIT $1`,
      [limit]
    );
    return rows.map(withSafeImage);
  }

  static async findByType(type) {
    const { rows } = await pool.query(
      `SELECT ${FIELDS}
         FROM prizes
        WHERE type = $1
        ORDER BY created_at DESC`,
      [type]
    );
    return rows.map(withSafeImage);
  }
}

module.exports = Prize;
// Exposto para testes (validação de URL é lógica pura)
module.exports.safeImageUrl = safeImageUrl;
