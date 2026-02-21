type UserDataLookupClient = {
  userData: {
    findFirst: (...args: any[]) => any;
  };
};

const GENERATED_USER_NAME_PREFIX = 'user';

export const normalizeUserName = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

const toCaseInsensitiveKey = (value: string): string => value.trim().toLowerCase();

const sanitizeGeneratedBase = (value: string): string => {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '')
    .replace(/^[._-]+|[._-]+$/g, '');
  if (!normalized) return GENERATED_USER_NAME_PREFIX;
  return normalized.slice(0, 24);
};

const sanitizeSuffixSeed = (value: string | undefined): string => {
  if (!value) return '';
  return value.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10);
};

const buildCandidate = (base: string, suffix: string): string => {
  if (!suffix) return base;
  const maxBaseLength = 63 - suffix.length - 1;
  const truncatedBase = base.slice(0, Math.max(maxBaseLength, 1));
  return `${truncatedBase}_${suffix}`;
};

export const findUserNameConflictUserId = async (
  client: UserDataLookupClient,
  userName: string,
  excludeUserId?: string | null,
): Promise<string | null> => {
  const normalizedUserName = normalizeUserName(userName);
  if (!normalizedUserName) return null;

  const where: Record<string, unknown> = {
    userName: { equals: normalizedUserName, mode: 'insensitive' },
  };
  if (excludeUserId) {
    where.id = { not: excludeUserId };
  }

  const existing = await client.userData.findFirst({
    where,
    select: { id: true },
  });
  return existing?.id ?? null;
};

export const isSameUserName = (left: string | null | undefined, right: string | null | undefined): boolean => {
  if (!left || !right) return false;
  return toCaseInsensitiveKey(left) === toCaseInsensitiveKey(right);
};

export const reserveGeneratedUserName = async (
  client: UserDataLookupClient,
  preferredBase: string,
  options?: {
    excludeUserId?: string | null;
    suffixSeed?: string;
  },
): Promise<string> => {
  const base = sanitizeGeneratedBase(preferredBase);
  const suffixSeed = sanitizeSuffixSeed(options?.suffixSeed);
  const excludeUserId = options?.excludeUserId ?? null;

  const seedCandidates = suffixSeed
    ? [suffixSeed, `${suffixSeed}1`, `${suffixSeed}2`]
    : [];
  const fallbackCandidates = [
    ...seedCandidates,
    '1',
    '2',
    '3',
    '4',
    '5',
    '6',
    '7',
    '8',
    '9',
  ];

  const candidates = [base, ...fallbackCandidates.map((suffix) => buildCandidate(base, suffix))];
  for (const candidate of candidates) {
    const conflictUserId = await findUserNameConflictUserId(client, candidate, excludeUserId);
    if (!conflictUserId) {
      return candidate;
    }
  }

  return buildCandidate(GENERATED_USER_NAME_PREFIX, sanitizeSuffixSeed(options?.suffixSeed) || Date.now().toString(36));
};

export const isPrismaUserNameUniqueError = (error: unknown): boolean => {
  const code = (error as { code?: string } | null)?.code;
  if (code !== 'P2002') return false;
  const target = (error as { meta?: { target?: unknown } } | null)?.meta?.target;
  if (Array.isArray(target)) {
    return target.some((entry) => String(entry).toLowerCase().includes('username'));
  }
  if (typeof target === 'string') {
    return target.toLowerCase().includes('username');
  }
  // Expression-based unique indexes may not include a structured target.
  return true;
};
