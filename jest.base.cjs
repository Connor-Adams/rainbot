// jest.base.cjs
const path = require('path');
const { pathsToModuleNameMapper } = require('ts-jest');

function makeConfig({ workspaceDir, monorepoRoot }) {
  const tsconfigPath = path.join(monorepoRoot, 'tsconfig.json');
  // eslint-disable-next-line global-require, import/no-dynamic-require
  const { compilerOptions = {} } = require(tsconfigPath);

  return {
    preset: 'ts-jest',
    testEnvironment: 'node',

    rootDir: workspaceDir,
    roots: ['<rootDir>'],

    testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
    testPathIgnorePatterns: ['/node_modules/', '/dist/', '/build/'],

    transform: {
      '^.+\\.(ts|tsx)$': [
        'ts-jest',
        {
          tsconfig: tsconfigPath,
          isolatedModules: true,
        },
      ],
    },

    moduleNameMapper: {
      // TS path aliases from the MONOREPO root tsconfig.json
      ...pathsToModuleNameMapper(compilerOptions.paths || {}, {
        prefix: `${monorepoRoot}/`,
      }),
    },

    moduleFileExtensions: ['ts', 'tsx', 'js', 'json'],
    verbose: true,
  };
}

module.exports = { makeConfig };
