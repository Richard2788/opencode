/* =========================================================
   Adivinha o Meu Número — scores.js
   Ponte com a API do site: ranking (GET /api/scores/:gameId)
   e registro de pontuações (POST /api/scores).
   Nome do jogador em Local Storage (snuffly.playerName).
   ========================================================= */

(() => {
  "use strict";

  const GAME_ID = "adivinha-numero";
  const LS_PLAYER = "snuffly.playerName";
  const LS_PENDING = "snuffly.pendingScores." + GAME_ID;

  const store = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        return raw === null ? fallback : JSON.parse(raw);
      } catch { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* quota */ }
    },
  };

  const dom = {
    list: document.getElementById("gameRanking"),
    dialog: document.getElementById("nameDialog"),
    form: document.getElementById("nameForm"),
    input: document.getElementById("playerName"),
    toast: document.getElementById("toast"),
    toastText: document.getElementById("toastText"),
    toastClose: document.getElementById("toastClose"),
  };

  function toast(text, timeout = 3600) {
    if (!dom.toast) return;
    dom.toastText.textContent = text;
    dom.toast.hidden = false;
    window.clearTimeout(toast._t);
    if (timeout > 0) toast._t = window.setTimeout(() => { dom.toast.hidden = true; }, timeout);
  }

  /* ---------------- Nome do jogador ---------------- */

  function getPlayerName() {
    return store.get(LS_PLAYER, "");
  }

  function askPlayerName() {
    return new Promise((resolve) => {
      if (!dom.dialog || typeof dom.dialog.showModal !== "function") {
        const nome = window.prompt("Qual é o seu nome para o ranking?");
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

  function escapeHTML(str) {
    return String(str).replace(/[&<>"']/g, (c) => (
      { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
    ));
  }

  async function loadRanking() {
    if (!dom.list) return;
    try {
      const res = await fetch(`/api/scores/${GAME_ID}?limit=10`, { headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const scores = await res.json();

      if (!scores.length) {
        dom.list.innerHTML = '<p class="ranking__empty">Ninguém pontuou ainda — seja o primeiro! 🏆</p>';
        return;
      }
      const medals = ["🥇", "🥈", "🥉"];
      dom.list.innerHTML = `<ol class="ranking">${scores.map((s, i) => `
        <li${s.player === getPlayerName() ? ' class="is-me"' : ""}>
          <span class="ranking__pos">${medals[i] || (i + 1 + "º")}</span>
          <span class="ranking__name">${escapeHTML(s.player)}</span>
          <span class="ranking__pts">${s.points} pts</span>
        </li>`).join("")}</ol>`;
    } catch (err) {
      console.warn("[Snuffly] ranking indisponível:", err.message);
      dom.list.innerHTML = '<p class="ranking__empty">Ranking indisponível agora.</p>';
    }
  }

  /* ---------------- Envio de pontuação ---------------- */

  function queuePending(entry) {
    store.set(LS_PENDING, store.get(LS_PENDING, []).concat([entry]).slice(-20));
  }

  async function flushPending(player) {
    const pending = store.get(LS_PENDING, []);
    if (!pending.length) return;
    const restantes = [];
    for (const entry of pending) {
      try {
        const res = await fetch("/api/scores", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ game: GAME_ID, player, points: entry.points }),
        });
        if (!res.ok) restantes.push(entry);
      } catch {
        restantes.push(entry); // offline: tenta de novo na próxima visita
      }
    }
    store.set(LS_PENDING, restantes);
    if (restantes.length === 0) loadRanking();
  }

  /**
   * Registra os pontos da rodada vencida.
   * Pede o nome na primeira vitória; offline guarda e sincroniza depois.
   */
  async function submitScore(points) {
    let player = getPlayerName();
    if (!player) {
      player = await askPlayerName();
      if (!player) {
        toast("Pontuação não enviada — informe seu nome na próxima rodada. 🎪");
        return;
      }
    }

    const entry = { points, at: new Date().toISOString() };
    try {
      const res = await fetch("/api/scores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ game: GAME_ID, player, points }),
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      await loadRanking();
      toast("Pontuação registrada no ranking! 🏆");
    } catch (err) {
      queuePending(entry); // sem conexão: sincroniza na próxima visita
      toast("Sem conexão — seus pontos serão enviados depois. 📡", 5000);
    }
  }

  /* ---------------- Boot ---------------- */

  document.addEventListener("DOMContentLoaded", () => {
    loadRanking();
    const player = getPlayerName();
    if (player) flushPending(player);
    if (dom.toastClose) dom.toastClose.addEventListener("click", () => { dom.toast.hidden = true; });
  });

  /* API pública usada pelo game.js */
  window.SnufflyScores = { submitScore, getPlayerName, loadRanking };
})();
