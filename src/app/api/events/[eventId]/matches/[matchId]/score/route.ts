import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { canManageEvent } from '@/server/accessControl';
import { loadEventWithRelations, saveMatches } from '@/server/repositories/events';
import { acquireEventLock } from '@/server/repositories/locks';
import { serializeMatchesLegacy } from '@/server/scheduler/serialize';
import type { MatchSegment } from '@/types';

export const dynamic = 'force-dynamic';

const scoreSetSchema = z.object({
  segmentId: z.string().nullable().optional(),
  sequence: z.number().int().positive(),
  eventTeamId: z.string().min(1),
  points: z.number().int().nonnegative(),
});

const normalizeIdToken = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
};

const isUserOnTeam = (team: unknown, userId: string): boolean => {
  if (!team || typeof team !== 'object') return false;
  const row = team as Record<string, unknown>;
  const memberIds = new Set<string>();
  const addId = (value: unknown) => {
    const normalized = normalizeIdToken(value);
    if (normalized) memberIds.add(normalized);
  };
  const addIdsFromList = (value: unknown) => {
    if (!Array.isArray(value)) return;
    value.forEach((entry) => {
      if (typeof entry === 'string') {
        addId(entry);
        return;
      }
      if (entry && typeof entry === 'object') {
        const item = entry as Record<string, unknown>;
        addId(item.id ?? item.$id ?? item.userId);
      }
    });
  };

  addId(row.captainId);
  addId(row.managerId);
  addId(row.headCoachId);
  if (row.captain && typeof row.captain === 'object') {
    const captain = row.captain as Record<string, unknown>;
    addId(captain.id ?? captain.$id);
  }
  if (row.manager && typeof row.manager === 'object') {
    const manager = row.manager as Record<string, unknown>;
    addId(manager.id ?? manager.$id);
  }
  if (row.headCoach && typeof row.headCoach === 'object') {
    const headCoach = row.headCoach as Record<string, unknown>;
    addId(headCoach.id ?? headCoach.$id);
  }
  addIdsFromList(row.playerIds);
  addIdsFromList(row.coachIds);
  addIdsFromList(row.assistantCoachIds);
  addIdsFromList(row.players);
  addIdsFromList(row.coaches);
  addIdsFromList(row.assistantCoaches);
  addIdsFromList(row.members);
  addIdsFromList(row.userIds);

  return memberIds.has(userId);
};

const matchRequiresPlayerRecordedScoring = (match: any, event: any): boolean => (
  event?.resolvedMatchRules?.pointIncidentRequiresParticipant === true
  || match?.resolvedMatchRules?.pointIncidentRequiresParticipant === true
  || match?.matchRulesSnapshot?.pointIncidentRequiresParticipant === true
);

const syncLegacyArraysFromSegments = (match: any) => {
  const segments = Array.isArray(match.segments)
    ? [...match.segments].sort((left: MatchSegment, right: MatchSegment) => left.sequence - right.sequence)
    : [];
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

export async function POST(req: NextRequest, { params }: { params: Promise<{ eventId: string; matchId: string }> }) {
  try {
    const session = await requireSession(req);
    const body = await req.json().catch(() => null);
    const parsed = scoreSetSchema.safeParse(body ?? {});
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
    }
    const { eventId, matchId } = await params;

    const result = await prisma.$transaction(async (tx) => {
      await acquireEventLock(tx, eventId);
      const eventAccess = await tx.events.findUnique({
        where: { id: eventId },
        select: { id: true, hostId: true, assistantHostIds: true, organizationId: true },
      });
      if (!eventAccess) throw new Response('Event not found', { status: 404 });

      const isHostOrAdmin = await canManageEvent(session, eventAccess, tx);
      const event = await loadEventWithRelations(eventId, tx);
      const match = event.matches[matchId];
      if (!match) throw new Response('Match not found', { status: 404 });

      const isEventOfficial = Array.isArray((event as any).officials) && (event as any).officials.some((official: any) => (
        normalizeIdToken(official?.id ?? official?.$id) === session.userId
      ));
      const assignedTeamOfficialId = normalizeIdToken((match as any).teamOfficial?.id ?? (match as any).teamOfficial?.$id);
      const isTeamOfficialMember = isUserOnTeam((match as any).teamOfficial, session.userId);
      const isAssignedOfficialUser = normalizeIdToken((match as any).official?.id ?? (match as any).official?.$id) === session.userId;
      const eventTeams = Array.isArray((event as any).teams)
        ? ((event as any).teams as unknown[])
        : Object.values(((event as any).teams ?? {}) as Record<string, unknown>);
      const isAssignedTeamOfficialById = Boolean(assignedTeamOfficialId && eventTeams.some((team) => {
        if (!isUserOnTeam(team, session.userId) || !team || typeof team !== 'object') return false;
        const teamId = normalizeIdToken((team as any).id ?? (team as any).$id);
        return teamId === assignedTeamOfficialId;
      }));
      if (!isHostOrAdmin && !isEventOfficial && !isTeamOfficialMember && !isAssignedOfficialUser && !isAssignedTeamOfficialById) {
        throw new Response('Forbidden', { status: 403 });
      }
      if (matchRequiresPlayerRecordedScoring(match, event)) {
        throw new Response('Player-recorded scoring must use the match incident endpoint.', { status: 400 });
      }

      const teamIds = [
        normalizeIdToken((match as any).team1?.id ?? (match as any).team1?.$id),
        normalizeIdToken((match as any).team2?.id ?? (match as any).team2?.$id),
      ].filter((value): value is string => Boolean(value));
      if (!teamIds.includes(parsed.data.eventTeamId)) {
        throw new Response('Score team must be one of the match participants.', { status: 400 });
      }

      const segments: MatchSegment[] = Array.isArray(match.segments)
        ? match.segments.map((segment: MatchSegment) => ({ ...segment, scores: { ...(segment.scores ?? {}) } }))
        : [];
      const segmentIndex = segments.findIndex((segment) => (
        (parsed.data.segmentId && (segment.id === parsed.data.segmentId || segment.$id === parsed.data.segmentId))
        || segment.sequence === parsed.data.sequence
      ));
      if (segmentIndex < 0) {
        throw new Response('Match segment not found', { status: 404 });
      }
      const segment = segments[segmentIndex];
      const nextScore = Math.trunc(parsed.data.points);
      const nextScores = {
        ...(segment.scores ?? {}),
        [parsed.data.eventTeamId]: nextScore,
      };
      segments[segmentIndex] = {
        ...segment,
        status: segment.status === 'COMPLETE'
          ? segment.status
          : Object.values(nextScores).some((score) => Number(score) > 0) ? 'IN_PROGRESS' : 'NOT_STARTED',
        scores: nextScores,
      };
      match.segments = segments.sort((left, right) => left.sequence - right.sequence);
      syncLegacyArraysFromSegments(match);
      await saveMatches(eventId, Object.values(event.matches), tx);
      return match;
    });

    return NextResponse.json({ match: serializeMatchesLegacy([result])[0] }, { status: 200 });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('Match score set failed', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
