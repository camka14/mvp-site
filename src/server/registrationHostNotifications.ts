import { SITE_URL } from '@/lib/siteUrl';
import { prisma } from '@/lib/prisma';
import { resolveDivisionDisplayName } from '@/lib/divisionDisplay';
import { isEmailEnabled, sendEmail } from '@/server/email';

const NOT_PROVIDED = 'Not provided';

type NotificationRow = [label: string, value: unknown];
type NotificationLinkRow = [label: string, value: unknown, options: { href?: string | null }];
type NotificationTableRow = NotificationRow | NotificationLinkRow;

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

const getRowOptions = (row: NotificationTableRow): { href?: string | null } => (
  row.length === 3 ? row[2] : {}
);

const notificationRow = (
  label: string,
  value: unknown,
  options?: { href?: string | null },
): NotificationTableRow => (
  options ? [label, value, options] : [label, value]
);

const buildText = (title: string, rows: NotificationTableRow[]): string => (
  [
    title,
    '',
    ...rows.map((row) => {
      const [label, value] = row;
      const formatted = formatValue(value);
      const href = normalizeText(getRowOptions(row).href);
      return href && href !== formatted
        ? `${label}: ${formatted} (${href})`
        : `${label}: ${formatted}`;
    }),
  ].join('\n')
);

const buildHtml = (title: string, rows: NotificationTableRow[]): string => (
  [
    `<h1>${escapeHtml(title)}</h1>`,
    '<table cellpadding="8" cellspacing="0" style="border-collapse:collapse;">',
    ...rows.map((row) => {
      const [label, value] = row;
      const href = normalizeText(getRowOptions(row).href);
      const formatted = escapeHtml(formatValue(value)).replace(/\n/g, '<br>');
      const htmlValue = href
        ? `<a href="${escapeHtml(href)}">${formatted}</a>`
        : formatted;
      return `<tr><th align="left" valign="top">${escapeHtml(label)}</th><td>${htmlValue}</td></tr>`;
    }),
    '</table>',
  ].join('')
);

const buildEventUrl = (eventId: string): string => {
  const baseUrl = normalizeText(process.env.PUBLIC_WEB_BASE_URL) ?? SITE_URL;
  return `${baseUrl.replace(/\/$/, '')}/events/${encodeURIComponent(eventId)}`;
};

const formatDateTimeForManager = (
  value: Date | string | null | undefined,
  timeZone: string | null | undefined,
): string | null => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const normalizedTimeZone = normalizeText(timeZone);
  const options: Intl.DateTimeFormatOptions = {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZoneName: 'short',
    ...(normalizedTimeZone ? { timeZone: normalizedTimeZone } : {}),
  };

  try {
    return new Intl.DateTimeFormat('en-US', options).format(date);
  } catch {
    return new Intl.DateTimeFormat('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZoneName: 'short',
    }).format(date);
  }
};

const formatDateOnlyForManager = (
  value: string | null | undefined,
): string | null => {
  const normalized = normalizeText(value);
  const match = normalized?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return normalized;

  const [, year, month, day] = match;
  const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), 12, 0, 0));
  if (Number.isNaN(parsed.getTime())) return normalized;

  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(parsed);
};

const formatTimeZoneForManager = (
  timeZone: string | null | undefined,
  referenceDate: Date | null | undefined,
): string | null => {
  const normalized = normalizeText(timeZone);
  if (!normalized) return null;

  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: normalized,
      timeZoneName: 'longGeneric',
    }).formatToParts(referenceDate ?? new Date());
    return normalizeText(parts.find((part) => part.type === 'timeZoneName')?.value)
      ?? normalized.replace(/_/g, ' ');
  } catch {
    return normalized.replace(/_/g, ' ');
  }
};

const formatRegistrationType = (value: unknown): string => {
  const normalized = normalizeText(value)?.toUpperCase();
  if (normalized === 'TEAM') return 'Team';
  if (normalized === 'CHILD') return 'Child participant';
  if (normalized === 'SELF') return 'Participant';
  if (!normalized) return 'Participant';
  return normalized
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

const formatMinutesLabel = (value: unknown): string | null => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const totalMinutes = Math.max(0, Math.trunc(value));
  const hours24 = Math.floor(totalMinutes / 60) % 24;
  const minutes = totalMinutes % 60;
  const suffix = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 || 12;
  return `${hours12}:${String(minutes).padStart(2, '0')} ${suffix}`;
};

const formatSlotTimeRange = (slot: {
  startTimeMinutes: number | null;
  endTimeMinutes: number | null;
} | null): string | null => {
  const start = formatMinutesLabel(slot?.startTimeMinutes);
  const end = formatMinutesLabel(slot?.endTimeMinutes);
  if (start && end) return `${start}-${end}`;
  return start ?? end;
};

const resolveDivisionLabel = async (
  registration: {
    divisionId: string | null;
    divisionTypeId: string | null;
    divisionTypeKey: string | null;
  },
  event: {
    sportId: string | null;
  },
): Promise<string | null> => {
  const divisionId = normalizeText(registration.divisionId);
  const divisionType = normalizeText(registration.divisionTypeKey)
    ?? normalizeText(registration.divisionTypeId);

  const division = divisionId
    ? await prisma.divisions.findUnique({
      where: { id: divisionId },
      select: {
        id: true,
        name: true,
        key: true,
        playoffPlacementDivisionIds: true,
      },
    })
    : null;

  const divisionForDisplay = division
    ? {
      ...division,
      key: division.key ?? undefined,
    }
    : null;

  return resolveDivisionDisplayName({
    division: divisionForDisplay ?? divisionId ?? divisionType,
    divisionDetails: divisionForDisplay ? [divisionForDisplay] : undefined,
    sportInput: event.sportId,
  });
};

const resolveOccurrenceLabel = async (
  registration: {
    slotId: string | null;
    occurrenceDate: string | null;
  },
  event: {
    timeZone: string | null;
  },
): Promise<string | null> => {
  const slotId = normalizeText(registration.slotId);
  const occurrenceDate = normalizeText(registration.occurrenceDate);
  const slot = slotId
    ? await prisma.timeSlots.findUnique({
      where: { id: slotId },
      select: {
        startTimeMinutes: true,
        endTimeMinutes: true,
        timeZone: true,
      },
    })
    : null;

  const dateLabel = formatDateOnlyForManager(occurrenceDate);
  const timeRange = formatSlotTimeRange(slot);
  const timeZoneLabel = slot && timeRange
    ? formatTimeZoneForManager(slot.timeZone ?? event.timeZone, new Date())
    : null;

  return [
    dateLabel,
    timeRange,
    timeZoneLabel,
  ].filter(Boolean).join(', ') || null;
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
        sportId: true,
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
    const divisionLabel = await resolveDivisionLabel(registration, event);
    const occurrenceLabel = await resolveOccurrenceLabel(registration, event);
    const registrationKind = registration.registrantType === 'TEAM' ? 'team' : 'participant';
    const title = `New ${registrationKind} registration`;
    const eventUrl = buildEventUrl(event.id);
    const rows: NotificationTableRow[] = [
      notificationRow('Event', event.name),
      notificationRow('Event page', 'Open event page', { href: eventUrl }),
      notificationRow('Event start', formatDateTimeForManager(event.start, event.timeZone)),
      notificationRow('Time zone', formatTimeZoneForManager(event.timeZone, event.start)),
      notificationRow('Location', event.location),
      notificationRow('Registrant', registrant.label),
      notificationRow('Registrant type', formatRegistrationType(registration.registrantType)),
      notificationRow('Registrant email', registrant.email),
      ...(registrant.parentEmail ? [notificationRow('Parent/guardian email', registrant.parentEmail)] : []),
      ...(divisionLabel ? [notificationRow('Division', divisionLabel)] : []),
      ...(occurrenceLabel ? [notificationRow('Session', occurrenceLabel)] : []),
      notificationRow('Registered at', formatDateTimeForManager(registration.createdAt, event.timeZone)),
    ].filter(([, value]) => formatValue(value) !== NOT_PROVIDED);

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
