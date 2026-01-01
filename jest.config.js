module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  collectCoverageFrom: [
    'commands/**/*.ts',
    'utils/**/*.ts',
    'server/**/*.ts',
    'handlers/**/*.ts',
    '!**/*.d.ts',
    '!**/node_modules/**',
    '!**/dist/**',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html', 'text-summary'],
  coverageThreshold: {
    global: {
      statements: 20,
      branches: 14,
      functions: 16,
      lines: 20,
    },
  },
  moduleFileExtensions: ['ts', 'js', 'json'],
  verbose: true,
};
