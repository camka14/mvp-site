import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { loadEventWithRelations, saveMatches } from '@/server/repositories/events';
import { acquireEventLock } from '@/server/repositories/locks';
import {
  applyMatchUpdates,
  applyPersistentAutoLock,
  finalizeMatch,
  isScheduleWindowExceededError,
  type MatchUpdate,
} from '@/server/scheduler/updateMatch';
import { serializeMatchesLegacy } from '@/server/scheduler/serialize';
import { SchedulerContext } from '@/server/scheduler/types';
import { canManageEvent } from '@/server/accessControl';
import { isEmailEnabled, sendEmail } from '@/server/email';
import { sendPushToUsers } from '@/server/pushNotifications';
import {
  normalizeMatchOfficialAssignments,
} from '@/server/officials/config';
import type { MatchIncident, MatchSegment } from '@/types';

export const dynamic = 'force-dynamic';

const scoreMapSchema = z.record(z.string(), z.number());
const lifecycleSchema = z.object({
  status: z.string().nullable().optional(),
  resultStatus: z.string().nullable().optional(),
  resultType: z.string().nullable().optional(),
  actualStart: z.string().nullable().optional(),
  actualEnd: z.string().nullable().optional(),
  statusReason: z.string().nullable().optional(),
  winnerEventTeamId: z.string().nullable().optional(),
}).optional();
const segmentOperationSchema = z.object({
  id: z.string().optional(),
  sequence: z.number().int().positive(),
  status: z.string().optional(),
  scores: scoreMapSchema.optional(),
  winnerEventTeamId: z.string().nullable().optional(),
  startedAt: z.string().nullable().optional(),
  endedAt: z.string().nullable().optional(),
  resultType: z.string().nullable().optional(),
  statusReason: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
});
const incidentOperationSchema = z.object({
  action: z.enum(['CREATE', 'UPDATE', 'DELETE']),
  id: z.string().optional(),
  segmentId: z.string().nullable().optional(),
  eventTeamId: z.string().nullable().optional(),
  eventRegistrationId: z.string().nullable().optional(),
  participantUserId: z.string().nullable().optional(),
  officialUserId: z.string().nullable().optional(),
  incidentType: z.string().optional(),
  sequence: z.number().int().positive().optional(),
  minute: z.number().int().nullable().optional(),
  clock: z.string().nullable().optional(),
  clockSeconds: z.number().int().nullable().optional(),
  linkedPointDelta: z.number().int().nullable().optional(),
  note: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
});
const officialCheckInSchema = z.object({
  positionId: z.string().optional(),
  slotIndex: z.number().int().nonnegative().optional(),
  userId: z.string().optional(),
  checkedIn: z.boolean(),
}).optional();

const updateSchema = z.object({
  locked: z.boolean().optional(),
  team1Points: z.array(z.number()).optional(),
  team2Points: z.array(z.number()).optional(),
  setResults: z.array(z.number()).optional(),
  lifecycle: lifecycleSchema,
  segmentOperations: z.array(segmentOperationSchema).optional(),
  incidentOperations: z.array(incidentOperationSchema).optional(),
  officialCheckIn: officialCheckInSchema,
  team1Id: z.string().nullable().optional(),
  team2Id: z.string().nullable().optional(),
  officialId: z.string().nullable().optional(),
  officialIds: z.any().optional(),
  teamOfficialId: z.string().nullable().optional(),
  fieldId: z.string().nullable().optional(),
  previousLeftId: z.string().nullable().optional(),
  previousRightId: z.string().nullable().optional(),
  winnerNextMatchId: z.string().nullable().optional(),
  loserNextMatchId: z.string().nullable().optional(),
  side: z.string().nullable().optional(),
  officialCheckedIn: z.boolean().optional(),
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

const normalizeOfficialAssignmentsOrThrow = (
  value: unknown,
  options: Parameters<typeof normalizeMatchOfficialAssignments>[1],
): ReturnType<typeof normalizeMatchOfficialAssignments> => {
  try {
    return normalizeMatchOfficialAssignments(value, options);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid official assignments.';
    throw new Response(message, { status: 400 });
  }
};

const parseNullableDate = (value: string | null | undefined): Date | null | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (value === null || value.trim().length === 0) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Response('Invalid date value', { status: 400 });
  }
  return parsed;
};

const hasOperationalUpdate = (data: z.infer<typeof updateSchema>): boolean => Boolean(
  data.lifecycle
  || (Array.isArray(data.segmentOperations) && data.segmentOperations.length > 0)
  || (Array.isArray(data.incidentOperations) && data.incidentOperations.length > 0)
  || data.officialCheckIn,
);

const syncLegacyArraysFromSegments = (match: any) => {
  const segments = Array.isArray(match.segments)
    ? [...match.segments].sort((left: MatchSegment, right: MatchSegment) => left.sequence - right.sequence)
    : [];
  if (!segments.length) {
    return;
  }
  const team1Id = normalizeIdToken(match.team1?.id ?? match.team1?.$id);
  const team2Id = normalizeIdToken(match.team2?.id ?? match.team2?.$id);
  match.team1Points = segments.map((segment) => team1Id ? Number(segment.scores?.[team1Id] ?? 0) : 0);
  match.team2Points = segments.map((segment) => team2Id ? Number(segment.scores?.[team2Id] ?? 0) : 0);
  match.setResults = segments.map((segment) => {
    const winner = normalizeIdToken(segment.winnerEventTeamId);
    if (winner && team1Id && winner === team1Id) return 1;
    if (winner && team2Id && winner === team2Id) return 2;
    return 0;
  });
};

const resolveWinnerEventTeamIdFromSegments = (match: any): string | null => {
  const segments = Array.isArray(match.segments)
    ? [...match.segments].sort((left: MatchSegment, right: MatchSegment) => left.sequence - right.sequence)
    : [];
  const team1Id = normalizeIdToken(match.team1?.id ?? match.team1?.$id);
  const team2Id = normalizeIdToken(match.team2?.id ?? match.team2?.$id);
  if (!segments.length || !team1Id || !team2Id) {
    return null;
  }

  const rules = (match.matchRulesSnapshot ?? match.resolvedMatchRules ?? {}) as { scoringModel?: string; segmentCount?: number };
  const scoringModel = typeof rules.scoringModel === 'string' ? rules.scoringModel : null;
  if (scoringModel === 'SETS') {
    const completedWinnerIds = segments
      .filter((segment) => segment.status === 'COMPLETE' || Boolean(segment.winnerEventTeamId))
      .map((segment) => normalizeIdToken(segment.winnerEventTeamId))
      .filter((winnerId): winnerId is string => Boolean(winnerId));
    const team1Wins = completedWinnerIds.filter((winnerId) => winnerId === team1Id).length;
    const team2Wins = completedWinnerIds.filter((winnerId) => winnerId === team2Id).length;
    const configuredSegmentCount = Number(rules.segmentCount);
    const segmentCount = Number.isFinite(configuredSegmentCount) && configuredSegmentCount > 0
      ? Math.trunc(configuredSegmentCount)
      : Math.max(segments.length, 1);
    const winsNeeded = Math.max(1, Math.ceil(segmentCount / 2));
    if (team1Wins >= winsNeeded || team2Wins >= winsNeeded) {
      return team1Wins >= team2Wins ? team1Id : team2Id;
    }
    return null;
  }

  if (!segments.every((segment) => segment.status === 'COMPLETE')) {
    return null;
  }
  const team1Total = segments.reduce((total, segment) => total + Number(segment.scores?.[team1Id] ?? 0), 0);
  const team2Total = segments.reduce((total, segment) => total + Number(segment.scores?.[team2Id] ?? 0), 0);
  if (team1Total === team2Total) {
    return null;
  }
  return team1Total > team2Total ? team1Id : team2Id;
};

const applyIncidentScoreDelta = (match: any, incident: Pick<MatchIncident, 'segmentId' | 'eventTeamId' | 'linkedPointDelta'>, multiplier: 1 | -1) => {
  const segmentId = normalizeIdToken(incident.segmentId);
  const eventTeamId = normalizeIdToken(incident.eventTeamId);
  const delta = Number(incident.linkedPointDelta ?? 0);
  if (!segmentId || !eventTeamId || !Number.isFinite(delta) || delta === 0) {
    return;
  }
  const segments: MatchSegment[] = Array.isArray(match.segments)
    ? match.segments.map((segment: MatchSegment) => ({ ...segment, scores: { ...(segment.scores ?? {}) } }))
    : [];
  const segmentIndex = segments.findIndex((segment) => segment.id === segmentId || segment.$id === segmentId);
  if (segmentIndex < 0) {
    return;
  }
  const segment = segments[segmentIndex];
  const currentScore = Number(segment.scores?.[eventTeamId] ?? 0);
  const nextScore = Math.max(0, Math.trunc((Number.isFinite(currentScore) ? currentScore : 0) + delta * multiplier));
  segments[segmentIndex] = {
    ...segment,
    status: segment.status === 'NOT_STARTED' && nextScore > 0 ? 'IN_PROGRESS' : segment.status,
    scores: {
      ...(segment.scores ?? {}),
      [eventTeamId]: nextScore,
    },
  };
  match.segments = segments.sort((left, right) => left.sequence - right.sequence);
};

const applyLifecycleOperation = (match: any, lifecycle: NonNullable<z.infer<typeof lifecycleSchema>>) => {
  if (Object.prototype.hasOwnProperty.call(lifecycle, 'status')) {
    match.status = lifecycle.status ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(lifecycle, 'resultStatus')) {
    match.resultStatus = lifecycle.resultStatus ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(lifecycle, 'resultType')) {
    match.resultType = lifecycle.resultType ?? null;
  }
  const actualStart = parseNullableDate(lifecycle.actualStart);
  if (actualStart !== undefined) {
    match.actualStart = actualStart;
  }
  const actualEnd = parseNullableDate(lifecycle.actualEnd);
  if (actualEnd !== undefined) {
    match.actualEnd = actualEnd;
  }
  if (Object.prototype.hasOwnProperty.call(lifecycle, 'statusReason')) {
    match.statusReason = lifecycle.statusReason ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(lifecycle, 'winnerEventTeamId')) {
    match.winnerEventTeamId = lifecycle.winnerEventTeamId ?? null;
  }
};

const applyOfficialCheckInOperation = (
  match: any,
  checkIn: NonNullable<z.infer<typeof officialCheckInSchema>>,
  fallbackUserId: string,
) => {
  const userId = normalizeIdToken(checkIn.userId) ?? fallbackUserId;
  if (Array.isArray(match.officialAssignments) && match.officialAssignments.length > 0) {
    let matched = false;
    match.officialAssignments = match.officialAssignments.map((assignment: any) => {
      const positionMatches = checkIn.positionId ? assignment.positionId === checkIn.positionId : true;
      const slotMatches = typeof checkIn.slotIndex === 'number' ? assignment.slotIndex === checkIn.slotIndex : true;
      const userMatches = userId ? assignment.userId === userId : true;
      if (positionMatches && slotMatches && userMatches) {
        matched = true;
        return { ...assignment, checkedIn: checkIn.checkedIn };
      }
      return assignment;
    });
    if (matched) {
      match.officialCheckedIn = match.officialAssignments.some((assignment: any) => assignment.checkedIn === true);
      return;
    }
  }
  match.officialCheckedIn = checkIn.checkedIn;
};

const applySegmentOperations = (
  match: any,
  event: any,
  operations: Array<z.infer<typeof segmentOperationSchema>> | undefined,
) => {
  if (!Array.isArray(operations) || operations.length === 0) {
    return;
  }
  const segments: MatchSegment[] = Array.isArray(match.segments)
    ? match.segments.map((segment: MatchSegment) => ({ ...segment, scores: { ...(segment.scores ?? {}) } }))
    : [];
  const pointIncidentType = event.resolvedMatchRules?.autoCreatePointIncidentType ?? 'POINT';
  const shouldAutoIncident = event.autoCreatePointMatchIncidents === true;
  const incidents: MatchIncident[] = Array.isArray(match.incidents) ? [...match.incidents] : [];
  for (const operation of operations) {
    const existingIndex = segments.findIndex((segment) => (
      (operation.id && segment.id === operation.id) || segment.sequence === operation.sequence
    ));
    const existing = existingIndex >= 0
      ? segments[existingIndex]
      : {
          id: operation.id ?? `${match.id}_segment_${operation.sequence}`,
          $id: operation.id ?? `${match.id}_segment_${operation.sequence}`,
          eventId: event.id,
          matchId: match.id,
          sequence: operation.sequence,
          status: 'NOT_STARTED',
          scores: {},
          winnerEventTeamId: null,
        } as MatchSegment;
    const previousScores = { ...(existing.scores ?? {}) };
    const next: MatchSegment = {
      ...existing,
      id: operation.id ?? existing.id,
      $id: operation.id ?? existing.$id ?? existing.id,
      eventId: event.id,
      matchId: match.id,
      sequence: operation.sequence,
      status: (operation.status ?? existing.status ?? 'NOT_STARTED') as MatchSegment['status'],
      scores: operation.scores ? { ...operation.scores } : { ...(existing.scores ?? {}) },
      winnerEventTeamId: Object.prototype.hasOwnProperty.call(operation, 'winnerEventTeamId')
        ? operation.winnerEventTeamId ?? null
        : existing.winnerEventTeamId ?? null,
      startedAt: Object.prototype.hasOwnProperty.call(operation, 'startedAt')
        ? operation.startedAt ?? null
        : existing.startedAt ?? null,
      endedAt: Object.prototype.hasOwnProperty.call(operation, 'endedAt')
        ? operation.endedAt ?? null
        : existing.endedAt ?? null,
      resultType: Object.prototype.hasOwnProperty.call(operation, 'resultType')
        ? operation.resultType ?? null
        : existing.resultType ?? null,
      statusReason: Object.prototype.hasOwnProperty.call(operation, 'statusReason')
        ? operation.statusReason ?? null
        : existing.statusReason ?? null,
      metadata: Object.prototype.hasOwnProperty.call(operation, 'metadata')
        ? operation.metadata ?? null
        : existing.metadata ?? null,
    };
    if (existingIndex >= 0) {
      segments[existingIndex] = next;
    } else {
      segments.push(next);
    }
    if (shouldAutoIncident && operation.scores) {
      for (const [eventTeamId, score] of Object.entries(operation.scores)) {
        const previous = Number(previousScores[eventTeamId] ?? 0);
        const delta = Number(score) - previous;
        if (delta === 0) {
          continue;
        }
        const sequence = incidents.length
          ? Math.max(...incidents.map((incident) => Number(incident.sequence) || 0)) + 1
          : 1;
        incidents.push({
          id: randomUUID(),
          $id: undefined,
          eventId: event.id,
          matchId: match.id,
          segmentId: next.id,
          eventTeamId,
          eventRegistrationId: null,
          participantUserId: null,
          officialUserId: null,
          incidentType: pointIncidentType,
          sequence,
          linkedPointDelta: delta,
          minute: null,
          clock: null,
          clockSeconds: null,
          note: null,
          metadata: null,
        });
      }
    }
  }
  match.segments = segments.sort((left, right) => left.sequence - right.sequence);
  match.incidents = incidents.sort((left, right) => left.sequence - right.sequence);
  match.winnerEventTeamId = resolveWinnerEventTeamIdFromSegments(match) ?? match.winnerEventTeamId ?? null;
  syncLegacyArraysFromSegments(match);
};

const applyIncidentOperations = (
  match: any,
  event: any,
  operations: Array<z.infer<typeof incidentOperationSchema>> | undefined,
) => {
  if (!Array.isArray(operations) || operations.length === 0) {
    return;
  }
  let incidents: MatchIncident[] = Array.isArray(match.incidents) ? [...match.incidents] : [];
  for (const operation of operations) {
    if (operation.action === 'DELETE') {
      if (operation.id) {
        const removedIncident = incidents.find((incident) => incident.id === operation.id);
        if (removedIncident) {
          applyIncidentScoreDelta(match, removedIncident, -1);
        }
        incidents = incidents.filter((incident) => incident.id !== operation.id);
      }
      continue;
    }
    if (operation.action === 'CREATE') {
      const sequence = operation.sequence ?? (
        incidents.length ? Math.max(...incidents.map((incident) => Number(incident.sequence) || 0)) + 1 : 1
      );
      const incident: MatchIncident = {
        id: operation.id ?? randomUUID(),
        eventId: event.id,
        matchId: match.id,
        segmentId: operation.segmentId ?? null,
        eventTeamId: operation.eventTeamId ?? null,
        eventRegistrationId: operation.eventRegistrationId ?? null,
        participantUserId: operation.participantUserId ?? null,
        officialUserId: operation.officialUserId ?? null,
        incidentType: operation.incidentType ?? 'NOTE',
        sequence,
        minute: operation.minute ?? null,
        clock: operation.clock ?? null,
        clockSeconds: operation.clockSeconds ?? null,
        linkedPointDelta: operation.linkedPointDelta ?? null,
        note: operation.note ?? null,
        metadata: operation.metadata ?? null,
      };
      incidents.push(incident);
      applyIncidentScoreDelta(match, incident, 1);
      continue;
    }
    const index = operation.id ? incidents.findIndex((incident) => incident.id === operation.id) : -1;
    if (index < 0) {
      continue;
    }
    applyIncidentScoreDelta(match, incidents[index], -1);
    const updatedIncident: MatchIncident = {
      ...incidents[index],
      segmentId: Object.prototype.hasOwnProperty.call(operation, 'segmentId') ? operation.segmentId ?? null : incidents[index].segmentId,
      eventTeamId: Object.prototype.hasOwnProperty.call(operation, 'eventTeamId') ? operation.eventTeamId ?? null : incidents[index].eventTeamId,
      eventRegistrationId: Object.prototype.hasOwnProperty.call(operation, 'eventRegistrationId') ? operation.eventRegistrationId ?? null : incidents[index].eventRegistrationId,
      participantUserId: Object.prototype.hasOwnProperty.call(operation, 'participantUserId') ? operation.participantUserId ?? null : incidents[index].participantUserId,
      officialUserId: Object.prototype.hasOwnProperty.call(operation, 'officialUserId') ? operation.officialUserId ?? null : incidents[index].officialUserId,
      incidentType: operation.incidentType ?? incidents[index].incidentType,
      sequence: operation.sequence ?? incidents[index].sequence,
      minute: Object.prototype.hasOwnProperty.call(operation, 'minute') ? operation.minute ?? null : incidents[index].minute,
      clock: Object.prototype.hasOwnProperty.call(operation, 'clock') ? operation.clock ?? null : incidents[index].clock,
      clockSeconds: Object.prototype.hasOwnProperty.call(operation, 'clockSeconds') ? operation.clockSeconds ?? null : incidents[index].clockSeconds,
      linkedPointDelta: Object.prototype.hasOwnProperty.call(operation, 'linkedPointDelta') ? operation.linkedPointDelta ?? null : incidents[index].linkedPointDelta,
      note: Object.prototype.hasOwnProperty.call(operation, 'note') ? operation.note ?? null : incidents[index].note,
      metadata: Object.prototype.hasOwnProperty.call(operation, 'metadata') ? operation.metadata ?? null : incidents[index].metadata,
    };
    incidents[index] = updatedIncident;
    applyIncidentScoreDelta(match, updatedIncident, 1);
  }
  match.incidents = incidents.sort((left, right) => left.sequence - right.sequence);
  match.winnerEventTeamId = resolveWinnerEventTeamIdFromSegments(match) ?? match.winnerEventTeamId ?? null;
  syncLegacyArraysFromSegments(match);
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
      const officialPositions = Array.isArray(event.officialPositions) ? event.officialPositions : [];
      const eventOfficials = Array.isArray(event.eventOfficials) ? event.eventOfficials : [];
      const positionCountsById = new Map(officialPositions.map((position) => [position.id, position.count]));
      const eventOfficialsById = new Map(eventOfficials.map((official) => [official.id, official]));

      const isEventOfficial = Array.isArray((event as any).officials) && (event as any).officials.some((official: any) => {
        const officialId = normalizeIdToken(official?.id ?? official?.$id);
        return officialId === session.userId;
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
      const assignedTeamOfficialId = normalizeIdToken((targetMatch as any).teamOfficial?.id ?? (targetMatch as any).teamOfficial?.$id);
      const matchOfficialCheckedIn = targetMatch.officialCheckedIn === true;
      const isTeamOfficialMember = isUserOnTeam((targetMatch as any).teamOfficial, session.userId);
      const isAssignedOfficialUser = normalizeIdToken((targetMatch as any).official?.id ?? (targetMatch as any).official?.$id) === session.userId;
      const isAssignedTeamOfficialById = Boolean(assignedTeamOfficialId && userEventTeamIds.has(assignedTeamOfficialId));
      const isOfficial = Boolean(isEventOfficial || isTeamOfficialMember || isAssignedOfficialUser || isAssignedTeamOfficialById);
      const canEventTeamSwap =
        !isHostOrAdmin &&
        !isOfficial &&
        event.doTeamsOfficiate === true &&
        event.teamOfficialsMaySwap === true &&
        !matchOfficialCheckedIn &&
        userEventTeamIds.size > 0;

      if (!isHostOrAdmin && !isOfficial && !canEventTeamSwap) {
        throw new Response('Forbidden', { status: 403 });
      }

      if (!['LEAGUE', 'TOURNAMENT'].includes(event.eventType)) {
        throw new Response('Unsupported event type', { status: 400 });
      }

      let updates: MatchUpdate & { finalize?: boolean; time?: string };
      if (isHostOrAdmin) {
        updates = { ...parsed.data };
      } else if (canEventTeamSwap) {
        const requestedKeys = Object.entries(parsed.data)
          .filter(([, value]) => value !== undefined)
          .map(([key]) => key);
        const swapOnlyKeys = new Set(['teamOfficialId', 'officialCheckedIn']);
        if (requestedKeys.some((key) => !swapOnlyKeys.has(key))) {
          throw new Response('Forbidden', { status: 403 });
        }

        const requestedTeamOfficialId = normalizeIdToken(parsed.data.teamOfficialId);
        const isEventTeamOfficialId = eventTeams.some((team) => {
          if (!team || typeof team !== 'object') {
            return false;
          }
          const row = team as Record<string, unknown>;
          const teamId = normalizeIdToken(row.id ?? row.$id);
          return teamId === requestedTeamOfficialId;
        });
        if (
          !requestedTeamOfficialId ||
          !userEventTeamIds.has(requestedTeamOfficialId) ||
          !isEventTeamOfficialId
        ) {
          throw new Response('Forbidden', { status: 403 });
        }

        updates = {
          teamOfficialId: requestedTeamOfficialId,
          // Swap-only action; check-in is a follow-up official action.
          officialCheckedIn: false,
        };
      } else {
        updates = {
          team1Points: parsed.data.team1Points,
          team2Points: parsed.data.team2Points,
          setResults: parsed.data.setResults,
          officialCheckedIn: parsed.data.officialCheckedIn,
          officialAssignments: Object.prototype.hasOwnProperty.call(parsed.data, 'officialIds')
            ? normalizeOfficialAssignmentsOrThrow(parsed.data.officialIds, {
                positionCountsById,
                eventOfficialsById,
              })
            : undefined,
          teamOfficialId: parsed.data.teamOfficialId ?? assignedTeamOfficialId ?? null,
          finalize: parsed.data.finalize,
          time: parsed.data.time,
        };
      }

      if (Object.prototype.hasOwnProperty.call(updates, 'officialIds')) {
        delete (updates as Record<string, unknown>).officialIds;
      }

      if (Object.prototype.hasOwnProperty.call(parsed.data, 'officialIds') && isHostOrAdmin) {
        updates.officialAssignments = normalizeOfficialAssignmentsOrThrow(parsed.data.officialIds, {
          positionCountsById,
          eventOfficialsById,
        });
      }

      applyMatchUpdates(event, targetMatch, updates);
      const operationalUpdate = hasOperationalUpdate(parsed.data);
      if (operationalUpdate && !targetMatch.matchRulesSnapshot) {
        targetMatch.matchRulesSnapshot = (event as any).resolvedMatchRules ?? null;
        targetMatch.resolvedMatchRules = (event as any).resolvedMatchRules ?? null;
      }
      if (parsed.data.lifecycle) {
        if (!isHostOrAdmin) {
          throw new Response('Only hosts can update match lifecycle.', { status: 403 });
        }
        applyLifecycleOperation(targetMatch, parsed.data.lifecycle);
      }
      if (parsed.data.officialCheckIn) {
        applyOfficialCheckInOperation(targetMatch, parsed.data.officialCheckIn, session.userId);
      }
      applySegmentOperations(targetMatch, event, parsed.data.segmentOperations);
      applyIncidentOperations(targetMatch, event, parsed.data.incidentOperations);

      if (updates.officialCheckedIn === true || targetMatch.officialCheckedIn === true) {
        targetMatch.locked = true;
      }

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

      const incidentDeleteIds = (parsed.data.incidentOperations ?? [])
        .filter((operation) => operation.action === 'DELETE' && operation.id)
        .map((operation) => operation.id as string);
      if (incidentDeleteIds.length && typeof (tx as any).matchIncidents?.deleteMany === 'function') {
        await (tx as any).matchIncidents.deleteMany({
          where: { id: { in: incidentDeleteIds }, matchId: targetMatch.id },
        });
      }

      await saveMatches(eventId, Object.values(event.matches), tx);

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


