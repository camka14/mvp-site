import { isEmailEnabled, sendEmail } from '@/server/email';

const DEFAULT_ADMIN_NOTIFICATION_RECIPIENT = 'samuel.r@razumly.com';
const NOT_PROVIDED = 'Not provided';

type NotificationRow = [label: string, value: unknown];

export type AdminAccountCreatedNotification = {
  userId: string;
  email: string;
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  userName?: string | null;
  dateOfBirth?: Date | string | null;
  createdAt?: Date | string | null;
  authProvider?: string | null;
  wasInviteClaim?: boolean;
};

export type AdminOrganizationCreatedNotification = {
  id: string;
  name: string;
  ownerId: string;
  location?: string | null;
  address?: string | null;
  website?: string | null;
  sports?: string[] | null;
  status?: string | null;
  publicSlug?: string | null;
  taxOrganizationType?: string | null;
  operatesAthleticFacility?: boolean | null;
  createdAt?: Date | string | null;
};

export type AdminEventCreatedNotification = {
  id: string;
  name: string;
  eventType?: string | null;
  state?: string | null;
  hostId?: string | null;
  organizationId?: string | null;
  sportId?: string | null;
  start?: Date | string | null;
  end?: Date | string | null;
  timeZone?: string | null;
  location?: string | null;
  address?: string | null;
  teamSignup?: boolean | null;
  price?: number | null;
  maxParticipants?: number | null;
  createdAt?: Date | string | null;
};

const getAdminNotificationRecipient = (): string => (
  process.env.ADMIN_NOTIFICATION_EMAIL_TO?.trim() || DEFAULT_ADMIN_NOTIFICATION_RECIPIENT
);

const escapeHtml = (value: string): string => (
  value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      case "'":
        return '&#39;';
      default:
        return char;
    }
  })
);

const isUnknownDate = (date: Date): boolean => date.getTime() === 0;

const formatDateTime = (value: Date | string | null | undefined): string => {
  if (!value) return NOT_PROVIDED;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime()) || isUnknownDate(value)) return NOT_PROVIDED;
    return value.toISOString();
  }
  const trimmed = value.trim();
  return trimmed || NOT_PROVIDED;
};

const formatDateOnly = (value: Date | string | null | undefined): string => {
  const formatted = formatDateTime(value);
  return formatted === NOT_PROVIDED ? formatted : formatted.slice(0, 10);
};

const formatValue = (value: unknown): string => {
  if (value == null) return NOT_PROVIDED;
  if (value instanceof Date) return formatDateTime(value);
  if (Array.isArray(value)) {
    const entries = value
      .map((entry) => formatValue(entry))
      .filter((entry) => entry !== NOT_PROVIDED);
    return entries.length ? entries.join(', ') : NOT_PROVIDED;
  }
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'string') return value.trim() || NOT_PROVIDED;
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : NOT_PROVIDED;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const buildText = (title: string, rows: NotificationRow[]): string => (
  [
    title,
    '',
    ...rows.map(([label, value]) => `${label}: ${formatValue(value)}`),
  ].join('\n')
);

const buildHtml = (title: string, rows: NotificationRow[]): string => (
  [
    `<h1>${escapeHtml(title)}</h1>`,
    '<table cellpadding="8" cellspacing="0" style="border-collapse:collapse;">',
    ...rows.map(([label, value]) => (
      `<tr><th align="left" valign="top">${escapeHtml(label)}</th><td>${escapeHtml(formatValue(value)).replace(/\n/g, '<br>')}</td></tr>`
    )),
    '</table>',
  ].join('')
);

const buildUrl = (baseUrl: string | null | undefined, path: string): string | null => {
  const normalizedBaseUrl = baseUrl?.trim().replace(/\/$/, '');
  if (!normalizedBaseUrl) return null;
  return `${normalizedBaseUrl}${path}`;
};

const sendAdminNotification = async ({
  subject,
  title,
  rows,
}: {
  subject: string;
  title: string;
  rows: NotificationRow[];
}): Promise<void> => {
  if (!isEmailEnabled()) {
    return;
  }

  await sendEmail({
    to: getAdminNotificationRecipient(),
    subject,
    text: buildText(title, rows),
    html: buildHtml(title, rows),
  });
};

export const sendAdminAccountCreatedNotification = async (
  account: AdminAccountCreatedNotification,
): Promise<void> => {
  await sendAdminNotification({
    subject: `[BracketIQ] New account: ${account.email}`,
    title: 'New BracketIQ account',
    rows: [
      ['User ID', account.userId],
      ['Email', account.email],
      ['Name', account.name],
      ['First name', account.firstName],
      ['Last name', account.lastName],
      ['Username', account.userName],
      ['Date of birth', formatDateOnly(account.dateOfBirth)],
      ['Auth provider', account.authProvider],
      ['Claimed invite placeholder', account.wasInviteClaim === true],
      ['Created at', account.createdAt],
    ],
  });
};

export const sendAdminOrganizationCreatedNotification = async ({
  organization,
  baseUrl,
}: {
  organization: AdminOrganizationCreatedNotification;
  baseUrl?: string | null;
}): Promise<void> => {
  const organizationUrl = buildUrl(baseUrl, `/organizations/${encodeURIComponent(organization.id)}`);
  await sendAdminNotification({
    subject: `[BracketIQ] New organization: ${organization.name}`,
    title: 'New BracketIQ organization',
    rows: [
      ['Organization ID', organization.id],
      ['Organization URL', organizationUrl],
      ['Name', organization.name],
      ['Owner ID', organization.ownerId],
      ['Status', organization.status],
      ['Location', organization.location],
      ['Address', organization.address],
      ['Website', organization.website],
      ['Sports', organization.sports],
      ['Public slug', organization.publicSlug],
      ['Tax organization type', organization.taxOrganizationType],
      ['Operates athletic facility', organization.operatesAthleticFacility],
      ['Created at', organization.createdAt],
    ],
  });
};

export const sendAdminEventCreatedNotification = async ({
  event,
  baseUrl,
}: {
  event: AdminEventCreatedNotification;
  baseUrl?: string | null;
}): Promise<void> => {
  const eventUrl = buildUrl(baseUrl, `/events/${encodeURIComponent(event.id)}`);
  await sendAdminNotification({
    subject: `[BracketIQ] New event: ${event.name}`,
    title: 'New BracketIQ event',
    rows: [
      ['Event ID', event.id],
      ['Event URL', eventUrl],
      ['Name', event.name],
      ['Event type', event.eventType],
      ['State', event.state],
      ['Host ID', event.hostId],
      ['Organization ID', event.organizationId],
      ['Sport ID', event.sportId],
      ['Start', event.start],
      ['End', event.end],
      ['Time zone', event.timeZone],
      ['Location', event.location],
      ['Address', event.address],
      ['Team signup', event.teamSignup],
      ['Price cents', event.price],
      ['Max participants', event.maxParticipants],
      ['Created at', event.createdAt],
    ],
  });
};
