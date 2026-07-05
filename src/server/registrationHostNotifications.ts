import { SITE_URL } from '@/lib/siteUrl';
import { prisma } from '@/lib/prisma';
import { isEmailEnabled, sendEmail } from '@/server/email';

const NOT_PROVIDED = 'Not provided';

type NotificationRow = [label: string, value: unknown];

const normalizeText = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

const normalizeEmail = (value: unknown): string | null => {
  const normalized = normalizeText(value)?.toLowerCase() ?? null;
  return normalized && normalized.includes('@') ? normalized : null;
};

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

const formatValue = (value: unknown): string => {
  if (value == null) return NOT_PROVIDED;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? NOT_PROVIDED : value.toISOString();
  if (Array.isArray(value)) {
    const entries = value.map(formatValue).filter((entry) => entry !== NOT_PROVIDED);
    return entries.length ? entries.join(', ') : NOT_PROVIDED;
  }
  if (typeof value === 'string') return value.trim() || NOT_PROVIDED;
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : NOT_PROVIDED;
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
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

const buildEventUrl = (eventId: string): string => {
  const baseUrl = normalizeText(process.env.PUBLIC_WEB_BASE_URL) ?? SITE_URL;
  return `${baseUrl.replace(/\/$/, '')}/events/${encodeURIComponent(eventId)}`;
};

const resolveUserIdentity = async (userId: string | null | undefined): Promise<{
  email: string | null;
  name: string | null;
}> => {
  const normalizedUserId = normalizeText(userId);
  if (!normalizedUserId) {
    return { email: null, name: null };
  }

  const [authUser, sensitiveUser, profile] = await Promise.all([
    prisma.authUser.findUnique({
      where: { id: normalizedUserId },
      select: { email: true, name: true },
    }),
    prisma.sensitiveUserData.findFirst({
      where: { userId: normalizedUserId },
      select: { email: true },
    }),
    prisma.userData.findUnique({
      where: { id: normalizedUserId },
      select: { firstName: true, lastName: true, userName: true },
    }),
  ]);

  const profileName = [profile?.firstName, profile?.lastName]
    .map((value) => normalizeText(value))
    .filter(Boolean)
    .join(' ');
  const email = normalizeEmail(authUser?.email) ?? normalizeEmail(sensitiveUser?.email);

  return {
    email,
    name: normalizeText(profileName)
      ?? normalizeText(authUser?.name)
      ?? normalizeText(profile?.userName)
      ?? email,
  };
};

const resolveHostUserId = async (event: {
  hostId: string | null;
  organizationId: string | null;
}): Promise<string | null> => {
  const directHostId = normalizeText(event.hostId);
  if (directHostId) return directHostId;

  const organizationId = normalizeText(event.organizationId);
  if (!organizationId) return null;

  const organization = await prisma.organizations.findUnique({
    where: { id: organizationId },
    select: { ownerId: true },
  });
  return normalizeText(organization?.ownerId);
};

const resolveRegistrantLabel = async (registration: {
  registrantType: string | null;
  registrantId: string;
  parentId: string | null;
  eventTeamId: string | null;
}): Promise<{
  label: string;
  email: string | null;
  parentEmail: string | null;
}> => {
  const registrantType = normalizeText(registration.registrantType)?.toUpperCase() ?? 'SELF';
  if (registrantType === 'TEAM') {
    const teamId = normalizeText(registration.eventTeamId) ?? normalizeText(registration.registrantId);
    const team = teamId
      ? await prisma.teams.findUnique({
        where: { id: teamId },
        select: { name: true, managerId: true, captainId: true },
      })
      : null;
    const manager = await resolveUserIdentity(team?.managerId ?? team?.captainId ?? registration.parentId);
    return {
      label: normalizeText(team?.name) ?? teamId ?? 'Team registration',
      email: manager.email,
      parentEmail: null,
    };
  }

  const registrant = await resolveUserIdentity(registration.registrantId);
  const parent = registrantType === 'CHILD'
    ? await resolveUserIdentity(registration.parentId)
    : { email: null, name: null };

  return {
    label: registrant.name ?? registration.registrantId,
    email: registrant.email,
    parentEmail: parent.email,
  };
};

export const sendEventRegistrationHostNotification = async ({
  eventId,
  registrationId,
}: {
  eventId: string;
  registrationId: string;
}): Promise<void> => {
  if (!isEmailEnabled()) {
    return;
  }

  try {
    const registration = await prisma.eventRegistrations.findUnique({
      where: { id: registrationId },
      select: {
        id: true,
        eventId: true,
        registrantId: true,
        parentId: true,
        registrantType: true,
        rosterRole: true,
        status: true,
        eventTeamId: true,
        divisionId: true,
        divisionTypeId: true,
        divisionTypeKey: true,
        slotId: true,
        occurrenceDate: true,
        createdAt: true,
      },
    });
    if (!registration || registration.eventId !== eventId || registration.status !== 'ACTIVE') {
      return;
    }

    const event = await prisma.events.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        name: true,
        start: true,
        timeZone: true,
        location: true,
        hostId: true,
        organizationId: true,
      },
    });
    if (!event) {
      return;
    }

    const hostUserId = await resolveHostUserId(event);
    const host = await resolveUserIdentity(hostUserId);
    if (!host.email) {
      return;
    }

    const registrant = await resolveRegistrantLabel(registration);
    const registrationKind = registration.registrantType === 'TEAM' ? 'team' : 'participant';
    const title = `New ${registrationKind} registration`;
    const rows: NotificationRow[] = [
      ['Event', event.name],
      ['Event URL', buildEventUrl(event.id)],
      ['Event start', event.start],
      ['Time zone', event.timeZone],
      ['Location', event.location],
      ['Registrant', registrant.label],
      ['Registrant type', registration.registrantType],
      ['Registrant email', registrant.email],
      ['Parent/guardian email', registrant.parentEmail],
      ['Division', registration.divisionId],
      ['Division type', registration.divisionTypeId ?? registration.divisionTypeKey],
      ['Occurrence slot', registration.slotId],
      ['Occurrence date', registration.occurrenceDate],
      ['Registration ID', registration.id],
      ['Registered at', registration.createdAt],
    ];

    await sendEmail({
      to: host.email,
      subject: `[BracketIQ] ${title}: ${event.name}`,
      text: buildText(title, rows),
      html: buildHtml(title, rows),
    });
  } catch (error) {
    console.error('Failed to send event registration host notification', {
      eventId,
      registrationId,
      error,
    });
  }
};
