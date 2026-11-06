/** Testes unitários: lógica pura (sanitização, rate limit, validação de URL). */
const { test, describe } = require('node:test');
const assert = require('node:assert');

const contact = require('../server/controllers/contact.controller');
const { sanitizeForWebhook } = require('../server/notifier');
const Prize = require('../server/models/prize.model');

describe('contact.controller.clean', () => {
  test('remove tags e ângulos (anti-XSS)', () => {
    assert.equal(contact.clean('<script>alert(1)</script>oi', 100), 'scriptalert(1)/scriptoi');
  });

  test('remove menções de Discord/Telegram', () => {
    assert.equal(contact.clean('olá <@123456> <@abc>', 100), 'olá');
  });

  test('remove caracteres de controle (mantém \\n)', () => {
    assert.equal(contact.clean('a\u0001b\nc', 100), 'a b\nc');
  });

  test('limita tamanho e faz trim', () => {
    assert.equal(contact.clean('  abcd  ', 2), 'ab');
  });

  test('aceita valores ausentes', () => {
    assert.equal(contact.clean(null, 10), '');
  });
});

describe('notifier.sanitizeForWebhook', () => {
  test('neutraliza @everyone/@here', () => {
    const out = sanitizeForWebhook('oi @everyone e @here!');
    assert.ok(!/@everyone/.test(out.replace('@\u200b@everyone', '')) || out.includes('@\u200b'));
    assert.ok(out.includes('@\u200b@everyone') && out.includes('@\u200b@here'));
  });

  test('remove menções <@id>', () => {
    const out = sanitizeForWebhook('ping <@9876>');
    assert.ok(!/<@9876>/.test(out));
  });

  test('texto limpo passa intocado', () => {
    assert.equal(sanitizeForWebhook('joão: oi'), 'joão: oi');
  });
});

describe('prize.model.safeImageUrl', () => {
  test('aceita http/https', () => {
    assert.equal(Prize.safeImageUrl('https://x.com/a.png'), 'https://x.com/a.png');
    assert.equal(Prize.safeImageUrl('http://x.com/a.png'), 'http://x.com/a.png');
  });

  test('bloqueia javascript:, data: e JS brasileiro de pacote', () => {
    assert.equal(Prize.safeImageUrl('javascript:alert(1)'), null);
    assert.equal(Prize.safeImageUrl('data:image/svg+xml;base64,xxx'), null);
    assert.equal(Prize.safeImageUrl('/relativa.png'), null);
  });

  test('null/undefined → null', () => {
    assert.equal(Prize.safeImageUrl(null), null);
    assert.equal(Prize.safeImageUrl(undefined), null);
  });
});
