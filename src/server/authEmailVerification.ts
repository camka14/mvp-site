import jwt from 'jsonwebtoken';
import { isEmailEnabled, sendEmail } from '@/server/email';

type InitialEmailVerificationTokenPayload = {
  type: 'initial_email_verification';
  userId: string;
  email: string;
  iat?: number;
  exp?: number;
};

const INITIAL_EMAIL_VERIFICATION_TOKEN_TTL_SECONDS = 60 * 30;

const getAuthSecret = (): string => {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error('AUTH_SECRET is not set');
  }
  return secret;
};

const signInitialEmailVerificationToken = (payload: InitialEmailVerificationTokenPayload): string => {
  return jwt.sign(payload, getAuthSecret(), { expiresIn: INITIAL_EMAIL_VERIFICATION_TOKEN_TTL_SECONDS });
};

export const readInitialEmailVerificationToken = (
  token: string | null,
): InitialEmailVerificationTokenPayload | null => {
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, getAuthSecret());
    if (!decoded || typeof decoded === 'string') return null;
    const type = decoded.type === 'initial_email_verification' ? decoded.type : null;
    const userId = typeof decoded.userId === 'string' ? decoded.userId : '';
    const email = typeof decoded.email === 'string' ? decoded.email.trim().toLowerCase() : '';
    if (!type || !userId || !email) return null;
    return {
      type,
      userId,
      email,
      iat: typeof decoded.iat === 'number' ? decoded.iat : undefined,
      exp: typeof decoded.exp === 'number' ? decoded.exp : undefined,
    };
  } catch {
    return null;
  }
};

export const isInitialEmailVerificationAvailable = (): boolean => isEmailEnabled();

export const sendInitialEmailVerification = async ({
  userId,
  email,
  origin,
}: {
  userId: string;
  email: string;
  origin: string;
}): Promise<{ sent: true }> => {
  if (!isEmailEnabled()) {
    throw new Error('Email verification is unavailable because SMTP is not configured.');
  }

  const normalizedEmail = email.trim().toLowerCase();
  const token = signInitialEmailVerificationToken({
    type: 'initial_email_verification',
    userId,
    email: normalizedEmail,
  });

  const confirmUrl = new URL('/api/auth/verify/confirm', origin);
  confirmUrl.searchParams.set('token', token);
  const confirmUrlString = confirmUrl.toString();

  await sendEmail({
    to: normalizedEmail,
    subject: 'Verify your BracketIQ email',
    text: `Use this link to verify your email:\n\n${confirmUrlString}\n\nThis link expires in 30 minutes.`,
    html: `
      <p>Use the button below to verify your email address:</p>
      <p><a href="${confirmUrlString}">Verify email</a></p>
      <p>This link expires in 30 minutes.</p>
    `,
  });

  return { sent: true };
};
