/* =========================================================
   Snuffly's Carnival — scores-comum.js
   Ponte única com a API do site, reaproveitada pelos 4 jogos:
   ranking (GET /api/scores/:gameId), registro de pontuações
   (POST /api/scores com fila offline em Local Storage) e nome
   do jogador (snuffly.playerName).

   O id do jogo vem de <body data-game-id="..."> na página.

   Regras da fila offline (compatíveis com o anti-replay de
   15s do servidor — server/controllers/score.controller.js):
   - Guarda apenas a MELHOR pontuação pendente por jogo.
   - Só falhas de rede/5xx (transitórias) vão para a fila;
     4xx é rejeição permanente e é descartada com aviso claro.
   - flushPending() garante o nome do jogador antes de enviar
     e envia 1 entrada por visita, nunca em rajada.
   ========================================================= */

(() => {
  'use strict';

  const GAME_ID = document.body.dataset.gameId || '';
  const LS_PLAYER = 'snuffly.playerName';
  const LS_PENDING = 'snuffly.pendingScores.' + GAME_ID;

  if (!GAME_ID) {
    console.warn('[Snuffly] scores-comum.js sem data-game-id no <body>');
    return;
  }

  const store = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        return raw === null ? fallback : JSON.parse(raw);
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch {
        /* quota */
      }
    },
  };

  const dom = {
    list: document.getElementById('gameRanking'),
    dialog: document.getElementById('nameDialog'),
    form: document.getElementById('nameForm'),
    input: document.getElementById('playerName'),
    toast: document.getElementById('toast'),
    toastText: document.getElementById('toastText'),
    toastClose: document.getElementById('toastClose'),
  };

  /**
   * Toast compatível com os 4 jogos:
   * - adivinha-numero/hack-torre usam [hidden] + #toastText;
   * - cup-pong usa .toast.is-visible (opacity) e não tem #toastText.
   */
  function toast(text, timeout = 3600) {
    if (!dom.toast) return;
    (dom.toastText || dom.toast).textContent = text;
    dom.toast.hidden = false;
    dom.toast.classList.add('is-visible');
    window.clearTimeout(toast._t);
    if (timeout > 0) {
      toast._t = window.setTimeout(() => {
        dom.toast.hidden = true;
        dom.toast.classList.remove('is-visible');
      }, timeout);
    }
  }

  /* ---------------- Nome do jogador ---------------- */

  function escapeHTML(str) {
    return String(str).replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
    );
  }

  function getPlayerName() {
    return store.get(LS_PLAYER, '');
  }

  function askPlayerName() {
    return new Promise((resolve) => {
      if (!dom.dialog || typeof dom.dialog.showModal !== 'function') {
        const nome = window.prompt('Qual é o seu nome para o ranking?');
        if (nome && nome.trim()) {
          store.set(LS_PLAYER, nome.trim().slice(0, 40));
          resolve(getPlayerName());
        } else {
          resolve(null);
        }
        return;
      }
      dom.input.value = getPlayerName();
      dom.dialog.showModal();

      dom.form.onsubmit = (event) => {
        event.preventDefault();
        const nome = dom.input.value.trim().slice(0, 40);
        if (!nome) return;
        store.set(LS_PLAYER, nome);
        dom.dialog.close();
        resolve(nome);
      };
    });
  }

  /* ---------------- Ranking ---------------- */

  async function loadRanking() {
    if (!dom.list) return;
    try {
      const res = await fetch(`/api/scores/${GAME_ID}?limit=10`, {
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const scores = await res.json();

      if (!scores.length) {
        dom.list.innerHTML =
          '<p class="ranking__empty">Ninguém pontuou ainda — seja o primeiro! 🏆</p>';
        return;
      }
      const medals = ['🥇', '🥈', '🥉'];
      dom.list.innerHTML = `<ol class="ranking">${scores
        .map(
          (s, i) => `
        <li${s.player === getPlayerName() ? ' class="is-me"' : ''}>
          <span class="ranking__pos">${medals[i] || i + 1 + 'º'}</span>
          <span class="ranking__name">${escapeHTML(s.player)}</span>
          <span class="ranking__pts">${s.points} pts</span>
        </li>`
        )
        .join('')}</ol>`;
    } catch (err) {
      console.warn('[Snuffly] ranking indisponível:', err.message);
      dom.list.innerHTML = '<p class="ranking__empty">Ranking indisponível agora.</p>';
    }
  }

  /* ---------------- Fila offline ---------------- */

  /**
   * Mantém apenas a melhor pontuação pendente. Quando a API volta,
   * basta sincronizar 1 partida por jogo — nunca uma rajada que o
   * anti-replay de 15s do servidor rejeitaria em bloco.
   */
  function keepBest(prev, next) {
    if (!prev) return next;
    if (!next) return prev;
    return next.points >= prev.points ? next : prev;
  }

  function getPending() {
    const raw = store.get(LS_PENDING, null);
    if (!raw) return null;
    // Compat: versões antigas guardavam um array de entradas.
    if (Array.isArray(raw)) {
      return raw.reduce((acc, e) => keepBest(acc, e), null);
    }
    return raw;
  }

  function queuePending(entry) {
    store.set(LS_PENDING, keepBest(getPending(), entry));
  }

  function clearPending() {
    store.set(LS_PENDING, null);
  }

  /** Rejeição permanente (4xx)? Não adianta reenfileirar. */
  async function postScore(player, points) {
    let res;
    try {
      res = await fetch('/api/scores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ game: GAME_ID, player, points }),
      });
    } catch {
      return { kind: 'rede' };
    }
    if (res.ok) return { kind: 'ok' };
    if (res.status >= 500) return { kind: 'rede' };
    let erro = 'Não foi possível registrar a pontuação.';
    try {
      const body = await res.json();
      if (body && body.error) erro = body.error;
    } catch {
      /* corpo não-JSON */
    }
    // Anti-replay de 15s é transitório (basta esperar): não descarta.
    if (/15 segundos/.test(erro)) return { kind: 'rede', erro };
    return { kind: '4xx', erro };
  }

  /**
   * Sincroniza a melhor pontuação pendente.
   * Pede o nome se ainda não existir; sem nome, não perde a fila.
   */
  async function flushPending() {
    const entry = getPending();
    if (!entry) return;

    let player = getPlayerName();
    if (!player) {
      player = await askPlayerName();
      if (!player) return; // fila preservada para a próxima visita
    }

    const resultado = await postScore(player, entry.points);
    if (resultado.kind === 'ok') {
      clearPending();
      loadRanking();
      toast('Pontuação pendente enviada ao ranking! 🏆');
    } else if (resultado.kind === '4xx') {
      // irreversível (ex.: jogo removido do catálogo): descarta
      clearPending();
      toast(resultado.erro, 5000);
    } else if (resultado.erro) {
      // transitório conhecido (anti-replay): mantém a fila e avisa
      toast(resultado.erro, 5000);
    }
    // rede: mantém para a próxima visita
  }

  /**
   * Registra os pontos da partida.
   * Pede o nome na primeira vez; offline/instável guarda a melhor
   * pontuação e sincroniza depois.
   */
  async function submitScore(points) {
    let player = getPlayerName();
    if (!player) {
      player = await askPlayerName();
      if (!player) {
        toast('Pontuação não enviada — informe seu nome na próxima partida. 🎪');
        return;
      }
    }

    const entry = { points, at: new Date().toISOString() };
    const resultado = await postScore(player, points);

    if (resultado.kind === 'ok') {
      clearPending(); // a pontuação nova substitui qualquer pendência antiga
      await loadRanking();
      toast('Pontuação registrada no ranking! 🏆');
    } else if (resultado.kind === '4xx') {
      toast(resultado.erro, 5000);
    } else {
      queuePending(entry);
      toast(
        resultado.erro
          ? `${resultado.erro} Tentaremos enviar depois. 📡`
          : 'Sem conexão — seus pontos serão enviados depois. 📡',
        5000
      );
    }
  }

  /* ---------------- Boot ---------------- */

  document.addEventListener('DOMContentLoaded', () => {
    loadRanking();
    flushPending();
    if (dom.toastClose) {
      dom.toastClose.addEventListener('click', () => {
        dom.toast.hidden = true;
        dom.toast.classList.remove('is-visible');
      });
    }
  });

  /* API pública usada pelo game.js de cada jogo */
  window.SnufflyScores = {
    submitScore,
    getPlayerName,
    loadRanking,
    flushPending,
    /* internos expostos para testes unitários (node --test via vm) */
    _internal: { keepBest, getPending, queuePending, clearPending },
  };
})();
