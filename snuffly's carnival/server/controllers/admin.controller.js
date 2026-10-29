/** Painel admin: mensagens do "Fale com a gente" (protegido por ADMIN_PASS). */
const crypto = require('crypto');
const Contact = require('../models/contact.model');

/** Token de sessão derivado da senha (não expõe a senha no cookie). */
function sessionToken() {
  return crypto
    .createHash('sha256')
    .update(`snuffly-admin:${process.env.ADMIN_PASS || ''}`)
    .digest('hex');
}

function escapeHTML(str) {
  return String(str).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
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
    :root { --red:#e53935; --red-dark:#b71c1c; --deep:#7f1010; --yellow:#ffd600; --cream:#fff8f0; --ink:#2a1414; --muted:#7a5a55; }
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

exports.loginPage = (_req, res) => {
  res.send(layout('Entrar', `
    <div class="login">
      <h1>🔐 Painel do Carnaval</h1>
      <p class="count">Acesso restrito — mensagens do "Fale com a gente"</p>
      <form method="POST" action="/admin/login">
        <input type="password" name="senha" placeholder="Senha do painel" required autofocus />
        <button class="btn" type="submit">Entrar</button>
        <p class="err">${res.locals.loginError || ''}</p>
      </form>
    </div>`));
};

exports.login = (req, res) => {
  const { senha } = req.body || {};
  const expected = process.env.ADMIN_PASS || '';
  if (expected && senha && senha === expected) {
    res.cookie('snuffly_admin', sessionToken(), {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 12 * 60 * 60 * 1000, // 12h
    });
    return res.redirect('/admin/contatos');
  }
  res.locals.loginError = 'Senha incorreta.';
  res.status(401);
  exports.loginPage(req, res);
};

exports.logout = (req, res) => {
  res.clearCookie('snuffly_admin');
  res.redirect('/admin/login');
};

exports.listPage = async (req, res, next) => {
  try {
    const mensagens = await Contact.list(200);
    const itens = mensagens.length
      ? mensagens.map((m) => `
        <article class="msg">
          <div class="msg__head">
            <strong>${escapeHTML(m.nome)}</strong>
            <span>${new Date(m.created_at).toLocaleString('pt-BR')}</span>
          </div>
          <span class="msg__mail">${escapeHTML(m.email)}</span>
          <p>${escapeHTML(m.mensagem)}</p>
        </article>`).join('')
      : '<div class="empty">🎪 Nenhuma mensagem ainda. Assim que alguém falar com a gente, aparece aqui!</div>';

    res.send(layout('Mensagens', `
      <header>
        <h1>📬 Mensagens do "Fale com a gente"</h1>
        <span class="count">${mensagens.length} mensagem(ns)</span>
        <a class="ghost" href="/admin/logout">Sair</a>
      </header>
      <a class="back" href="/">← Voltar ao site</a>
      <main>${itens}</main>`));
  } catch (err) { next(err); }
};
