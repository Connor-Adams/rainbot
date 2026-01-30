const js = require('@eslint/js');
const globals = require('globals');
const tseslint = require('@typescript-eslint/eslint-plugin');
const tsparser = require('@typescript-eslint/parser');

module.exports = [
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      'no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      'no-console': 'off',
      'no-undef': 'error',
    },
  },
  {
    files: ['**/*.ts'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parser: tsparser,
      globals: {
        ...globals.node,
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-require-imports': 'off', // Allow require() for CommonJS interop
      '@typescript-eslint/no-explicit-any': 'warn', // Warn but don't error
      'no-unused-vars': 'off', // Use TS version instead
      'no-undef': 'off', // TypeScript handles this
    },
  },
  {
    files: ['**/*.{js,ts,jsx,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            'types/*',
            '**/types/*',
            'commands/*',
            '**/commands/*',
            'utils/*',
            '**/utils/*',
            'components/*',
            '**/components/*',
            'apps/raincloud/events/*',
            'events/*',
            'handlers/*',
          ],
        },
      ],
    },
  },
  {
    files: ['apps/**/*.{js,ts,jsx,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            '../apps/*',
            '../../apps/*',
            '../../../apps/*',
            '../../../../apps/*',
            '../../../../../apps/*',
          ],
        },
      ],
    },
  },
  {
    files: ['packages/**/*.{js,ts,jsx,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            '../apps/*',
            '../../apps/*',
            '../../../apps/*',
            '../../../../apps/*',
            '../../../../../apps/*',
          ],
        },
      ],
    },
  },
  {
    ignores: [
      'node_modules/**',
      '**/node_modules/**',
      'dist/**',
      '**/dist/**',
      'build/**',
      '**/build/**',
      'ui/**',
      'logs/**',
      'sessions/**',
      'sounds/**',
      'eslint.config.js',
      'deploy-commands.js',
      'dev-server.js',
      '**/*.d.ts',
    ],
  },
];
