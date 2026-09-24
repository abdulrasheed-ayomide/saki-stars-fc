import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['node_modules', 'backups'] },
  {
    files: ['**/*.js'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: { ...globals.node } },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['error', { argsIgnorePattern: '^_|^next$|^req$|^res$', varsIgnorePattern: '^_', ignoreRestSiblings: true }],
    },
  },
];
