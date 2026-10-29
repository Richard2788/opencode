-- Seed inicial de prêmios (catálogo de exemplo da vitrine).
-- Idempotente: só insere se a tabela estiver vazia (seguro em re-deploys).
INSERT INTO prizes (name, type, description, rarity, emoji)
SELECT v.name, v.type, v.description, v.rarity, v.emoji
  FROM (VALUES
    ('Mestre de Cerimônias Snuffly', 'boneco', 'Boneco do mascote com cartola e cetro, em papel e papelão artesanais.', 'lendário', '🎩'),
    ('Espada Confete', 'arma', 'Espada de papelão decorada com fitas vermelhas e amarelas.', 'raro', '⚔️'),
    ('Máscara Éclipse', 'acessorio', 'Máscara de papel com pintura em vermelho, amarelo e branco.', 'comum', '🎭'),
    ('Rei Momo de Bolso', 'boneco', 'Mini boneco do Rei Momo com coroa dourada de papel.', 'raro', '👑'),
    ('Escudo da Batera', 'arma', 'Escudo redondo de papelão com estampas de blocos carnavalescos.', 'comum', '🛡️'),
    ('Passista Miniatura', 'boneco', 'Boneco de passista com plumas de papel vermelhas e amarelas.', 'lendário', '💃')
  ) AS v (name, type, description, rarity, emoji)
 WHERE NOT EXISTS (SELECT 1 FROM prizes);
