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
| GET | `/api/health` | Health check (Render) |
| GET | `/api/games` | Catálogo dos 4 jogos |
| GET | `/api/games/:id` | Detalhe de um jogo |
| GET | `/api/prizes` | Todos os prêmios |
| GET | `/api/prizes/featured` | 3 prêmios em destaque |
| GET | `/api/prizes/type/:type` | boneco \| arma \| acessorio |
| POST | `/api/contact` | Mensagem de contato |

## Rodar localmente

```bash
cp .env.example .env           # ajuste DATABASE_URL se necessário
npm install
npm run db:init -- --seed      # cria tabelas + prêmios de exemplo
npm start                      # http://localhost:3000
```

## Publicar no Render.com (via GitHub)

1. Envie o repositório para o GitHub.
2. No Render, crie um **Blueprint** apontando para o repositório — o `render.yaml` provisiona o web service + banco PostgreSQL free.
3. A cada push na branch principal, o Render faz o deploy automático.
4. No primeiro deploy, rode `npm run db:init -- --seed` via Shell do Render para criar as tabelas.

## PWA

- `manifest.json` com ícones (192/512), tema `#e53935`, display standalone.
- Service worker: cache offline dos recursos estáticos, network-first para a API.
- Botão "Instalar aplicativo" aparece quando o navegador dispara `beforeinstallprompt`.

## Local Storage (cliente)

- `snuffly.visits` — contador/seletor de visitas.
- `snuffly.seenPrizes` — marca prêmios já vistos (badge ✨ de novidade).
- `snuffly.favorites` — prêmios favoritados na vitrine.
