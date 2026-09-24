module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  moduleFileExtensions: ['ts', 'js', 'json'],
  moduleNameMapper: {
    '^@rainbot/utils$': '<rootDir>/src/index.ts',
    '^@rainbot/utils/(.*)$': '<rootDir>/src/$1',
    '^@rainbot/protocol$': '<rootDir>/../protocol/src/index.ts',
    '^@rainbot/protocol/(.*)$': '<rootDir>/../protocol/src/$1',
  },
  modulePathIgnorePatterns: ['<rootDir>/dist/'],
  passWithNoTests: true,
};
