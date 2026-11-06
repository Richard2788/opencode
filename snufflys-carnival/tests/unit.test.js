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

describe('score.controller.validaPartida (anti-cheat)', () => {
  const { validaPartida } = require('../server/controllers/score.controller');

  test('aceita partida plausível', () => {
    assert.equal(validaPartida({ game: 'tomba-copos', player: 'ana', points: 450 }), null);
  });

  test('recusa jogo desconhecido', () => {
    assert.match(validaPartida({ game: 'nao-existe', player: 'a', points: 1 }), /Jogo inválido/);
  });

  test('recusa pontos acima do teto do jogo', () => {
    assert.match(
      validaPartida({ game: 'tomba-copos', player: 'beto', points: 99999 }),
      /entre 0 e 2000/
    );
    assert.match(
      validaPartida({ game: 'hack-torre-copos', player: 'carla', points: 50000 }),
      /entre 0 e 31000/
    );
  });

  test('recusa pontos negativos e não inteiros', () => {
    assert.ok(validaPartida({ game: 'cup-pong', player: 'duda', points: -1 }));
    assert.ok(validaPartida({ game: 'cup-pong', player: 'duda', points: 10.5 }));
  });

  test('recusa jogador vazio', () => {
    assert.match(validaPartida({ game: 'cup-pong', player: '  ', points: 10 }), /nome/);
  });

  test('recusa reenvio do mesmo jogador+jogo em menos de 15s', () => {
    const nome = 'reenvio-teste';
    assert.equal(validaPartida({ game: 'tomba-copos', player: nome, points: 100 }), null);
    assert.match(validaPartida({ game: 'tomba-copos', player: nome, points: 200 }), /15 segundos/);
  });

  test('mesmo player em jogos diferentes é independente', () => {
    const nome = 'jogos-distintos';
    assert.equal(validaPartida({ game: 'tomba-copos', player: nome, points: 10 }), null);
    assert.equal(validaPartida({ game: 'cup-pong', player: nome, points: 10 }), null);
  });

  test('catálogo tem maxPoints definido para os 4 jogos', () => {
    const Game = require('../server/models/game.model');
    for (const g of Game.all()) {
      assert.ok(Number.isInteger(g.maxPoints) && g.maxPoints > 0, g.id);
    }
  });
});
