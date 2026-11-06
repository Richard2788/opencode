/** Testes do painel admin (/admin) — superfície mais sensível do app.
 *  Cobrem: proteção da listagem, login (CSRF + senha, correto/errado),
 *  sessão via cookie httpOnly, logout (CSRF) invalidando o token e rate
 *  limit do login. */
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');

process.env.ADMIN_PASS = 'palavra-secreta-teste';

// App próprio: o rate limiter é por instância (Map em memória), então os
// testes abaixo não interferem nos de api.test.js nem entre si.
const createApp = require('../server/app');
const pool = require('../server/db');

let temBanco = false;

/** GET /admin/login → { cookie, csrf } para o fluxo CSRF (double-submit). */
async function getCSRF(app) {
  const res = await request(app).get('/admin/login');
  const cookie = (res.headers['set-cookie'] || [])
    .filter((c) => c.startsWith('snuffly_csrf='))
    .map((c) => c.split(';')[0])
    .join('; ');
  const m = /name="_csrf" value="([a-f0-9]+)"/.exec(res.text);
  return { cookie, csrf: m ? m[1] : '' };
}

async function login(app, senha, { ip, csrf = {} } = {}) {
  const req = request(app)
    .post('/admin/login')
    .type('form')
    .send({ senha, _csrf: csrf.token });
  if (ip) req.set('X-Forwarded-For', ip);
  if (csrf.cookie) req.set('Cookie', csrf.cookie);
  return req;
}

describe('painel admin', () => {
  let app;

  before(async () => {
    app = createApp();
    try {
      await pool.query('SELECT 1');
      temBanco = true;
    } catch {
      temBanco = false; // sem Postgres: login/sessão/rate-limit rodam igual
    }
  });

  after(async () => {
    await pool.end().catch(() => {});
  });

  describe('GET /admin/contatos (proteção)', () => {
    test('sem sessão redireciona para o login', async () => {
      const res = await request(app).get('/admin/contatos');
      assert.equal(res.status, 302);
      assert.match(res.headers.location, /\/admin\/login/);
    });

    test('página de login emite cookie CSRF e campo _csrf', async () => {
      const res = await request(app).get('/admin/login');
      const raw = (res.headers['set-cookie'] || []).find((c) => c.startsWith('snuffly_csrf='));
      assert.match(raw, /^snuffly_csrf=[a-f0-9]+/);
      assert.match(raw, /httponly/i);
      assert.match(raw, /samesite=lax/i);
      assert.match(/name="_csrf" value="([a-f0-9]+)"/.exec(res.text)?.[1] || '', /^[a-f0-9]+$/);
    });
  });

  describe('POST /admin/login', () => {
    test('sem token CSRF responde 403 e não emite sessão', async () => {
      const res = await request(app)
        .post('/admin/login')
        .type('form')
        .send({ senha: 'palavra-secreta-teste' });
      assert.equal(res.status, 403);
      assert.match(res.text, /Sessão expirada/);
      assert.ok(
        !(res.headers['set-cookie'] || []).some((c) => c.startsWith('snuffly_admin='))
      );
    });

    test('CSRF sem cookie correspondente é rejeitado (pedido forjado)', async () => {
      const { csrf } = await getCSRF(app); // token capturado, mas sem o cookie
      const res = await request(app)
        .post('/admin/login')
        .type('form')
        .send({ senha: 'palavra-secreta-teste', _csrf: csrf });
      assert.equal(res.status, 403);
    });

    test('senha correta + CSRF emite cookie httpOnly e entra no painel', async () => {
      const { cookie, csrf } = await getCSRF(app);
      const res = await login(app, 'palavra-secreta-teste', { csrf: { cookie, token: csrf } });
      assert.equal(res.status, 302);
      assert.match(res.headers.location, /\/admin\/contatos/);

      const sessao = (res.headers['set-cookie'] || []).find((c) =>
        c.startsWith('snuffly_admin=')
      );
      assert.match(sessao, /^snuffly_admin=[a-f0-9]{64}/i);
      assert.match(sessao, /httponly/i);
      assert.match(sessao, /samesite=lax/i);

      // cookie válido acessa o painel (listagem lê o banco — sem Postgres
      // local essa parte vira artefato de ambiente, coberto na CI)
      const painel = await request(app)
        .get('/admin/contatos')
        .set('Cookie', `${cookie}; ${sessao.split(';')[0]}`);
      if (temBanco) {
        assert.equal(painel.status, 200);
        assert.match(painel.text, /Mensagens do "Fale com a gente"/);
      }
    });

    test('senha errada responde 401 com mensagem (sem sessão)', async () => {
      const { cookie, csrf } = await getCSRF(app);
      const res = await login(app, 'errada', { csrf: { cookie, token: csrf } });
      assert.equal(res.status, 401);
      assert.match(res.text, /Senha incorreta/);
      assert.ok(
        !(res.headers['set-cookie'] || []).some((c) => c.startsWith('snuffly_admin='))
      );
    });

    test('senha vazia responde 401', async () => {
      const { cookie, csrf } = await getCSRF(app);
      const res = await login(app, '', { csrf: { cookie, token: csrf } });
      assert.equal(res.status, 401);
    });

    test('loginError aparece escapado na página', async () => {
      const { cookie, csrf } = await getCSRF(app);
      const res = await login(app, 'senha-errada-com-<b>tags</b>', {
        csrf: { cookie, token: csrf },
      });
      assert.equal(res.status, 401);
      assert.match(res.text, /Senha incorreta/);
      assert.ok(!res.text.includes('<b>tags</b>'));
    });
  });

  describe('POST /admin/logout', () => {
    test('com CSRF: invalida a sessão (cookie reusado volta ao login)', async () => {
      const { cookie: csrfCookie, csrf } = await getCSRF(app);
      const loginRes = await login(app, 'palavra-secreta-teste', {
        ip: '198.51.100.7',
        csrf: { cookie: csrfCookie, token: csrf },
      });
      const sessao = (loginRes.headers['set-cookie'] || [])
        .find((c) => c.startsWith('snuffly_admin='))
        .split(';')[0];
      assert.ok(sessao.startsWith('snuffly_admin='));

      const logout = await request(app)
        .post('/admin/logout')
        .set('Cookie', `${csrfCookie}; ${sessao}`)
        .type('form')
        .send({ _csrf: csrf });
      assert.equal(logout.status, 302);
      assert.match(logout.headers.location, /\/admin\/login/);

      const depois = await request(app)
        .get('/admin/contatos')
        .set('Cookie', sessao);
      assert.equal(depois.status, 302); // token destruído no servidor
      assert.match(depois.headers.location, /\/admin\/login/);
    });

    test('sem CSRF não encerra a sessão (403)', async () => {
      const { cookie: csrfCookie, csrf } = await getCSRF(app);
      const loginRes = await login(app, 'palavra-secreta-teste', {
        ip: '198.51.100.9',
        csrf: { cookie: csrfCookie, token: csrf },
      });
      const sessao = (loginRes.headers['set-cookie'] || [])
        .find((c) => c.startsWith('snuffly_admin='))
        .split(';')[0];

      const logout = await request(app)
        .post('/admin/logout')
        .set('Cookie', sessao)
        .type('form')
        .send({});
      assert.equal(logout.status, 403);

      // sessão continua válida
      const depois = await request(app).get('/admin/contatos').set('Cookie', sessao);
      if (temBanco) assert.equal(depois.status, 200);
    });
  });

  describe('rate limit do login', () => {
    test('429 com Retry-After após 11 tentativas do mesmo IP', async () => {
      const { cookie: csrfCookie, csrf } = await getCSRF(app);
      let last;
      for (let i = 0; i < 11; i++) {
        last = await login(app, `tentativa-${i}`, {
          ip: '203.0.113.66',
          csrf: { cookie: csrfCookie, token: csrf },
        });
      }
      assert.equal(last.status, 429);
      assert.ok(last.headers['retry-after']);
      assert.equal(last.body?.ok, false);
      assert.match(last.body?.error || '', /Muitas tentativas/);
    });

    test('IPs diferentes têm contadores independentes', async () => {
      const { cookie: csrfCookie, csrf } = await getCSRF(app);
      const res = await login(app, 'errada', {
        ip: '203.0.113.77',
        csrf: { cookie: csrfCookie, token: csrf },
      });
      assert.equal(res.status, 401);
    });
  });

  after(() => {
    // Sessões vivem em memória do módulo; nada a encerrar.
  });
});
