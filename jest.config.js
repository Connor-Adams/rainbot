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
  coverageThresholds: {
    global: {
      statements: 60,
      branches: 50,
      functions: 50,
      lines: 60,
    },
  },
  moduleFileExtensions: ['ts', 'js', 'json'],
  verbose: true,
};
