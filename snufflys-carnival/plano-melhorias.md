# Plano de Melhorias — Snuffly's Carnival

Análise de 06/11/2026. Projeto: PWA de divulgação (Node/Express + PostgreSQL, MVC em
`server/`, frontend estático em `public/`, deploy no Render), com 4 mini-jogos,
service worker com 3 estratégias de cache e fila offline de pontuações.

## Avaliação geral

Projeto bem construído: SQL 100% parametrizado, validação server-side, rate limiting,
acessibilidade (ARIA, reduced motion), ESLint 9 + Prettier, deploy como código
(`render.yaml` com segredos fora do git), schema/seed idempotentes no boot.

## 🎯 Prioridade Alta — Segurança (itens 1–4)

1. **Headers de segurança (`helmet` + CSP)** — `server/server.js` não define nenhum
   header de segurança. Adicionar `helmet` com Content-Security-Policy compatível com
   o PWA/SW/Discord/Telegram (não aplicável ao painel admin, que usa inline styles).
2. **XSS em `prizeCardHTML` (`public/js/app.js` ~linha 106)** — `p.image_url` é
   injetado em `<img src="${...}">` sem escape. Sanitizar: escapar tudo que não
   parecer URL http(s)/data de imagem segura.
3. **Autenticação admin (`server/controllers/admin.controller.js`,
   `server/routes/admin.routes.js`)**:
   - Token atual é `sha256("snuffly-admin:" + ADMIN_PASS)` — estático, válido 12h nas
     sessões todas, nunca invalidado (logout não mata o token).
   - Trocar por token aleatório emitido por sessão, guardado em memória com expiração;
     logout invalida o token.
   - Logout via **GET** (CSRF de logout) → mover para **POST** com botão/form no painel.
4. **Postgres SSL (`server/db.js:22`)** — `rejectUnauthorized: false` aceita qualquer
   certificado (MITM). Usar `true` (renderservice.com usa CA confiável).

## 🔧 Prioridade Média — Robustez

5. Service worker (`sw.js`): verificação de rota da API corrigida
   (`new URL(...).pathname.startsWith('/api/')` em vez de `includes`) e versão de
   cache atualizada (`snuffly-v7` → `snuffly-v8`). Pré-cache gerado por build ficou
   como trabalho futuro (lista manual revisada e atual).
- [x] 6. Sanitização de `contact.controller.js` (tags, caracteres de controle e
   menções `<@...>`/`@everyone`/`@here`) e escape/neutralização nos webhooks em
   `notifier.js` (+ `allowed_mentions` no Discord).
- [x] 7. Limitações do rate limit documentadas no cabeçalho de
   `server/middleware/rate-limit.js` (memória por instância, restart, trust proxy).
- [x] 8. `image_url` validado no model (`prize.model.js`): só http(s) é exposto;
   qualquer outra coisa vira `null` na API (validado com seed de teste malicioso).
- [ ] 9–11 (pendentes)

## 🧪 Prioridade Baixa — Qualidade/Processo

- [x] 9. Testes automatizados: `tests/unit.test.js` (lógica pura) e
   `tests/api.test.js` (supertest sobre `server/app.js`); extraído
   `server/app.js` de `server/server.js` para permitir testes sem boot; helpers
   puros exportados à prova (`clean`, `sanitizeForWebhook`, `safeImageUrl`),
   CI em `.github/workflows/ci.yml` (lint + db:init + test com Postgres de serviço).
   **O teste revelou um bug real** (ordem de sanitização em `clean()`) que foi
   corrigido.
- [x] 10. Removido artefato de sessão (`Session ID: ...`) do README.
- [x] 11. `loginError` do painel admin agora escapado com `escapeHTML()`.

---

## Status

- [x] 1. helmet + CSP em `server/server.js`
- [x] 2. Escape/XSS fix em `prizeCardHTML` (`public/js/app.js`)
- [x] 3. Sessão admin com token aleatório + logout via POST
- [x] 4. `rejectUnauthorized: true` em `server/db.js`
- [x] 5–8 (concluídos)
- [x] 9–11 (concluídos)

**Status final: todos os 11 itens do plano implementados e verificados.**
