import { DIFFICULTIES } from './config.js';
import { saveStore, resetStats } from './store.js';

const $ = (selector) => document.querySelector(selector);

export function initUI({ store, audio, game }) {
  const hud = $('#hud');
  const screens = new Map(
    [...document.querySelectorAll('.screen')].map((el) => [el.id.replace('screen-', ''), el])
  );

  const el = {
    turnPill: $('#turn-pill'),
    turnLabel: $('#turn-label'),
    name1: $('#name-1'),
    name2: $('#name-2'),
    count1: $('#count-1'),
    count2: $('#count-2'),
    cups1: $('#cups-1'),
    cups2: $('#cups-2'),
    team1: $('#team-1'),
    team2: $('#team-2'),
    throwDots: $('#throw-dots'),
    streakChip: $('#streak-chip'),
    streakValue: $('#streak-value'),
    toast: $('#toast'),
    hint: $('#aim-hint'),
    soundBtn: $('#btn-sound'),
    difficultyChip: $('#difficulty-chip'),
    statsGrid: $('#stats-grid'),
  };

  let currentScreen = 'menu';
  let toastTimer = null;
  let hintTimer = null;

  /* ---------------------------------------------------------
     Cup indicators
     --------------------------------------------------------- */
  function buildCupRow(container, total = 10) {
    container.innerHTML = '';
    for (let i = 0; i < total; i += 1) {
      container.appendChild(document.createElement('span'));
    }
  }
  buildCupRow(el.cups1);
  buildCupRow(el.cups2);
  buildCupRow(el.throwDots, 2);

  function paintCups(container, remaining, total = 10) {
    const spans = container.children;
    for (let i = 0; i < spans.length; i += 1) {
      spans[i].classList.toggle('is-hit', i >= remaining);
    }
    container.setAttribute('aria-label', `${remaining} de ${total} copos restantes`);
  }

  /* ---------------------------------------------------------
     Screens
     --------------------------------------------------------- */
  function setScreen(name) {
    currentScreen = name;
    for (const [key, node] of screens) {
      node.classList.toggle('is-open', key === name);
    }
    hud.hidden = name !== null;
    document.body.dataset.screen = name || 'game';
    if (name === null) {
      el.hint.classList.add('is-visible');
      clearTimeout(hintTimer);
      hintTimer = setTimeout(() => el.hint.classList.remove('is-visible'), 12000);
    } else {
      el.hint.classList.remove('is-visible');
    }
  }

  function startGame(mode) {
    audio.unlock();
    audio.play('ui');
    setScreen(null);
    game.start(mode);
  }

  function hideHint() {
    el.hint.classList.remove('is-visible');
    clearTimeout(hintTimer);
  }

  /* ---------------------------------------------------------
     Toast
     --------------------------------------------------------- */
  function toast(text, tone = '') {
    if (!text) return;
    el.toast.textContent = text;
    el.toast.className = 'toast is-visible';
    if (tone === 'good') el.toast.classList.add('is-good');
    if (tone === 'hot') el.toast.classList.add('is-hot');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.toast.classList.remove('is-visible');
    }, 1900);
  }

  /* ---------------------------------------------------------
     HUD
     --------------------------------------------------------- */
  function updateHud(data) {
    if (!data) return;
    const practice = data.mode === 'practice';
    const cpu = data.mode === 'cpu';

    // pop nos contadores quando muda o placar
    const prev = updateHud._prev || (updateHud._prev = {});
    for (const [node, value] of [
      [el.count1, data.cups[0]],
      [el.count2, data.cups[1]],
    ]) {
      const key = node.id;
      if (prev[key] !== undefined && prev[key] !== value && !node.hidden) {
        node.classList.remove('pop');
        void node.offsetWidth;
        node.classList.add('pop');
      }
      prev[key] = value;
    }

    if (practice) {
      el.name1.textContent = 'Precisão';
      el.count1.textContent = `${data.accuracy}%`;
      el.cups1.hidden = true;
      el.cups1.setAttribute('aria-label', `Precisão de ${data.accuracy}%`);
      el.name2.textContent = 'Alvos';
      el.count2.textContent = String(data.cups[1]);
      paintCups(el.cups2, data.cups[1], 10);
      el.team1.classList.add('is-active');
      el.team2.classList.remove('is-active');
      el.turnLabel.textContent = 'Treino livre';
      el.turnPill.classList.remove('is-cpu');
      el.turnPill.classList.add('is-practice');
      el.throwDots.hidden = true;
    } else {
      el.cups1.hidden = false;
      el.name1.textContent = data.names[0];
      el.name2.textContent = data.names[1];
      el.count1.textContent = String(data.cups[0]);
      el.count2.textContent = String(data.cups[1]);
      paintCups(el.cups1, data.cups[0], 10);
      paintCups(el.cups2, data.cups[1], 10);
      el.team1.classList.toggle('is-active', data.turn === 0);
      el.team2.classList.toggle('is-active', data.turn === 1);
      el.throwDots.hidden = false;
      const dots = el.throwDots.children;
      for (let i = 0; i < dots.length; i += 1) {
        dots[i].classList.toggle('is-full', i < data.throwsLeft);
      }
      el.turnPill.classList.remove('is-practice');
      el.turnPill.classList.toggle('is-cpu', cpu && data.turn === 1);
      if (cpu && data.turn === 1) {
        el.turnLabel.textContent = data.cpuThinking ? 'CPU mirando…' : 'Vez do CPU';
      } else if (cpu) {
        el.turnLabel.textContent = 'Sua vez';
      } else {
        el.turnLabel.textContent = `Vez de ${data.names[data.turn]}`;
      }
    }

    if (data.streak >= 2) {
      el.streakChip.hidden = false;
      el.streakValue.textContent = String(data.streak);
    } else {
      el.streakChip.hidden = true;
    }
  }

  /* ---------------------------------------------------------
     Settings sync
     --------------------------------------------------------- */
  function syncSettings() {
    const soundOn = Boolean(store.settings.sound);
    const vibOn = Boolean(store.settings.vibrate);

    $('#toggle-sound').setAttribute('aria-checked', String(soundOn));
    $('#toggle-vibrate').setAttribute('aria-checked', String(vibOn));
    el.soundBtn.setAttribute('aria-pressed', String(soundOn));
    el.soundBtn.setAttribute('aria-label', soundOn ? 'Desligar som' : 'Ligar som');
    el.soundBtn.querySelector('use').setAttribute('href', soundOn ? '#i-sound' : '#i-mute');

    const diff = DIFFICULTIES[store.settings.difficulty] ? store.settings.difficulty : 'normal';
    el.difficultyChip.textContent = DIFFICULTIES[diff].label;
    for (const btn of document.querySelectorAll('#difficulty-seg button')) {
      btn.setAttribute('aria-checked', String(btn.dataset.diff === diff));
    }
    syncStats();
  }

  function syncStats() {
    const { games, wins, throws, hits, bestStreak } = store.stats;
    const acc = throws ? Math.round((hits / throws) * 100) : 0;
    $('#stat-games').textContent = String(games);
    $('#stat-wins').textContent = String(wins);
    $('#stat-acc').textContent = `${acc}%`;
    $('#stat-streak').textContent = String(bestStreak);
  }

  function setSound(value) {
    store.settings.sound = value;
    audio.setEnabled(value);
    saveStore(store);
    syncSettings();
    if (value) audio.play('ui');
  }

  function setVibrate(value) {
    store.settings.vibrate = value;
    saveStore(store);
    syncSettings();
  }

  function setDifficulty(value) {
    if (!DIFFICULTIES[value]) return;
    game.setDifficulty(value);
    syncSettings();
    audio.play('ui');
  }

  /* ---------------------------------------------------------
     Game over
     --------------------------------------------------------- */
  function showGameOver(result) {
    const { mode, winnerName, playerWon, names, cups } = result;
    const title = $('#over-title');
    const sub = $('#over-sub');
    const trophy = $('#over-trophy');

    if (mode === 'local') {
      title.textContent = `${winnerName} venceu!`;
      sub.textContent = 'Rack limpo. Revanche?';
      trophy.classList.remove('is-loss');
    } else if (playerWon) {
      title.textContent = 'Você venceu!';
      sub.textContent = 'O CPU ficou sem copos.';
      trophy.classList.remove('is-loss');
    } else {
      title.textContent = 'O CPU venceu';
      sub.textContent = 'Quase! A mira estava boa.';
      trophy.classList.add('is-loss');
    }

    $('#over-left').textContent = `${names[0]} ${cups[0]}`;
    $('#over-right').textContent = `${cups[1]} ${names[1]}`;
    $('#over-throws').textContent = String(result.throws);
    $('#over-hits').textContent = String(result.hits);
    $('#over-acc').textContent = `${result.accuracy}%`;
    $('#over-streak').textContent = String(result.bestStreak);

    syncStats();

    // Ranking global (API do site) — modo contra CPU
    const bridge = window.SnufflyScores;
    if (bridge && mode === 'cpu') {
      const points = playerWon ? 400 + result.hits * 30 + result.bestStreak * 30 : result.hits * 20;
      bridge.submitScore(points);
    }

    setTimeout(() => setScreen('over'), 900);
  }

  /* ---------------------------------------------------------
     Instalação
     O PWA e a instalação são gerenciados pelo site principal
     (/sw.js, /manifest.json), então não há botão local aqui.
     --------------------------------------------------------- */

  /* ---------------------------------------------------------
     Wiring
     --------------------------------------------------------- */
  $('#btn-cpu').addEventListener('click', () => startGame('cpu'));
  $('#btn-local').addEventListener('click', () => startGame('local'));
  $('#btn-practice').addEventListener('click', () => startGame('practice'));

  $('#btn-howto').addEventListener('click', () => {
    audio.play('ui');
    setScreen('howto');
  });
  $('#btn-settings').addEventListener('click', () => {
    audio.play('ui');
    syncSettings();
    setScreen('settings');
  });

  for (const btn of document.querySelectorAll('[data-back]')) {
    btn.addEventListener('click', () => {
      audio.play('ui');
      setScreen('menu');
    });
  }

  $('#btn-pause').addEventListener('click', () => {
    if (game.phase === 'menu' || game.phase === 'over') return;
    audio.play('ui');
    game.pause();
    setScreen('pause');
  });

  $('#btn-resume').addEventListener('click', () => {
    audio.play('ui');
    game.resume();
    setScreen(null);
  });

  $('#btn-restart').addEventListener('click', () => {
    audio.play('ui');
    game.resume();
    setScreen(null);
    game.restart();
  });

  $('#btn-quit').addEventListener('click', () => {
    audio.play('ui');
    game.toMenu();
    setScreen('menu');
    syncStats();
  });

  $('#btn-rematch').addEventListener('click', () => {
    audio.play('ui');
    setScreen(null);
    game.start(game.lastMode);
  });

  $('#btn-menu').addEventListener('click', () => {
    audio.play('ui');
    game.toMenu();
    setScreen('menu');
    syncStats();
  });

  el.soundBtn.addEventListener('click', () => {
    setSound(!store.settings.sound);
  });

  $('#toggle-sound').addEventListener('click', () => {
    setSound(!store.settings.sound);
  });

  $('#toggle-vibrate').addEventListener('click', () => {
    setVibrate(!store.settings.vibrate);
  });

  for (const btn of document.querySelectorAll('#difficulty-seg button')) {
    btn.addEventListener('click', () => setDifficulty(btn.dataset.diff));
  }

  $('#btn-reset').addEventListener('click', () => {
    if (window.confirm('Apagar todas as estatísticas?')) {
      resetStats(store);
      syncStats();
      toast('Estatísticas apagadas', 'good');
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && currentScreen === null && game.phase !== 'over') {
      game.pause();
      setScreen('pause');
    }
  });

  document.addEventListener('gesturestart', (event) => {
    event.preventDefault();
  });

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && currentScreen === null) {
      game.pause();
      setScreen('pause');
    }
  });

  syncSettings();
  setScreen('menu');

  return {
    setScreen,
    startGame,
    updateHud,
    toast,
    showGameOver,
    hideHint,
    syncSettings,
    syncStats,
  };
}
