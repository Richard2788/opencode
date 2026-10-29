/* ============================================================
   Snuffly's Carnival — game-shell.js
   Casca comum para as páginas dos jogos.
   Cada jogo futuro substitui o placeholder por sua lógica,
   reaproveitando o ranking via API (/api/scores/:gameId).
   ============================================================ */
(function () {
  'use strict';

  const GAME = {
    id: document.body.dataset.gameId,
    name: document.body.dataset.gameName,
    emoji: document.body.dataset.gameEmoji,
    skill: document.body.dataset.gameSkill,
  };

  /* Local Storage das pontuações do jogador (estado leve no cliente) */
  const LS_KEY = 'snuffly.scores.' + GAME.id;
  function store() {
    try {
      return JSON.parse(localStorage.getItem(LS_KEY) || '[]');
    } catch {
      return [];
    }
  }
  function saveLocal(score) {
    const list = store();
    list.unshift(score);
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(list.slice(0, 20)));
    } catch {
      /* quota */
    }
  }

  function renderPlaceholder(root) {
    root.innerHTML = `
      <div class="game-board card">
        <span class="card-icon">${GAME.emoji}</span>
        <h2>${GAME.name}</h2>
        <p><strong>Em breve — jogue aqui.</strong></p>
        <p>Este é o espaço reservado para o módulo do jogo. A estrutura de
        view/controller já está pronta: a lógica do jogo entra neste quadro
        e a pontuação é registrada automaticamente no ranking abaixo.</p>
        <p class="game-skill">Habilidade: ${GAME.skill}</p>
      </div>`;
  }

  /** Ranking via API — mostra Top 10 do jogo; fallback: mensagem simples. */
  async function renderRanking(list) {
    if (!list) return;
    try {
      const res = await fetch('/api/scores/' + GAME.id + '?limit=10', {
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const scores = await res.json();
      if (!scores.length) {
        list.innerHTML =
          '<p class="notice">Nenhuma pontuação ainda — seja o primeiro quando o jogo estrear! 🏆</p>';
        return;
      }
      list.innerHTML =
        '<ol class="ranking">' +
        scores
          .map(
            (s, i) => `
        <li><span class="rank">${['🥇', '🥈', '🥉'][i] || i + 1 + 'º'}</span>
            <strong>${s.player}</strong> — ${s.points} pts</li>`
          )
          .join('') +
        '</ol>';
    } catch (err) {
      console.warn('[Snuffly] ranking indisponível:', err.message);
      list.innerHTML = '<p class="notice">Ranking indisponível no momento.</p>';
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    const root = document.getElementById('gameRoot');
    const list = document.getElementById('gameRanking');
    if (root) renderPlaceholder(root);
    if (list) renderRanking(list);
  });

  /* Exposto para o controller de cada jogo futuro */
  window.SnufflyGame = {
    id: GAME.id,
    /** Registre a pontuação ao fim de uma partida: registra no LS e envia à API. */
    async submitScore(player, points) {
      const local = { player, points, at: new Date().toISOString() };
      saveLocal(local);
      try {
        const res = await fetch('/api/scores', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ game: GAME.id, player, points }),
        });
        return await res.json();
      } catch (err) {
        console.warn('[Snuffly] pontuação salva só localmente:', err.message);
        return { ok: false, local };
      }
    },
    myScores: store,
  };
})();
