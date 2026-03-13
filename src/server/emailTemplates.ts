export interface InviteEmailInput {
  baseUrl: string;
  email: string;
  inviteType?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  eventId?: string | null;
  eventName?: string | null;
  organizationId?: string | null;
  organizationName?: string | null;
  teamId?: string | null;
  teamName?: string | null;
}

export interface InviteEmailContent {
  subject: string;
  text: string;
  html: string;
  actionUrl: string;
}

const normalizeBaseUrl = (value: string): string => value.replace(/\/+$/, '');

const buildInviteActionUrl = (input: InviteEmailInput): string => {
  const baseUrl = normalizeBaseUrl(input.baseUrl || 'http://localhost:3000');
  if (input.eventId) {
    return `${baseUrl}/events/${input.eventId}/schedule`;
  }
  if (input.organizationId) {
    return `${baseUrl}/organizations/${input.organizationId}`;
  }
  if (input.teamId) {
    return `${baseUrl}/teams`;
  }
  return `${baseUrl}/`;
};

const buildSubject = (input: InviteEmailInput): string => {
  const prefix = 'BracketIQ: Staff Invite';
  const inviteType = (input.inviteType ?? '').trim().toUpperCase();
  if (inviteType === 'STAFF') {
    if (input.organizationName) {
      return `${prefix} — You are invited to join the staff for ${input.organizationName}`;
    }
    return prefix;
  }

  if (inviteType === 'EVENT') {
    if (input.eventName) {
      return `${prefix} — You are invited to join ${input.eventName}`;
    }
    return `${prefix} — You have an event invite on BracketIQ`;
  }

  if (input.teamName) {
    return `${prefix} — You are invited to join ${input.teamName}`;
  }
  if (input.eventName) {
    return `${prefix} — You are invited to join ${input.eventName}`;
  }
  return `${prefix} — You are invited to join on BracketIQ`;
};

export const buildInviteEmail = (input: InviteEmailInput): InviteEmailContent => {
  const name = [input.firstName, input.lastName].filter(Boolean).join(' ').trim();
  const greeting = name ? `Hi ${name},` : 'Hi,';
  const actionUrl = buildInviteActionUrl(input);
  const subject = buildSubject(input);

  const contextLines: string[] = [];
  if (input.eventName) contextLines.push(`Event: ${input.eventName}`);
  if (input.organizationName) contextLines.push(`Organization: ${input.organizationName}`);
  if (input.teamName) contextLines.push(`Team: ${input.teamName}`);

  const detailsText = contextLines.length ? `\n${contextLines.join('\n')}\n` : '\n';
  const introLine = 'You have a new invite on BracketIQ.';

  const text = [
    greeting,
    '',
    introLine,
    detailsText.trimEnd(),
    '',
    `View the invite: ${actionUrl}`,
    '',
    'If you do not have an account yet, sign up with this email address to accept the invite.',
  ]
    .filter(Boolean)
    .join('\n');

  const detailsHtml = contextLines.length
    ? `<ul>${contextLines.map((line) => `<li>${line}</li>`).join('')}</ul>`
    : '';

  const html = [
    `<p>${greeting}</p>`,
    `<p>${introLine}</p>`,
    detailsHtml,
    `<p><a href="${actionUrl}">View the invite</a></p>`,
    `<p>If you do not have an account yet, sign up with this email address to accept the invite.</p>`,
  ].join('');

  return { subject, text, html, actionUrl };
};
