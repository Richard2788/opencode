/**
 * Model: Jogos (M — catálogo servido ao front; cada jogo é implementado depois).
 *
 * `maxPoints` é o teto plausível de pontuação por partida, derivado da regra
 * de pontuação de cada jogo em public/jogos/<id>/. Serve de anti-cheat mínimo
 * no server-side: a API recusa valores acima do teto (o cliente só envia o
 * placar; sem verificação de gameplay, o teto limita o dano de trapaças).
 */
const games = [
  {
    id: 'tomba-copos',
    name: 'Tomba-copos',
    emoji: '🥤',
    description: 'Copos empilhados em pirâmide; derrube com uma bola de tênis à distância.',
    skill: 'arremesso',
    // vitória: 300 + copos(≤15)*50 + bolas restantes(≤5)*100 ≈ 1300
    maxPoints: 2000,
  },
  {
    id: 'hack-torre-copos',
    name: 'Hack da Torre de Copos',
    emoji: '⚡',
    description: 'Junte rapidamente todos os copos de uma pirâmide empilhada.',
    skill: 'destreza',
    // pointsFor: cap máx (30000, modo apoteose) + 3 estrelas*200 ≈ 30600
    maxPoints: 31000,
  },
  {
    id: 'adivinha-numero',
    name: 'Adivinha o Meu Número',
    emoji: '🔢',
    description: 'Adivinhe ou se aproxime do número de 1 a 10 escolhido pelo vendedor.',
    skill: 'sorte',
    // por rodada: 10 + (sequência-1)*2; sequência plausível ≤ 100  → ~210
    maxPoints: 1000,
  },
  {
    id: 'cup-pong',
    name: 'Cup Pong',
    emoji: '🏓',
    description: 'Faça a bolinha de pingue-pongue cair dentro de um dos copos vazios na mesa.',
    skill: 'mira',
    // vitória: 400 + acertos(~≤20)*30 + sequência(~≤20)*30 ≈ 1600
    maxPoints: 3000,
  },
];

class Game {
  static all() {
    return games;
  }

  static find(id) {
    return games.find((g) => g.id === id) || null;
  }
}

module.exports = Game;
