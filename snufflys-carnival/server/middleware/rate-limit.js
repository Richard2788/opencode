/**
 * Rate limit simples em memória (sem dependências externas).
 * Janela fixa por IP — suficiente para o escopo do projeto.
 *
 * LIMITAÇÕES (aceitas no escopo do Render Free, instância única):
 * - Counters vivem em memória: NÃO compartilhados entre múltiplas
 *   instâncias/processos (cada uma teria seu próprio limite).
 * - Perde o estado em restart.
 * - `req.ip` depende de `trust proxy` estar correto no ambiente de deploy
 *   (no Render está `trust proxy 1`; em ambiente próprio sob proxy reverso
 *   lembre-se de ajustar, senão o IP pode vir do proxy e concentrar limites).
 * Para multi-instância, migrar para um store compartilhado (ex.: Redis).
 */
function rateLimit({
  windowMs = 10 * 60 * 1000,
  max = 5,
  message = 'Muitas requisições. Tente novamente mais tarde.',
} = {}) {
  const hits = new Map(); // ip -> { count, resetAt }

  // Limpeza periódica para não vazar memória
  setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of hits) {
      if (entry.resetAt <= now) hits.delete(ip);
    }
  }, windowMs).unref();

  return function (req, res, next) {
    const ip = req.ip || req.socket?.remoteAddress || 'desconhecido';
    const now = Date.now();
    let entry = hits.get(ip);

    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(ip, entry);
    }

    entry.count += 1;
    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', Math.max(max - entry.count, 0));
    res.setHeader('X-RateLimit-Reset', Math.ceil(entry.resetAt / 1000));

    if (entry.count > max) {
      const retry = Math.ceil((entry.resetAt - now) / 1000);
      res.setHeader('Retry-After', retry);
      return res.status(429).json({ ok: false, error: message });
    }
    next();
  };
}

module.exports = rateLimit;
