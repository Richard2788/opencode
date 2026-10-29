/* ============================================================
   Snuffly's Carnival — app.js
   Mobile First · PWA · Local Storage · API REST (web service)
   ============================================================ */
(function () {
  'use strict';

  const API = {
    // No Render, o back-end serve os arquivos estáticos na mesma origem.
    // Para desenvolvimento separado, defina window.API_BASE antes deste script.
    base: window.API_BASE || '',
    headers: { Accept: 'application/json' },
  };

  async function fetchJSON(url, body) {
    try {
      const res = await fetch(API.base + url, {
        method: body ? 'POST' : 'GET',
        headers: { ...API.headers, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        // Propaga a mensagem de erro da API (ex.: validação do contato)
        const err = new Error((data && data.error) || 'HTTP ' + res.status);
        err.status = res.status;
        err.apiMessage = data && data.error;
        throw err;
      }
      return data;
    } catch (err) {
      if (err instanceof TypeError) {
        // falha de rede
        console.warn('[Snuffly] API indisponível:', err.message);
        return null;
      }
      throw err; // erros de validação precisam chegar ao chamador
    }
  }

  /* ---------------- Local Storage ---------------- */
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

  const LS = {
    visits: 'snuffly.visits',
    seenPrizes: 'snuffly.seenPrizes',
    favorites: 'snuffly.favorites',
    cachedPrizes: 'snuffly.cachedPrizes',
  };

  function trackVisit() {
    const count = store.get(LS.visits, 0) + 1;
    store.set(LS.visits, count);
    store.set(LS.visits + '.last', new Date().toISOString());
    const el = document.getElementById('visitCounter');
    if (el) {
      el.textContent =
        count > 1
          ? `🎪 Bem-vindo de volta! Esta é a sua visita nº ${count}.`
          : '🎪 Primeira visita? Explore os jogos e a vitrine!';
      el.hidden = false;
    }
  }

  /* ---------------- Confete (CSS puro + spans, respeita reduced motion) ---------------- */
  function confetti() {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return;
    document.querySelectorAll('.hero:not(.hero-sm)').forEach((hero) => {
      if (hero.querySelector('.confetti-piece')) return;
      const colors = ['#ffd600', '#ffffff', '#ffe566', '#ff8a80'];
      for (let i = 0; i < 18; i++) {
        const s = document.createElement('span');
        s.className = 'confetti-piece';
        s.style.left = Math.random() * 100 + '%';
        s.style.background = colors[i % colors.length];
        s.style.animationDelay = (Math.random() * 6).toFixed(2) + 's';
        s.style.animationDuration = (5 + Math.random() * 4).toFixed(2) + 's';
        const size = 6 + Math.random() * 6;
        s.style.width = size + 'px';
        s.style.height = size * (Math.random() > 0.5 ? 1 : 1.8) + 'px';
        hero.appendChild(s);
      }
    });
  }

  /* ---------------- Vitrine de prêmios ---------------- */
  function prizeCardHTML(p, isFav, isNew) {
    const art = p.image_url
      ? `<img src="${p.image_url}" alt="" loading="lazy" style="width:100%;height:100%;object-fit:cover" />`
      : p.emoji || '🧸';
    return `
      <div class="prize-art" aria-hidden="true">${art}</div>
      <div class="prize-body">
        <span class="prize-type">${p.type || 'Prêmio'}</span>
        <h3>${p.name}${isNew ? ' <span title="Novidade">✨</span>' : ''}</h3>
        <p>${p.description || ''}</p>
        ${p.rarity ? `<span class="prize-rarity rarity-${p.rarity}">Raridade: ${p.rarity}</span>` : ''}
        <button class="btn-fav" aria-pressed="${isFav}" aria-label="${isFav ? 'Remover' : 'Marcar'} "${p.name}" como favorito" data-id="${p.id}">
          ${isFav ? '❤️ Favorito' : '🤍 Favoritar'}
        </button>
      </div>`;
  }

  function bindFavButtons(container, favs) {
    container.querySelectorAll('.btn-fav').forEach((btn) => {
      btn.addEventListener('click', function () {
        const id = Number(this.dataset.id);
        const list = new Set(store.get(LS.favorites, []));
        if (list.has(id)) {
          list.delete(id);
        } else {
          list.add(id);
        }
        store.set(LS.favorites, [...list]);
        this.setAttribute('aria-pressed', list.has(id));
        this.textContent = list.has(id) ? '❤️ Favorito' : '🤍 Favoritar';
        this.setAttribute('aria-label', (list.has(id) ? 'Remover' : 'Marcar') + ' como favorito');
      });
    });
  }

  function showMessage(container, html) {
    container.innerHTML = `<div class="card skeleton">${html}</div>`;
  }

  /** Estado de erro: mensagem + fallback com o cache do Local Storage (item 6). */
  function renderOfflineFallback(container, { featured = false, retryFn = null } = {}) {
    const cached = store.get(LS.cachedPrizes, null);
    if (cached && cached.length) {
      const data = featured ? cached.slice(0, 3) : cached;
      renderPrizes(container, data, {
        notice: '📡 Sem conexão com o servidor — exibindo a última versão salva no seu aparelho.',
      });
      return;
    }
    showMessage(
      container,
      `
      <p><strong>🎪 A vitrine está sendo enfeitada!</strong></p>
      <p>Não foi possível falar com o servidor agora — os prêmios aparecem aqui assim que a API estiver no ar.</p>
      ${retryFn ? '<button class="btn btn-red btn-retry" type="button">Tentar novamente</button>' : ''}`
    );
    const retry = container.querySelector('.btn-retry');
    if (retry && retryFn) retry.addEventListener('click', retryFn);
  }

  function renderPrizes(container, data, { notice = '' } = {}) {
    const seen = new Set(store.get(LS.seenPrizes, []));
    const favs = new Set(store.get(LS.favorites, []));

    if (!data.length) {
      showMessage(
        container,
        `
        <p><strong>🎭 Nenhum prêmio encontrado.</strong></p>
        <p>Ajuste os filtros ou volte em breve — a oficina de papel e papelão está produzindo novidades!</p>`
      );
      return;
    }

    container.innerHTML = '';
    if (notice) {
      const n = document.createElement('p');
      n.className = 'cache-notice';
      n.textContent = notice;
      container.appendChild(n);
    }
    data.forEach((p) => {
      const card = document.createElement('article');
      card.className = 'prize-card';
      card.innerHTML = prizeCardHTML(p, favs.has(p.id), !seen.has(p.id));
      container.appendChild(card);
      seen.add(p.id);
    });
    bindFavButtons(container, favs);
    store.set(LS.seenPrizes, [...seen]);
  }

  function cachePrizes(prizes) {
    store.set(LS.cachedPrizes, prizes.slice(0, 60));
  }

  /** Vitrine completa com filtros/busca/paginação (itens 2 e 7). */
  function setupShowcase() {
    const grid = document.getElementById('prizesGrid');
    if (!grid) return;

    const chips = [...document.querySelectorAll('.chip')];
    const search = document.getElementById('prizeSearch');
    const more = document.getElementById('loadMoreBtn');
    const status = document.getElementById('prizesStatus');

    const state = { type: '', q: '', page: 1, pages: 1 };
    let allItems = [];

    function updateChips() {
      chips.forEach((c) => {
        const active = c.dataset.type === state.type;
        c.classList.toggle('active', active);
        c.setAttribute('aria-pressed', active);
      });
    }

    async function load({ append = false } = {}) {
      status.textContent = 'Carregando…';
      const params = new URLSearchParams();
      if (state.type) params.set('type', state.type);
      if (state.q) params.set('q', state.q);
      params.set('page', state.page);
      params.set('limit', 12);
      params.set('sort', 'recent');

      try {
        const data = await fetchJSON('/api/prizes?' + params.toString());
        if (!data) throw new Error('offline');
        state.pages = data.pages || 1;
        const known = new Set(allItems.map((p) => p.id));
        const fresh = data.items.filter((p) => !known.has(p.id));
        allItems = append ? allItems.concat(fresh) : data.items;
        cachePrizes(allItems);
        renderGrid();
        more.hidden = state.page >= state.pages;
        status.textContent = allItems.length
          ? `${data.total} ${data.total === 1 ? 'prêmio' : 'prêmios'} encontrados.`
          : '';
      } catch (err) {
        if (err.message === 'offline') {
          renderOfflineFallback(grid, { retryFn: () => load() });
          status.textContent = '';
        } else {
          showMessage(grid, `<p><strong>⚠️ ${err.message}</strong></p>`);
        }
      }
    }

    function renderGrid() {
      const seen = new Set(store.get(LS.seenPrizes, []));
      const favs = new Set(store.get(LS.favorites, []));
      grid.innerHTML = '';
      allItems.forEach((p) => {
        const card = document.createElement('article');
        card.className = 'prize-card';
        card.innerHTML = prizeCardHTML(p, favs.has(p.id), !seen.has(p.id));
        grid.appendChild(card);
        seen.add(p.id);
      });
      bindFavButtons(grid, favs);
      store.set(LS.seenPrizes, [...seen]);
    }

    chips.forEach((chip) =>
      chip.addEventListener('click', () => {
        state.type = chip.dataset.type || '';
        state.page = 1;
        updateChips();
        load();
      })
    );

    let debounce;
    search.addEventListener('input', () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        state.q = search.value.trim();
        state.page = 1;
        load();
      }, 300);
    });

    more.addEventListener('click', () => {
      state.page += 1;
      load({ append: true });
    });

    updateChips();
    load();
  }

  /* ---------------- PWA ---------------- */
  let deferredPrompt = null;

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    const btn = document.getElementById('installBtn');
    if (btn) btn.hidden = false;
  });

  function setupInstall() {
    const btn = document.getElementById('installBtn');
    if (!btn) return;
    btn.addEventListener('click', async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') btn.hidden = true;
      deferredPrompt = null;
    });
  }

  /** Banner "nova versão disponível" (item 12). */
  function showUpdateBanner() {
    if (document.getElementById('swUpdate')) return;
    const bar = document.createElement('div');
    bar.id = 'swUpdate';
    bar.className = 'update-banner';
    bar.setAttribute('role', 'status');
    bar.innerHTML = `
      <span>🎉 Nova versão disponível!</span>
      <button type="button" class="btn btn-yellow btn-sm">Atualizar</button>`;
    bar.querySelector('button').addEventListener('click', () => location.reload());
    document.body.appendChild(bar);
  }

  function registerSW() {
    if (!('serviceWorker' in navigator)) return;
    if (!(location.protocol === 'https:' || location.hostname === 'localhost')) return;

    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        // Um SW esperando ativação significa que há uma versão nova
        if (reg.waiting && navigator.serviceWorker.controller) showUpdateBanner();
        reg.addEventListener('updatefound', () => {
          const sw = reg.installing;
          if (!sw) return;
          sw.addEventListener('statechange', () => {
            if (sw.state === 'installed' && navigator.serviceWorker.controller) showUpdateBanner();
          });
        });
      })
      .catch((err) => console.warn('[Snuffly] SW falhou:', err.message));
  }

  /* ---------------- Menu & formulário ---------------- */
  function setupMenu() {
    const btn = document.getElementById('menuBtn');
    const nav = document.getElementById('navmenu');
    if (!btn || !nav) return;
    btn.addEventListener('click', () => {
      const open = nav.classList.toggle('open');
      btn.setAttribute('aria-expanded', open);
      btn.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
      btn.textContent = open ? '✕' : '☰';
    });
    nav.addEventListener('click', (e) => {
      if (e.target.tagName === 'A') nav.classList.remove('open');
    });
    document.addEventListener('click', (e) => {
      if (!nav.contains(e.target) && e.target !== btn) nav.classList.remove('open');
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && nav.classList.contains('open')) {
        nav.classList.remove('open');
        btn.setAttribute('aria-expanded', 'false');
        btn.textContent = '☰';
        btn.focus();
      }
    });
  }

  function setupContactForm() {
    const form = document.getElementById('contactForm');
    if (!form) return;
    const status = document.getElementById('contactStatus');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      status.className = 'form-status';
      status.textContent = 'Enviando…';
      const payload = Object.fromEntries(new FormData(form).entries());

      // Validação mínima no cliente
      if (!payload.nome || !payload.email || !payload.mensagem) {
        status.className = 'form-status err';
        status.textContent = 'Preencha todos os campos.';
        return;
      }

      try {
        const res = await fetchJSON('/api/contact', payload);
        if (res && res.ok !== false) {
          status.className = 'form-status ok';
          status.textContent = '🎉 Mensagem enviada! Em breve entraremos em contato.';
          form.reset();
        } else {
          status.className = 'form-status err';
          status.textContent = 'Não foi possível enviar agora. Tente novamente em instantes.';
        }
      } catch (err) {
        status.className = 'form-status err';
        status.textContent =
          err.apiMessage || 'Não foi possível enviar. Verifique os dados e tente novamente.';
      }
    });
  }

  /* ---------------- Boot ---------------- */
  document.addEventListener('DOMContentLoaded', () => {
    trackVisit();
    setupMenu();
    setupInstall();
    setupContactForm();
    registerSW();
    confetti();

    // Página inicial: prêmios em destaque
    const featured = document.getElementById('featuredPrizes');
    if (featured) {
      fetchJSON('/api/prizes/featured').then((prizes) => {
        if (!prizes) {
          renderOfflineFallback(featured, { featured: true, retryFn: () => location.reload() });
          return;
        }
        renderPrizes(featured, prizes.slice(0, 3));
        cachePrizes(prizes);
      });
    }

    // Página de prêmios: vitrine com filtros/busca/paginação
    setupShowcase();
  });
})();
