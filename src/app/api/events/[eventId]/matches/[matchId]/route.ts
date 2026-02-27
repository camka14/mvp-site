import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { loadEventWithRelations, saveMatches, saveTeamRecords } from '@/server/repositories/events';
import { acquireEventLock } from '@/server/repositories/locks';
import {
  applyMatchUpdates,
  applyPersistentAutoLock,
  finalizeMatch,
  isScheduleWindowExceededError,
} from '@/server/scheduler/updateMatch';
import { serializeMatchesLegacy } from '@/server/scheduler/serialize';
import { SchedulerContext } from '@/server/scheduler/types';
import { canManageEvent } from '@/server/accessControl';
import { isEmailEnabled, sendEmail } from '@/server/email';
import { sendPushToUsers } from '@/server/pushNotifications';

export const dynamic = 'force-dynamic';

const updateSchema = z.object({
  locked: z.boolean().optional(),
  team1Points: z.array(z.number()).optional(),
  team2Points: z.array(z.number()).optional(),
  setResults: z.array(z.number()).optional(),
  team1Id: z.string().nullable().optional(),
  team2Id: z.string().nullable().optional(),
  refereeId: z.string().nullable().optional(),
  teamRefereeId: z.string().nullable().optional(),
  fieldId: z.string().nullable().optional(),
  previousLeftId: z.string().nullable().optional(),
  previousRightId: z.string().nullable().optional(),
  winnerNextMatchId: z.string().nullable().optional(),
  loserNextMatchId: z.string().nullable().optional(),
  side: z.string().nullable().optional(),
  refereeCheckedIn: z.boolean().optional(),
  matchId: z.number().int().nullable().optional(),
  finalize: z.boolean().optional(),
  time: z.string().optional(),
});

const buildContext = (): SchedulerContext => {
  const debug = process.env.SCHEDULER_DEBUG === 'true';
  return {
    log: (message) => {
      if (debug) console.log(message);
    },
    error: (message) => {
      console.error(message);
    },
  };
};

type AutoRescheduleHostNotification = {
  eventId: string;
  eventName: string;
  eventEndIso: string;
  hostId: string;
  matchId: string;
};

class AutoRescheduleWindowExceededError extends Error {
  notification: AutoRescheduleHostNotification;

  constructor(notification: AutoRescheduleHostNotification) {
    super('Auto-reschedule exceeded event end date/time');
    this.name = 'AutoRescheduleWindowExceededError';
    this.notification = notification;
  }
}

const formatHostName = (profile?: { firstName: string | null; lastName: string | null; userName: string | null } | null): string => {
  const firstName = profile?.firstName?.trim() ?? '';
  const lastName = profile?.lastName?.trim() ?? '';
  const fullName = `${firstName} ${lastName}`.trim();
  if (fullName.length > 0) {
    return fullName;
  }
  const userName = profile?.userName?.trim() ?? '';
  if (userName.length > 0) {
    return userName;
  }
  return 'Host';
};

const normalizeIdToken = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

const isUserOnTeam = (team: unknown, userId: string): boolean => {
  if (!team || typeof team !== 'object') {
    return false;
  }
  const teamRecord = team as Record<string, unknown>;
  const memberIds = new Set<string>();
  const addId = (value: unknown) => {
    const normalized = normalizeIdToken(value);
    if (normalized) {
      memberIds.add(normalized);
    }
  };
  const addIdsFromList = (value: unknown) => {
    if (!Array.isArray(value)) {
      return;
    }
    value.forEach((entry) => {
      if (typeof entry === 'string') {
        addId(entry);
        return;
      }
      if (entry && typeof entry === 'object') {
        const row = entry as Record<string, unknown>;
        addId(row.id ?? row.$id);
      }
    });
  };

  addId(teamRecord.captainId);
  addId(teamRecord.managerId);
  addId(teamRecord.headCoachId);

  if (teamRecord.captain && typeof teamRecord.captain === 'object') {
    const captain = teamRecord.captain as Record<string, unknown>;
    addId(captain.id ?? captain.$id);
  }
  if (teamRecord.manager && typeof teamRecord.manager === 'object') {
    const manager = teamRecord.manager as Record<string, unknown>;
    addId(manager.id ?? manager.$id);
  }
  if (teamRecord.headCoach && typeof teamRecord.headCoach === 'object') {
    const headCoach = teamRecord.headCoach as Record<string, unknown>;
    addId(headCoach.id ?? headCoach.$id);
  }

  addIdsFromList(teamRecord.playerIds);
  addIdsFromList(teamRecord.coachIds);
  addIdsFromList(teamRecord.assistantCoachIds);
  addIdsFromList(teamRecord.players);
  addIdsFromList(teamRecord.coaches);
  addIdsFromList(teamRecord.assistantCoaches);

  return memberIds.has(userId);
};

const notifyHostOfAutoRescheduleFailure = async (
  payload: AutoRescheduleHostNotification,
): Promise<void> => {
  if (!payload.hostId.trim()) {
    return;
  }
  const [hostProfile, sensitiveProfile] = await Promise.all([
    prisma.userData.findUnique({
      where: { id: payload.hostId },
      select: { firstName: true, lastName: true, userName: true },
    }),
    prisma.sensitiveUserData.findFirst({
      where: { userId: payload.hostId },
      select: { email: true },
    }),
  ]);
  const hostName = formatHostName(hostProfile);
  const title = `Auto-reschedule failed for ${payload.eventName}`;
  const body = `A finalized match could not be auto-rescheduled before ${payload.eventEndIso}. Extend the event end date/time for auto-rescheduling or reschedule manually.`;

  await sendPushToUsers({
    userIds: [payload.hostId],
    title,
    body,
    data: {
      eventId: payload.eventId,
      matchId: payload.matchId,
      reason: 'fixed_end_limit',
    },
  }).catch((error) => {
    console.warn('Failed to send auto-reschedule failure push notification', {
      eventId: payload.eventId,
      hostId: payload.hostId,
      error,
    });
  });

  const hostEmail = sensitiveProfile?.email?.trim();
  if (!hostEmail || !isEmailEnabled()) {
    return;
  }
  await sendEmail({
    to: hostEmail,
    subject: title,
    text: `Hello ${hostName},\n\n${body}\n\nEvent: ${payload.eventName}\nEvent ID: ${payload.eventId}\nMatch ID: ${payload.matchId}\n\nYou can extend the event end date/time to continue auto-rescheduling, or reschedule this match manually.`,
  }).catch((error) => {
    console.warn('Failed to send auto-reschedule failure email notification', {
      eventId: payload.eventId,
      hostId: payload.hostId,
      error,
    });
  });
};

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ eventId: string; matchId: string }> }) {
  try {
    const session = await requireSession(req);
    const body = await req.json().catch(() => null);
    const parsed = updateSchema.safeParse(body ?? {});
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
    }

    const { eventId, matchId } = await params;
    const context = buildContext();

    const result = await prisma.$transaction(async (tx) => {
      await acquireEventLock(tx, eventId);
      const eventAccess = await tx.events.findUnique({
        where: { id: eventId },
        select: { id: true, hostId: true, assistantHostIds: true, organizationId: true },
      });
      if (!eventAccess) {
        throw new Response('Event not found', { status: 404 });
      }
      const isHostOrAdmin = await canManageEvent(session, eventAccess, tx);
      const event = await loadEventWithRelations(eventId, tx);

      const isEventReferee = Array.isArray((event as any).referees) && (event as any).referees.some((ref: any) => {
        const refId = normalizeIdToken(ref?.id ?? ref?.$id);
        return refId === session.userId;
      });

      const targetMatch = event.matches[matchId];
      if (!targetMatch) {
        throw new Response('Match not found', { status: 404 });
      }

      const eventTeams = Array.isArray((event as any).teams)
        ? ((event as any).teams as unknown[])
        : Object.values(((event as any).teams ?? {}) as Record<string, unknown>);
      const userEventTeamIds = new Set<string>();
      eventTeams.forEach((team) => {
        if (!isUserOnTeam(team, session.userId)) {
          return;
        }
        if (!team || typeof team !== 'object') {
          return;
        }
        const row = team as Record<string, unknown>;
        const teamId = normalizeIdToken(row.id ?? row.$id);
        if (teamId) {
          userEventTeamIds.add(teamId);
        }
      });
      const assignedTeamRefereeId = normalizeIdToken((targetMatch as any).teamReferee?.id ?? (targetMatch as any).teamReferee?.$id);
      const matchRefereeCheckedIn = targetMatch.refereeCheckedIn === true;
      const isTeamRefereeMember = isUserOnTeam((targetMatch as any).teamReferee, session.userId);
      const isAssignedRefereeUser = normalizeIdToken((targetMatch as any).referee?.id ?? (targetMatch as any).referee?.$id) === session.userId;
      const isAssignedTeamRefById = Boolean(assignedTeamRefereeId && userEventTeamIds.has(assignedTeamRefereeId));
      const isReferee = Boolean(isEventReferee || isTeamRefereeMember || isAssignedRefereeUser || isAssignedTeamRefById);
      const canEventTeamSwap =
        !isHostOrAdmin &&
        !isReferee &&
        event.doTeamsRef === true &&
        event.teamRefsMaySwap === true &&
        !matchRefereeCheckedIn &&
        userEventTeamIds.size > 0;

      if (!isHostOrAdmin && !isReferee && !canEventTeamSwap) {
        throw new Response('Forbidden', { status: 403 });
      }

      if (!['LEAGUE', 'TOURNAMENT'].includes(event.eventType)) {
        throw new Response('Unsupported event type', { status: 400 });
      }

      let updates: z.infer<typeof updateSchema>;
      if (isHostOrAdmin) {
        updates = parsed.data;
      } else if (canEventTeamSwap) {
        const requestedKeys = Object.entries(parsed.data)
          .filter(([, value]) => value !== undefined)
          .map(([key]) => key);
        const swapOnlyKeys = new Set(['teamRefereeId', 'refereeCheckedIn']);
        if (requestedKeys.some((key) => !swapOnlyKeys.has(key))) {
          throw new Response('Forbidden', { status: 403 });
        }

        const requestedTeamRefereeId = normalizeIdToken(parsed.data.teamRefereeId);
        const isEventTeamRefereeId = eventTeams.some((team) => {
          if (!team || typeof team !== 'object') {
            return false;
          }
          const row = team as Record<string, unknown>;
          const teamId = normalizeIdToken(row.id ?? row.$id);
          return teamId === requestedTeamRefereeId;
        });
        if (
          !requestedTeamRefereeId ||
          !userEventTeamIds.has(requestedTeamRefereeId) ||
          !isEventTeamRefereeId
        ) {
          throw new Response('Forbidden', { status: 403 });
        }

        updates = {
          teamRefereeId: requestedTeamRefereeId,
          // Swap-only action; check-in is a follow-up referee action.
          refereeCheckedIn: false,
        };
      } else {
        updates = {
          team1Points: parsed.data.team1Points,
          team2Points: parsed.data.team2Points,
          setResults: parsed.data.setResults,
          refereeCheckedIn: parsed.data.refereeCheckedIn,
          teamRefereeId: parsed.data.teamRefereeId ?? assignedTeamRefereeId ?? null,
          finalize: parsed.data.finalize,
          time: parsed.data.time,
        };
      }

      applyMatchUpdates(event, targetMatch, updates);

      const lockEvaluationTime = (() => {
        if (typeof updates.time === 'string' && updates.time.trim().length > 0) {
          const parsedTime = new Date(updates.time);
          if (!Number.isNaN(parsedTime.getTime())) {
            return parsedTime;
          }
        }
        return new Date();
      })();

      if (updates.finalize) {
        const currentTime = updates.time ? new Date(updates.time) : new Date();
        if (Number.isNaN(currentTime.getTime())) {
          throw new Response('Invalid time', { status: 400 });
        }
        try {
          finalizeMatch(event, targetMatch, context, currentTime);
        } catch (error) {
          const noFixedEndDateTime = typeof event.noFixedEndDateTime === 'boolean'
            ? event.noFixedEndDateTime
            : event.start.getTime() === event.end.getTime();
          if (!noFixedEndDateTime && isScheduleWindowExceededError(error)) {
            throw new AutoRescheduleWindowExceededError({
              eventId: event.id,
              eventName: event.name || 'Untitled event',
              eventEndIso: event.end.toISOString(),
              hostId: event.hostId,
              matchId: targetMatch.id,
            });
          }
          throw error;
        }
      }

      applyPersistentAutoLock(targetMatch, {
        now: lockEvaluationTime,
        explicitLockedValue: updates.locked,
      });

      await saveMatches(eventId, Object.values(event.matches), tx);
      await saveTeamRecords(Object.values(event.teams), tx);

      return targetMatch;
    });

    return NextResponse.json({ match: serializeMatchesLegacy([result])[0] }, { status: 200 });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof AutoRescheduleWindowExceededError) {
      await notifyHostOfAutoRescheduleFailure(error.notification);
      return NextResponse.json({
        error: 'Auto-reschedule failed because the event end date/time has been reached. Extend the end date/time for auto-rescheduling, or reschedule manually.',
        code: 'AUTO_RESCHEDULE_END_LIMIT',
      }, { status: 409 });
    }
    console.error('Match update failed', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ eventId: string; matchId: string }> }) {
  try {
    const session = await requireSession(req);
    const { eventId, matchId } = await params;
    const event = await prisma.events.findUnique({ where: { id: eventId } });
    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }
    if (!(await canManageEvent(session, event))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await prisma.matches.delete({ where: { id: matchId } });
    return NextResponse.json({ deleted: true }, { status: 200 });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('Match delete failed', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
