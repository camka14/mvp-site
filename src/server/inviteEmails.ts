import { prisma } from '@/lib/prisma';
import { buildInviteEmail } from '@/server/emailTemplates';
import { isEmailEnabled, sendEmail } from '@/server/email';
import { sendPushToUsers } from '@/server/pushNotifications';

interface InviteRecord {
  id: string;
  email?: string | null;
  userId?: string | null;
  type?: string | null;
  eventId?: string | null;
  organizationId?: string | null;
  teamId?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  status?: string | null;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const normalizeEmail = (value?: string | null): string => (value ?? '').trim().toLowerCase();

export const sendInviteEmails = async (invites: InviteRecord[], baseUrl: string): Promise<InviteRecord[]> => {
  if (!invites.length || !isEmailEnabled()) {
    return invites;
  }

  const eventIds = new Set<string>();
  const organizationIds = new Set<string>();
  const teamIds = new Set<string>();

  invites.forEach((invite) => {
    if (invite.eventId) eventIds.add(invite.eventId);
    if (invite.organizationId) organizationIds.add(invite.organizationId);
    if (invite.teamId) teamIds.add(invite.teamId);
  });

  const [events, organizations, teams] = await Promise.all([
    eventIds.size
      ? prisma.events.findMany({
        where: { id: { in: Array.from(eventIds) } },
        select: { id: true, name: true },
      })
      : Promise.resolve([]),
    organizationIds.size
      ? prisma.organizations.findMany({
        where: { id: { in: Array.from(organizationIds) } },
        select: { id: true, name: true },
      })
      : Promise.resolve([]),
    teamIds.size
      ? prisma.teams.findMany({
        where: { id: { in: Array.from(teamIds) } },
        select: { id: true, name: true },
      })
      : Promise.resolve([]),
  ]);

  const eventNames = new Map(events.map((event) => [event.id, event.name]));
  const organizationNames = new Map(organizations.map((org) => [org.id, org.name]));
  const teamNames = new Map(teams.map((team) => [team.id, team.name]));

  const results = await Promise.all(invites.map(async (invite) => {
    const email = normalizeEmail(invite.email);
    if (!email || !EMAIL_REGEX.test(email)) {
      return { id: invite.id, status: null };
    }

    const content = buildInviteEmail({
      baseUrl,
      email,
      inviteType: invite.type,
      firstName: invite.firstName,
      lastName: invite.lastName,
      eventId: invite.eventId,
      eventName: invite.eventId ? eventNames.get(invite.eventId) : undefined,
      organizationId: invite.organizationId,
      organizationName: invite.organizationId ? organizationNames.get(invite.organizationId) : undefined,
      teamId: invite.teamId,
      teamName: invite.teamId ? teamNames.get(invite.teamId) : undefined,
    });

    try {
      await sendEmail({
        to: email,
        subject: content.subject,
        text: content.text,
        html: content.html,
      });

      const inviteUserId = invite.userId?.trim();
      if (inviteUserId) {
        await sendPushToUsers({
          userIds: [inviteUserId],
          title: content.subject,
          body: 'You have a new invitation in MVP. Open the app to review it.',
          data: {
            inviteId: invite.id,
            inviteType: invite.type ?? '',
            eventId: invite.eventId ?? '',
            organizationId: invite.organizationId ?? '',
            teamId: invite.teamId ?? '',
          },
        }).catch((error) => {
          console.warn('Failed to send invite push notification', { inviteId: invite.id, error });
        });
      }

      return { id: invite.id, status: 'sent' };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('Failed to send invite email', { inviteId: invite.id, error: message });
      return { id: invite.id, status: 'failed' };
    }
  }));

  const statusUpdates = results.filter((result) => result.status === 'sent' || result.status === 'failed');
  if (statusUpdates.length) {
    await Promise.all(statusUpdates.map((update) => (
      prisma.invites.update({
        where: { id: update.id },
        data: { status: update.status },
      })
    )));
  }

  const statusMap = new Map(statusUpdates.map((update) => [update.id, update.status]));
  return invites.map((invite) => {
    const nextStatus = statusMap.get(invite.id);
    if (!nextStatus) return invite;
    return { ...invite, status: nextStatus };
  });
};
