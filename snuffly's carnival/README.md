# Snuffly's Carnival 🎪

PWA de divulgação da **Snuffly's Carnival** — jogos de carnaval pagos com premiação de bonecos, armas e acessórios geek de papel e papelão.

## Estrutura

```
public/              Front-end (static site, PWA)
  index.html         Home (hero, como funciona, destaque, CTA de instalação)
  jogos.html         Catálogo dos 4 jogos (placeholders "Em breve")
  premios.html       Vitrine de prêmios (carrega da API)
  sobre.html         Sobre + formulário de contato
  css/style.css      Tema carnaval (vermelho, amarelo, branco), Mobile First
  js/app.js          API, Local Storage, menu, formulário, instalação PWA
  manifest.json      Manifest do PWA
  sw.js              Service worker (cache offline)
  icons/, img/       Ícones e logo
server/              Web service (Express, MVC)
  server.js          App principal (serve o front + /api)
  db.js              Pool PostgreSQL
  models/            M — acesso ao banco
  controllers/       C — lógica req/res
  routes/            Rotas REST
  sql/               schema.sql + seed.sql
  scripts/db-init.js Aplica schema/seed
render.yaml          Blueprint de deploy no Render.com
docs/                Logo original
```

## MVC — por que sim

O web service adota **MVC**: `models` (PostgreSQL), `controllers` (lógica) e `routes` (rotas REST). O front organiza dados (app.js/API + Local Storage), views (páginas) e comportamento. Isso torna trivial conectar os jogos futuros (cada jogo = view + controller próprio reutilizando os models de pontuação/prêmios).

## API

| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/health` | Health check (Render) — inclui status do banco |
| GET | `/api/games` | Catálogo dos 4 jogos |
| GET | `/api/games/:id` | Detalhe de um jogo |
| GET | `/api/prizes` | Prêmios com filtros: `?type=&q=&page=&limit=&sort=recent\|name` |
| GET | `/api/prizes/featured` | 3 prêmios em destaque |
| GET | `/api/prizes/type/:type` | boneco \| arma \| acessorio |
| GET | `/api/scores/:gameId?limit=10` | Top pontuações de um jogo (ranking) |
| POST | `/api/scores` | Registra pontuação: `{ game, player, points }` |
| POST | `/api/contact` | Mensagem de contato (rate limit: 5 envios / 10 min) |

## Rodar localmente

```bash
cp .env.example .env           # ajuste DATABASE_URL se necessário
npm install
npm run db:init -- --seed      # cria tabelas + prêmios de exemplo
npm run dev                    # http://localhost:3000 (auto-reload)
# ou
npm start
```

## Qualidade de código

```bash
npm run lint        # ESLint (server + front JS)
npm run format      # Prettier --write
npm run format:check
```

## Estrutura pronta para os jogos

Cada jogo tem sua página em `public/jogos/<id>/index.html` com um casca comum
(`game-shell.js`) que exibe o ranking via `GET /api/scores/:gameId`. Quando o
jogo for implementado, basta substituir o placeholder do `#gameRoot` e registrar
a pontuação com `window.SnufflyGame.submitScore(player, points)` — que salva no
Local Storage e envia à API.

## Painel admin — mensagens do "Fale com a gente"

As mensagens enviadas pelo formulário ficam salvas no banco e podem ser lidas em:

```
/admin/contatos        → senha definida em ADMIN_PASS (sessão de 12h)
```

Notificação instantânea (opcional): configure `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID`
(crie o bot com @BotFather e converse com ele uma vez para obter o chat_id) e/ou
`DISCORD_WEBHOOK_URL` (Canal → Integrations → Webhooks). Cada novo contato chega
na hora no seu Telegram/Discord, além de ficar salvo no banco.

## Publicar no Render.com (via GitHub)

1. Envie o repositório para o GitHub.
2. No Render, crie um **Blueprint** apontando para o repositório — o `render.yaml` provisiona o web service + banco PostgreSQL free. As mensagens do formulário ficam no banco, no painel `/admin/contatos` e (opcionalmente) no Discord/Telegram — não há envio por SMTP.
3. O servidor aplica o **schema e o seed automaticamente na inicialização** (idempotente) — não é preciso rodar `db:init` no Render. O plano Free não suporta `preDeployCommand`; por isso o próprio app prepara o banco antes de ouvir a porta.
4. A cada push na branch principal, o Render faz o deploy automático.

## PWA

- `manifest.json` com ícones (192/512), tema `#e53935`, display standalone.
- Service worker: cache offline dos recursos estáticos, network-first para a API.
- Botão "Instalar aplicativo" aparece quando o navegador dispara `beforeinstallprompt`.

## Local Storage (cliente)

- `snuffly.visits` — contador/seletor de visitas.
- `snuffly.seenPrizes` — marca prêmios já vistos (badge ✨ de novidade).
- `snuffly.favorites` — prêmios favoritados na vitrine.
- `snuffly.cachedPrizes` — última lista de prêmios carregada (fallback offline).
- `snuffly.scores.<jogo>` — pontuações locais do jogador por jogo.

Session ID: ses_e860bf3e5ffeJMCDrwtGD5GD76
