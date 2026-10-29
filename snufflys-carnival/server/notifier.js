/** Notificações instantâneas (webhook): Telegram e/ou Discord. */
require('dotenv').config();

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL || '';

async function postJSON(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

/** Envia a notificação de novo contato. Falha NÃO derruba a requisição. */
async function notifyContact({ nome, email, mensagem }) {
  const text =
    `🎪 Novo contato no site!\n` +
    `👤 ${nome} <${email}>\n\n${mensagem}`;
  const results = [];

  if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
    try {
      await postJSON(
        `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
        { chat_id: TELEGRAM_CHAT_ID, text }
      );
      results.push('telegram:ok');
    } catch (err) {
      console.error('[notifier] Telegram falhou:', err.message);
      results.push('telegram:falhou');
    }
  }

  if (DISCORD_WEBHOOK_URL) {
    try {
      await postJSON(DISCORD_WEBHOOK_URL, { content: text });
      results.push('discord:ok');
    } catch (err) {
      console.error('[notifier] Discord falhou:', err.message);
      results.push('discord:falhou');
    }
  }

  return results;
}

module.exports = { notifyContact };
