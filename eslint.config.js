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
    files: [
      'index.js',
      'deploy-commands.js',
      'dev-server.js',
      'utils/config.js',
      'utils/logger.js',
      'utils/workerServer.js',
      'scripts/setup-database.js',
      'packages/redis-client/src/client.js',
      'apps/raincloud/deploy-commands.js',
    ],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
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
    files: ['public/**/*.js', 'server/routes/auth.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        ...globals.browser,
        ...globals.node,
      },
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
      'public/**',
      'logs/**',
      'sessions/**',
      'sounds/**',
      'eslint.config.js',
      '**/*.d.ts',
    ],
  },
];
