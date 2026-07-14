import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '\\.(css|less|sass|scss)$': '<rootDir>/test/mocks/styleMock.ts',
    '^react-timezone-select$': '<rootDir>/test/mocks/react-timezone-select.tsx',
  },
  setupFilesAfterEnv: ['<rootDir>/test/setupTests.ts'],
  // Coverage plus large Mantine/React trees can legitimately exceed Jest's
  // five-second default on Windows; individual tests may still opt into a
  // tighter timeout where that is part of their contract.
  testTimeout: 20_000,
  testMatch: ['**/?(*.)+(spec|test).[tj]s?(x)'],
  testPathIgnorePatterns: ['<rootDir>/e2e/'],
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.jest.json' }],
  },
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/index.ts',
    '!src/app/**/*.d.ts',
  ],
  coverageReporters: ['json', 'json-summary', 'text', 'lcov', 'clover'],
  // These floors start below the measured route-inclusive baseline so CI is
  // stable while still rejecting a material coverage regression. Ratchet them
  // upward as additional authorization and failure branches gain coverage.
  // API routes have a separate aggregate gate because Jest applies a path/glob
  // coverageThreshold independently to every matching file.
  coverageThreshold: {
    global: {
      statements: 60,
      branches: 50,
      functions: 59,
      lines: 60,
    },
  },
};

export default config;
