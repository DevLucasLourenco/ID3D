import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['dist/', 'node_modules/'] },
  js.configs.recommended,
  {
    rules: {
      'no-unused-vars': ['error', { args: 'after-used', caughtErrors: 'none' }],
      eqeqeq: ['error', 'always'],
    },
  },
  {
    // nucleo: roda igual no navegador e no Node, entao so o que existe nos dois
    files: ['src/core/**/*.js'],
    languageOptions: { globals: { TextDecoder: 'readonly' } },
  },
  {
    files: ['src/viewer/**/*.js'],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['scripts/**/*.mjs', 'test/**/*.js', 'eslint.config.js'],
    languageOptions: { globals: globals.node },
  },
];
