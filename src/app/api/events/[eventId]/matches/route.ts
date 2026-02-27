import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { createId } from '@/lib/id';
import { requireSession } from '@/lib/permissions';
import { parseDateInput, withLegacyList } from '@/server/legacyFormat';
import { canManageEvent } from '@/server/accessControl';
import { loadEventWithRelations, saveMatches, saveTeamRecords } from '@/server/repositories/events';
import { acquireEventLock } from '@/server/repositories/locks';
import { validateAndNormalizeBracketGraph, type BracketNode } from '@/server/matches/bracketGraph';
import { applyMatchUpdates, applyPersistentAutoLock } from '@/server/scheduler/updateMatch';
import { Division, Match as SchedulerMatch, MINUTE_MS, Team as SchedulerTeam, sideFrom } from '@/server/scheduler/types';
import { serializeMatchesLegacy } from '@/server/scheduler/serialize';

export const dynamic = 'force-dynamic';

type BulkMatchUpdateInput = z.infer<typeof bulkMatchUpdateSchema>;
type BulkMatchCreateInput = z.infer<typeof bulkMatchCreateSchema>;

const bulkMatchUpdateSchema = z.object({
  id: z.string().optional(),
  $id: z.string().optional(),
  locked: z.boolean().optional(),
  matchId: z.number().int().nullable().optional(),
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
  start: z.string().nullable().optional(),
  end: z.string().nullable().optional(),
  division: z.string().nullable().optional(),
  losersBracket: z.boolean().optional(),
}).passthrough();

const bulkMatchCreateSchema = z.object({
  clientId: z.string().min(1),
  creationContext: z.enum(['schedule', 'bracket']).optional(),
  autoPlaceholderTeam: z.boolean().optional(),
  matchId: z.number().int().nullable().optional(),
  locked: z.boolean().optional(),
  losersBracket: z.boolean().optional(),
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
  start: z.string().nullable().optional(),
  end: z.string().nullable().optional(),
  division: z.string().nullable().optional(),
}).passthrough();

const bulkUpdateSchema = z.object({
  matches: z.array(bulkMatchUpdateSchema).optional(),
  creates: z.array(bulkMatchCreateSchema).optional(),
  deletes: z.array(z.string().min(1)).optional(),
}).superRefine((value, ctx) => {
  const updates = value.matches ?? [];
  const creates = value.creates ?? [];
  const deletes = value.deletes ?? [];
  if (!updates.length && !creates.length && !deletes.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'At least one match update, create entry, or delete id is required.',
      path: ['matches'],
    });
  }
});

const hasOwn = (value: object, key: string): boolean => Object.prototype.hasOwnProperty.call(value, key);

const normalizeOptionalString = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const normalizeMatchRef = (value: unknown): string | null => {
  if (value == null) {
    return null;
  }
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    return null;
  }
  return normalized;
};

const resolveMatchId = (entry: BulkMatchUpdateInput): string | null => {
  if (typeof entry.id === 'string' && entry.id.trim().length > 0) {
    return entry.id.trim();
  }
  if (typeof entry.$id === 'string' && entry.$id.trim().length > 0) {
    return entry.$id.trim();
  }
  return null;
};

const resolveCanonicalNodeId = (entry: BulkMatchCreateInput): string => `client:${entry.clientId.trim()}`;

const resolveDivisionForMatch = (
  event: Awaited<ReturnType<typeof loadEventWithRelations>>,
  requestedDivisionId: string | null,
): Division => {
  if (requestedDivisionId) {
    const existingDivision = event.divisions.find((division) => division.id === requestedDivisionId);
    if (existingDivision) {
      return existingDivision;
    }
  }

  if (event.divisions.length > 0) {
    return event.divisions[0];
  }

  const fallback = new Division('OPEN', 'OPEN');
  event.divisions.push(fallback);
  return fallback;
};

const ensureEventDivisionMembershipForTeam = async (
  tx: typeof prisma,
  eventId: string,
  teamId: string,
  divisionId: string,
) => {
  const rows = await tx.divisions.findMany({
    where: { eventId },
    select: { id: true, key: true, kind: true, teamIds: true },
  });

  const normalizedTarget = divisionId.trim().toLowerCase();
  const isTargetDivision = (row: { id: string; key: string | null }) => {
    const aliases = [row.id, row.key ?? '']
      .map((entry) => entry.trim().toLowerCase())
      .filter((entry) => entry.length > 0);
    return aliases.includes(normalizedTarget);
  };

  const targetRow = rows.find((row) => {
    const isPlayoff = typeof row.kind === 'string' && row.kind.toUpperCase() === 'PLAYOFF';
    if (isPlayoff) return false;
    return isTargetDivision(row);
  }) ?? rows.find((row) => !(typeof row.kind === 'string' && row.kind.toUpperCase() === 'PLAYOFF'));

  if (!targetRow) {
    return;
  }

  const existingTeamIds = Array.isArray(targetRow.teamIds)
    ? targetRow.teamIds.map((entry) => String(entry).trim()).filter((entry) => entry.length > 0)
    : [];

  if (existingTeamIds.includes(teamId)) {
    return;
  }

  await tx.divisions.update({
    where: { id: targetRow.id },
    data: {
      teamIds: [...existingTeamIds, teamId],
      updatedAt: new Date(),
    },
  });
};

export async function GET(_req: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const matches = await prisma.matches.findMany({
    where: { eventId },
    orderBy: { start: 'asc' },
  });
  return NextResponse.json({ matches: withLegacyList(matches) }, { status: 200 });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const session = await requireSession(req);
  const body = await req.json().catch(() => null);
  const parsed = bulkUpdateSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const updates = parsed.data.matches ?? [];
  const creates = parsed.data.creates ?? [];
  const deletes = Array.from(
    new Set(
      (parsed.data.deletes ?? [])
        .map((value) => value.trim())
        .filter((value) => value.length > 0),
    ),
  );

  const { eventId } = await params;
  try {
    const result = await prisma.$transaction(async (tx) => {
      await acquireEventLock(tx, eventId);

      const eventAccess = await tx.events.findUnique({
        where: { id: eventId },
        select: { id: true, hostId: true, assistantHostIds: true, organizationId: true },
      });
      if (!eventAccess) {
        throw new Response('Event not found', { status: 404 });
      }
      if (!(await canManageEvent(session, eventAccess, tx))) {
        throw new Response('Forbidden', { status: 403 });
      }

      const event = await loadEventWithRelations(eventId, tx);
      const lockEvaluationTime = new Date();
      const touchedIds: string[] = [];
      const deletedMatchIdSet = new Set<string>();

      for (const matchId of deletes) {
        if (matchId.startsWith('client:')) {
          throw new Response(`Delete id ${matchId} is invalid.`, { status: 400 });
        }
        if (!event.matches[matchId]) {
          throw new Response(`Match ${matchId} not found.`, { status: 404 });
        }
        deletedMatchIdSet.add(matchId);
      }

      const canonicalNodes = new Map<string, BracketNode>();
      for (const match of Object.values(event.matches)) {
        if (deletedMatchIdSet.has(match.id)) {
          continue;
        }
        canonicalNodes.set(match.id, {
          id: match.id,
          matchId: typeof match.matchId === 'number' ? match.matchId : null,
          winnerNextMatchId: match.winnerNextMatch?.id ?? null,
          loserNextMatchId: match.loserNextMatch?.id ?? null,
          previousLeftId: match.previousLeftMatch?.id ?? null,
          previousRightId: match.previousRightMatch?.id ?? null,
        });
      }

      for (const entry of updates) {
        const matchId = resolveMatchId(entry);
        if (!matchId) {
          throw new Response('Each match update must include an id.', { status: 400 });
        }
        if (deletedMatchIdSet.has(matchId)) {
          throw new Response(`Match ${matchId} cannot be updated and deleted in the same request.`, { status: 400 });
        }

        const target = event.matches[matchId];
        if (!target) {
          throw new Response(`Match ${matchId} not found.`, { status: 404 });
        }

        const node = canonicalNodes.get(matchId) as BracketNode;
        if (hasOwn(entry, 'winnerNextMatchId')) {
          node.winnerNextMatchId = normalizeMatchRef(entry.winnerNextMatchId);
        }
        if (hasOwn(entry, 'loserNextMatchId')) {
          node.loserNextMatchId = normalizeMatchRef(entry.loserNextMatchId);
        }
        if (hasOwn(entry, 'previousLeftId')) {
          node.previousLeftId = normalizeMatchRef(entry.previousLeftId);
        }
        if (hasOwn(entry, 'previousRightId')) {
          node.previousRightId = normalizeMatchRef(entry.previousRightId);
        }
        if (hasOwn(entry, 'matchId')) {
          node.matchId = typeof entry.matchId === 'number' ? entry.matchId : null;
        }
      }

      if (deletedMatchIdSet.size > 0) {
        for (const node of canonicalNodes.values()) {
          if (node.winnerNextMatchId && deletedMatchIdSet.has(node.winnerNextMatchId)) {
            node.winnerNextMatchId = null;
          }
          if (node.loserNextMatchId && deletedMatchIdSet.has(node.loserNextMatchId)) {
            node.loserNextMatchId = null;
          }
          if (node.previousLeftId && deletedMatchIdSet.has(node.previousLeftId)) {
            node.previousLeftId = null;
          }
          if (node.previousRightId && deletedMatchIdSet.has(node.previousRightId)) {
            node.previousRightId = null;
          }
        }
      }

      const seenClientNodeIds = new Set<string>();
      for (const entry of creates) {
        const canonicalNodeId = resolveCanonicalNodeId(entry);
        if (seenClientNodeIds.has(canonicalNodeId)) {
          throw new Response(`Duplicate create clientId ${entry.clientId}.`, { status: 400 });
        }
        seenClientNodeIds.add(canonicalNodeId);

        canonicalNodes.set(canonicalNodeId, {
          id: canonicalNodeId,
          matchId: typeof entry.matchId === 'number' ? entry.matchId : null,
          winnerNextMatchId: normalizeMatchRef(entry.winnerNextMatchId),
          loserNextMatchId: normalizeMatchRef(entry.loserNextMatchId),
          previousLeftId: normalizeMatchRef(entry.previousLeftId),
          previousRightId: normalizeMatchRef(entry.previousRightId),
        });
      }

      const bracketValidation = validateAndNormalizeBracketGraph(Array.from(canonicalNodes.values()));
      if (!bracketValidation.ok) {
        throw new Response(bracketValidation.errors[0]?.message ?? 'Invalid bracket graph.', { status: 400 });
      }

      const eventType = String(event.eventType ?? '').toUpperCase();
      const isTournament = eventType === 'TOURNAMENT';

      for (const entry of creates) {
        const canonicalNodeId = resolveCanonicalNodeId(entry);
        const normalizedNode = bracketValidation.normalizedById[canonicalNodeId];
        const winnerNext = normalizeMatchRef(canonicalNodes.get(canonicalNodeId)?.winnerNextMatchId);
        const loserNext = normalizeMatchRef(canonicalNodes.get(canonicalNodeId)?.loserNextMatchId);
        const hasAnyLink = Boolean(
          winnerNext
          || loserNext
          || normalizedNode?.previousLeftId
          || normalizedNode?.previousRightId,
        );

        if (isTournament && !hasAnyLink) {
          throw new Response(`Tournament match create ${entry.clientId} must include at least one link.`, { status: 400 });
        }

        const creationContext = entry.creationContext ?? 'bracket';
        if (creationContext === 'schedule') {
          const hasField = normalizeOptionalString(entry.fieldId) !== null;
          const start = parseDateInput(entry.start);
          const end = parseDateInput(entry.end);
          if (!hasField || !start || !end) {
            throw new Response(`Schedule create ${entry.clientId} requires field, start, and end.`, { status: 400 });
          }
          if (end.getTime() <= start.getTime()) {
            throw new Response(`Schedule create ${entry.clientId} requires end after start.`, { status: 400 });
          }
        }
      }

      const teamIdsAddedForPlaceholders: string[] = [];
      const canonicalToPersistedId = new Map<string, string>();
      const matchByCanonicalId = new Map<string, SchedulerMatch>();

      for (const existingId of Object.keys(event.matches)) {
        canonicalToPersistedId.set(existingId, existingId);
        matchByCanonicalId.set(existingId, event.matches[existingId]);
      }

      const existingMatchIds = Object.values(event.matches)
        .map((match) => (typeof match.matchId === 'number' && Number.isFinite(match.matchId) ? match.matchId : 0));
      let nextMatchId = existingMatchIds.length > 0 ? Math.max(...existingMatchIds) + 1 : 1;

      const existingPlaceholderCount = Object.values(event.teams)
        .filter((team) => team.captainId.trim().length === 0)
        .length;
      let nextPlaceholderOffset = 1;

      for (const entry of creates) {
        const canonicalNodeId = resolveCanonicalNodeId(entry);
        const requestedDivisionId = normalizeOptionalString(entry.division);
        const matchDivision = resolveDivisionForMatch(event, requestedDivisionId);

        const parsedStart = parseDateInput(entry.start);
        const parsedEnd = parseDateInput(entry.end);
        if (hasOwn(entry, 'start') && entry.start != null && !parsedStart) {
          throw new Response(`Invalid start value for create ${entry.clientId}.`, { status: 400 });
        }
        if (hasOwn(entry, 'end') && entry.end != null && !parsedEnd) {
          throw new Response(`Invalid end value for create ${entry.clientId}.`, { status: 400 });
        }

        const createPlaceholder = isTournament && (entry.autoPlaceholderTeam ?? true);
        let createdPlaceholderTeamId: string | null = null;

        if (createPlaceholder) {
          const placeholderTeamId = createId();
          const placeholderName = `Place Holder ${existingPlaceholderCount + nextPlaceholderOffset}`;
          nextPlaceholderOffset += 1;

          await tx.teams.create({
            data: {
              id: placeholderTeamId,
              createdAt: new Date(),
              updatedAt: new Date(),
              seed: 0,
              playerIds: [],
              division: matchDivision.id,
              divisionTypeId: null,
              divisionTypeName: null,
              wins: 0,
              losses: 0,
              name: placeholderName,
              captainId: '',
              managerId: '',
              headCoachId: null,
              coachIds: [],
              parentTeamId: null,
              pending: [],
              teamSize: Math.max(0, Math.trunc(event.teamSizeLimit ?? 0)),
              profileImageId: null,
              sport: null,
            },
          });

          await ensureEventDivisionMembershipForTeam(tx, eventId, placeholderTeamId, matchDivision.id);

          const placeholderTeam = new SchedulerTeam({
            id: placeholderTeamId,
            captainId: '',
            division: matchDivision,
            name: placeholderName,
            matches: [],
            playerIds: [],
          });
          event.teams[placeholderTeamId] = placeholderTeam;
          teamIdsAddedForPlaceholders.push(placeholderTeamId);
          createdPlaceholderTeamId = placeholderTeamId;
        }

        const persistedMatchId = createId();
        canonicalToPersistedId.set(canonicalNodeId, persistedMatchId);

        let team1Id = normalizeOptionalString(entry.team1Id);
        let team2Id = normalizeOptionalString(entry.team2Id);
        if (createdPlaceholderTeamId && !team1Id && !team2Id) {
          team1Id = createdPlaceholderTeamId;
        }

        const startFallback = parsedStart ?? new Date();
        const endFallback = parsedEnd ?? new Date(startFallback.getTime() + 60 * MINUTE_MS);

        const createdMatch = new SchedulerMatch({
          id: persistedMatchId,
          matchId: typeof entry.matchId === 'number' && Number.isFinite(entry.matchId)
            ? entry.matchId
            : nextMatchId,
          locked: Boolean(entry.locked),
          team1Seed: null,
          team2Seed: null,
          team1Points: Array.isArray(entry.team1Points) ? entry.team1Points : [],
          team2Points: Array.isArray(entry.team2Points) ? entry.team2Points : [],
          start: startFallback,
          end: endFallback,
          losersBracket: Boolean(entry.losersBracket),
          division: matchDivision,
          field: (() => {
            const fieldId = normalizeOptionalString(entry.fieldId);
            return fieldId ? event.fields[fieldId] ?? null : null;
          })(),
          setResults: Array.isArray(entry.setResults) ? entry.setResults : [],
          bufferMs: Math.max(event.restTimeMinutes ?? 0, 0) * MINUTE_MS,
          side: sideFrom(entry.side ?? null),
          refereeCheckedIn: Boolean(entry.refereeCheckedIn),
          teamReferee: (() => {
            const teamRefId = normalizeOptionalString(entry.teamRefereeId);
            return teamRefId ? event.teams[teamRefId] ?? null : null;
          })(),
          referee: (() => {
            const refereeId = normalizeOptionalString(entry.refereeId);
            return refereeId
              ? event.referees.find((referee) => referee.id === refereeId) ?? null
              : null;
          })(),
          team1: team1Id ? event.teams[team1Id] ?? null : null,
          team2: team2Id ? event.teams[team2Id] ?? null : null,
          eventId,
          previousLeftMatch: null,
          previousRightMatch: null,
          winnerNextMatch: null,
          loserNextMatch: null,
        });

        if (!parsedStart) {
          (createdMatch as unknown as { start: Date | null }).start = null;
        }
        if (!parsedEnd) {
          (createdMatch as unknown as { end: Date | null }).end = null;
        }

        event.matches[persistedMatchId] = createdMatch;
        matchByCanonicalId.set(canonicalNodeId, createdMatch);
        touchedIds.push(persistedMatchId);

        if (!(typeof entry.matchId === 'number' && Number.isFinite(entry.matchId))) {
          nextMatchId += 1;
        }
      }

      for (const entry of updates) {
        const matchId = resolveMatchId(entry) as string;
        const target = event.matches[matchId];

        applyMatchUpdates(event, target, {
          locked: entry.locked,
          team1Points: entry.team1Points,
          team2Points: entry.team2Points,
          setResults: entry.setResults,
          team1Id: entry.team1Id,
          team2Id: entry.team2Id,
          refereeId: entry.refereeId,
          teamRefereeId: entry.teamRefereeId,
          fieldId: entry.fieldId,
          previousLeftId: null,
          previousRightId: null,
          winnerNextMatchId: null,
          loserNextMatchId: null,
          side: entry.side,
          refereeCheckedIn: entry.refereeCheckedIn,
          matchId: entry.matchId ?? undefined,
        });

        if (hasOwn(entry, 'start')) {
          if (entry.start == null) {
            (target as unknown as { start: Date | null }).start = null;
          } else {
            const parsedStart = parseDateInput(entry.start);
            if (!parsedStart) {
              throw new Response(`Invalid start value for match ${matchId}.`, { status: 400 });
            }
            target.start = parsedStart;
          }
        }

        if (hasOwn(entry, 'end')) {
          if (entry.end == null) {
            (target as unknown as { end: Date | null }).end = null;
          } else {
            const parsedEnd = parseDateInput(entry.end);
            if (!parsedEnd) {
              throw new Response(`Invalid end value for match ${matchId}.`, { status: 400 });
            }
            target.end = parsedEnd;
          }
        }

        if (hasOwn(entry, 'division')) {
          const divisionId = normalizeOptionalString(entry.division);
          if (!divisionId) {
            (target as unknown as { division: typeof target.division | null }).division = null;
          } else {
            target.division = resolveDivisionForMatch(event, divisionId);
          }
        }

        if (hasOwn(entry, 'losersBracket')) {
          target.losersBracket = Boolean(entry.losersBracket);
        }

        applyPersistentAutoLock(target, {
          now: lockEvaluationTime,
          explicitLockedValue: entry.locked,
        });

        touchedIds.push(matchId);
      }

      for (const [canonicalNodeId, node] of canonicalNodes.entries()) {
        const targetMatch = matchByCanonicalId.get(canonicalNodeId);
        if (!targetMatch) continue;

        const resolvePersistedRef = (ref: string | null | undefined): string | null => {
          const normalized = normalizeMatchRef(ref);
          if (!normalized) {
            return null;
          }
          return canonicalToPersistedId.get(normalized) ?? normalized;
        };

        const winnerNextId = resolvePersistedRef(node.winnerNextMatchId);
        const loserNextId = resolvePersistedRef(node.loserNextMatchId);
        const normalizedPrevious = bracketValidation.normalizedById[canonicalNodeId];
        const previousLeftId = resolvePersistedRef(normalizedPrevious?.previousLeftId ?? null);
        const previousRightId = resolvePersistedRef(normalizedPrevious?.previousRightId ?? null);

        targetMatch.winnerNextMatch = winnerNextId ? event.matches[winnerNextId] ?? null : null;
        targetMatch.loserNextMatch = loserNextId ? event.matches[loserNextId] ?? null : null;
        targetMatch.previousLeftMatch = previousLeftId ? event.matches[previousLeftId] ?? null : null;
        targetMatch.previousRightMatch = previousRightId ? event.matches[previousRightId] ?? null : null;
        touchedIds.push(targetMatch.id);
      }

      if (deletedMatchIdSet.size > 0) {
        const deletedIds = Array.from(deletedMatchIdSet);
        deletedIds.forEach((matchId) => {
          delete event.matches[matchId];
          canonicalToPersistedId.delete(matchId);
          matchByCanonicalId.delete(matchId);
        });
        await tx.matches.deleteMany({
          where: {
            eventId,
            id: { in: deletedIds },
          },
        });
      }

      if (isTournament && teamIdsAddedForPlaceholders.length > 0) {
        const nextMaxParticipants = Math.max(0, Math.trunc(event.maxParticipants ?? 0)) + teamIdsAddedForPlaceholders.length;
        const existingTeamIds = Array.isArray(event.registeredTeamIds)
          ? event.registeredTeamIds
          : Object.keys(event.teams);
        const nextTeamIds = Array.from(new Set([...existingTeamIds, ...teamIdsAddedForPlaceholders]));

        await tx.events.update({
          where: { id: eventId },
          data: {
            maxParticipants: nextMaxParticipants,
            teamIds: nextTeamIds,
            updatedAt: new Date(),
          },
        });

        event.maxParticipants = nextMaxParticipants;
        event.registeredTeamIds = nextTeamIds;
      }

      await saveMatches(eventId, Object.values(event.matches), tx);
      await saveTeamRecords(Object.values(event.teams), tx);

      const uniqueTouchedIds = Array.from(new Set(touchedIds));
      const created: Record<string, string> = {};
      for (const entry of creates) {
        const canonicalNodeId = resolveCanonicalNodeId(entry);
        const persistedId = canonicalToPersistedId.get(canonicalNodeId);
        if (persistedId) {
          created[entry.clientId.trim()] = persistedId;
        }
      }

      return {
        matches: uniqueTouchedIds
          .map((id) => event.matches[id])
          .filter((match): match is NonNullable<typeof match> => Boolean(match)),
        created,
        deleted: Array.from(deletedMatchIdSet),
      };
    });

    return NextResponse.json(
      {
        matches: serializeMatchesLegacy(result.matches),
        created: result.created,
        deleted: result.deleted,
      },
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('Bulk match update failed', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const session = await requireSession(req);
  const { eventId } = await params;
  const event = await prisma.events.findUnique({ where: { id: eventId } });
  if (!event) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  }
  if (!(await canManageEvent(session, event))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await prisma.matches.deleteMany({ where: { eventId } });
  return NextResponse.json({ deleted: true }, { status: 200 });
}
