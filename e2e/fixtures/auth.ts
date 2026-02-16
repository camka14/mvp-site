import path from 'node:path';
import { expect, test as base } from '@playwright/test';
import type { SeedUserRole } from './api';

type AuthFixtures = {
  authRole: SeedUserRole;
};

const authDir = path.resolve(__dirname, '..', '.auth');
const storageStatePath = (role: SeedUserRole): string => path.join(authDir, `${role}.json`);

export const test = base.extend<AuthFixtures>({
  authRole: ['host', { option: true }],
  storageState: async ({ authRole }, applyFixture) => {
    await applyFixture(storageStatePath(authRole));
  },
});

export const hostTest = base.extend({
  storageState: storageStatePath('host'),
});

export const participantTest = base.extend({
  storageState: storageStatePath('participant'),
});

export { expect, storageStatePath };
