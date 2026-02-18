import { prisma } from '@/lib/prisma';
import { isEmailEnabled, sendEmail } from '@/server/email';
import { sendPushToUsers } from '@/server/pushNotifications';

interface EventCreationAudienceInput {
  eventId: string;
  hostId: string;
  eventName: string;
  eventStart: Date;
  location?: string | null;
  baseUrl: string;
}

const normalizeIds = (ids: string[]): string[] => (
  Array.from(new Set(ids.map((id) => id.trim()).filter(Boolean)))
);

const formatHostName = (firstName?: string | null, lastName?: string | null): string => {
  const fullName = `${firstName ?? ''} ${lastName ?? ''}`.trim();
  if (fullName) return fullName;
  return 'A host you follow';
};

const formatEventDate = (date: Date): string => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return 'an upcoming date';
  return date.toISOString().replace('T', ' ').replace('.000Z', ' UTC');
};

export const notifySocialAudienceOfEventCreation = async ({
  eventId,
  hostId,
  eventName,
  eventStart,
  location,
  baseUrl,
}: EventCreationAudienceInput): Promise<void> => {
  try {
    const host = await prisma.userData.findUnique({
      where: { id: hostId },
      select: {
        firstName: true,
        lastName: true,
        friendIds: true,
      },
    });

    if (!host) return;

    const followers = await prisma.userData.findMany({
      where: { followingIds: { has: hostId } },
      select: { id: true },
    });

    const recipientIds = normalizeIds([
      ...(host.friendIds ?? []),
      ...followers.map((row) => row.id),
    ]).filter((id) => id !== hostId);

    if (!recipientIds.length) {
      return;
    }

    const hostName = formatHostName(host.firstName, host.lastName);
    const eventDate = formatEventDate(eventStart);
    const trimmedBaseUrl = baseUrl.trim().replace(/\/$/, '');
    const eventUrl = `${trimmedBaseUrl}/events/${encodeURIComponent(eventId)}`;
    const locationSuffix = location?.trim() ? ` at ${location.trim()}` : '';

    await sendPushToUsers({
      userIds: recipientIds,
      title: `${hostName} created a new event`,
      body: `${eventName} starts ${eventDate}${locationSuffix}`,
      data: {
        type: 'event_created',
        eventId,
        hostId,
      },
    }).catch((error) => {
      console.warn('Failed to send event creation push notifications', { eventId, hostId, error });
    });

    if (!isEmailEnabled()) {
      return;
    }

    const recipients = await prisma.sensitiveUserData.findMany({
      where: { userId: { in: recipientIds } },
      select: {
        userId: true,
        email: true,
      },
    });

    const emailRows = recipients
      .map((row) => ({
        userId: row.userId,
        email: row.email?.trim().toLowerCase() ?? '',
      }))
      .filter((row) => row.email.length > 0);

    if (!emailRows.length) {
      return;
    }

    const subject = `${hostName} created a new event: ${eventName}`;
    const text = [
      `${hostName} just created a new event.`,
      '',
      `Event: ${eventName}`,
      `Start: ${eventDate}`,
      location?.trim() ? `Location: ${location.trim()}` : null,
      '',
      `View event: ${eventUrl}`,
    ].filter(Boolean).join('\n');
    const html = [
      `<p><strong>${hostName}</strong> just created a new event.</p>`,
      '<ul>',
      `<li><strong>Event:</strong> ${eventName}</li>`,
      `<li><strong>Start:</strong> ${eventDate}</li>`,
      location?.trim() ? `<li><strong>Location:</strong> ${location.trim()}</li>` : null,
      '</ul>',
      `<p><a href="${eventUrl}">View event</a></p>`,
    ].filter(Boolean).join('');

    const sendResults = await Promise.allSettled(emailRows.map((row) => sendEmail({
      to: row.email,
      subject,
      text,
      html,
    })));

    sendResults.forEach((result, index) => {
      if (result.status === 'rejected') {
        console.warn('Failed to send event creation email notification', {
          eventId,
          hostId,
          recipientUserId: emailRows[index]?.userId,
          error: result.reason,
        });
      }
    });
  } catch (error) {
    console.warn('Failed event social notification fanout', { eventId, hostId, error });
  }
};
