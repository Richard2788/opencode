/** Painel admin: mensagens do "Fale com a gente" (protegido por ADMIN_PASS). */
const crypto = require('crypto');
const Contact = require('../models/contact.model');

const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12h
const CSRF_COOKIE = 'snuffly_csrf';
const CSRF_TTL_MS = 60 * 60 * 1000; // 1h

/**
 * Sessões emitidas: token aleatório → expiry. Viver em memória por instância
 * (suficiente para o Render Free, single instance); logout invalida o token.
 */
const sessions = new Map();

/**
 * Token CSRF (padrão double-submit): um token aleatório vai em um cookie
 * (qualquer valor serve, pois exigimos que campo do formulário == cookie).
 * `sameSite: lax` + verificação cookie↔campo impedem login/logout forjados
 * por outro site (CSRF de login e de logout).
 */
function novoCSRF() {
  return crypto.randomBytes(24).toString('hex');
}

function emitirCSRF(res) {
  const token = novoCSRF();
  res.cookie(CSRF_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: CSRF_TTL_MS,
  });
  return token;
}

/** Igualdade em tempo constante entre dois segredos de tamanho qualquer. */
function igualEmTempoConstante(a, b) {
  if (!a || !b) return false;
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function sessionToken() {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, Date.now() + SESSION_TTL_MS);
  sweepSessions();
  return token;
}

function isValidSession(token) {
  const expiry = sessions.get(String(token || ''));
  if (!expiry) return false;
  if (expiry < Date.now()) {
    sessions.delete(token);
    return false;
  }
  return true;
}

function destroySession(token) {
  sessions.delete(String(token || ''));
}

// Remove sessões expiradas periodicamente (evita crescimento do Map)
function sweepSessions() {
  if (sessions.size < 100) return;
  const now = Date.now();
  for (const [token, expiry] of sessions) {
    if (expiry < now) sessions.delete(token);
  }
}

exports.isValidSession = isValidSession;

function escapeHTML(str) {
  return String(str).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
}

function layout(title, body) {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="robots" content="noindex, nofollow" />
  <title>${title} — Snuffly's Carnival</title>
  <link rel="icon" href="/favicon.png" type="image/png" />
  <style>
    :root { --red:#e53935; --red-dark:#b71c1c; --deep:#7f1010; --yellow:#ffd600; --cream:#fff8f0; --white:#fff; --ink:#2a1414; --muted:#7a5a55; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: "Trebuchet MS", "Segoe UI", system-ui, sans-serif; background: var(--cream); color: var(--ink); line-height: 1.55; padding: 24px 16px; }
    header { display: flex; align-items: center; justify-content: space-between; gap: 12px; max-width: 860px; margin: 0 auto 20px; flex-wrap: wrap; }
    h1 { color: var(--deep); font-size: 1.4rem; }
    .count { color: var(--muted); font-size: .9rem; }
    a, .btn { color: var(--white); background: var(--red); text-decoration: none; font-weight: bold; padding: 10px 18px; border-radius: 999px; border: none; cursor: pointer; font-size: .9rem; }
    a.ghost { background: transparent; color: var(--deep); border: 2px solid var(--red); }
    main { max-width: 860px; margin: 0 auto; display: grid; gap: 14px; }
    .msg { background: var(--white); border-radius: 14px; border: 2px solid rgba(229,57,53,.2); padding: 16px 18px; box-shadow: 0 6px 18px rgba(127,16,16,.12); }
    .msg__head { display: flex; justify-content: space-between; gap: 10px; flex-wrap: wrap; margin-bottom: 6px; }
    .msg__head strong { color: var(--deep); }
    .msg__head span { color: var(--muted); font-size: .8rem; }
    .msg__mail { color: var(--red-dark); font-size: .9rem; font-weight: bold; }
    .msg p { margin-top: 6px; white-space: pre-wrap; overflow-wrap: anywhere; }
    .empty { text-align: center; color: var(--muted); padding: 32px; background: var(--white); border-radius: 14px; border: 2px dashed rgba(229,57,53,.3); }
    .login { max-width: 380px; margin: 60px auto; background: var(--white); border-radius: 18px; border: 2px solid rgba(255,214,0,.5); padding: 28px; text-align: center; box-shadow: 0 10px 30px rgba(127,16,16,.15); }
    .login input { width: 100%; font-size: 1rem; padding: 13px 14px; border: 2px solid rgba(229,57,53,.35); border-radius: 12px; margin: 14px 0; }
    .login .btn { width: 100%; }
    .err { color: var(--red-dark); font-size: .9rem; min-height: 1.3em; }
    .back { display: block; max-width: 860px; margin: 0 auto 12px; color: var(--deep); }
  </style>
</head>
<body>
${body}
</body>
</html>`;
}

exports.loginPage = (req, res) => {
  const csrf = emitirCSRF(res);
  res.send(
    layout(
      'Entrar',
      `
    <div class="login">
      <h1>🔐 Painel do Carnaval</h1>
      <p class="count">Acesso restrito — mensagens do "Fale com a gente"</p>
      <form method="POST" action="/admin/login">
        <input type="hidden" name="_csrf" value="${csrf}" />
        <input type="password" name="senha" placeholder="Senha do painel" required autofocus />
        <button class="btn" type="submit">Entrar</button>
        <p class="err">
          ${res.locals.loginError ? `🚫 ${escapeHTML(res.locals.loginError)}` : ''}
        </p>
      </form>
    </div>`
    )
  );
};

exports.login = (req, res) => {
  const { senha, _csrf } = req.body || {};

  // CSRF (login): o campo do formulário precisa bater com o cookie
  if (!igualEmTempoConstante(_csrf, req.cookies[CSRF_COOKIE])) {
    res.locals.loginError = 'Sessão expirada — recarregue a página e tente de novo.';
    res.status(403);
    return exports.loginPage(req, res);
  }

  const expected = process.env.ADMIN_PASS || '';
  if (igualEmTempoConstante(senha, expected)) {
    res.cookie('snuffly_admin', sessionToken(), {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: SESSION_TTL_MS,
    });
    return res.redirect('/admin/contatos');
  }
  res.locals.loginError = 'Senha incorreta.';
  res.status(401);
  exports.loginPage(req, res);
};

// Logout via POST (state change por GET era suscetível a CSRF de logout)
// e com token CSRF: o formulário do painel envia o mesmo valor do cookie.
exports.logout = (req, res) => {
  const { _csrf } = req.body || {};
  if (!igualEmTempoConstante(_csrf, req.cookies[CSRF_COOKIE])) {
    res.status(403).send('Pedido de logout rejeitado (CSRF). Volte ao painel e tente de novo.');
    return;
  }
  destroySession(req.cookies.snuffly_admin);
  res.clearCookie('snuffly_admin');
  res.redirect('/admin/login');
};

exports.listPage = async (req, res, next) => {
  try {
    const mensagens = await Contact.list(200);
    const itens = mensagens.length
      ? mensagens
          .map(
            (m) => `
        <article class="msg">
          <div class="msg__head">
            <strong>${escapeHTML(m.nome)}</strong>
            <span>${new Date(m.created_at).toLocaleString('pt-BR')}</span>
          </div>
          <span class="msg__mail">${escapeHTML(m.email)}</span>
          <p>${escapeHTML(m.mensagem)}</p>
        </article>`
          )
          .join('')
      : '<div class="empty">🎪 Nenhuma mensagem ainda. Assim que alguém falar com a gente, aparece aqui!</div>';

    res.send(
      layout(
        'Mensagens',
        `
      <header>
        <h1>📬 Mensagens do "Fale com a gente"</h1>
        <span class="count">${mensagens.length} mensagem(ns)</span>
        <form method="POST" action="/admin/logout" style="display:inline">
          <input type="hidden" name="_csrf" value="${escapeHTML(req.cookies[CSRF_COOKIE] || novoCSRF())}" />
          <button class="btn" type="submit">Sair</button>
        </form>
      </header>
      <a class="back" href="/">← Voltar ao site</a>
      <main>${itens}</main>`
      )
    );
  } catch (err) {
    next(err);
  }
};
