/** Testes de API (supertest sobre o app montado em server/app.js).
 *  Sem banco: rotas que não precisam de DB (/api/games, validações 400).
 *  Com banco (DATABASE_URL disponível): /api/prizes, /api/contact, /api/scores. */
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');

const createApp = require('../server/app');
const pool = require('../server/db');

const app = createApp();

let temBanco = false;

before(async () => {
  try {
    await pool.query('SELECT 1');
    try {
      await pool.query('SELECT 1 FROM prizes LIMIT 1');
      temBanco = true;
    } catch {
      // tabelas não existem; roda db:init? deixa como sem banco
      try {
        await app.locals.ensureDb();
        temBanco = true;
      } catch { /* sem banco mesmo */ }
    }
  } catch { temBanco = false; }
});

after(async () => { await pool.end().catch(() => {}); });

describe('GET /api/games (sem banco)', () => {
  test('200 com 4 jogos', async () => {
    const res = await request(app).get('/api/games');
    assert.equal(res.status, 200);
    assert.equal(res.body.length, 4);
  });

  test('200 em um jogo específico', async () => {
    const res = await request(app).get('/api/games/tomba-copos');
    assert.equal(res.status, 200);
    assert.equal(res.body.id, 'tomba-copos');
  });

  test('404 em jogo inexistente', async () => {
    const res = await request(app).get('/api/games/nao-existe');
    assert.equal(res.status, 404);
  });
});

describe('POST /api/contact (validação, sem DB)', () => {
  test('400 com campos faltando', async () => {
    const res = await request(app).post('/api/contact').send({});
    assert.equal(res.status, 400);
    assert.ok(res.body.ok === false);
  });

  test('400 com e-mail inválido', async () => {
    const res = await request(app)
      .post('/api/contact')
      .send({ nome: 'a', email: 'sem-arroba', mensagem: 'x' });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /E-mail/);
  });
});

describe('POST /api/scores (validação, sem DB)', () => {
  test('400 com jogo desconhecido', async () => {
    const res = await request(app)
      .post('/api/scores')
      .send({ game: 'hackerzao', player: 'a', points: 10 });
    assert.equal(res.status, 400);
  });

  test('400 com pontos não numéricos', async () => {
    const res = await request(app)
      .post('/api/scores')
      .send({ game: 'tomba-copos', player: 'a', points: 'muito' });
    assert.equal(res.status, 400);
  });
});

describe('headers de segurança', () => {
  test('CSP presente na raiz', async () => {
    const res = await request(app).get('/');
    assert.match(res.headers['content-security-policy'], /default-src 'self'/);
  });
});

describe('GET /api/prizes (com banco)', () => {
  test('200 com items e paginação', async (t) => {
    if (!temBanco) t.skip('sem banco disponível');
    const res = await request(app).get('/api/prizes?limit=2&page=1');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.items));
    assert.ok(res.body.items.length <= 2);
    assert.ok(res.body.total >= res.body.items.length);
  });

  test('image_url suspeita vira null na API', async (t) => {
    if (!temBanco) t.skip('sem banco disponível');
    const bad = 'javascript:alert(1)';
    await pool.query(
      "INSERT INTO prizes (name,type,description,rarity,emoji,image_url) VALUES ('__test_xss','arma','x','comum','🎈',$1)",
      [bad]
    );
    try {
      const res = await request(app).get('/api/prizes?q=__test_xss');
      const row = res.body.items[0];
      assert.equal(row.image_url, null);
    } finally {
      await pool.query("DELETE FROM prizes WHERE name='__test_xss'");
    }
  });

  test('POST /api/contact 201 e grava sanitizado', async (t) => {
    if (!temBanco) t.skip('sem banco disponível');
    const res = await request(app)
      .post('/api/contact')
      .send({ nome: 'T <b>bold</b>', email: 't@t.com', mensagem: 'msg <@123> x' });
    assert.equal(res.status, 201);
    const { rows } = await pool.query('SELECT nome, mensagem FROM contacts ORDER BY id DESC LIMIT 1');
    assert.ok(!rows[0].nome.includes('<'));
    assert.ok(!rows[0].mensagem.includes('<@'));
    await pool.query("DELETE FROM contacts WHERE email='t@t.com' AND nome LIKE 'T %'");
  });
});
