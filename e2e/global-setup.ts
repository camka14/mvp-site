import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { request } from '@playwright/test';
import { SEED_USERS, resolveBaseUrl } from './fixtures/api';
import { storageStatePath } from './fixtures/auth';

const projectRoot = path.resolve(__dirname, '..');

const resolveSeedCommand = (): string => process.env.E2E_SEED_COMMAND ?? 'npm run seed:e2e';

const runSeedScript = (): void => {
  const seedCommand = resolveSeedCommand();
  execSync(seedCommand, {
    cwd: projectRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      E2E_SEED: process.env.E2E_SEED ?? '1',
    },
  });
};

const ensureAuthStorageState = async (role: keyof typeof SEED_USERS): Promise<void> => {
  const user = SEED_USERS[role];
  const baseURL = resolveBaseUrl();
  const authStatePath = storageStatePath(role);
  fs.mkdirSync(path.dirname(authStatePath), { recursive: true });

  const context = await request.newContext({ baseURL });
  try {
    const response = await context.post('/api/auth/login', {
      data: {
        email: user.email,
        password: user.password,
      },
    });

    if (!response.ok()) {
      const body = await response.text().catch(() => '');
      throw new Error(`Login failed for ${role} (${response.status()}): ${body}`);
    }

    const payload = (await response.json().catch(() => ({}))) as {
      user?: { id?: string; email?: string; name?: string | null };
      profile?: Record<string, unknown>;
    };

    const authUser = payload.user
      ? {
          $id: payload.user.id ?? '',
          email: payload.user.email ?? '',
          name: payload.user.name ?? undefined,
        }
      : null;

    const rawProfile = payload.profile ?? null;
    const normalizeArray = (value: unknown): string[] => (Array.isArray(value) ? value.map(String) : []);
    const appUser = rawProfile
      ? {
          ...rawProfile,
          $id:
            (rawProfile as { $id?: string }).$id ??
            (rawProfile as { id?: string }).id ??
            (rawProfile as { userId?: string }).userId ??
            '',
          teamIds: normalizeArray((rawProfile as { teamIds?: unknown }).teamIds),
          friendIds: normalizeArray((rawProfile as { friendIds?: unknown }).friendIds),
          friendRequestIds: normalizeArray((rawProfile as { friendRequestIds?: unknown }).friendRequestIds),
          friendRequestSentIds: normalizeArray((rawProfile as { friendRequestSentIds?: unknown }).friendRequestSentIds),
          followingIds: normalizeArray((rawProfile as { followingIds?: unknown }).followingIds),
          uploadedImages: normalizeArray((rawProfile as { uploadedImages?: unknown }).uploadedImages),
          fullName:
            typeof (rawProfile as { fullName?: string }).fullName === 'string'
              ? (rawProfile as { fullName?: string }).fullName
              : `${(rawProfile as { firstName?: string }).firstName ?? ''} ${(rawProfile as { lastName?: string }).lastName ?? ''}`.trim(),
          avatarUrl: typeof (rawProfile as { avatarUrl?: string }).avatarUrl === 'string'
            ? (rawProfile as { avatarUrl?: string }).avatarUrl
            : '',
        }
      : null;

    const state = await context.storageState();
    const origin = new URL(baseURL).origin;
    const existing = state.origins.find((entry) => entry.origin === origin);
    const localStorage = [
      ...(authUser ? [{ name: 'auth-user', value: JSON.stringify(authUser) }] : []),
      ...(appUser ? [{ name: 'app-user', value: JSON.stringify(appUser) }] : []),
    ];

    if (existing) {
      existing.localStorage = localStorage;
    } else {
      state.origins.push({ origin, localStorage });
    }

    fs.writeFileSync(authStatePath, JSON.stringify(state, null, 2));
  } finally {
    await context.dispose();
  }
};

const globalSetup = async (): Promise<void> => {
  runSeedScript();
  await Promise.all([ensureAuthStorageState('host'), ensureAuthStorageState('participant')]);
};

export default globalSetup;
