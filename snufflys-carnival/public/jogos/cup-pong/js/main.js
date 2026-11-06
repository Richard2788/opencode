import { AudioEngine } from './audio.js';
import { Game } from './game.js';
import { Renderer } from './render.js';
import { loadStore } from './store.js';
import { initUI } from './ui.js';

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

const store = loadStore();
const audio = new AudioEngine(store);
const canvas = document.getElementById('scene');
const renderer = new Renderer(canvas);

let ui = null;

const game = new Game(renderer, audio, store, {
  hud: (data) => ui?.updateHud(data),
  toast: (text, tone) => ui?.toast(text, tone),
  gameOver: (result) => ui?.showGameOver(result),
  vibrate: (pattern) => {
    if (store.settings.vibrate && typeof navigator.vibrate === 'function') {
      navigator.vibrate(pattern);
    }
  },
});

ui = initUI({ store, audio, game });

/* Deep link from the manifest shortcut: ?mode=practice */
const initialMode = new URLSearchParams(window.location.search).get('mode');
if (initialMode === 'cpu' || initialMode === 'local' || initialMode === 'practice') {
  ui.startGame(initialMode);
}

/* ---------------------------------------------------------
   Pointer input
   --------------------------------------------------------- */

function localPoint(event) {
  const rect = canvas.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

canvas.addEventListener('pointerdown', (event) => {
  if (event.pointerType === 'mouse' && event.button !== 0) return;
  event.preventDefault();
  const point = localPoint(event);
  try {
    canvas.setPointerCapture(event.pointerId);
  } catch {
    /* ignore */
  }
  ui.hideHint();
  game.pointerDown(point.x, point.y, event.pointerId, event.pointerType);
});

canvas.addEventListener('pointermove', (event) => {
  if (!game.aim.active) return;
  const point = localPoint(event);
  game.pointerMove(point.x, point.y, event.pointerId, event.pointerType);
});

canvas.addEventListener('pointerup', (event) => {
  const point = localPoint(event);
  game.pointerUp(point.x, point.y, event.pointerId, event.pointerType, event.pointerType);
  try {
    canvas.releasePointerCapture(event.pointerId);
  } catch {
    /* ignore */
  }
});

canvas.addEventListener('pointercancel', (event) => {
  game.pointerCancel(event.pointerId);
});

canvas.addEventListener('contextmenu', (event) => {
  event.preventDefault();
});

/* ---------------------------------------------------------
   Keyboard aim (desktop convenience)
   --------------------------------------------------------- */

window.addEventListener('keydown', (event) => {
  if (game.phase !== 'aim' || game.paused) return;
  const step = event.shiftKey ? 0.06 : 0.025;
  let handled = true;
  switch (event.key) {
    case 'ArrowLeft':
      game.aim.active = true;
      game.aim.x = clamp(game.aim.x - step, -0.94, 0.94);
      break;
    case 'ArrowRight':
      game.aim.active = true;
      game.aim.x = clamp(game.aim.x + step, -0.94, 0.94);
      break;
    case 'ArrowUp':
      game.aim.active = true;
      game.aim.z = clamp(game.aim.z + step * 0.5, 0.56, 0.965);
      break;
    case 'ArrowDown':
      game.aim.active = true;
      game.aim.z = clamp(game.aim.z - step * 0.5, 0.56, 0.965);
      break;
    case ' ':
    case 'Enter':
      game.aim.active = true;
      game.throwBall();
      break;
    default:
      handled = false;
  }
  if (handled) {
    event.preventDefault();
    game.aim.sx = 0;
    game.aim.sy = 0;
    game.pushHud();
  }
});

/* ---------------------------------------------------------
   Render loop
   --------------------------------------------------------- */

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
  last = now;
  // slow-mo: o renderer pode "segurar" o tempo (rim/etc.)
  game.update(dt * (renderer.timeScale ?? 1));
  renderer.render(game, dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

/* PWA: o service worker e a instalação são gerenciados pelo site principal
   (/sw.js, /manifest.json) — o jogo roda dentro do Snuffly's Carnival. */

window.cupPong = { game, renderer, store, audio };
