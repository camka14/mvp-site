import crypto from 'crypto';
import type { NextRequest } from 'next/server';
import { AuthMfaChallengePurpose } from '@/server/authMfaPurpose';
import { prisma } from '@/lib/prisma';
import { decryptSecret, encryptSecret } from '@/server/integrations/secretCrypto';

const TOTP_MFA_CHALLENGE_TTL_MS = 10 * 60 * 1000;
const TOTP_MFA_MAX_ATTEMPTS = 5;
const TOTP_SECRET_BYTES = 20;
const TOTP_PERIOD_SECONDS = 30;
const TOTP_DIGITS = 6;
const TOTP_WINDOW = 1;
const TOTP_PROVIDER = 'totp';
const TOTP_ISSUER = 'BracketIQ';
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

type TotpMfaClient = typeof prisma | any;

type RequestMetadata = {
  ipHash: string | null;
  userAgent: string | null;
};

type MfaChallengeResponse = {
  challengeId: string;
  expiresAt: string;
  method: 'totp';
  setupQrUrl?: string;
};

type TotpVerificationResult = {
  valid: boolean;
  counter?: number;
};

type RequestHostSource = {
  headers: {
    get(name: string): string | null;
  };
};

export class TotpMfaError extends Error {
  code: string;
  status: number;

  constructor(message: string, code: string, status = 400) {
    super(message);
    this.name = 'TotpMfaError';
    this.code = code;
    this.status = status;
  }
}

export const isTotpMfaError = (error: unknown): error is TotpMfaError => (
  error instanceof TotpMfaError
);

export const isWebLoginClient = (value: unknown): boolean => value === 'web';

const createId = (prefix: string): string => `${prefix}_${crypto.randomUUID()}`;

const addMs = (date: Date, ms: number): Date => new Date(date.getTime() + ms);

const hashValue = (value: string): string => crypto.createHash('sha256').update(value).digest('hex');

const readBooleanEnvFlag = (...keys: string[]): boolean | null => {
  for (const key of keys) {
    const value = process.env[key]?.trim().toLowerCase();
    if (value === 'true' || value === '1' || value === 'yes') return true;
    if (value === 'false' || value === '0' || value === 'no') return false;
  }
  return null;
};

const isLocalHost = (host: string): boolean => {
  const normalized = host.trim().toLowerCase();
  return normalized === 'localhost'
    || normalized.startsWith('localhost:')
    || normalized === '127.0.0.1'
    || normalized.startsWith('127.0.0.1:')
    || normalized === '[::1]'
    || normalized.startsWith('[::1]:');
};

export const isLocalAuthMfaBypassEnabled = (req?: RequestHostSource | null): boolean => {
  const explicit = readBooleanEnvFlag('AUTH_MFA_DISABLED_LOCAL', 'AUTH_MFA_DISABLED');
  if (explicit !== null) return explicit;

  if (process.env.NODE_ENV === 'test') return false;
  if (process.env.NODE_ENV !== 'production') return true;

  return isLocalHost(req?.headers.get('host') ?? '');
};

const decryptTotpSecret = (encryptedSecret: string): string => {
  try {
    return decryptSecret(encryptedSecret);
  } catch (error) {
    console.error('Failed to decrypt authenticator secret for MFA.', error);
    throw new TotpMfaError(
      'Authenticator setup could not be verified. Please set up your authenticator again.',
      'MFA_SECRET_INVALID',
      400,
    );
  }
};

const readForwardedIp = (req: NextRequest): string | null => {
  const forwardedFor = req.headers.get('x-forwarded-for');
  if (forwardedFor) {
    const first = forwardedFor.split(',')[0]?.trim();
    if (first) return first;
  }

  return req.headers.get('cf-connecting-ip')?.trim()
    || req.headers.get('x-real-ip')?.trim()
    || req.headers.get('x-client-ip')?.trim()
    || null;
};

export const readTotpMfaRequestMetadata = (req: NextRequest): RequestMetadata => {
  const ip = readForwardedIp(req);
  const userAgent = req.headers.get('user-agent')?.trim() || null;
  return {
    ipHash: ip ? hashValue(ip) : null,
    userAgent: userAgent ? userAgent.slice(0, 500) : null,
  };
};

const getSensitiveUserData = (client: TotpMfaClient, userId: string) => (
  client.sensitiveUserData.findFirst({ where: { userId } })
);

export const encodeBase32 = (buffer: Buffer): string => {
  let bits = 0;
  let value = 0;
  let output = '';

  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
};

export const decodeBase32 = (value: string): Buffer => {
  const normalized = value.toUpperCase().replace(/=+$/g, '').replace(/\s+/g, '');
  let bits = 0;
  let buffer = 0;
  const bytes: number[] = [];

  for (const char of normalized) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) {
      throw new TotpMfaError('Authenticator secret has an unsupported format.', 'MFA_SECRET_INVALID', 500);
    }
    buffer = (buffer << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((buffer >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
};

export const createTotpSecret = (): string => encodeBase32(crypto.randomBytes(TOTP_SECRET_BYTES));

const normalizeCode = (code: string): string => code.trim().replace(/\s+/g, '');

const getCounterForDate = (date: Date): number => Math.floor(date.getTime() / 1000 / TOTP_PERIOD_SECONDS);

const hotp = (secret: Buffer, counter: number): string => {
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  counterBuffer.writeUInt32BE(counter >>> 0, 4);

  const digest = crypto.createHmac('sha1', secret).update(counterBuffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = (
    ((digest[offset] & 0x7f) << 24)
    | ((digest[offset + 1] & 0xff) << 16)
    | ((digest[offset + 2] & 0xff) << 8)
    | (digest[offset + 3] & 0xff)
  );
  const otp = binary % (10 ** TOTP_DIGITS);
  return String(otp).padStart(TOTP_DIGITS, '0');
};

export const createTotpCodeForTest = (secretBase32: string, date: Date = new Date()): string => (
  hotp(decodeBase32(secretBase32), getCounterForDate(date))
);

const timingSafeCodeEqual = (left: string, right: string): boolean => {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

export const verifyTotpCode = ({
  secretBase32,
  code,
  now = new Date(),
  minimumCounter,
}: {
  secretBase32: string;
  code: string;
  now?: Date;
  minimumCounter?: number | null;
}): TotpVerificationResult => {
  const normalizedCode = normalizeCode(code);
  if (!/^\d{6}$/.test(normalizedCode)) {
    return { valid: false };
  }

  const secret = decodeBase32(secretBase32);
  const currentCounter = getCounterForDate(now);
  for (let offset = -TOTP_WINDOW; offset <= TOTP_WINDOW; offset += 1) {
    const counter = currentCounter + offset;
    if (counter < 0) continue;
    if (minimumCounter !== null && minimumCounter !== undefined && counter <= minimumCounter) {
      continue;
    }
    if (timingSafeCodeEqual(hotp(secret, counter), normalizedCode)) {
      return { valid: true, counter };
    }
  }

  return { valid: false };
};

export const buildTotpSetupUri = ({
  secretBase32,
  email,
}: {
  secretBase32: string;
  email: string;
}): string => {
  const label = encodeURIComponent(`${TOTP_ISSUER}:${email}`);
  const params = new URLSearchParams({
    secret: secretBase32,
    issuer: TOTP_ISSUER,
    algorithm: 'SHA1',
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
};

const setupQrUrlForChallenge = (challengeId: string): string => (
  `/api/auth/mfa/setup/qr?challengeId=${encodeURIComponent(challengeId)}`
);

const createChallenge = async ({
  client,
  userId,
  purpose,
  sessionVersion,
  metadata,
  now,
  totpSecretEncrypted,
}: {
  client: TotpMfaClient;
  userId: string;
  purpose: AuthMfaChallengePurpose;
  sessionVersion?: number | null;
  metadata: RequestMetadata;
  now: Date;
  totpSecretEncrypted?: string | null;
}) => (
  client.authMfaChallenges.create({
    data: {
      id: createId('mfa'),
      userId,
      purpose,
      provider: TOTP_PROVIDER,
      totpSecretEncrypted: totpSecretEncrypted ?? null,
      expiresAt: addMs(now, TOTP_MFA_CHALLENGE_TTL_MS),
      sessionVersion: sessionVersion ?? 0,
      verificationIpHash: metadata.ipHash,
      verificationUserAgent: metadata.userAgent,
    },
  })
);

const consumeExistingChallenges = async (
  client: TotpMfaClient,
  userId: string,
  purposes: AuthMfaChallengePurpose[],
  now: Date,
) => {
  await client.authMfaChallenges.updateMany({
    where: {
      userId,
      purpose: { in: purposes },
      consumedAt: null,
    },
    data: {
      consumedAt: now,
      updatedAt: now,
    },
  });
};

const createSetupChallenge = async ({
  client,
  userId,
  purpose,
  sessionVersion,
  metadata,
  now,
}: {
  client: TotpMfaClient;
  userId: string;
  purpose: AuthMfaChallengePurpose;
  sessionVersion?: number | null;
  metadata: RequestMetadata;
  now: Date;
}) => {
  const secretBase32 = createTotpSecret();
  return createChallenge({
    client,
    userId,
    purpose,
    sessionVersion,
    metadata,
    now,
    totpSecretEncrypted: encryptSecret(secretBase32),
  });
};

export const getTotpMfaStatus = async (
  userId: string,
  client: TotpMfaClient = prisma,
) => {
  const sensitive = await getSensitiveUserData(client, userId);
  const enabledAt = sensitive?.totpEnabledAt ?? null;
  const verifiedAt = sensitive?.totpVerifiedAt ?? null;
  return {
    authenticatorEnabled: Boolean(sensitive?.totpSecretEncrypted && enabledAt),
    enabledAt: enabledAt?.toISOString?.() ?? null,
    lastVerifiedAt: verifiedAt?.toISOString?.() ?? null,
    provider: sensitive?.totpProvider ?? null,
  };
};

export const isTotpMfaEnabledForUser = async (
  userId: string,
  client: TotpMfaClient = prisma,
): Promise<boolean> => {
  const sensitive = await getSensitiveUserData(client, userId);
  return Boolean(sensitive?.totpSecretEncrypted && sensitive?.totpEnabledAt);
};

export const createWebLoginMfaChallenge = async ({
  userId,
  sessionVersion,
  metadata,
  client = prisma,
}: {
  userId: string;
  sessionVersion?: number | null;
  metadata: RequestMetadata;
  client?: TotpMfaClient;
}): Promise<{
  code: 'MFA_REQUIRED';
  mfa: MfaChallengeResponse;
} | null> => {
  const now = new Date();
  if (!(await isTotpMfaEnabledForUser(userId, client))) {
    return null;
  }

  await consumeExistingChallenges(client, userId, [AuthMfaChallengePurpose.LOGIN], now);
  const challenge = await createChallenge({
    client,
    userId,
    purpose: AuthMfaChallengePurpose.LOGIN,
    sessionVersion,
    metadata,
    now,
  });

  return {
    code: 'MFA_REQUIRED',
    mfa: {
      challengeId: challenge.id,
      expiresAt: challenge.expiresAt.toISOString(),
      method: 'totp',
    },
  };
};

const loadActiveChallenge = async (
  client: TotpMfaClient,
  challengeId: string,
  purpose: AuthMfaChallengePurpose,
) => {
  const challenge = await client.authMfaChallenges.findUnique({ where: { id: challengeId } });
  const now = new Date();
  if (!challenge || challenge.purpose !== purpose || challenge.provider !== TOTP_PROVIDER) {
    throw new TotpMfaError('Invalid authenticator challenge.', 'MFA_CHALLENGE_INVALID', 400);
  }
  if (challenge.consumedAt) {
    throw new TotpMfaError('Authenticator challenge has already been used.', 'MFA_CHALLENGE_USED', 400);
  }
  if (challenge.expiresAt.getTime() <= now.getTime()) {
    throw new TotpMfaError('Authenticator challenge has expired.', 'MFA_CHALLENGE_EXPIRED', 400);
  }
  if (challenge.attemptCount >= TOTP_MFA_MAX_ATTEMPTS) {
    throw new TotpMfaError('Too many verification attempts. Please start again.', 'MFA_ATTEMPTS_EXCEEDED', 429);
  }
  return challenge;
};

const recordFailedAttempt = async (
  client: TotpMfaClient,
  challengeId: string,
  now: Date,
) => {
  await client.authMfaChallenges.update({
    where: { id: challengeId },
    data: {
      attemptCount: { increment: 1 },
      updatedAt: now,
    },
  });
};

const consumeChallengeAfterVerification = async (
  client: TotpMfaClient,
  challengeId: string,
  now: Date,
) => (
  client.authMfaChallenges.update({
    where: { id: challengeId },
    data: {
      attemptCount: { increment: 1 },
      consumedAt: now,
      updatedAt: now,
    },
  })
);

const verifyChallengeAccount = async (
  client: TotpMfaClient,
  challenge: any,
  expectedUserId?: string | null,
) => {
  if (expectedUserId && challenge.userId !== expectedUserId) {
    throw new TotpMfaError('Invalid authenticator challenge.', 'MFA_CHALLENGE_INVALID', 400);
  }

  const authUserForChallenge = await client.authUser.findUnique({
    where: { id: challenge.userId },
    select: { email: true, sessionVersion: true },
  });
  if (!authUserForChallenge) {
    throw new TotpMfaError('Unable to verify account for authenticator setup.', 'MFA_ACCOUNT_NOT_FOUND', 401);
  }
  if ((authUserForChallenge.sessionVersion ?? 0) !== (challenge.sessionVersion ?? 0)) {
    throw new TotpMfaError('Authenticator challenge has expired.', 'MFA_CHALLENGE_EXPIRED', 401);
  }

  return authUserForChallenge;
};

const upsertVerifiedTotp = async ({
  client,
  userId,
  email,
  totpSecretEncrypted,
  counter,
  now,
}: {
  client: TotpMfaClient;
  userId: string;
  email: string;
  totpSecretEncrypted: string;
  counter: number;
  now: Date;
}) => {
  const existing = await getSensitiveUserData(client, userId);
  if (existing) {
    await client.sensitiveUserData.update({
      where: { id: existing.id },
      data: {
        userId,
        email,
        totpSecretEncrypted,
        totpEnabledAt: now,
        totpVerifiedAt: now,
        totpLastUsedCounter: counter,
        totpProvider: TOTP_PROVIDER,
        financialMfaSatisfiedAt: now,
        updatedAt: now,
      },
    });
    return;
  }

  await client.sensitiveUserData.create({
    data: {
      id: userId,
      userId,
      email,
      totpSecretEncrypted,
      totpEnabledAt: now,
      totpVerifiedAt: now,
      totpLastUsedCounter: counter,
      totpProvider: TOTP_PROVIDER,
      financialMfaSatisfiedAt: now,
      createdAt: now,
      updatedAt: now,
    },
  });
};

export const startProfileTotpMfaSetup = async ({
  userId,
  sessionVersion,
  metadata,
  client = prisma,
}: {
  userId: string;
  sessionVersion?: number | null;
  metadata: RequestMetadata;
  client?: TotpMfaClient;
}): Promise<MfaChallengeResponse> => {
  const now = new Date();
  await consumeExistingChallenges(client, userId, [AuthMfaChallengePurpose.PROFILE_TOTP_SETUP], now);
  const challenge = await createSetupChallenge({
    client,
    userId,
    purpose: AuthMfaChallengePurpose.PROFILE_TOTP_SETUP,
    sessionVersion,
    metadata,
    now,
  });

  return {
    challengeId: challenge.id,
    expiresAt: challenge.expiresAt.toISOString(),
    method: 'totp',
    setupQrUrl: setupQrUrlForChallenge(challenge.id),
  };
};

export const getTotpSetupQrPayload = async ({
  challengeId,
  expectedUserId,
  client = prisma,
}: {
  challengeId: string;
  expectedUserId?: string | null;
  client?: TotpMfaClient;
}): Promise<{ otpauthUri: string; expiresAt: string }> => {
  const challenge = await client.authMfaChallenges.findUnique({ where: { id: challengeId } });
  const now = new Date();
  if (!challenge || challenge.provider !== TOTP_PROVIDER) {
    throw new TotpMfaError('Invalid authenticator challenge.', 'MFA_CHALLENGE_INVALID', 400);
  }
  if (
    challenge.purpose !== AuthMfaChallengePurpose.LOGIN_SETUP
    && challenge.purpose !== AuthMfaChallengePurpose.PROFILE_TOTP_SETUP
  ) {
    throw new TotpMfaError('Invalid authenticator setup challenge.', 'MFA_CHALLENGE_INVALID', 400);
  }
  if (expectedUserId && challenge.userId !== expectedUserId) {
    throw new TotpMfaError('Invalid authenticator challenge.', 'MFA_CHALLENGE_INVALID', 400);
  }
  if (challenge.consumedAt || challenge.expiresAt.getTime() <= now.getTime()) {
    throw new TotpMfaError('Authenticator setup has expired.', 'MFA_CHALLENGE_EXPIRED', 400);
  }
  if (!challenge.totpSecretEncrypted) {
    throw new TotpMfaError('Authenticator setup is incomplete.', 'MFA_SECRET_MISSING', 400);
  }

  const authUser = await client.authUser.findUnique({
    where: { id: challenge.userId },
    select: { email: true },
  });
  if (!authUser?.email) {
    throw new TotpMfaError('Unable to verify account for authenticator setup.', 'MFA_ACCOUNT_NOT_FOUND', 401);
  }

  return {
    otpauthUri: buildTotpSetupUri({
      secretBase32: decryptTotpSecret(challenge.totpSecretEncrypted),
      email: authUser.email,
    }),
    expiresAt: challenge.expiresAt.toISOString(),
  };
};

export const confirmTotpMfaChallenge = async ({
  challengeId,
  code,
  purpose,
  expectedUserId,
  authUserEmail,
  client = prisma,
}: {
  challengeId: string;
  code: string;
  purpose: AuthMfaChallengePurpose;
  expectedUserId?: string | null;
  authUserEmail?: string | null;
  client?: TotpMfaClient;
}): Promise<{
  userId: string;
  sessionVersion: number;
}> => {
  const challenge = await loadActiveChallenge(client, challengeId, purpose);
  const authUserForChallenge = await verifyChallengeAccount(client, challenge, expectedUserId);

  const now = new Date();
  const isSetup = purpose === AuthMfaChallengePurpose.LOGIN_SETUP
    || purpose === AuthMfaChallengePurpose.PROFILE_TOTP_SETUP;
  const sensitive = await getSensitiveUserData(client, challenge.userId);
  const encryptedSecret = isSetup
    ? challenge.totpSecretEncrypted
    : sensitive?.totpSecretEncrypted;
  if (!encryptedSecret) {
    throw new TotpMfaError('Authenticator is not configured.', 'MFA_NOT_CONFIGURED', 400);
  }

  const verification = verifyTotpCode({
    secretBase32: decryptTotpSecret(encryptedSecret),
    code,
    now,
    minimumCounter: isSetup ? null : sensitive?.totpLastUsedCounter ?? null,
  });
  if (!verification.valid || verification.counter === undefined) {
    await recordFailedAttempt(client, challenge.id, now);
    throw new TotpMfaError('Invalid authenticator code.', 'MFA_CODE_INVALID', 400);
  }

  const consumed = await consumeChallengeAfterVerification(client, challenge.id, now);
  if (isSetup) {
    const resolvedEmail = authUserEmail ?? authUserForChallenge.email ?? null;
    if (!resolvedEmail) {
      throw new TotpMfaError('Unable to verify account for authenticator setup.', 'MFA_ACCOUNT_NOT_FOUND', 401);
    }
    await upsertVerifiedTotp({
      client,
      userId: consumed.userId,
      email: resolvedEmail,
      totpSecretEncrypted: encryptedSecret,
      counter: verification.counter,
      now,
    });
  } else if (sensitive) {
    await client.sensitiveUserData.update({
      where: { id: sensitive.id },
      data: {
        financialMfaSatisfiedAt: now,
        totpVerifiedAt: now,
        totpLastUsedCounter: verification.counter,
        updatedAt: now,
      },
    });
  }

  return {
    userId: consumed.userId,
    sessionVersion: consumed.sessionVersion ?? 0,
  };
};

export const confirmTotpMfaChallengeForLocalBypass = async ({
  challengeId,
  purpose,
  expectedUserId,
  client = prisma,
}: {
  challengeId: string;
  purpose: AuthMfaChallengePurpose;
  expectedUserId?: string | null;
  client?: TotpMfaClient;
}): Promise<{
  userId: string;
  sessionVersion: number;
}> => {
  const challenge = await loadActiveChallenge(client, challengeId, purpose);
  await verifyChallengeAccount(client, challenge, expectedUserId);

  const consumed = await consumeChallengeAfterVerification(client, challenge.id, new Date());
  return {
    userId: consumed.userId,
    sessionVersion: consumed.sessionVersion ?? 0,
  };
};
