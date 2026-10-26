/** Controller: Contato (C). */
const Contact = require('../models/contact.model');

exports.create = async (req, res, next) => {
  try {
    const { nome, email, mensagem } = req.body || {};
    if (!nome || !email || !mensagem) {
      return res.status(400).json({ ok: false, error: 'Preencha todos os campos' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ ok: false, error: 'E-mail inválido' });
    }
    await Contact.create({ nome, email, mensagem });
    res.status(201).json({ ok: true });
  } catch (err) { next(err); }
};
