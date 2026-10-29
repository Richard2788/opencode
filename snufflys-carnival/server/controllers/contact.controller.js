/** Controller: Contato (C). */
const Contact = require('../models/contact.model');
const { notifyContact } = require('../notifier');

/** Remove tags/ângulos (evita XSS armazenado) e limita tamanho. */
function clean(value, max) {
  return String(value || '')
    .replace(/[<>]/g, '')
    .trim()
    .slice(0, max);
}

exports.create = async (req, res, next) => {
  try {
    const { nome, email, mensagem } = req.body || {};

    const erros = [];
    if (!nome || !String(nome).trim()) erros.push('informe seu nome');
    if (!email || !String(email).trim()) erros.push('informe o e-mail');
    if (!mensagem || !String(mensagem).trim()) erros.push('escreva a mensagem');

    if (erros.length) {
      return res
        .status(400)
        .json({ ok: false, error: `Campos obrigatórios: ${erros.join(', ')}.` });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim())) {
      return res.status(400).json({ ok: false, error: 'E-mail inválido.' });
    }

    const dados = {
      nome: clean(nome, 80),
      email: clean(email, 120),
      mensagem: clean(mensagem, 2000),
    };
    await Contact.create(dados);

    // Notificação instantânea (Discord/Telegram) — não bloqueia a resposta
    notifyContact(dados).catch((err) => console.error('[notifier] erro:', err.message));

    res.status(201).json({ ok: true });
  } catch (err) {
    next(err);
  }
};
