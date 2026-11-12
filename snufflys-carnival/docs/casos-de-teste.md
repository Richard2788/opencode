# Casos de teste — Snuffly's Carnival

Registro de casos de teste exploratórios/funcionais dos jogos, com o
comportamento esperado, o obtido e a correção aplicada.

---

## CT-01 — Tomba-Copos: copos derrubados em cascata pontuam

**Status:** corrigido ✅ (implementação em `public/jogos/tomba-copos/js/game.js`)

### Funcionalidade

Contagem de pontos no jogo Tomba-Copos (`/jogos/tomba-copos/`): cada copo
derrubado durante um arremesso deve valer 1 ponto, independentemente de ter
sido atingido diretamente pela bola ou derrubado por perder o apoio
(reação em cadeia / cascata).

### Resultado esperado

Quando a bola acertasse e derrubasse copos da torre, os copos que caírem
seriam contados como pontos do jogo — com uma bolinha, se o arremesso
derrubasse 3 copos, os três copos eram contados, dando 3 pontos no final.

### Resultado obtido

Quando a base de 1 ou mais copos era derrubada, **apenas o copo acertado
diretamente pela bola** era contado como derrubado pelo contador. Os copos de
cima, que caíram por perder o apoio da base, caíam visualmente mas não
pontuavam.

### Causa raiz

O motor mantinha dois contadores separados em `game.js`:

| Variável  | Semântica antiga                                                                                  |
| --------- | ------------------------------------------------------------------------------------------------- |
| `knocked` | copos derrubados **direto pela bola** (os únicos pontuados)                                       |
| `cascade` | copos caídos por perder apoio — incrementados em `checkChains()`, mas **não** somados à pontuação |

Consequências: HUD `x/6`, condição de vitória (`knocked >= WIN_CUPS`) e a
pontuação enviada ao ranking (`finish()` → `SnufflyScores.submitScore`) usavam
só os acertos diretos.

### Correção

`knocked` passou a significar o **total de copos derrubados** (diretos +
cascata) — todos pontuam:

- `checkChains()`: copo de cascata agora incrementa também `knocked`
  (além de `cascade`, mantido como estatística do resumo por jogada);
- `knockCup()`: acerto direto incrementa `knocked` e `directHits`;
- HUD, condição de vitória e pontuação do ranking usam o total (`knocked`):
  vitória `300 + caídos×50 + bolas sobrando×100`, derrota `caídos×25`;
- `stats` enviados à UI incluem `direct` (novos) além de `cascade` e
  `throws` — o resumo por jogada continua detalhando individuais × cascata;
- `app.js` e `index.html` atualizados: nota "copos em cascata não contam"
  → "copos em cascata também pontuam".

### Como validar

1. `npm run dev` e abrir `/jogos/tomba-copos/`.
2. Iniciar a partida e mirar um arremesso forte na **base** da pirâmide.
3. Com a base caindo, os copos de cima tombam em cascata.
4. **Esperado:** o HUD (`🏓 x/6`) e o modal de resultado contam **todos** os
   copos que caíram no arremesso (ex.: base + 2 de cima = 3 pontos), e o
   resumo lista "Jogada 1: 1 copo individual + 2 em cascata". O HUD atualiza
   **imediatamente** a cada copo de cascata (não só no fim do arremesso).
5. Derrubar 5 dos 6 copos com 3 bolas → vitória com a pontuação refletindo o
   total caído.

### Impacto no balanceamento

A vitória (5 de 6 copos) ficou mais acessível — um arremesso forte na base
pode derrubar a pirâmide inteira e pontuar tudo. Teto anti-cheat do servidor
(`score.controller.js`, 2000 pts para `tomba-copos`) continua folgado:
pontuação máxima possível em vitória = 300 + 6×50 = 600.
