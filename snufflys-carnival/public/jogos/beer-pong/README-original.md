# 🍻 Beer Pong — Mesa Neon

PWA de beer pong com visual neon, feita para jogar no celular. Sem build, sem
dependências e sem backend: HTML, CSS e JavaScript puro.

![Ícone do app](icons/icon-192.png)

## ✨ Funcionalidades

- **Modo CPU** com três dificuldades (Tranquilo, Equilibrado e Insano).
- **2 Jogadores** no mesmo celular (passa e joga).
- **Treino livre** com arremessos infinitos e precisão em tempo real.
- Física de arremesso com arco, sombra, quique e detecção de borda.
- **Regras da casa**: 2 arremessos por turno e “bolas de volta” ao acertar os dois.
- Mira por arrasto, com retícula acima do dedo para não tapar o alvo.
- Efeitos sonoros sintetizados (Web Audio), vibração e partículas.
- Estatísticas e ajustes salvos no dispositivo (`localStorage`).
- **PWA instalável**, funciona offline e abre em tela cheia.
- Layout mobile-first, safe areas do iPhone, suporte a mouse e teclado.

## 📁 Estrutura

```
.
├── index.html            # telas, HUD e SVG sprite
├── styles.css            # design responsivo mobile-first
├── manifest.json         # manifesto do PWA
├── sw.js                 # service worker (cache offline)
├── js/
│   ├── main.js           # bootstrap, input, loop e registro do SW
│   ├── game.js           # regras, turnos, CPU e física
│   ├── render.js         # canvas 2D: mesa, copos, bola, mira e efeitos
│   ├── ui.js             # telas, HUD, ajustes e instalação
│   ├── audio.js          # sons sintetizados
│   ├── store.js          # persistência local
│   └── config.js         # constantes
├── icons/                # ícones PNG (192, 512, maskable, Apple, favicon)
├── tools/
│   ├── serve.ps1         # servidor local em PowerShell (sem Node/Python)
│   └── make-icons.ps1    # regenera os ícones
├── render.yaml           # deploy automático no Render
├── LICENSE               # licença MIT
└── README.md
```

## ▶️ Rodar localmente

O service worker exige `http://localhost` ou HTTPS (não funciona abrindo o
`index.html` direto). Escolha uma opção:

**Com Node:**

```bash
npx serve .
```

**Com Python:**

```bash
python -m http.server 4173
```

**Com PowerShell (Windows, sem instalar nada):**

```powershell
powershell -ExecutionPolicy Bypass -File tools/serve.ps1
```

Depois abra <http://localhost:4173>.

> Dica: no Chrome/Edge, abra o DevTools → aba *Application* → *Manifest* e
> *Service Workers* para validar a instalação e o cache.

## 🚀 Publicar no GitHub

No terminal, dentro da pasta do projeto:

```bash
git init
git add .
git commit -m "feat: Beer Pong PWA"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/beer-pong.git
git push -u origin main
```

Crie o repositório vazio em <https://github.com/new> antes do `push` (sem
README, sem .gitignore). Se o Git não estiver instalado, baixe em
<https://git-scm.com/downloads>.

## ☁️ Publicar no Render

### Opção A — Blueprint (usa o `render.yaml`)

1. Envie o projeto para o GitHub (passos acima).
2. Acesse <https://dashboard.render.com/blueprints> → **New Blueprint Instance**.
3. Conecte o repositório `beer-pong`. O Render lê o `render.yaml` e cria o
   serviço estático automaticamente.
4. Clique em **Apply** e aguarde o deploy.

### Opção B — Dashboard

1. <https://dashboard.render.com> → **New +** → **Static Site**.
2. Conecte o repositório do GitHub.
3. Preencha:
   - **Name:** `beer-pong` (ou outro)
   - **Branch:** `main`
   - **Build Command:** *(deixe vazio)*
   - **Publish Directory:** `.`
4. **Create Static Site**.

O Render entrega HTTPS de graça, requisito para o PWA. Cada `git push` na
branch `main` dispara um novo deploy.

### Variáveis de ambiente

Nenhuma. O projeto é 100% estático.

## 📲 Instalar como app

- **Android/Chrome:** menu ⋮ → *Instalar app* (ou o botão **Instalar
  aplicativo** no menu do jogo).
- **iPhone/Safari:** botão *Compartilhar* → *Adicionar à Tela de Início*.
- **Desktop:** ícone de instalação na barra de endereço.

Depois de instalado, o jogo abre sem barra de navegador e funciona offline.

## 🎮 Como jogar

1. Arraste o dedo na mesa para posicionar a mira.
2. Solte para arremessar. A mira fica alguns pixels acima do dedo.
3. Cada turno tem 2 arremessos. Acertou os dois? Você joga de novo.
4. Limpe os 10 copos do adversário primeiro.

No computador: arraste com o mouse ou use as setas + espaço/Enter.

## 🎨 Personalizar

- Cores: variáveis no topo de `styles.css` e gradientes em `js/render.js`.
- Dificuldade do CPU: `DIFFICULTIES` em `js/config.js`.
- Nome/ícones: `manifest.json` e a pasta `icons/`.
- Para regenerar ícones: `powershell -ExecutionPolicy Bypass -File tools/make-icons.ps1`.

## ⚠️ Aviso

Conteúdo para maiores de 18 anos. Beba com moderação e nunca dirija depois de
beber. O jogo funciona perfeitamente com água — a diversão é a mira. 🏓

## 📄 Licença

MIT. Use, altere e compartilhe.
