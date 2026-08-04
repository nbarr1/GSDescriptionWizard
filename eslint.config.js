import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';

export default [
  { ignores: ['dist/**', 'node_modules/**', 'playwright-report/**', 'test-results/**'] },
  js.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
      globals: {
        document: 'readonly',
        window: 'readonly',
        navigator: 'readonly',
        localStorage: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        HTMLElement: 'readonly',
        HTMLInputElement: 'readonly',
        HTMLTextAreaElement: 'readonly',
        HTMLSelectElement: 'readonly',
        HTMLButtonElement: 'readonly',
        Element: 'readonly',
        Event: 'readonly',
        KeyboardEvent: 'readonly',
      },
    },
    plugins: { '@typescript-eslint': tseslint },
    rules: {
      ...tseslint.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-undef': 'off',
      // The whole point of this tool is that user text never reaches an HTML sink.
      'no-restricted-properties': [
        'error',
        {
          object: '*',
          property: 'innerHTML',
          message:
            'innerHTML is banned. User answers must only ever reach the DOM via textContent or createTextNode.',
        },
        {
          object: '*',
          property: 'outerHTML',
          message: 'outerHTML is banned. Build nodes explicitly instead.',
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'fetch', message: 'The tool must make zero network requests at runtime.' },
        {
          name: 'XMLHttpRequest',
          message: 'The tool must make zero network requests at runtime.',
        },
      ],
    },
  },
  {
    files: ['tests/**/*.ts', 'scripts/**/*.mjs'],
    rules: {
      'no-restricted-properties': 'off',
      'no-restricted-globals': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
];
