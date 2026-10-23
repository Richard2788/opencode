/* Smoke test de layout do totem (Chrome headless + puppeteer-core).
   Verifica estouro horizontal em várias larguras e salva screenshots. */
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const URL = 'http://localhost:8080/';
const OUT = path.join(__dirname, '..', 'docs');
const SIZES = [
  { w: 360, h: 640, tag: 'android-peq' },
  { w: 390, h: 844, tag: 'iphone' },
  { w: 414, h: 896, tag: 'iphone-plus' },
  { w: 768, h: 1024, tag: 'tablet' },
  { w: 1280, h: 800, tag: 'totem' },
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/google-chrome',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--force-device-scale-factor=1'],
  });

  const problems = [];

  for (const { w, h, tag } of SIZES) {
    const page = await browser.newPage();
    await page.setViewport({ width: w, height: h, isMobile: w < 800, hasTouch: w < 800 });
    await page.goto(URL, { waitUntil: 'networkidle0' });

    const checkOverflow = async (label) => {
      const res = await page.evaluate(() => {
        const out = { doc: document.documentElement.scrollWidth, client: document.documentElement.clientWidth, bad: [] };
        const vw = document.documentElement.clientWidth;
        document.querySelectorAll('.card, .stepper, .qty-pill, .tag, .cart-item, .method, .panel, .cta, .chip').forEach(el => {
          const r = el.getBoundingClientRect();
          if (r.width === 0 && el.clientWidth === 0) return;   // oculto
          const over = Math.max(0, r.right - vw) + Math.max(0, -r.left);
          const clipped = el.scrollWidth - el.clientWidth;
          if (over > 1 || clipped > 1) {
            // dentro de um contêiner com rolagem horizontal? então não é estouro
            let p = el.parentElement, inScroller = false;
            while (p) {
              const ovf = getComputedStyle(p).overflowX;
              if (ovf === 'auto' || ovf === 'scroll') { inScroller = true; break; }
              p = p.parentElement;
            }
            if (inScroller) return;
            out.bad.push({
              cls: el.className.toString().slice(0, 40),
              txt: (el.textContent || '').trim().slice(0, 28),
              over: +over.toFixed(1), clipped: +clipped.toFixed(1),
              rect: { l: +r.left.toFixed(0), r: +r.right.toFixed(0), w: +r.width.toFixed(0) },
            });
          }
        });
        // stepper dentro do card?
        document.querySelectorAll('.card').forEach(card => {
          const cr = card.getBoundingClientRect();
          if (cr.width === 0) return;                    // card oculto (tela inativa)
          const st = card.querySelector('.stepper');
          if (st) {
            const sr = st.getBoundingClientRect();
            if (sr.width === 0) return;
            if (sr.right > cr.right - 1 || sr.left < cr.left - 1) {
              out.bad.push({ cls: 'STEPPER FORA DO CARD', txt: card.dataset.id, over: +(sr.right - cr.right).toFixed(1), clipped: 0, rect: { l: +sr.left.toFixed(0), r: +sr.right.toFixed(0), w: +sr.width.toFixed(0) } });
            }
          }
        });
        return out;
      });

      if (res.doc > res.client + 1) {
        problems.push({ tag, label, kind: 'scroll largura da página', detail: `${res.doc} > ${res.client}` });
      }
      res.bad.forEach(b => problems.push({ tag, label, ...b }));
      return res;
    };

    await checkOverflow('home');

    // catálogo
    await page.click('#btn-start');
    await new Promise(r => setTimeout(r, 450));
    await checkOverflow('catalogo');

    // adiciona itens e vai para carrinho/pagamento
    for (let i = 0; i < 3; i++) await page.click('.card .stepper button[data-act="plus"]');
    await new Promise(r => setTimeout(r, 250));
    await checkOverflow('catalogo+itens');
    await page.click('#btn-checkout');
    await new Promise(r => setTimeout(r, 450));
    await checkOverflow('pagamento');
    await page.click('.method[data-pay="pix"]');
    await new Promise(r => setTimeout(r, 500));
    await checkOverflow('pix');

    await page.goto(URL, { waitUntil: 'networkidle0' });
    await new Promise(r => setTimeout(r, 250));
    await page.screenshot({ path: path.join(OUT, `home-${tag}-${w}x${h}.png`) });
    await page.click('#btn-start');
    await new Promise(r => setTimeout(r, 400));
    for (let i = 0; i < 2; i++) await page.click('.card .stepper button[data-act="plus"]');
    await page.screenshot({ path: path.join(OUT, `catalogo-${tag}-${w}x${h}.png`) });
    await page.close();
  }

  await browser.close();

  if (!problems.length) {
    console.log('OK — nenhum estouro detectado em', SIZES.length, 'larguras.');
  } else {
    console.log('PROBLEMAS:', problems.length);
    for (const p of problems) console.log(JSON.stringify(p));
  }
})();
