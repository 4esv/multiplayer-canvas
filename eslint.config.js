import js from '@eslint/js'

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: {
        // Node.js globals
        process: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        fetch: 'readonly',
        AbortSignal: 'readonly',
        URLSearchParams: 'readonly',
        URL: 'readonly',
        structuredClone: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': 'off',
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },
  {
    files: [
      'src/static/js/**/*.js',
      'src/static/sw.js',
      // the engine's browser halves: the kit's hands and the pixel moves
      'primitives/kit/*.js',
      'primitives/pixel-moves.js',
      'src/static/canvas/app.js',
      'primitives/presence/presence.js',
      'src/static/canvas/highlight.js',
      'src/static/canvas/watchdog.js',
      'src/static/canvas/case-study.js',
      'src/static/canvas/code-refs.js',
      'primitives/rooms/view-sync.js',
      'primitives/dust.js',
      'src/static/canvas/abyss.js',
    ],
    languageOptions: {
      globals: {
        window: 'readonly',
        document: 'readonly',
        history: 'readonly',
        matchMedia: 'readonly',
        innerWidth: 'readonly',
        innerHeight: 'readonly',
        addEventListener: 'readonly',
        WebSocket: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        navigator: 'readonly',
        Node: 'readonly',
        NodeFilter: 'readonly',
        htmx: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        self: 'readonly',
        caches: 'readonly',
        crypto: 'readonly',
        TextEncoder: 'readonly',
        Notification: 'readonly',
        fetch: 'readonly',
        URL: 'readonly',
        location: 'readonly',
        performance: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        getComputedStyle: 'readonly',
        ResizeObserver: 'readonly',
        IntersectionObserver: 'readonly',
        MutationObserver: 'readonly',
        XMLHttpRequest: 'readonly',
        DOMParser: 'readonly',
        Intl: 'readonly',
        CSS: 'readonly',
        // shared highlighting paints peers' selections with the Custom
        // Highlight API into a stylesheet it builds (canvas/highlight.js)
        Highlight: 'readonly',
        CSSStyleSheet: 'readonly',
        getSelection: 'readonly',
        atob: 'readonly',
        btoa: 'readonly',
        Blob: 'readonly',
        // the textmode tool reads a dropped file to a data: URL
        FileReader: 'readonly',
        // a session's page bridge and its marked lines (canvas/marks.js)
        dispatchEvent: 'readonly',
        CustomEvent: 'readonly',
        getSelection: 'readonly',
        CSSStyleSheet: 'readonly',
        Highlight: 'readonly',
        // an embed's page-wide listeners ride one signal (js/instruments.js)
        AbortController: 'readonly',
        // a page that is read can be listened to in the browser's own voice
        // (js/page-reader.js), and stops listening when the page goes
        speechSynthesis: 'readonly',
        SpeechSynthesisUtterance: 'readonly',
        removeEventListener: 'readonly',
      },
    },
    rules: {
      'no-var': 'off',
      'prefer-const': 'off',
    },
  },
  {
    // Build and verification scripts: Node, but a modern one. The timers and
    // WebSocket are Node built-ins here, not borrowed browser APIs, and the
    // world check needs both to drive Chrome over CDP.
    files: ['scripts/**/*.mjs', 'scripts/**/*.js'],
    languageOptions: {
      globals: {
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        WebSocket: 'readonly',
        TextEncoder: 'readonly',
        TextDecoder: 'readonly',
        structuredClone: 'readonly',
      },
    },
  },
  {
    // Third-party code we ship as-is. Linting it is noise (it trips a
    // dozen browser-API globals we don't declare) and it must never be
    // auto-fixed. Nothing first-party is exempt any more: layout.js joined
    // when it was extracted, theme.js joined once it earned browser globals,
    // and app.js joined 2026-08-19. app.js was the last holdout, exempt since
    // it was promoted from the prototype and exempt through +5247/-2882 lines
    // of edits, which is long enough for the exemption to stop being a
    // staging decision and start being a blind spot. Turning the rules on
    // cost four globals to declare, six catch bindings nobody read, and it
    // immediately found two dead symbols (a DESIGN_VIEW import and the
    // THEME_CYCLE array the switch stopped walking when it went binary).
    // The FORMATTER is still off for it, deliberately: see .prettierignore.
    ignores: ['node_modules/', 'src/static/js/vendor/', 'src/static/canvas/vendor/'],
  },
]
