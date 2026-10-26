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
    headers: { 'Accept': 'application/json' },
  };

  async function fetchJSON(url) {
    try {
      const res = await fetch(API.base + url, { headers: API.headers });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } catch (err) {
      console.warn('[Snuffly] API indisponível:', err.message);
      return null;
    }
  }

  /* ---------------- Local Storage ---------------- */
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

  const LS = {
    visits: 'snuffly.visits',
    seenPrizes: 'snuffly.seenPrizes',
    favorites: 'snuffly.favorites',
  };

  function trackVisit() {
    const count = store.get(LS.visits, 0) + 1;
    store.set(LS.visits, count);
    store.set(LS.visits + '.last', new Date().toISOString());
    const el = document.getElementById('visitCounter');
    if (el) {
      el.textContent = count > 1
        ? `🎪 Bem-vindo de volta! Esta é a sua visita nº ${count}.`
        : '🎪 Primeira visita? Explore os jogos e a vitrine!';
      el.hidden = false;
    }
  }

  function loadPrizesInto(container, { featured = false } = {}) {
    if (!container) return;
    fetchJSON('/api/prizes').then((prizes) => {
      if (!prizes) {
        container.innerHTML = `
          <div class="card skeleton">
            <p><strong>🎪 A vitrine está sendo enfeitada!</strong></p>
            <p>Não foi possível falar com o servidor agora — os prêmios aparecem aqui assim que a API estiver no ar.</p>
          </div>`;
        return;
      }
      const data = featured ? prizes.slice(0, 3) : prizes;
      const seen = new Set(store.get(LS.seenPrizes, []));
      const favs = new Set(store.get(LS.favorites, []));

      if (!data.length) {
        container.innerHTML = '<div class="card skeleton"><p>Nenhum prêmio cadastrado ainda. Volte em breve!</p></div>';
        return;
      }

      container.innerHTML = '';
      data.forEach((p) => {
        const art = p.image_url
          ? `<img src="${p.image_url}" alt="" loading="lazy" style="width:100%;height:100%;object-fit:cover" />`
          : (p.emoji || '🧸');
        const isFav = favs.has(p.id);
        const isNew = !seen.has(p.id);
        const card = document.createElement('article');
        card.className = 'prize-card';
        card.innerHTML = `
          <div class="prize-art">${art}</div>
          <div class="prize-body">
            <span class="prize-type">${p.type || 'Prêmio'}</span>
            <h3>${p.name}${isNew ? ' <span title="Novidade">✨</span>' : ''}</h3>
            <p>${p.description || ''}</p>
            ${p.rarity ? `<span class="prize-rarity rarity-${p.rarity}">Raridade: ${p.rarity}</span>` : ''}
            <button class="btn-fav" aria-pressed="${isFav}" data-id="${p.id}">
              ${isFav ? '❤️ Favorito' : '🤍 Favoritar'}
            </button>
          </div>`;
        card.querySelector('.btn-fav').addEventListener('click', function () {
          const id = Number(this.dataset.id);
          const list = new Set(store.get(LS.favorites, []));
          if (list.has(id)) { list.delete(id); } else { list.add(id); }
          store.set(LS.favorites, [...list]);
          this.setAttribute('aria-pressed', list.has(id));
          this.textContent = list.has(id) ? '❤️ Favorito' : '🤍 Favoritar';
        });
        container.appendChild(card);
        seen.add(p.id);
      });
      store.set(LS.seenPrizes, [...seen]);
    });
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

  function registerSW() {
    if ('serviceWorker' in navigator && location.protocol === 'https:' || location.hostname === 'localhost') {
      navigator.serviceWorker.register('/sw.js').catch((err) =>
        console.warn('[Snuffly] SW falhou:', err.message));
    }
  }

  /* ---------------- Menu & formulário ---------------- */
  function setupMenu() {
    const btn = document.getElementById('menuBtn');
    const nav = document.getElementById('navmenu');
    if (!btn || !nav) return;
    btn.addEventListener('click', () => {
      const open = nav.classList.toggle('open');
      btn.setAttribute('aria-expanded', open);
      btn.textContent = open ? '✕' : '☰';
    });
    nav.addEventListener('click', (e) => {
      if (e.target.tagName === 'A') nav.classList.remove('open');
    });
    document.addEventListener('click', (e) => {
      if (!nav.contains(e.target) && e.target !== btn) nav.classList.remove('open');
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

      const res = await fetchJSON('/api/contact', payload);
      if (res && res.ok !== false) {
        status.className = 'form-status ok';
        status.textContent = '🎉 Mensagem enviada! Em breve entraremos em contato.';
        form.reset();
      } else {
        status.className = 'form-status err';
        status.textContent = 'Não foi possível enviar agora. Tente novamente em instantes.';
      }
    });
  }

  /* fetchJSON com corpo, usado só pelo formulário */
  async function _fetchJSON(url, body) {
    try {
      const res = await fetch(API.base + url, {
        method: body ? 'POST' : 'GET',
        headers: { ...API.headers, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } catch (err) {
      console.warn('[Snuffly] API indisponível:', err.message);
      return null;
    }
  }

  /* ---------------- Boot ---------------- */
  document.addEventListener('DOMContentLoaded', () => {
    fetchJSON = _fetchJSON; // sobrescreve com a versão que suporta POST
    trackVisit();
    setupMenu();
    setupInstall();
    setupContactForm();
    registerSW();

    // Página inicial: prêmios em destaque
    const featured = document.getElementById('featuredPrizes');
    if (featured) loadPrizesInto(featured, { featured: true });

    // Página de prêmios: vitrine completa
    const prizes = document.getElementById('prizesGrid');
    if (prizes) loadPrizesInto(prizes);
  });
})();
