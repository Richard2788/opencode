/* ESLint (flat config) — regras essenciais, sem conflitar com o estilo existente. */
module.exports = [
  // ES modules do jogo Beer Pong (import/export no navegador)
  {
    files: ['public/jogos/beer-pong/js/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        navigator: 'readonly',
        window: 'readonly',
        document: 'readonly',
        localStorage: 'readonly',
        performance: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        URLSearchParams: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        Path2D: 'readonly',
        confirm: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }],
      'no-undef': 'error',
      'no-console': 'off',
      eqeqeq: ['warn', 'smart'],
    },
  },
  {
    files: ['server/**/*.js', 'public/js/**/*.js', 'public/jogos/**/*.js'],
    ignores: ['public/jogos/beer-pong/js/**'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        // Node (server)
        require: 'readonly',
        module: 'readonly',
        process: 'readonly',
        console: 'readonly',
        __dirname: 'readonly',
        setInterval: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        URL: 'readonly',
        // Navegador (public)
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        performance: 'readonly',
        HTMLInputElement: 'readonly',
        HTMLTextAreaElement: 'readonly',
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        localStorage: 'readonly',
        location: 'readonly',
        fetch: 'readonly',
        URLSearchParams: 'readonly',
        FormData: 'readonly',
        caches: 'readonly',
        clients: 'readonly',
        self: 'readonly',
        Response: 'readonly',
        // Áudio sintetizado dos jogos (window.Sound)
        Sound: 'readonly',
        // Motor do Tomba-copos (window.TombaCarnaval)
        TombaCarnaval: 'readonly',
        // Canvas / Blob (jogo Tomba-copos)
        CanvasRenderingContext2D: 'readonly',
        Blob: 'readonly',
        PointerEvent: 'readonly',
        // Service worker
        skipWaiting: 'off',
      },
    },
    rules: {
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }],
      'no-undef': 'error',
      'no-console': 'off',
      eqeqeq: ['warn', 'smart'],
    },
  },
];
