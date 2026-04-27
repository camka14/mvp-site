import nodemailer, { Transporter } from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';

export interface EmailPayload {
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
}

interface SmtpEmailConfig {
  provider: 'smtp';
  transport: SMTPTransport.Options | string;
  from: string;
  replyTo?: string;
}

interface GmailApiEmailConfig {
  provider: 'gmail-api';
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  userId: string;
  from: string;
  replyTo?: string;
}

type EmailConfig = SmtpEmailConfig | GmailApiEmailConfig;

interface GmailAccessTokenCache {
  accessToken: string;
  expiresAt: number;
  cacheKey: string;
}

const GMAIL_SEND_ENDPOINT = 'https://gmail.googleapis.com/gmail/v1/users';
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const ACCESS_TOKEN_REFRESH_WINDOW_MS = 60_000;

const readEnv = (key: string): string | undefined => {
  const value = process.env[key];
  return value ? value.trim() : undefined;
};

const parsePort = (value?: string, fallback = 587): number => {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const parseBool = (value?: string): boolean | undefined => {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false;
  return undefined;
};

const formatFrom = (email?: string, name?: string): string | undefined => {
  if (!email) return undefined;
  if (!name) return email;
  return `${name} <${email}>`;
};

const resolveFrom = (): { from: string | undefined; replyTo: string | undefined } => {
  const fromEmail = readEnv('SMTP_FROM') || readEnv('GMAIL_FROM') || readEnv('GMAIL_SENDER_EMAIL') || readEnv('GMAIL_USER');
  const fromName = readEnv('SMTP_FROM_NAME');
  const replyTo = readEnv('SMTP_REPLY_TO');
  return {
    from: formatFrom(fromEmail, fromName),
    replyTo,
  };
};

const resolveEmailConfig = (): EmailConfig | null => {
  const { from, replyTo } = resolveFrom();
  const gmailOauthClientId = readEnv('GMAIL_OAUTH_CLIENT_ID');
  const gmailOauthClientSecret = readEnv('GMAIL_OAUTH_CLIENT_SECRET');
  const gmailOauthRefreshToken = readEnv('GMAIL_OAUTH_REFRESH_TOKEN');
  if (gmailOauthClientId && gmailOauthClientSecret && gmailOauthRefreshToken) {
    if (!from) return null;
    return {
      provider: 'gmail-api',
      clientId: gmailOauthClientId,
      clientSecret: gmailOauthClientSecret,
      refreshToken: gmailOauthRefreshToken,
      userId: readEnv('GMAIL_SENDER_EMAIL') || 'me',
      from,
      replyTo,
    };
  }

  const smtpUrl = readEnv('SMTP_URL');

  if (smtpUrl) {
    if (!from) return null;
    return { provider: 'smtp', transport: smtpUrl, from, replyTo };
  }

  const gmailUser = readEnv('GMAIL_USER');
  const gmailPassword = readEnv('GMAIL_PASSWORD');
  const smtpHost = readEnv('SMTP_HOST') || (gmailUser ? 'smtp.gmail.com' : undefined);
  if (!smtpHost || !from) return null;

  const smtpUser = readEnv('SMTP_USER') || gmailUser;
  const smtpPassword = readEnv('SMTP_PASS') || gmailPassword;
  const defaultPort = smtpHost === 'smtp.gmail.com' ? 465 : 587;
  const port = parsePort(readEnv('SMTP_PORT'), defaultPort);
  const secure = parseBool(readEnv('SMTP_SECURE')) ?? port === 465;

  const transport: SMTPTransport.Options = {
    host: smtpHost,
    port,
    secure,
  };

  if (smtpUser && smtpPassword) {
    transport.auth = { user: smtpUser, pass: smtpPassword };
  }

  return { provider: 'smtp', transport, from, replyTo };
};

let cachedTransport: Transporter | null = null;
let cachedKey = '';
let cachedGmailAccessToken: GmailAccessTokenCache | null = null;

const getTransport = (config: SmtpEmailConfig): Transporter => {
  const key = typeof config.transport === 'string' ? config.transport : JSON.stringify(config.transport);
  if (!cachedTransport || cachedKey !== key) {
    cachedTransport = nodemailer.createTransport(config.transport);
    cachedKey = key;
  }
  return cachedTransport;
};

const sanitizeHeaderValue = (value: string): string => value.replace(/[\r\n]+/g, ' ').trim();

const encodeHeaderValue = (value: string): string => {
  const sanitized = sanitizeHeaderValue(value);
  if (!/[^\x20-\x7E]/.test(sanitized)) {
    return sanitized;
  }
  return `=?UTF-8?B?${Buffer.from(sanitized, 'utf8').toString('base64')}?=`;
};

const chunkBase64 = (value: string): string => value.match(/.{1,76}/g)?.join('\r\n') ?? '';

const encodeBodyPart = (value: string): string => chunkBase64(Buffer.from(value, 'utf8').toString('base64'));

const base64UrlEncode = (value: string): string => (
  Buffer.from(value, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
);

const buildMimeMessage = (payload: EmailPayload, from: string, replyTo?: string): string => {
  const headers = [
    `From: ${encodeHeaderValue(from)}`,
    `To: ${encodeHeaderValue(payload.to)}`,
    `Subject: ${encodeHeaderValue(payload.subject)}`,
    'MIME-Version: 1.0',
    replyTo ? `Reply-To: ${encodeHeaderValue(replyTo)}` : null,
  ].filter(Boolean);

  if (!payload.html) {
    return [
      ...headers,
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      encodeBodyPart(payload.text),
    ].join('\r\n');
  }

  const boundary = `bracketiq_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
  return [
    ...headers,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    encodeBodyPart(payload.text),
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    encodeBodyPart(payload.html),
    `--${boundary}--`,
    '',
  ].join('\r\n');
};

const getGmailAccessToken = async (config: GmailApiEmailConfig): Promise<string> => {
  const cacheKey = `${config.clientId}:${config.refreshToken}`;
  if (
    cachedGmailAccessToken
    && cachedGmailAccessToken.cacheKey === cacheKey
    && cachedGmailAccessToken.expiresAt - ACCESS_TOKEN_REFRESH_WINDOW_MS > Date.now()
  ) {
    return cachedGmailAccessToken.accessToken;
  }

  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: config.refreshToken,
    grant_type: 'refresh_token',
  });

  const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  const json = await response.json().catch(() => null) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  } | null;

  if (!response.ok || !json?.access_token) {
    const reason = json?.error_description || json?.error || response.statusText;
    throw new Error(`Failed to refresh Gmail access token: ${reason}`);
  }

  cachedGmailAccessToken = {
    accessToken: json.access_token,
    expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000,
    cacheKey,
  };

  return json.access_token;
};

const sendGmailApiEmail = async (config: GmailApiEmailConfig, payload: EmailPayload): Promise<void> => {
  const accessToken = await getGmailAccessToken(config);
  const raw = base64UrlEncode(buildMimeMessage(payload, config.from, payload.replyTo ?? config.replyTo));
  const userId = encodeURIComponent(config.userId);
  const response = await fetch(`${GMAIL_SEND_ENDPOINT}/${userId}/messages/send`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ raw }),
  });

  if (!response.ok) {
    const json = await response.json().catch(() => null) as {
      error?: { message?: string };
    } | null;
    throw new Error(`Failed to send Gmail API email: ${json?.error?.message || response.statusText}`);
  }
};

export const isEmailEnabled = (): boolean => Boolean(resolveEmailConfig());

export const sendEmail = async (payload: EmailPayload): Promise<void> => {
  const config = resolveEmailConfig();
  if (!config) {
    throw new Error('Email delivery is not configured');
  }

  if (config.provider === 'gmail-api') {
    await sendGmailApiEmail(config, payload);
    return;
  }

  const transporter = getTransport(config);
  await transporter.sendMail({
    from: config.from,
    to: payload.to,
    subject: payload.subject,
    text: payload.text,
    html: payload.html,
    replyTo: payload.replyTo ?? config.replyTo,
  });
};
