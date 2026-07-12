import crypto from 'crypto';
import type { NextRequest } from 'next/server';
import { AuthMfaChallengePurpose } from '@/server/authMfaPurpose';
import { getAuthSecret } from '@/lib/authServer';
import { prisma } from '@/lib/prisma';

const PHONE_MFA_CHALLENGE_TTL_MS = 10 * 60 * 1000;
const PHONE_MFA_MAX_ATTEMPTS = 5;
const PHONE_MFA_DEV_PROVIDER = 'dev';
const PHONE_MFA_PENDING_PROVIDER = 'pending';
const PHONE_MFA_TWILIO_PROVIDER = 'twilio_verify';

type PhoneMfaClient = typeof prisma | any;

type RequestMetadata = {
  ipHash: string | null;
  userAgent: string | null;
};

type PhoneMfaSendResult = {
  providerChallengeId?: string | null;
  devCodeHash?: string | null;
};

type MfaChallengeResponse = {
  challengeId: string;
  expiresAt: string;
  maskedPhoneNumber?: string;
};

export class PhoneMfaError extends Error {
  code: string;
  status: number;

  constructor(message: string, code: string, status = 400) {
    super(message);
    this.name = 'PhoneMfaError';
    this.code = code;
    this.status = status;
  }
}

export const isPhoneMfaError = (error: unknown): error is PhoneMfaError => (
  error instanceof PhoneMfaError
);

export const isWebLoginClient = (value: unknown): boolean => value === 'web';

const createId = (prefix: string): string => `${prefix}_${crypto.randomUUID()}`;

const addMs = (date: Date, ms: number): Date => new Date(date.getTime() + ms);

const hashValue = (value: string): string => crypto.createHash('sha256').update(value).digest('hex');

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

export const readPhoneMfaRequestMetadata = (req: NextRequest): RequestMetadata => {
  const ip = readForwardedIp(req);
  const userAgent = req.headers.get('user-agent')?.trim() || null;
  return {
    ipHash: ip ? hashValue(ip) : null,
    userAgent: userAgent ? userAgent.slice(0, 500) : null,
  };
};

export const normalizePhoneNumberToE164 = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new PhoneMfaError('Enter a phone number.', 'MFA_PHONE_REQUIRED', 400);
  }

  if (trimmed.startsWith('+')) {
    const digits = trimmed.slice(1).replace(/\D/g, '');
    if (/^[1-9]\d{7,14}$/.test(digits)) {
      return `+${digits}`;
    }
  }

  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 10) {
    return `+1${digits}`;
  }
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`;
  }

  throw new PhoneMfaError('Enter a valid phone number.', 'MFA_PHONE_INVALID', 400);
};

export const maskPhoneNumber = (phoneNumberE164?: string | null): string => {
  const digits = phoneNumberE164?.replace(/\D/g, '') ?? '';
  if (digits.length < 4) return 'your phone';
  const last4 = digits.slice(-4);
  if (digits.length === 11 && digits.startsWith('1')) {
    return `(***) ***-${last4}`;
  }
  return `+${digits.slice(0, Math.max(1, digits.length - 10))} *** *** ${last4}`;
};

const getSensitiveUserData = (client: PhoneMfaClient, userId: string) => (
  client.sensitiveUserData.findUnique({ where: { userId } })
);

const resolvePhoneMfaProvider = (): string => {
  const hasTwilio = Boolean(
    process.env.TWILIO_ACCOUNT_SID?.trim()
      && process.env.TWILIO_AUTH_TOKEN?.trim()
      && process.env.TWILIO_VERIFY_SERVICE_SID?.trim(),
  );
  if (hasTwilio) return PHONE_MFA_TWILIO_PROVIDER;

  if (process.env.MFA_SMS_DEV_MODE === 'true' && process.env.NODE_ENV !== 'production') {
    return PHONE_MFA_DEV_PROVIDER;
  }

  throw new PhoneMfaError(
    'Phone verification is not configured.',
    'MFA_PROVIDER_NOT_CONFIGURED',
    503,
  );
};

const getTwilioVerifyBaseUrl = (): string => {
  const serviceSid = process.env.TWILIO_VERIFY_SERVICE_SID?.trim();
  if (!serviceSid) {
    throw new PhoneMfaError('Phone verification is not configured.', 'MFA_PROVIDER_NOT_CONFIGURED', 503);
  }
  return `https://verify.twilio.com/v2/Services/${encodeURIComponent(serviceSid)}`;
};

const getTwilioAuthHeader = (): string => {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  if (!accountSid || !authToken) {
    throw new PhoneMfaError('Phone verification is not configured.', 'MFA_PROVIDER_NOT_CONFIGURED', 503);
  }
  return `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`;
};

const parseTwilioPayload = async (response: Response): Promise<Record<string, unknown>> => (
  response.json().catch(() => ({}))
);

const startTwilioVerification = async (phoneNumberE164: string): Promise<PhoneMfaSendResult> => {
  const body = new URLSearchParams();
  body.set('To', phoneNumberE164);
  body.set('Channel', 'sms');

  const response = await fetch(`${getTwilioVerifyBaseUrl()}/Verifications`, {
    method: 'POST',
    headers: {
      authorization: getTwilioAuthHeader(),
      'content-type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  const payload = await parseTwilioPayload(response);
  if (!response.ok) {
    throw new PhoneMfaError('Failed to send verification code.', 'MFA_SEND_FAILED', 502);
  }

  return {
    providerChallengeId: typeof payload.sid === 'string' ? payload.sid : null,
  };
};

const verifyTwilioCode = async (phoneNumberE164: string, code: string): Promise<boolean> => {
  const body = new URLSearchParams();
  body.set('To', phoneNumberE164);
  body.set('Code', code);

  const response = await fetch(`${getTwilioVerifyBaseUrl()}/VerificationCheck`, {
    method: 'POST',
    headers: {
      authorization: getTwilioAuthHeader(),
      'content-type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  const payload = await parseTwilioPayload(response);
  if (!response.ok) {
    if (response.status >= 500) {
      throw new PhoneMfaError('Failed to verify code.', 'MFA_VERIFY_FAILED', 502);
    }
    return false;
  }

  return payload.status === 'approved';
};

const normalizeCode = (code: string): string => code.trim().replace(/\s+/g, '');

const createDevCode = (): string => {
  const configured = process.env.MFA_SMS_DEV_CODE?.trim();
  if (configured && /^\d{6}$/.test(configured)) return configured;
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
};

const hashDevCode = (challengeId: string, phoneNumberE164: string, code: string): string => (
  crypto
    .createHmac('sha256', getAuthSecret())
    .update(`${challengeId}:${phoneNumberE164}:${code}`)
    .digest('hex')
);

const timingSafeStringEqual = (left: string, right: string): boolean => {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

const startDevVerification = (
  challengeId: string,
  phoneNumberE164: string,
): PhoneMfaSendResult => {
  const code = createDevCode();
  console.info('[mfa] development verification code', {
    challengeId,
    maskedPhoneNumber: maskPhoneNumber(phoneNumberE164),
    code,
  });
  return {
    providerChallengeId: `dev_${challengeId}`,
    devCodeHash: hashDevCode(challengeId, phoneNumberE164, code),
  };
};

const sendPhoneMfaCode = async (
  provider: string,
  challengeId: string,
  phoneNumberE164: string,
): Promise<PhoneMfaSendResult> => {
  if (provider === PHONE_MFA_DEV_PROVIDER) {
    return startDevVerification(challengeId, phoneNumberE164);
  }
  if (provider === PHONE_MFA_TWILIO_PROVIDER) {
    return startTwilioVerification(phoneNumberE164);
  }
  throw new PhoneMfaError('Phone verification is not configured.', 'MFA_PROVIDER_NOT_CONFIGURED', 503);
};

const verifyPhoneMfaCode = async (
  challenge: {
    id: string;
    provider: string;
    phoneNumberE164: string | null;
    devCodeHash: string | null;
  },
  code: string,
): Promise<boolean> => {
  const phoneNumberE164 = challenge.phoneNumberE164;
  if (!phoneNumberE164) {
    throw new PhoneMfaError('Verification code has not been sent.', 'MFA_CODE_NOT_SENT', 400);
  }

  const normalizedCode = normalizeCode(code);
  if (!/^\d{4,10}$/.test(normalizedCode)) {
    return false;
  }

  if (challenge.provider === PHONE_MFA_DEV_PROVIDER) {
    if (!challenge.devCodeHash) return false;
    return timingSafeStringEqual(
      hashDevCode(challenge.id, phoneNumberE164, normalizedCode),
      challenge.devCodeHash,
    );
  }

  if (challenge.provider === PHONE_MFA_TWILIO_PROVIDER) {
    return verifyTwilioCode(phoneNumberE164, normalizedCode);
  }

  throw new PhoneMfaError('Phone verification is not configured.', 'MFA_PROVIDER_NOT_CONFIGURED', 503);
};

const consumeExistingChallenges = async (
  client: PhoneMfaClient,
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

const createChallenge = async ({
  client,
  userId,
  purpose,
  provider,
  phoneNumberE164,
  sessionVersion,
  metadata,
  now,
}: {
  client: PhoneMfaClient;
  userId: string;
  purpose: AuthMfaChallengePurpose;
  provider: string;
  phoneNumberE164?: string | null;
  sessionVersion?: number | null;
  metadata: RequestMetadata;
  now: Date;
}) => (
  client.authMfaChallenges.create({
    data: {
      id: createId('mfa'),
      userId,
      purpose,
      provider,
      phoneNumberE164: phoneNumberE164 ?? null,
      expiresAt: addMs(now, PHONE_MFA_CHALLENGE_TTL_MS),
      sessionVersion: sessionVersion ?? 0,
      verificationIpHash: metadata.ipHash,
      verificationUserAgent: metadata.userAgent,
    },
  })
);

const recordChallengeSend = async ({
  client,
  challengeId,
  provider,
  sendResult,
  now,
}: {
  client: PhoneMfaClient;
  challengeId: string;
  provider: string;
  sendResult: PhoneMfaSendResult;
  now: Date;
}) => (
  client.authMfaChallenges.update({
    where: { id: challengeId },
    data: {
      provider,
      providerChallengeId: sendResult.providerChallengeId ?? null,
      devCodeHash: sendResult.devCodeHash ?? null,
      lastSentAt: now,
      updatedAt: now,
    },
  })
);

const recordSensitiveSend = async (
  client: PhoneMfaClient,
  userId: string,
  now: Date,
) => {
  const sensitive = await getSensitiveUserData(client, userId);
  if (!sensitive) return;
  await client.sensitiveUserData.update({
    where: { id: sensitive.id },
    data: {
      phoneVerificationLastSentAt: now,
      phoneVerificationAttemptCount: 0,
      updatedAt: now,
    },
  });
};

export const getPhoneMfaStatus = async (
  userId: string,
  client: PhoneMfaClient = prisma,
) => {
  const sensitive = await getSensitiveUserData(client, userId);
  const phoneNumberE164 = sensitive?.phoneNumberE164 ?? null;
  const phoneVerifiedAt = sensitive?.phoneVerifiedAt ?? null;
  return {
    phoneVerified: Boolean(phoneNumberE164 && phoneVerifiedAt),
    maskedPhoneNumber: phoneNumberE164 && phoneVerifiedAt ? maskPhoneNumber(phoneNumberE164) : null,
    phoneVerifiedAt: phoneVerifiedAt?.toISOString?.() ?? null,
    provider: sensitive?.phoneVerificationProvider ?? null,
  };
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
  client?: PhoneMfaClient;
}): Promise<{
  code: 'MFA_REQUIRED' | 'MFA_SETUP_REQUIRED';
  mfa: MfaChallengeResponse;
}> => {
  const now = new Date();
  await consumeExistingChallenges(
    client,
    userId,
    [AuthMfaChallengePurpose.LOGIN, AuthMfaChallengePurpose.LOGIN_SETUP],
    now,
  );

  const sensitive = await getSensitiveUserData(client, userId);
  const verifiedPhone = sensitive?.phoneNumberE164 && sensitive.phoneVerifiedAt
    ? sensitive.phoneNumberE164
    : null;

  if (!verifiedPhone) {
    const challenge = await createChallenge({
      client,
      userId,
      purpose: AuthMfaChallengePurpose.LOGIN_SETUP,
      provider: PHONE_MFA_PENDING_PROVIDER,
      sessionVersion,
      metadata,
      now,
    });

    return {
      code: 'MFA_SETUP_REQUIRED',
      mfa: {
        challengeId: challenge.id,
        expiresAt: challenge.expiresAt.toISOString(),
      },
    };
  }

  const provider = resolvePhoneMfaProvider();
  const challenge = await createChallenge({
    client,
    userId,
    purpose: AuthMfaChallengePurpose.LOGIN,
    provider,
    phoneNumberE164: verifiedPhone,
    sessionVersion,
    metadata,
    now,
  });
  const sendResult = await sendPhoneMfaCode(provider, challenge.id, verifiedPhone);
  await Promise.all([
    recordChallengeSend({ client, challengeId: challenge.id, provider, sendResult, now }),
    recordSensitiveSend(client, userId, now),
  ]);

  return {
    code: 'MFA_REQUIRED',
    mfa: {
      challengeId: challenge.id,
      expiresAt: challenge.expiresAt.toISOString(),
      maskedPhoneNumber: maskPhoneNumber(verifiedPhone),
    },
  };
};

const loadActiveChallenge = async (
  client: PhoneMfaClient,
  challengeId: string,
  purpose: AuthMfaChallengePurpose,
) => {
  const challenge = await client.authMfaChallenges.findUnique({ where: { id: challengeId } });
  const now = new Date();
  if (!challenge || challenge.purpose !== purpose) {
    throw new PhoneMfaError('Invalid verification challenge.', 'MFA_CHALLENGE_INVALID', 400);
  }
  if (challenge.consumedAt) {
    throw new PhoneMfaError('Verification challenge has already been used.', 'MFA_CHALLENGE_USED', 400);
  }
  if (challenge.expiresAt.getTime() <= now.getTime()) {
    throw new PhoneMfaError('Verification challenge has expired.', 'MFA_CHALLENGE_EXPIRED', 400);
  }
  if (challenge.attemptCount >= PHONE_MFA_MAX_ATTEMPTS) {
    throw new PhoneMfaError('Too many verification attempts. Please request a new code.', 'MFA_ATTEMPTS_EXCEEDED', 429);
  }
  return challenge;
};

const recordFailedAttempt = async (
  client: PhoneMfaClient,
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
  client: PhoneMfaClient,
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

const upsertVerifiedPhone = async ({
  client,
  userId,
  email,
  phoneNumberE164,
  provider,
  now,
}: {
  client: PhoneMfaClient;
  userId: string;
  email: string;
  phoneNumberE164: string;
  provider: string;
  now: Date;
}) => {
  const existing = await getSensitiveUserData(client, userId);
  if (existing) {
    await client.sensitiveUserData.update({
      where: { id: existing.id },
      data: {
        userId,
        email,
        phoneNumberE164,
        phoneVerifiedAt: now,
        phoneVerificationProvider: provider,
        phoneVerificationAttemptCount: 0,
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
      phoneNumberE164,
      phoneVerifiedAt: now,
      phoneVerificationProvider: provider,
      phoneVerificationLastSentAt: now,
      phoneVerificationAttemptCount: 0,
      financialMfaSatisfiedAt: now,
      createdAt: now,
      updatedAt: now,
    },
  });
};

export const startLoginPhoneMfaSetup = async ({
  challengeId,
  phoneNumber,
  metadata,
  client = prisma,
}: {
  challengeId: string;
  phoneNumber: string;
  metadata: RequestMetadata;
  client?: PhoneMfaClient;
}): Promise<MfaChallengeResponse> => {
  const challenge = await loadActiveChallenge(client, challengeId, AuthMfaChallengePurpose.LOGIN_SETUP);
  const now = new Date();
  const phoneNumberE164 = normalizePhoneNumberToE164(phoneNumber);
  const provider = resolvePhoneMfaProvider();

  const prepared = await client.authMfaChallenges.update({
    where: { id: challenge.id },
    data: {
      provider,
      phoneNumberE164,
      verificationIpHash: metadata.ipHash,
      verificationUserAgent: metadata.userAgent,
      updatedAt: now,
    },
  });
  const sendResult = await sendPhoneMfaCode(provider, prepared.id, phoneNumberE164);
  await recordChallengeSend({
    client,
    challengeId: prepared.id,
    provider,
    sendResult,
    now,
  });

  return {
    challengeId: prepared.id,
    expiresAt: prepared.expiresAt.toISOString(),
    maskedPhoneNumber: maskPhoneNumber(phoneNumberE164),
  };
};

export const startProfilePhoneMfaSetup = async ({
  userId,
  phoneNumber,
  sessionVersion,
  metadata,
  client = prisma,
}: {
  userId: string;
  phoneNumber: string;
  sessionVersion?: number | null;
  metadata: RequestMetadata;
  client?: PhoneMfaClient;
}): Promise<MfaChallengeResponse> => {
  const now = new Date();
  await consumeExistingChallenges(client, userId, [AuthMfaChallengePurpose.PROFILE_PHONE_SETUP], now);
  const phoneNumberE164 = normalizePhoneNumberToE164(phoneNumber);
  const provider = resolvePhoneMfaProvider();
  const challenge = await createChallenge({
    client,
    userId,
    purpose: AuthMfaChallengePurpose.PROFILE_PHONE_SETUP,
    provider,
    phoneNumberE164,
    sessionVersion,
    metadata,
    now,
  });
  const sendResult = await sendPhoneMfaCode(provider, challenge.id, phoneNumberE164);
  await Promise.all([
    recordChallengeSend({ client, challengeId: challenge.id, provider, sendResult, now }),
    recordSensitiveSend(client, userId, now),
  ]);

  return {
    challengeId: challenge.id,
    expiresAt: challenge.expiresAt.toISOString(),
    maskedPhoneNumber: maskPhoneNumber(phoneNumberE164),
  };
};

export const confirmPhoneMfaChallenge = async ({
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
  client?: PhoneMfaClient;
}): Promise<{
  userId: string;
  phoneNumberE164: string | null;
  provider: string;
  sessionVersion: number;
}> => {
  const challenge = await loadActiveChallenge(client, challengeId, purpose);
  if (expectedUserId && challenge.userId !== expectedUserId) {
    throw new PhoneMfaError('Invalid verification challenge.', 'MFA_CHALLENGE_INVALID', 400);
  }
  const authUserForChallenge = await client.authUser.findUnique({
    where: { id: challenge.userId },
    select: { email: true, sessionVersion: true },
  });
  if (!authUserForChallenge) {
    throw new PhoneMfaError('Unable to verify account for MFA setup.', 'MFA_ACCOUNT_NOT_FOUND', 401);
  }
  if ((authUserForChallenge.sessionVersion ?? 0) !== (challenge.sessionVersion ?? 0)) {
    throw new PhoneMfaError('Verification challenge has expired.', 'MFA_CHALLENGE_EXPIRED', 401);
  }
  const now = new Date();
  const verified = await verifyPhoneMfaCode(challenge, code);
  if (!verified) {
    await recordFailedAttempt(client, challenge.id, now);
    throw new PhoneMfaError('Invalid verification code.', 'MFA_CODE_INVALID', 400);
  }

  const consumed = await consumeChallengeAfterVerification(client, challenge.id, now);
  if (
    (purpose === AuthMfaChallengePurpose.LOGIN_SETUP || purpose === AuthMfaChallengePurpose.PROFILE_PHONE_SETUP)
    && consumed.phoneNumberE164
  ) {
    const resolvedEmail = authUserEmail
      ?? authUserForChallenge.email
      ?? null;
    if (!resolvedEmail) {
      throw new PhoneMfaError('Unable to verify account for MFA setup.', 'MFA_ACCOUNT_NOT_FOUND', 401);
    }
    await upsertVerifiedPhone({
      client,
      userId: consumed.userId,
      email: resolvedEmail,
      phoneNumberE164: consumed.phoneNumberE164,
      provider: consumed.provider,
      now,
    });
  } else {
    const sensitive = await getSensitiveUserData(client, consumed.userId);
    if (sensitive) {
      await client.sensitiveUserData.update({
        where: { id: sensitive.id },
        data: {
          financialMfaSatisfiedAt: now,
          phoneVerificationAttemptCount: 0,
          updatedAt: now,
        },
      });
    }
  }

  return {
    userId: consumed.userId,
    phoneNumberE164: consumed.phoneNumberE164,
    provider: consumed.provider,
    sessionVersion: consumed.sessionVersion ?? 0,
  };
};
