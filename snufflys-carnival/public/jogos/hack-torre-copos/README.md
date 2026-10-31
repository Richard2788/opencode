# ⚡ Hack da Torre de Copos — Snuffly's Carnival

Jogo de destreza (o "hack" viral de speed stacking) integrado ao site Snuffly's Carnival, tema vermelho/amarelo/branco, mobile first, sem dependências.

## Como jogar

1. Escolha a dificuldade (Ensaio 3-2-1 · Bloco 4-3-2-1 · Apoteose 5-4-3-2-1) e espere o 3-2-1.
2. **Toque e segure** um copo (ele fica brilhando; a pirâmide está de boca para baixo, como copos reais).
3. **Varra a face em diagonal com o gesto em movimento**: só captura o copo que o aro da coluna realmente **cobre em movimento** — ficar parado perto não puxa nada. Os copos seguem de **boca para baixo**, e cada capturado entra pela parte inferior da coluna, um anel abaixo do anterior.
4. **Consequências reais no gesto**: arrastar rápido demais ou de forma errada **inclina a coluna** (pêndulo amortecido); inclinou a ponto de tombá-la → **a torre cai**, os copos espalham pela mesa e precisam ser recolhidos (**+1s**); copos que passam da borda **caem da mesa** e voltam à pirâmide (**+2s**).
5. **Soltar é instantâneo** e sem penalidade: a coluna desce na hora com gravidade preservando o encaixe, e pode ser recapturada.
6. Desmontou tudo → junte os copos em **uma pilha única estável** no chão para terminar.

Teclado (acessibilidade): **Enter** pega o copo mais alto, **←/→** guiam o gesto (com inércia real), **↓** solta na hora.

## Pontuação

- O cronômetro roda do "Já!" até a pilha final estabilizada.
- Menor tempo = mais pontos: `pontos = (teto da dificuldade − tempo) + estrelas × 200 − gestos extras × 100`.
- Penalidades somam tempo de verdade: torre tombou +1s; copo que cai da mesa +2s.
- Estrelas recalibradas por dificuldade (pirâmides de 6, 10 e 15 copos têm tetos próprios).
- Ranking global via API do site (`GET/POST /api/scores/hack-torre-copos`), com fila offline em Local Storage.

## Prêmios

Conquistar estrelas desbloqueia **papercrafts de carnaval em A4** (estandarte ★, máscara ★★, copo-troféu ★★★) para baixar em PDF/SVG e imprimir.

## Integração com o site

- Página em `/jogos/hack-torre-copos/` — sem manifest/service worker próprios: o PWA da raiz cobre tudo (pré-cache no SW v4).
- Nome do jogador em `snuffly.playerName` (compartilhado entre os jogos), prompt na primeira pontuação.
- Sons 100% sintetizados (Web Audio, `audio.js`), vibração háptica leve e suporte a `prefers-reduced-motion`.
