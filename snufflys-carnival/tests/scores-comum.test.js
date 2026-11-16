/**
 * Testes da ponte de pontuações (public/jogos/scores-comum.js).
 * O script é um IIFE de browser — avaliado aqui com stubs de
 * document/localStorage/window para testar a fila offline.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const CODIGO = fs.readFileSync(
  path.join(__dirname, '..', 'public', 'jogos', 'scores-comum.js'),
  'utf8'
);

/**
 * Executa scores-comum.js num sandbox e devolve a API exposta + o "storage".
 * fetchImpl: função fetch falsa (padrão: erro de rede).
 */
function carregarBridge(lsInicial = {}, fetchImpl) {
  const storage = new Map(Object.entries(lsInicial));
  const sandbox = {
    console,
    localStorage: {
      getItem: (k) => (storage.has(k) ? storage.get(k) : null),
      setItem: (k, v) => storage.set(k, String(v)),
      removeItem: (k) => storage.delete(k),
    },
    fetch:
      fetchImpl ||
      (async () => {
        throw new Error('rede indisponível');
      }),
    document: {
      body: { dataset: { gameId: 'cup-pong' } },
      getElementById: () => null,
      addEventListener: () => {},
    },
    window: { prompt: () => null, setTimeout: () => 0, clearTimeout: () => {} },
  };
  vm.createContext(sandbox);
  vm.runInContext(CODIGO, sandbox);
  return { bridge: sandbox.window.SnufflyScores, storage };
}

describe('scores-comum: fila offline', () => {
  test('queuePending guarda a melhor pontuação (não acumula rajada)', () => {
    const { bridge, storage } = carregarBridge();
    bridge._internal.queuePending({ points: 300, at: 't1' });
    bridge._internal.queuePending({ points: 700, at: 't2' });
    bridge._internal.queuePending({ points: 500, at: 't3' });
    assert.equal(bridge._internal.getPending().points, 700);
    assert.ok(storage.get('snuffly.pendingScores.cup-pong').includes('700'));
  });

  test('fila antiga em array (versão anterior) é normalizada para a melhor', () => {
    const { bridge } = carregarBridge({
      'snuffly.pendingScores.cup-pong': JSON.stringify([
        { points: 120, at: 'a' },
        { points: 900, at: 'b' },
      ]),
    });
    assert.equal(bridge._internal.getPending().points, 900);
  });

  test('nova pontuação menor que a pendente não substitui a fila', () => {
    const { bridge } = carregarBridge({
      'snuffly.pendingScores.cup-pong': JSON.stringify({ points: 800, at: 'a' }),
    });
    bridge._internal.queuePending({ points: 200, at: 'b' });
    assert.equal(bridge._internal.getPending().points, 800);
  });

  test('clearPending esvazia a fila', () => {
    const { bridge } = carregarBridge({
      'snuffly.pendingScores.cup-pong': JSON.stringify({ points: 800, at: 'a' }),
    });
    bridge._internal.clearPending();
    assert.equal(bridge._internal.getPending(), null);
  });

  test('submitScore sem rede enfileira a pontuação', async () => {
    const { bridge, storage } = carregarBridge({
      'snuffly.playerName': JSON.stringify('Rei Momo'),
    });
    await bridge.submitScore(650);
    assert.equal(bridge._internal.getPending().points, 650);
    assert.ok(storage.get('snuffly.pendingScores.cup-pong').includes('650'));
  });

  test('submitScore com sucesso limpa pendências antigas e registra', async () => {
    let post;
    const { bridge } = carregarBridge(
      {
        'snuffly.playerName': JSON.stringify('Rei Momo'),
        'snuffly.pendingScores.cup-pong': JSON.stringify({ points: 300, at: 'a' }),
      },
      async (_url, opts) => {
        post = JSON.parse(opts.body);
        return { ok: true, status: 201 };
      }
    );
    await bridge.submitScore(950);
    assert.equal(post.game, 'cup-pong');
    assert.equal(post.player, 'Rei Momo');
    assert.equal(post.points, 950);
    assert.equal(bridge._internal.getPending(), null);
  });

  test('rejeição permanente (4xx) não vai para a fila', async () => {
    const { bridge } = carregarBridge(
      { 'snuffly.playerName': JSON.stringify('Rei Momo') },
      async () => ({
        ok: false,
        status: 400,
        json: async () => ({ ok: false, error: 'Jogo inválido.' }),
      })
    );
    await bridge.submitScore(500);
    assert.equal(bridge._internal.getPending(), null);
  });

  test('anti-replay de 15s é transitório: fica na fila com aviso', async () => {
    const { bridge } = carregarBridge(
      { 'snuffly.playerName': JSON.stringify('Rei Momo') },
      async () => ({
        ok: false,
        status: 400,
        json: async () => ({
          ok: false,
          error:
            'Pontuações do mesmo jogador no mesmo jogo devem ter pelo menos 15 segundos de intervalo.',
        }),
      })
    );
    await bridge.submitScore(500);
    assert.equal(bridge._internal.getPending().points, 500);
  });

  test('erro 5xx vai para a fila (transitório)', async () => {
    const { bridge } = carregarBridge(
      { 'snuffly.playerName': JSON.stringify('Rei Momo') },
      async () => ({ ok: false, status: 503, json: async () => ({ error: 'Erro interno' }) })
    );
    await bridge.submitScore(500);
    assert.equal(bridge._internal.getPending().points, 500);
  });

  test('flushPending com sucesso sincroniza e limpa a fila', async () => {
    const { bridge } = carregarBridge(
      {
        'snuffly.playerName': JSON.stringify('Rei Momo'),
        'snuffly.pendingScores.cup-pong': JSON.stringify({ points: 700, at: 'a' }),
      },
      async () => ({ ok: true, status: 201 })
    );
    await bridge.flushPending();
    assert.equal(bridge._internal.getPending(), null);
  });

  test('flushPending sem rede mantém a fila para a próxima visita', async () => {
    const { bridge } = carregarBridge({
      'snuffly.playerName': JSON.stringify('Rei Momo'),
      'snuffly.pendingScores.cup-pong': JSON.stringify({ points: 700, at: 'a' }),
    });
    await bridge.flushPending();
    assert.equal(bridge._internal.getPending().points, 700);
  });

  test('flushPending sem nome disponível não perde a fila', async () => {
    const { bridge } = carregarBridge({
      // sem snuffly.playerName e o prompt (stub) retorna null
      'snuffly.pendingScores.cup-pong': JSON.stringify({ points: 700, at: 'a' }),
    });
    await bridge.flushPending();
    assert.equal(bridge._internal.getPending().points, 700);
  });

  test('flushPending com rejeição 4xx descarta a entrada presa', async () => {
    const { bridge } = carregarBridge(
      {
        'snuffly.playerName': JSON.stringify('Rei Momo'),
        'snuffly.pendingScores.cup-pong': JSON.stringify({ points: 700, at: 'a' }),
      },
      async () => ({
        ok: false,
        status: 400,
        json: async () => ({ ok: false, error: 'Jogo inválido.' }),
      })
    );
    await bridge.flushPending();
    assert.equal(bridge._internal.getPending(), null);
  });

  test('flushPending com anti-replay (15s) mantém a entrada', async () => {
    const { bridge } = carregarBridge(
      {
        'snuffly.playerName': JSON.stringify('Rei Momo'),
        'snuffly.pendingScores.cup-pong': JSON.stringify({ points: 700, at: 'a' }),
      },
      async () => ({
        ok: false,
        status: 400,
        json: async () => ({
          ok: false,
          error:
            'Pontuações do mesmo jogador no mesmo jogo devem ter pelo menos 15 segundos de intervalo.',
        }),
      })
    );
    await bridge.flushPending();
    assert.equal(bridge._internal.getPending().points, 700);
  });
});
