# Contexto de Produção — Snuffly's Carnival

Documento de contexto para uso no modo **Build**. Define o escopo, requisitos e decisões técnicas da aplicação descrita abaixo.

---

## 1. Visão Geral

**Aplicação:** Web PDA (Progressive Web App) de divulgação da empresa **"Snuffly's Carnival"**.

**Propósito do negócio:** Empresa que opera jogos de carnaval pagos para premiar bonecos, armas e acessórios geek feitos de papel e papelão.

**Objetivo do site:**
- Divulgar a marca e os jogos oferecidos.
- Apresentar a vitrine de **bonecos premiados** (galeria de prêmios).
- Servir de base para os jogos interativos, que **serão desenvolvidos e incluídos no site posteriormente** (prever placeholders/estrutura pronta para recebê-los).

**Ícone/Logo:** usar o arquivo `/home/aluno/Documentos/OC/snuffly's carnival/docs/file_000000003c9c820e8f5ad138402b81f6.png` como logo e ícone do site (gerar as versões do manifest a partir dele, ex.: 192px e 512px).

---

## 2. Jogos (catálogo a divulgar no site)

Os quatro jogos da empresa, a descrever na página dedicada (cada um ocupará um módulo/rota própria quando implementado):

1. **Tomba-copos** — Copos de plástico decorados com motivos carnavalescos (máscaras, confetes, tinta) empilhados em formato de pirâmide. O jogador derruba a pirâmide arremessando uma bola de meia à distância para ganhar prêmios.
2. **Hack da Torre de Copos** — Truque de destreza: juntar/raspar rapidamente todos os copos de uma pirâmide empilhada (speed stacking).
3. **Adivinha o Meu Número** — O vendedor escolhe e anota um número de 1 a 10; o jogador tenta adivinhá-lo. Acertando (ou chegando próximo), recebe um prêmio.
4. **Beer Pong** — Arremesso de bolinha de pingue-pongue tentando fazê-la cair em um dos copos enfileirados na mesa; acertar um copo premia.

> Detalhamento dos jogos: específico de cada jogo definido quando implementado. Nesta fase, o site deve expor apenas a descrição/catálogo e a estrutura de navegação para cada jogo.

---

## 3. Requisitos Técnicos

| Requisito | Decisão |
|---|---|
| Tipo de aplicação | PWA instalável |
| Responsividade | **Mobile First**, priorizando smartphones |
| Front-end | HTML, CSS, JavaScript (static site, sem build obrigatório de SPA) |
| Back-end | Web service (API REST) |
| Banco de dados | PostgreSQL |
| Manifest | `manifest.json` configurado (nome, ícones, tema, cores, start_url, display standalone) |
| Instalação | Service worker para permitir instalação como PWA e funcionamento offline básico |
| Hospedagem | Render.com, publicado via GitHub (repositório como fonte; deploy automático) |
| Arquitetura | PaaS (Render) + **Local Storage** no cliente para estado/persistência leve |
| Estilo visual | Tema **Carnaval**, paleta de cores: **vermelho, amarelo e branco** |

---

## 4. Estilo e Identidade

- Paleta: vermelho (#E53935 ou similar como cor primária), amarelo (#FFD600 ou similar como destaque), branco (fundo/contraste).
- Motivos visuais: confetes, máscaras, fitas, serpentina, texturas de festa de carnaval.
- Mobile First: layout projetado primeiro para telas pequenas; media queries expandem para tablet/desktop.
- Usabilidade mobile: alvos de toque ≥ 44px, navegação por abas simples, sem hover-dependência, formulários curtos, feedback visual imediato.

---

## 5. Estrutura de Páginas (proposta)

1. **Home** — Hero com logo, tagline da empresa, CTAs para Jogos e Prêmios.
2. **Jogos** — Catálogo dos 4 jogos com descrição e placeholder "Em breve — jogue aqui".
3. **Prêmios / Vitrine de Bonecos** — Galeria de bonecos, armas e acessórios geek de papel/papelão (cards com foto, nome e descrição).
4. **Sobre / Contato** — História da empresa, informações de contato, regras dos jogos.

---

## 6. Arquitetura — Análise de viabilidade do MVC

**Análise:** o uso de **MVC (Model-View-Controller) é viável e recomendado**, pelas razões abaixo:

- **Separação de responsabilidades:** Model (dados — prêmios, pontuações, registros de partidas consumidos da API e persistidos em Local Storage), View (páginas estáticas/renderizadas e componentes de UI), Controller (rotas do web service e lógica de negócio: validação de partidas, concessão de prêmios).
- **Front-end:** padrão ajuda a organizar a inclusão futura dos jogos — cada jogo pode ser uma View com seu próprio Controller/estado, reutilizando Models de pontuação e prêmios.
- **Back-end:** o web service em MVC facilita manutenção, testes e a evolução (ex.: autenticação de jogadores, histórico de partidas, ranking).
- **Custo/benefício:** a aplicação é pequena; MVC adiciona pouca complexidade mas ganho alto de organização e escalabilidade. Alternativas mais leves (código monolítico procedural) atenderiam o escopo atual, mas penalizariam a chegada dos jogos.

**Recomendação final:** adotar MVC no back-end (rotas/controllers + models do PostgreSQL) e uma organização inspirada em MVC/MV no front-end (módulos separados por dados, UI e lógica de jogo).

---

## 7. Entregáveis (para o modo Build)

- [ ] Estrutura de static site (index.html, css, js, manifest.json, service worker, ícones gerados do logo).
- [ ] Páginas: Home, Jogos, Prêmios, Sobre/Contato — responsivas, Mobile First, tema carnaval.
- [ ] Web service (API REST) com camadas MVC, conectando ao PostgreSQL no Render.
- [ ] Configuração de deploy no Render.com via GitHub (build do front + serviço do back + banco).
- [ ] Uso de Local Storage para cache de estado no cliente (ex.: última visita, prêmios visualizados, pontuações locais).
- [ ] Estrutura de rotas/sections reservada para os 4 jogos futuros.
