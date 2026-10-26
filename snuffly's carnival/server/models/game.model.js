/** Model: Jogos (M — catálogo servido ao front; cada jogo é implementado depois). */
const games = [
  {
    id: 'tomba-copos',
    name: 'Tomba-copos',
    emoji: '🥤',
    description: 'Copos empilhados em pirâmide; derrube com uma bola de meia à distância.',
    skill: 'arremesso',
  },
  {
    id: 'hack-torre-copos',
    name: 'Hack da Torre de Copos',
    emoji: '⚡',
    description: 'Junte rapidamente todos os copos de uma pirâmide empilhada.',
    skill: 'destreza',
  },
  {
    id: 'adivinha-numero',
    name: 'Adivinha o Meu Número',
    emoji: '🔢',
    description: 'Adivinhe ou se aproxime do número de 1 a 10 escolhido pelo vendedor.',
    skill: 'sorte',
  },
  {
    id: 'beer-pong',
    name: 'Beer Pong',
    emoji: '🏓',
    description: 'Faça a bolinha de pingue-pongue cair dentro de um dos copos na mesa.',
    skill: 'mira',
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
