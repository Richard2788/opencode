# 🍢 Espetos Aero — Totem de Venda (PWA)

Totem de autoatendimento (kiosk) para venda de espetos, com visual **Frutiger Aero**
(vidro fosco, gradientes céu→grama, bolhas, reflexos, faíscas). 100% estático:
não precisa de servidor de aplicação, apenas de qualquer host de arquivos.

## Rodar

```bash
cd espetos-aero
python3 -m http.server 8080      # ou: npx serve .
```

Abra <http://localhost:8080>.

> O **Service Worker** (instalação/offline) só funciona em `http://` ou `https://` —
> não use `file://`. Para instalar como app: no Chrome/Edge, ícone de instalar na
> barra de endereço, ou menu ⋮ → *Instalar aplicativo*. `display: fullscreen`
> deixa o totem em modo kiosk.

## Fluxo do usuário

**Início → Cardápio (filtros por categoria) → Carrinho (stepper +/−) →
Pagamento (Pix / Cartão / Dinheiro) → Processando → Ticket com nº do pedido e ETA.**

* Volta automática para a tela inicial após **45 s** de inatividade (kiosk).
* Teclado: `Esc` volta para o início. Botão ⛶ ativa tela cheia; 🔊 liga/desliga o som.
* Som e contador de pedidos persistem em `localStorage`.

## Estrutura

```
index.html              telas do totem (home, catálogo, carrinho, pix, ticket)
styles.css              tema Frutiger Aero (variáveis, vidro, bolhas, botões com gloss)
app.js                  cardápio, carrinho, pagamentos, idle reset, WebAudio, QR
sw.js                   cache-first do shell → funciona offline
manifest.webmanifest    display fullscreen, ícones any + maskable
icons/                  PNG gerados + favicon.svg
scripts/gen_icons.py    regenera os PNGs (python3 scripts/gen_icons.py)
```

## Pagamento

O QR do Pix e a autorização de cartão são **simulações de demonstração**
(`drawFakeQR()` e os `setTimeout` em `app.js`). Para produção:

1. Substitua `drawFakeQR()` pelo payload Pix real (EMV/BR Code + copia-e-cola).
2. Troque o `setTimeout` de 9 s do Pix por uma confirmação via **websocket/polling**
   do provedor (Mercado Pago, Asaas, Gerencianet…).
3. Cartão: use a API do maquininho ou terminal EMV/webhooks do adquirente.
4. Ligue o ticket ao sistema da cozinha (fila/PDF/impressão térmica).

## Personalizar

* **Itens e preços**: array `MENU` em `app.js` (`id`, `emoji`, `name`, `price`,
  `cat`, `desc`, `tags`).
* **Promoções da home**: array `PROMOS`.
* **Cores**: variáveis `--sky-*`, `--grass-*`, `--aqua`, `--lime` em `styles.css`.
* **Tempo de inatividade**: `IDLE_SCREENS` em `app.js` (segundos).

## Teste de layout (opcional)

`scripts/layout-check.js` abre o site no Chrome headless e verifica, em 360, 390,
414, 768 e 1280 px, se algum card/stepper/tag estoura a borda; salva screenshots
em `docs/`.

```bash
npm i puppeteer-core          # no diretório do script
node scripts/layout-check.js  # requer o site servido em localhost:8080
```
