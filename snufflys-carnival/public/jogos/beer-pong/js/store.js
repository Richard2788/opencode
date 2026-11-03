import { STORAGE_KEY } from './config.js';

const DEFAULTS = {
  settings: {
    sound: true,
    vibrate: true,
    difficulty: 'normal',
  },
  stats: {
    games: 0,
    wins: 0,
    throws: 0,
    hits: 0,
    bestStreak: 0,
  },
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function loadStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return clone(DEFAULTS);
    const parsed = JSON.parse(raw);
    return {
      settings: { ...DEFAULTS.settings, ...(parsed && parsed.settings) },
      stats: { ...DEFAULTS.stats, ...(parsed && parsed.stats) },
    };
  } catch {
    return clone(DEFAULTS);
  }
}

export function saveStore(store) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    /* storage may be unavailable (private mode / quota) */
  }
}

export function resetStats(store) {
  store.stats = clone(DEFAULTS.stats);
  saveStore(store);
  return store.stats;
}
