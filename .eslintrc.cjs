/* Раздел 19.5 ТЗ: правила, которые проверяются линтером. */
module.exports = {
  root: true,
  env: { browser: true, es2022: true, node: true },
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true } },
  plugins: ['@typescript-eslint', 'react-hooks'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  ignorePatterns: ['dist', 'dev-dist', 'node_modules', 'coverage', 'scripts', '*.cjs', '*.js'],
  rules: {
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'warn',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/no-explicit-any': 'warn',
  },
  overrides: [
    {
      // 2.9 / 5.2: UI и домен не имеют права знать про Dexie.
      files: ['src/screens/**/*.{ts,tsx}', 'src/components/**/*.{ts,tsx}', 'src/design-system/**/*.{ts,tsx}', 'src/domain/**/*.ts', 'src/app/**/*.{ts,tsx}'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            paths: [
              { name: 'dexie', message: 'Доступ к БД — только через src/data/repositories/*.' },
              {
                name: 'dexie-react-hooks',
                message: 'Импортируйте хуки из src/data/repositories/hooks.',
              },
            ],
            patterns: [
              {
                group: ['**/data/db/**', '@/data/db/*'],
                message: 'Схема Dexie доступна только слою data/.',
              },
            ],
          },
        ],
      },
    },
    {
      // 17: ни одной строки текста в коде компонентов.
      files: ['src/screens/**/*.tsx', 'src/components/**/*.tsx'],
      rules: {
        'react/jsx-no-literals': 'off',
        'no-restricted-syntax': [
          'error',
          {
            selector: 'JSXText[value=/[\\p{L}]{4,}/u]',
            message:
              'Строковые литералы в JSX запрещены (раздел 17). Используйте t() и ключи i18n.',
          },
        ],
      },
    },
    {
      files: ['src/domain/**/*.ts'],
      rules: {
        // 5.1: слой домена не знает о React, сети и хранилище.
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              { group: ['react', 'react-*', 'dexie*', '**/data/**', '**/adapters/**'], message: 'Домен — только чистые функции и типы.' },
            ],
          },
        ],
      },
    },
  ],
};
