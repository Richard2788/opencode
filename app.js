/* =========================================================
   ESPETOS AERO — lógica do totem (vanilla JS, offline-first)
   ========================================================= */
(() => {
'use strict';

/* ---------------- CARDÁPIO ---------------- */
const MENU = [
  { id:'frango',    emoji:'🍗', name:'Frango Acebolado',      price:8,  cat:'carnes',   desc:'Peito amaciado, alho e cebola na brasa.',            tags:[['MAIS VENDIDO','hot']] },
  { id:'contra',    emoji:'🥩', name:'Contrafilé com Alho',   price:12, cat:'carnes',   desc:'Contrafilé grelhado com alho tostado.',              tags:[] },
  { id:'linguica',  emoji:'🌭', name:'Linguiça Defumada',     price:9,  cat:'carnes',   desc:'Linguiça artesanal defumada no carvalho.',           tags:[['MAIS VENDIDO','hot']] },
  { id:'cordeiro',  emoji:'🍖', name:'Cordeiro Marinado',     price:16, cat:'carnes',   desc:'Cordeiro em marinada de ervas e vinho.',             tags:[['NOVO','new']] },
  { id:'bacon',     emoji:'🥓', name:'Bacon com Queijo',      price:11, cat:'carnes',   desc:'Bacon crocante com queijo derretido.',               tags:[] },
  { id:'picante',   emoji:'🌶️', name:'Frango Biquinho',       price:9,  cat:'carnes',   desc:'Frango com molho de pimenta biquinho.',              tags:[['PICANTE','hot']] },
  { id:'camarao',   emoji:'🍤', name:'Camarão na Brasa',      price:15, cat:'mar',      desc:'Camarão limpo com manteiga de alho.',                tags:[['NOVO','new']] },
  { id:'queijo',    emoji:'🧀', name:'Queijo Coalho',         price:8,  cat:'mar',      desc:'Coalho grelhado com mel e hortelã.',                 tags:[['VEGETARIANO','veg']] },
  { id:'veg',       emoji:'🥦', name:'Espeto Vegetariano',    price:7,  cat:'veg',      desc:'Abobrinha, cebola roxa e pimentão.',                 tags:[['VEGETARIANO','veg']] },
  { id:'misto',     emoji:'🍢', name:'Mix da Casa',           price:14, cat:'carnes',   desc:'Frango, bacon e linguiça no mesmo espeto.',          tags:[['MAIS VENDIDO','hot']] },
  { id:'banana',    emoji:'🍌', name:'Bananha com Canela',    price:6,  cat:'doces',    desc:'Banana da terra com açúcar e canela.',               tags:[['VEGETARIANO','veg']] },
  { id:'abacaxi',   emoji:'🍍', name:'Abacaxi Caramelizado',  price:6,  cat:'doces',    desc:'Abacaxi grelhado com calda de rapadura.',            tags:[['NOVO','new']] },
];

const CATS = [ ['all','Todos'],['carnes','Carnes'],['mar','Frutos do mar'],['veg','Vegetariano'],['doces','Doces'] ];

const PROMOS = [
  '🔥 Combo 3 espetos + refri por R$ 29,90',
  '💳 Pague com Pix e ganhe 5% de desconto',
  '🌽 Abacaxi caramelizado chegando quentinho',
  '⚡ Pedido pronto em 8 a 12 minutos',
];

/* ---------------- ESTADO ---------------- */
const state = {
  cart: new Map(),          // id -> qtd
  cat: 'all',
  payMethod: null,
  orderId: Number(localStorage.getItem('espeto-order-id') || 0),
  orderNo: null,
  paidTotal: 0,
  idleTimer: null,
  idleLeft: 45,
  pixTimer: null,
  procTimer: null,
  etaTimer: null,
  sound: localStorage.getItem('espeto-sound') !== 'off',
};

const IDLE_IDLE = 0, IDLE_SCREENS = 45; // segundos
let idleCount = IDLE_SCREENS;

/* ---------------- UTIL ---------------- */
const $  = (s, el=document) => el.querySelector(s);
const $$ = (s, el=document) => [...el.querySelectorAll(s)];
const brl = v => v.toLocaleString('pt-BR', { style:'currency', currency:'BRL' });
const item = id => MENU.find(p => p.id === id);
const countItems = () => [...state.cart.values()].reduce((a,b) => a+b, 0);
const subtotal = () => [...state.cart.entries()].reduce((a,[id,q]) => a + item(id).price*q, 0);
const withPixDiscount = v => +(v * 0.95).toFixed(2);

/* ---------------- ÁUDIO (WebAudio, sem arquivos) ---------------- */
let audioCtx = null;
function beep(freq=660, dur=.07, type='sine', gain=.05){
  if(!state.sound) return;
  try{
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if(audioCtx.state === 'suspended') audioCtx.resume();
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(gain, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + dur);
    o.connect(g); g.connect(audioCtx.destination);
    o.start(); o.stop(audioCtx.currentTime + dur);
  }catch(e){/* silencioso */}
}
const click = () => beep(720,.05,'triangle');
const addFx = () => { beep(660,.06,'sine'); setTimeout(()=>beep(980,.08,'sine'),60); };
const doneFx = () => [523,659,784,1047].forEach((f,i)=>setTimeout(()=>beep(f,.14,'sine',.06), i*110));

function vibrate(ms=12){ if(navigator.vibrate) navigator.vibrate(ms); }

/* ---------------- TOAST ---------------- */
let toastT;
function toast(msg){
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(()=>el.classList.remove('show'), 1900);
}

/* ---------------- BOLHAS ---------------- */
function makeBubbles(){
  const host = $('#bubbles');
  if(!host || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const n = window.innerWidth < 700 ? 10 : 18;
  for(let i=0;i<n;i++){
    const b = document.createElement('span');
    const size = 14 + Math.random()*54;
    b.className = 'bubble';
    b.style.width = b.style.height = size+'px';
    b.style.left = Math.random()*100+'%';
    b.style.setProperty('--dx', (Math.random()*160-80)+'px');
    b.style.animationDuration = (11 + Math.random()*16)+'s';
    b.style.animationDelay = (-Math.random()*22)+'s';
    host.appendChild(b);
  }
}

/* ---------------- NAVEGAÇÃO DE TELAS ---------------- */
function show(id){
  $$('.screen').forEach(s => s.classList.toggle('is-active', s.id === 'screen-'+id));
  const bar = $('#bar');
  bar.style.display = (id === 'home' || id === 'done') ? 'none' : 'flex';
  $('#hint').style.visibility = (id === 'home') ? 'hidden' : 'visible';
  $('#row-pix-off').hidden = !(id === 'pay' || id === 'pix');
  click();
  if(id === 'pix') startPix(); else stopPix();
  if(id === 'home') resetIdle(IDLE_IDLE);
}

function resetIdle(seconds){
  idleCount = seconds;
  const hint = $('#hint');
  if(!seconds){ hint.textContent = ''; return; }
  hint.innerHTML = `Volte ao início em <b>${idleCount}</b>s`;
}
function tickIdle(){
  if(idleCount <= 0) return;
  idleCount--;
  const b = $('#hint b'); if(b) b.textContent = idleCount;
  if(idleCount <= 0){ show('home'); renderCart(); }
}

/* ---------------- CATÁLOGO ---------------- */
function renderFilters(){
  const host = $('#filters');
  host.innerHTML = '';
  CATS.forEach(([key,label]) => {
    const b = document.createElement('button');
    b.className = 'chip'; b.type = 'button'; b.textContent = label;
    b.setAttribute('role','tab');
    b.setAttribute('aria-selected', String(state.cat === key));
    b.addEventListener('click', () => { state.cat = key; renderFilters(); renderGrid(); click(); });
    host.appendChild(b);
  });
}

function renderGrid(){
  const host = $('#grid');
  host.innerHTML = '';
  MENU.filter(p => state.cat === 'all' || p.cat === state.cat).forEach(p => {
    const card = document.createElement('article');
    card.className = 'card glass';
    const q = state.cart.get(p.id) || 0;
    card.dataset.id = p.id;
    card.innerHTML = `
      <div class="card-top">
        <div class="card-emoji" aria-hidden="true">${p.emoji}</div>
        <div class="card-main">
          <h3>${p.name}</h3>
          <div class="price">${brl(p.price)}</div>
        </div>
      </div>
      <p class="card-desc">${p.desc}</p>
      <div class="tags">${p.tags.map(([t,c]) => `<span class="tag ${c}">${t}</span>`).join('')}</div>
      <div class="card-foot">
        <span class="qty-pill"></span>
        <div class="stepper">
          <button type="button" data-act="minus" aria-label="Remover ${p.name}">−</button>
          <b data-qty>${q}</b>
          <button type="button" data-act="plus" aria-label="Adicionar ${p.name}">+</button>
        </div>
      </div>`;
    card.querySelector('[data-act="plus"]').addEventListener('click', e => { e.stopPropagation(); addItem(p.id); });
    card.querySelector('[data-act="minus"]').addEventListener('click', e => { e.stopPropagation(); removeItem(p.id); });
    card.addEventListener('click', () => addItem(p.id));
    host.appendChild(card);
  });
  syncCards();
}

/* atualiza só os contadores dos cards, sem reconstruir o grid */
function syncCards(){
  $$('#grid .card').forEach(card => {
    const p = item(card.dataset.id);
    if(!p) return;
    const q = state.cart.get(p.id) || 0;
    const qty = card.querySelector('[data-qty]');
    if(qty) qty.textContent = q;
    const pill = card.querySelector('.qty-pill');
    if(pill) pill.innerHTML = q ? `<span class="tag new">${q}× no carrinho</span>` : '';
  });
}

/* ---------------- CARRINHO ---------------- */
function addItem(id, n=1){
  const q = (state.cart.get(id) || 0) + n;
  if(q <= 0) state.cart.delete(id); else state.cart.set(id, q);
  addFx(); vibrate(14);
  renderCart();
  toast(`${item(id).emoji} ${item(id).name} adicionado`);
}
function removeItem(id){
  const q = (state.cart.get(id) || 0) - 1;
  if(q <= 0) state.cart.delete(id); else state.cart.set(id, q);
  click(); vibrate(8);
  renderCart();
}
function clearCart(){
  state.cart.clear(); click();
  renderCart();
  toast('🧺 Carrinho esvaziado');
}

function renderCart(){
  const list = $('#cart-list');
  const n = countItems();
  const sub = subtotal();

  $('#bar-count').textContent = n === 1 ? '1 item' : `${n} itens`;
  $('#bar-total').textContent = brl(sub);
  $('#btn-checkout').disabled = n === 0;

  list.innerHTML = '';
  if(n === 0){
    list.innerHTML = '<li class="cart-empty">Seu carrinho está vazio 🥲<br>Escolha um espeto no cardápio.</li>';
  } else {
    [...state.cart.entries()].forEach(([id,q]) => {
      const p = item(id);
      const li = document.createElement('li');
      li.className = 'cart-item';
      li.innerHTML = `
        <div class="card-emoji" aria-hidden="true">${p.emoji}</div>
        <div>
          <div class="name">${p.name}</div>
          <div class="unit">${brl(p.price)} un.</div>
        </div>
        <div class="stepper">
          <button type="button" data-act="minus" aria-label="Remover ${p.name}">−</button>
          <b data-qty>${q}</b>
          <button type="button" data-act="plus" aria-label="Adicionar ${p.name}">+</button>
        </div>
        <div class="line-total">${brl(p.price*q)}</div>`;
      li.querySelector('[data-act="plus"]').addEventListener('click', () => addItem(id));
      li.querySelector('[data-act="minus"]').addEventListener('click', () => removeItem(id));
      list.appendChild(li);
    });
  }

  $('#t-sub').textContent = brl(sub);
  $('#t-total').textContent = brl(sub);
  $('#pix-total').textContent = brl(withPixDiscount(sub));
  $('#t-off').textContent = '− ' + brl(sub - withPixDiscount(sub));
  syncCards();
}

/* ---------------- QR (padrão visual de demonstração) ---------------- */
function drawFakeQR(canvas, seedStr){
  const ctx = canvas.getContext('2d');
  const N = 33, S = canvas.width / N;
  let seed = 0; for(const c of seedStr) seed = (seed * 31 + c.charCodeAt(0)) >>> 0;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;

  ctx.fillStyle = '#fff'; ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle = '#062a45';
  const grid = Array.from({length:N}, () => Array.from({length:N}, () => rnd() > .52));
  const finder = (x,y) => {
    for(let i=0;i<7;i++) for(let j=0;j<7;j++){
      const edge = i===0||i===6||j===0||j===6;
      const core = i>=2&&i<=4&&j>=2&&j<=4;
      grid[y+j][x+i] = edge || core;
    }
    for(let i=-1;i<8;i++) for(let j=-1;j<8;j++){
      const yy=y+j, xx=x+i;
      if(yy>=0&&yy<N&&xx>=0&&xx<N && (i===-1||i===7||j===-1||j===7)) grid[yy][xx]=false;
    }
  };
  finder(0,0); finder(N-7,0); finder(0,N-7);
  for(let y=0;y<N;y++) for(let x=0;x<N;x++) if(grid[y][x]) ctx.fillRect(x*S, y*S, S, S);
}

/* ---------------- PAGAMENTO ---------------- */
function startPix(){
  const seed = `${state.orderNo || 'novo'}-${subtotal()}-${Date.now()}`;
  drawFakeQR($('#qr'), seed);
  let left = 5*60;
  const el = $('#pix-timer');
  el.textContent = '05:00';
  clearInterval(state.pixTimer);
  state.pixTimer = setInterval(() => {
    left--;
    el.textContent = `${String(Math.floor(left/60)).padStart(2,'0')}:${String(left%60).padStart(2,'0')}`;
    if(left === 30) toast('⏰ Faltam 30 segundos para o QR expirar');
    if(left <= 0){ toast('⏰ QR expirado — gere um novo'); stopPix(); show('pay'); }
  }, 1000);

  /* simulação do pagamento (trocar por webhook/Pix real em produção) */
  clearTimeout(state.procTimer);
  state.procTimer = setTimeout(() => {
    if(!$('#screen-pix').classList.contains('is-active')) return;
    finishOrder('Pix', withPixDiscount(subtotal()));
  }, 9000);
}
function stopPix(){ clearInterval(state.pixTimer); clearTimeout(state.procTimer); }

function finishOrder(method, paid){
  stopPix();
  $('#proc-hint').textContent =
    method === 'Pix' ? 'Pagamento recebido' :
    method === 'Cartão' ? 'Aproxime ou insira o cartão' : 'Leve o pedido ao balcão';
  state.orderId += 1;
  localStorage.setItem('espeto-order-id', String(state.orderId));
  state.orderNo = 'A-' + String(state.orderId % 1000).padStart(3,'0');
  state.paidTotal = paid;
  state.payMethod = method;

  show('processing');
  clearTimeout(state.procTimer);
  state.procTimer = setTimeout(() => {
    doneFx(); vibrate([20,40,20]);
    renderTicket();
    show('done');
    startEta();
    state.cart.clear();
    renderCart(); renderGrid();
  }, 2600);
}

function renderTicket(){
  $('#order-no').textContent = state.orderNo;
  $('#ticket-paid').textContent = brl(state.paidTotal);
  $('#ticket-method').textContent = state.payMethod;
  const mins = 8 + Math.floor(Math.random()*5);
  $('#eta-min').textContent = mins;
  const ul = $('#ticket-items');
  ul.innerHTML = '';
  if(state.cart.size === 0){
    ul.innerHTML = `<li><span>Pedido</span><b>${countItems()} itens</b></li>`;
  } else {
    [...state.cart.entries()].forEach(([id,q]) => {
      const p = item(id);
      const li = document.createElement('li');
      li.innerHTML = `<span>${q}× ${p.name}</span><b>${brl(p.price*q)}</b>`;
      ul.appendChild(li);
    });
  }
  const bar = $('#eta-bar');
  bar.style.width = '0%';
  setTimeout(() => bar.style.width = '100%', 120);
  clearInterval(state.etaTimer);
  state.etaTimer = setInterval(() => {
    const m = Number($('#eta-min').textContent);
    if(m <= 0){ clearInterval(state.etaTimer); toast('✅ Seu pedido está pronto!'); return; }
    $('#eta-min').textContent = m - 1;
  }, 30000);
}

/* ---------------- PROMOS ---------------- */
function startPromos(){
  const host = $('#promos');
  let i = 0;
  const paint = () => {
    host.innerHTML = `<div class="promo">${PROMOS[i]}</div>`;
    i = (i+1) % PROMOS.length;
  };
  paint();
  setInterval(paint, 5200);
}

/* ---------------- EVENTOS ---------------- */
function bind(){
  $('#btn-start').addEventListener('click', () => show('catalog'));
  $('#btn-checkout').addEventListener('click', () => { if(countItems()) show('pay'); });
  $('#btn-keep').addEventListener('click', () => show('catalog'));
  $('#btn-clear').addEventListener('click', clearCart);
  $('#btn-again').addEventListener('click', () => { clearInterval(state.etaTimer); show('home'); });
  $('#btn-pix-cancel').addEventListener('click', () => { stopPix(); show('pay'); });

  $$('.method').forEach(btn => btn.addEventListener('click', () => {
    const m = btn.dataset.pay;
    if(m === 'pix') show('pix');
    else if(m === 'card') { show('processing'); finishOrder('Cartão', subtotal()); }
    else { show('processing'); finishOrder('Dinheiro', subtotal()); }
  }));

  $('#btn-sound').addEventListener('click', () => {
    state.sound = !state.sound;
    localStorage.setItem('espeto-sound', state.sound ? 'on' : 'off');
    $('#sound-icon').textContent = state.sound ? '🔊' : '🔇';
    $('#btn-sound').setAttribute('aria-pressed', String(state.sound));
    if(state.sound) click();
  });

  $('#btn-full').addEventListener('click', () => {
    click();
    if(document.fullscreenElement) document.exitFullscreen?.();
    else document.documentElement.requestFullscreen?.().catch(()=>{});
  });

  ['pointerdown','keydown','touchstart'].forEach(ev =>
    document.addEventListener(ev, () => { if(idleCount > 0) resetIdle(IDLE_SCREENS); }, { passive:true }));

  document.addEventListener('keydown', e => {
    if(e.key === 'Escape'){ show('home'); }
  });
}

/* ---------------- BOOT ---------------- */
function boot(){
  $('#sound-icon').textContent = state.sound ? '🔊' : '🔇';
  $('#bar').style.display = 'none';
  makeBubbles();
  renderFilters();
  renderGrid();
  renderCart();
  startPromos();
  bind();
  setInterval(tickIdle, 1000);
  show('home');

  if('serviceWorker' in navigator && location.protocol !== 'file:'){
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(()=>{}));
  }
}

document.addEventListener('DOMContentLoaded', boot);
})();
