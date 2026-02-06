import nodemailer, { TransportOptions, Transporter } from 'nodemailer';

export interface EmailPayload {
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
}

interface EmailConfig {
  transport: TransportOptions | string;
  from: string;
  replyTo?: string;
}

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

const resolveEmailConfig = (): EmailConfig | null => {
  const smtpUrl = readEnv('SMTP_URL');
  const fromEmail = readEnv('SMTP_FROM') || readEnv('GMAIL_USER');
  const fromName = readEnv('SMTP_FROM_NAME');
  const replyTo = readEnv('SMTP_REPLY_TO');
  const from = formatFrom(fromEmail, fromName);

  if (smtpUrl) {
    if (!from) return null;
    return { transport: smtpUrl, from, replyTo };
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

  const transport: TransportOptions = {
    host: smtpHost,
    port,
    secure,
  };

  if (smtpUser && smtpPassword) {
    transport.auth = { user: smtpUser, pass: smtpPassword };
  }

  return { transport, from, replyTo };
};

let cachedTransport: Transporter | null = null;
let cachedKey = '';

const getTransport = (config: EmailConfig): Transporter => {
  const key = typeof config.transport === 'string' ? config.transport : JSON.stringify(config.transport);
  if (!cachedTransport || cachedKey !== key) {
    cachedTransport = nodemailer.createTransport(config.transport);
    cachedKey = key;
  }
  return cachedTransport;
};

export const isEmailEnabled = (): boolean => Boolean(resolveEmailConfig());

export const sendEmail = async (payload: EmailPayload): Promise<void> => {
  const config = resolveEmailConfig();
  if (!config) {
    throw new Error('SMTP is not configured');
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
