// ESLint flat config (ESLint 9+) for the Vite + React client.
// Goal: catch real bugs (unused vars, hook mistakes) without fighting Prettier
// on formatting. Run: npm run lint  (auto-fix: npm run lint:fix)
import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import prettier from 'eslint-config-prettier';

export default [
  // Build output and generated files are never linted. `android/` holds the
  // Capacitor project (which receives a MINIFIED COPY of dist/ on every sync)
  // and `src-tauri/` the Rust desktop shell — both are generated, not sources.
  { ignores: ['dist/**', 'dev-dist/**', 'node_modules/**', 'android/**', 'src-tauri/**', 'release/**'] },

  js.configs.recommended,

  // Application source (browser).
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.serviceworker },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // Allow intentionally-unused caught errors and PascalCase/UPPER placeholders.
      'no-unused-vars': ['warn', { varsIgnorePattern: '^[A-Z_]', args: 'none', caughtErrors: 'none' }],
      'no-empty': ['warn', { allowEmptyCatch: true }],
    },
  },

  // Node-side config files.
  {
    files: ['*.config.js', 'vite.config.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node },
    },
  },

  // Turn off ESLint rules that would conflict with Prettier's formatting.
  prettier,
];
