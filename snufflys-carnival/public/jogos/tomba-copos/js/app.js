/* ============================================================
   Tomba-Copos de Carnaval — integração UI + PWA
   - Liga o motor do jogo aos modais
   - Service Worker + instalação como app
   ============================================================ */
(function () {
  'use strict';

  // ---------- Elementos ----------
  const modalStart = document.getElementById('modal-start');
  const modalResult = document.getElementById('modal-result');
  const resultWin = document.getElementById('result-win');
  const resultLose = document.getElementById('result-lose');
  const resultScore = document.getElementById('result-score');
  const btnStart = document.getElementById('btn-start');
  const btnSeeDoll = document.getElementById('btn-see-doll');
  const btnRestart = document.getElementById('btn-restart');
  const btnTryAgain = document.getElementById('btn-try-again');
  const btnPlayAgain = document.getElementById('btn-play-again');
  const btnDownload = document.getElementById('btn-download');

  TombaCarnaval.setHooks({
    onFinish(won) { setTimeout(() => showResult(won), won ? 900 : 500); },
    onStats(knocked, ballsLeft) { window.__lastStats = [knocked, ballsLeft]; }
  });

  function showResult(won) {
    resultWin.hidden = !won;
    resultLose.hidden = won;
    modalResult.classList.remove('hidden');
    resultScore.textContent = 'Copos derrubados: ' + window.__lastStats[0] + ' de 6 • Bolas usadas: ' + (3 - window.__lastStats[1]);

    // animação de "tente de novo" (reanima)
    btnTryAgain.classList.remove('retry-shake');
    void btnTryAgain.offsetWidth; // reflow para reiniciar a animação
    btnTryAgain.classList.add('retry-shake');

    if ('vibrate' in navigator) navigator.vibrate(won ? [60, 60, 60, 60, 120] : 120);
  }

  // estado lido do HUD (atualizado pelo motor)
  window.__lastStats = [0, 3];

  // ---------- Botões ----------
  btnStart.addEventListener('click', () => {
    modalStart.classList.add('hidden');
    TombaCarnaval.start();
  });

  btnSeeDoll.addEventListener('click', () => showPreview());

  function showPreview() {
    resultWin.hidden = false;
    resultLose.hidden = true;
    resultScore.textContent = '👀 Prévia do prêmio — jogue para ganhar!';
    modalStart.classList.add('hidden');
    modalResult.classList.remove('hidden');
  }

  btnRestart.addEventListener('click', () => {
    modalResult.classList.add('hidden');
    TombaCarnaval.start();
    document.getElementById('hint').classList.remove('hidden');
  });

  btnTryAgain.addEventListener('click', () => {
    modalResult.classList.add('hidden');
    TombaCarnaval.start();
  });

  btnPlayAgain.addEventListener('click', () => {
    modalResult.classList.add('hidden');
    TombaCarnaval.start();
  });

  // Baixar o papercraft como arquivo SVG
  btnDownload.addEventListener('click', async () => {
    try {
      const res = await fetch('assets/papercraft.svg');
      const svg = await res.text();
      const blob = new Blob([svg], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'papercraft-rainha-do-carnaval.svg';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e) {
      window.open('assets/papercraft.svg', '_blank');
    }
  });

  // ---------- PWA ----------
  // O service worker e a instalação são gerenciados pelo site principal
  // (/sw.js, /manifest.json) — o jogo só roda dentro do Snuffly's Carnival.
})();
