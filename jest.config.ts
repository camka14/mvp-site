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
    '!src/app/**/route.ts',
    '!src/app/**/*.d.ts',
  ],
};

export default config;
