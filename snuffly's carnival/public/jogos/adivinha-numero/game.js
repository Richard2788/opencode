/* =========================================================
   Adivinha o Meu Número — Carnaval
   Lógica do jogo + PWA
   ========================================================= */

(() => {
  "use strict";

  const STORAGE_KEY = "snuffly.game.adivinha";
  const MAX_ATTEMPTS = 3;
  const MAX_NUMBER = 10;
  const REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)");

  const dom = {
    numbers: document.getElementById("numbers"),
    boardTitle: document.getElementById("boardTitle"),
    paper: document.getElementById("paper"),
    paperLabel: document.getElementById("paperLabel"),
    paperNumber: document.getElementById("paperNumber"),
    vendorSpeech: document.getElementById("vendorSpeech"),
    feedback: document.getElementById("feedback"),
    feedbackIcon: document.getElementById("feedbackIcon"),
    feedbackText: document.getElementById("feedbackText"),
    attempts: document.getElementById("attempts"),
    dots: Array.from(document.querySelectorAll(".attempts__dot")),
    newRound: document.getElementById("newRound"),
    soundBtn: document.getElementById("soundBtn"),
    soundIcon: document.getElementById("soundIcon"),
    statPrizes: document.getElementById("statPrizes"),
    statRounds: document.getElementById("statRounds"),
    statStreak: document.getElementById("statStreak"),
    resetBtn: document.getElementById("resetBtn"),
    prizeDialog: document.getElementById("prizeDialog"),
    prizeKicker: document.getElementById("prizeKicker"),
    prizeEmoji: document.getElementById("prizeEmoji"),
    prizeTitle: document.getElementById("prizeTitle"),
    prizeText: document.getElementById("prizeText"),
    dialogPlay: document.getElementById("dialogPlay"),
    dialogClose: document.getElementById("dialogClose"),
    toast: document.getElementById("toast"),
    toastText: document.getElementById("toastText"),
    toastClose: document.getElementById("toastClose"),
  };

  const settings = {
    sound: true,
  };

  const stats = {
    prizes: 0,
    rounds: 0,
    bestStreak: 0,
    streak: 0,
  };

  const state = {
    target: 0,
    attemptsLeft: MAX_ATTEMPTS,
    guessed: new Set(),
    locked: true,
  };

  const buttons = new Map();

  /* ---------------------------------------------------------
     Persistência
     --------------------------------------------------------- */

  function loadSaved() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (typeof saved.prizes === "number") stats.prizes = Math.max(0, saved.prizes);
      if (typeof saved.rounds === "number") stats.rounds = Math.max(0, saved.rounds);
      if (typeof saved.bestStreak === "number") stats.bestStreak = Math.max(0, saved.bestStreak);
      if (typeof saved.streak === "number") stats.streak = Math.max(0, saved.streak);
      if (typeof saved.sound === "boolean") settings.sound = saved.sound;
    } catch (error) {
      /* placar corrompido: começa do zero */
    }
  }

  function saveStats() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          prizes: stats.prizes,
          rounds: stats.rounds,
          bestStreak: stats.bestStreak,
          streak: stats.streak,
          sound: settings.sound,
        })
      );
    } catch (error) {
      /* armazenamento indisponível (modo privado): segue sem salvar */
    }
  }

  /* ---------------------------------------------------------
     Som (WebAudio, sem arquivos externos)
     --------------------------------------------------------- */

  let audioCtx = null;

  function getAudioContext() {
    if (!settings.sound) return null;
    if (!audioCtx) {
      const AudioCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtor) return null;
      audioCtx = new AudioCtor();
    }
    if (audioCtx.state === "suspended") audioCtx.resume();
    return audioCtx;
  }

  function playNotes(notes, type = "triangle", volume = 0.055) {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    notes.forEach((note) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = now + note.at;
      const dur = note.dur || 0.14;

      osc.type = type;
      osc.frequency.setValueAtTime(note.freq, start);

      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(volume, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + dur + 0.02);
    });
  }

  function playSound(kind) {
    if (!settings.sound) return;

    if (kind === "tap") {
      playNotes([{ freq: 523.25, at: 0, dur: 0.07 }], "sine", 0.035);
    } else if (kind === "miss") {
      playNotes(
        [
          { freq: 311.13, at: 0, dur: 0.1 },
          { freq: 233.08, at: 0.1, dur: 0.16 },
        ],
        "sawtooth",
        0.03
      );
    } else if (kind === "close") {
      playNotes(
        [
          { freq: 587.33, at: 0, dur: 0.13 },
          { freq: 739.99, at: 0.12, dur: 0.13 },
          { freq: 880.0, at: 0.24, dur: 0.24 },
        ],
        "triangle",
        0.05
      );
    } else if (kind === "win") {
      playNotes(
        [
          { freq: 523.25, at: 0, dur: 0.13 },
          { freq: 659.25, at: 0.12, dur: 0.13 },
          { freq: 783.99, at: 0.24, dur: 0.13 },
          { freq: 1046.5, at: 0.36, dur: 0.42 },
          { freq: 1318.51, at: 0.36, dur: 0.42 },
        ],
        "triangle",
        0.055
      );
    } else if (kind === "lose") {
      playNotes(
        [
          { freq: 392.0, at: 0, dur: 0.16 },
          { freq: 329.63, at: 0.16, dur: 0.16 },
          { freq: 261.63, at: 0.32, dur: 0.34 },
        ],
        "sine",
        0.045
      );
    }
  }

  function syncSoundButton() {
    dom.soundBtn.setAttribute("aria-pressed", String(settings.sound));
    dom.soundBtn.setAttribute("aria-label", settings.sound ? "Desligar sons" : "Ligar sons");
    dom.soundIcon.textContent = settings.sound ? "🔊" : "🔇";
  }

  /* ---------------------------------------------------------
     Confete (canvas)
     --------------------------------------------------------- */

  const canvas = document.getElementById("confetti");
  const ctx2d = canvas.getContext("2d");
  const CONFETTI_COLORS = ["#ffd600", "#ffffff", "#e53935", "#ff8a80", "#f2a900", "#fff8f0"];
  let particles = [];
  let animationId = null;
  let canvasW = 0;
  let canvasH = 0;

  function resizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvasW = window.innerWidth;
    canvasH = window.innerHeight;
    canvas.width = Math.floor(canvasW * dpr);
    canvas.height = Math.floor(canvasH * dpr);
    canvas.style.width = `${canvasW}px`;
    canvas.style.height = `${canvasH}px`;
    ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function spawnConfetti(amount) {
    if (REDUCED_MOTION.matches) return;
    resizeCanvas();

    for (let i = 0; i < amount; i += 1) {
      particles.push({
        x: Math.random() * canvasW,
        y: -20 - Math.random() * canvasH * 0.35,
        vx: (Math.random() - 0.5) * 2.6,
        vy: 2.4 + Math.random() * 3.4,
        size: 5 + Math.random() * 7,
        color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
        rotation: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 0.24,
        sway: Math.random() * Math.PI * 2,
        shape: Math.random() > 0.28 ? "rect" : "circle",
        life: 1,
      });
    }

    if (!animationId) animationId = requestAnimationFrame(tickConfetti);
  }

  function tickConfetti() {
    ctx2d.clearRect(0, 0, canvasW, canvasH);

    for (let i = particles.length - 1; i >= 0; i -= 1) {
      const p = particles[i];
      p.sway += 0.05;
      p.x += p.vx + Math.sin(p.sway) * 0.7;
      p.y += p.vy;
      p.vy = Math.min(p.vy + 0.025, 7.5);
      p.rotation += p.spin;
      if (p.y > canvasH + 30) p.life = 0;

      if (p.life <= 0) {
        particles.splice(i, 1);
        continue;
      }

      ctx2d.save();
      ctx2d.translate(p.x, p.y);
      ctx2d.rotate(p.rotation);
      ctx2d.fillStyle = p.color;
      ctx2d.globalAlpha = 0.95;

      if (p.shape === "circle") {
        ctx2d.beginPath();
        ctx2d.arc(0, 0, p.size / 2, 0, Math.PI * 2);
        ctx2d.fill();
      } else {
        ctx2d.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      }
      ctx2d.restore();
    }

    if (particles.length > 0) {
      animationId = requestAnimationFrame(tickConfetti);
    } else {
      animationId = null;
      ctx2d.clearRect(0, 0, canvasW, canvasH);
    }
  }

  /* ---------------------------------------------------------
     Placar e feedback
     --------------------------------------------------------- */

  function updateStats() {
    dom.statPrizes.textContent = String(stats.prizes);
    dom.statRounds.textContent = String(stats.rounds);
    dom.statStreak.textContent = String(stats.bestStreak);
  }

  function setFeedback(kind, icon, text) {
    dom.feedback.className = "feedback";
    if (kind) dom.feedback.classList.add(`feedback--${kind}`);
    dom.feedbackIcon.textContent = icon;
    dom.feedbackText.textContent = text;

    dom.feedback.classList.remove("is-bump");
    // reinicia a animação
    void dom.feedback.offsetWidth;
    dom.feedback.classList.add("is-bump");
  }

  function setSpeech(text) {
    dom.vendorSpeech.textContent = text;
  }

  function updateAttempts() {
    const used = MAX_ATTEMPTS - state.attemptsLeft;

    dom.dots.forEach((dot, index) => {
      dot.classList.toggle("is-used", index < used);
    });

    const label =
      state.attemptsLeft === 1
        ? "1 tentativa restante"
        : `${state.attemptsLeft} tentativas restantes`;
    dom.attempts.setAttribute("aria-label", label);
  }

  function revealTarget() {
    dom.paper.classList.add("is-revealed");
    dom.paperLabel.textContent = "O papel dizia";
    dom.paperNumber.textContent = String(state.target);
  }

  function resetPaper() {
    dom.paper.classList.remove("is-revealed");
    dom.paper.classList.add("is-shuffling");
    dom.paperLabel.textContent = "O papel diz";
    dom.paperNumber.textContent = "?";
    window.setTimeout(() => dom.paper.classList.remove("is-shuffling"), 560);
  }

  /* ---------------------------------------------------------
     Rodada
     --------------------------------------------------------- */

  function startRound(silent = false) {
    state.target = 1 + Math.floor(Math.random() * MAX_NUMBER);
    state.attemptsLeft = MAX_ATTEMPTS;
    state.guessed.clear();
    state.locked = false;

    stats.rounds += 1;
    saveStats();
    updateStats();

    resetPaper();
    updateAttempts();
    setSpeech("Escolhi um número de 1 a 10 e escrevi no papel. Qual é o seu palpite?");
    setFeedback("idle", "🎟️", "Toque em um número de 1 a 10. Você tem 3 tentativas!");

    dom.newRound.hidden = true;
    dom.attempts.hidden = false;
    dom.boardTitle.textContent = "Escolha seu palpite";

    buttons.forEach((button) => {
      button.disabled = false;
      button.classList.remove("is-picked", "is-win");
    });

    if (!silent) playSound("tap");
  }

  function lockBoard() {
    state.locked = true;
    buttons.forEach((button) => {
      button.disabled = true;
    });
  }

  function handleGuess(value) {
    if (state.locked || state.guessed.has(value)) return;

    const button = buttons.get(value);
    const diff = Math.abs(value - state.target);
    state.guessed.add(value);

    if (diff === 0 || diff === 1) {
      button.classList.add("is-win");
      finishRound(diff === 0 ? "exact" : "close");
      return;
    }

    // Errou: gasta uma tentativa
    state.attemptsLeft -= 1;
    button.disabled = true;
    button.classList.add("is-picked");
    updateAttempts();

    if (state.attemptsLeft <= 0) {
      finishRound("lose");
      return;
    }

    playSound("miss");
    const direction = state.target > value ? "maior" : "menor";
    const remaining =
      state.attemptsLeft === 1 ? "Resta 1 tentativa" : `Restam ${state.attemptsLeft} tentativas`;

    setFeedback(
      "miss",
      "🧊",
      `Errou! O número é ${direction} que ${value}. ${remaining}.`
    );
    setSpeech(`Hmm, não foi ${value}. O número é ${direction}! Tenta outra vez.`);
  }

  function finishRound(result) {
    lockBoard();
    revealTarget();
    dom.boardTitle.textContent = "Rodada encerrada";
    dom.attempts.hidden = true;

    const bridge = window.SnufflyScores;

    if (result === "exact") {
      stats.prizes += 1;
      stats.streak += 1;
      stats.bestStreak = Math.max(stats.bestStreak, stats.streak);
      saveStats();
      updateStats();
      playSound("win");
      spawnConfetti(150);
      setSpeech(`Acertou na mosca! O número era ${state.target}. Você levou a Máscara de Ouro! 🏆`);
      setFeedback("win", "🏆", `Acertou! O número era ${state.target}. Prêmio máximo garantido!`);
      showPrizeDialog("gold");
      // Ranking: acerto exato = 10 pts + 2 por vitória consecutiva
      if (bridge) bridge.submitScore(10 + (stats.streak - 1) * 2);
    } else if (result === "close") {
      stats.prizes += 1;
      stats.streak = 0;
      saveStats();
      updateStats();
      playSound("close");
      spawnConfetti(80);
      setSpeech(`Passou pertinho! O número era ${state.target}. Leva um brinde da barraca! 🎊`);
      setFeedback(
        "close",
        "🎊",
        `Número aproximado! O número era ${state.target}. Você ganhou um brinde!`
      );
      showPrizeDialog("close");
      // Ranking: acerto aproximado = 5 pts
      if (bridge) bridge.submitScore(5);
    } else {
      stats.streak = 0;
      saveStats();
      updateStats();
      playSound("lose");
      setSpeech(`Era ${state.target}! Na próxima você leva o prêmio. Bora de novo? 🎭`);
      setFeedback(
        "lose",
        "☹️",
        `Acabaram as tentativas. O número era ${state.target}. Jogue de novo!`
      );
    }

    dom.newRound.hidden = false;
    dom.newRound.focus({ preventScroll: true });
  }

  function showPrizeDialog(kind) {
    if (kind === "gold") {
      dom.prizeKicker.textContent = "Prêmio máximo";
      dom.prizeEmoji.textContent = "🏆";
      dom.prizeTitle.textContent = "Acertou na mosca!";
      dom.prizeText.textContent = `O número era ${state.target}. Você ganhou a Máscara de Ouro do Carnaval e mais um prêmio no placar!`;
      dom.prizeDialog.dataset.kind = "gold";
    } else {
      dom.prizeKicker.textContent = "Prêmio de consolação";
      dom.prizeEmoji.textContent = "🎊";
      dom.prizeTitle.textContent = "Quase lá!";
      dom.prizeText.textContent = `Você chegou pertinho: o número era ${state.target}. Um brinde de confetes dourados é seu!`;
      dom.prizeDialog.dataset.kind = "close";
    }

    if (typeof dom.prizeDialog.showModal === "function") {
      dom.prizeDialog.showModal();
    } else {
      dom.prizeDialog.setAttribute("open", "");
    }
  }

  /* ---------------------------------------------------------
     Tabuleiro
     --------------------------------------------------------- */

  function buildBoard() {
    const fragment = document.createDocumentFragment();

    for (let value = 1; value <= MAX_NUMBER; value += 1) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "number";
      button.textContent = String(value);
      button.dataset.value = String(value);
      button.setAttribute("aria-label", `Palpite ${value}`);
      button.addEventListener("click", () => handleGuess(value));
      buttons.set(value, button);
      fragment.appendChild(button);
    }

    dom.numbers.appendChild(fragment);
  }

  /* ---------------------------------------------------------
     Toasts e instalação
     --------------------------------------------------------- */

  let toastTimer = null;

  function showToast(text, timeout = 4200) {
    dom.toastText.textContent = text;
    dom.toast.hidden = false;

    window.clearTimeout(toastTimer);
    if (timeout > 0) toastTimer = window.setTimeout(hideToast, timeout);
  }

  function hideToast() {
    dom.toast.hidden = true;
    window.clearTimeout(toastTimer);
  }

  /* ---------------------------------------------------------
     Eventos gerais
     --------------------------------------------------------- */

  function setupEvents() {
    dom.newRound.addEventListener("click", startRound);

    dom.dialogPlay.addEventListener("click", () => {
      dom.prizeDialog.close();
      startRound();
    });

    dom.dialogClose.addEventListener("click", () => dom.prizeDialog.close());

    dom.soundBtn.addEventListener("click", () => {
      settings.sound = !settings.sound;
      syncSoundButton();
      saveStats();
      if (settings.sound) playSound("tap");
    });

    dom.resetBtn.addEventListener("click", () => {
      const confirmed = window.confirm("Zerar o placar de prêmios e rodadas?");
      if (!confirmed) return;

      stats.prizes = 0;
      stats.rounds = 0;
      stats.bestStreak = 0;
      stats.streak = 0;
      saveStats();
      updateStats();
      showToast("Placar zerado. Boa sorte na folia! 🎊", 3000);
    });

    dom.toastClose.addEventListener("click", hideToast);

    // Teclado: 1–9 e 0 (para 10)
    document.addEventListener("keydown", (event) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (dom.prizeDialog.open) return;
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;

      const key = event.key;
      if (/^[0-9]$/.test(key)) {
        const value = key === "0" ? 10 : Number(key);
        if (!state.locked) handleGuess(value);
      }
    });

    window.addEventListener("resize", resizeCanvas);

    // Mantém a tela acordada durante a partida quando possível
    if ("wakeLock" in navigator) {
      document.addEventListener("visibilitychange", async () => {
        if (document.visibilityState !== "visible" || state.locked) return;
        try {
          await navigator.wakeLock.request("screen");
        } catch (error) {
          /* sem suporte ou permissão */
        }
      });
    }
  }

  /* ---------------------------------------------------------
     Inicialização
     --------------------------------------------------------- */

  function init() {
    loadSaved();
    buildBoard();
    updateStats();
    updateAttempts();
    syncSoundButton();
    resizeCanvas();
    setupEvents();
    startRound(true);

    // Atalho do manifest: ./?jogar=1
    const params = new URLSearchParams(window.location.search);
    if (params.get("jogar") === "1") {
      dom.numbers.scrollIntoView({ block: "center", behavior: REDUCED_MOTION.matches ? "auto" : "smooth" });
    }
  }

  init();
})();
