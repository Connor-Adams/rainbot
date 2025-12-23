const js = require('@eslint/js');
const globals = require('globals');

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
            'no-unused-vars': ['warn', { 
                argsIgnorePattern: '^_',
                varsIgnorePattern: '^_',
            }],
            'no-console': 'off',
            'no-undef': 'error',
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
            'dist/**',
            'build/**',
            'ui/**',
            'public/**',
            'logs/**',
            'sessions/**',
            'sounds/**',
            'eslint.config.js',
            'deploy-commands.js',
            'dev-server.js',
        ],
    },
];

