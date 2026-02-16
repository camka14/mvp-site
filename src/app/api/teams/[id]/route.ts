import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { withLegacyFields } from '@/server/legacyFormat';
import {
  inferDivisionDetails,
  normalizeDivisionIdToken,
} from '@/lib/divisionTypes';

export const dynamic = 'force-dynamic';

const patchEnvelopeSchema = z.object({
  team: z.unknown().optional(),
}).passthrough();

const teamPatchSchema = z.object({
  name: z.string().optional(),
  seed: z.number().optional(),
  division: z.string().optional(),
  divisionTypeId: z.string().optional(),
  divisionTypeName: z.string().optional(),
  sport: z.string().optional(),
  wins: z.number().optional(),
  losses: z.number().optional(),
  playerIds: z.array(z.string()).optional(),
  captainId: z.string().optional(),
  managerId: z.string().optional(),
  coachIds: z.array(z.string()).optional(),
  pending: z.array(z.string()).optional(),
  teamSize: z.number().optional(),
  profileImageId: z.string().optional(),
  profileImage: z.string().optional(),
});

const VERSIONED_PROFILE_FIELDS: ReadonlySet<string> = new Set([
  'name',
  'seed',
  'division',
  'divisionTypeId',
  'divisionTypeName',
  'sport',
  'teamSize',
  'playerIds',
  'captainId',
  'managerId',
  'coachIds',
]);

const normalizeText = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length ? normalized : null;
};

const toUniqueStrings = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return Array.from(
    new Set(
      value
        .map((entry) => String(entry).trim())
        .filter(Boolean),
    ),
  );
};

const normalizeNumber = (value: unknown, fallback: number): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const replaceTeamId = (ids: string[], fromId: string, toId: string): string[] => (
  Array.from(
    new Set(
      ids
        .map((value) => (value === fromId ? toId : value))
        .filter(Boolean),
    ),
  )
);

const arraysEqual = (a: string[], b: string[]): boolean => (
  a.length === b.length && a.every((value, index) => value === b[index])
);

type TeamState = {
  name: string | null;
  seed: number;
  division: string;
  divisionTypeId: string;
  divisionTypeName: string;
  sport: string | null;
  wins: number;
  losses: number;
  playerIds: string[];
  captainId: string;
  managerId: string;
  coachIds: string[];
  pending: string[];
  teamSize: number;
  profileImageId: string | null;
};

const buildTeamState = (
  existing: Record<string, any>,
  payload: z.infer<typeof teamPatchSchema>,
): TeamState => {
  const normalizedDivision = normalizeText(payload.division)
    ?? normalizeText(existing.division)
    ?? 'Open';
  const sportInput = normalizeText(payload.sport)
    ?? normalizeText(existing.sport)
    ?? null;
  const normalizedDivisionTypeId = normalizeDivisionIdToken(payload.divisionTypeId)
    ?? normalizeDivisionIdToken(existing.divisionTypeId);
  const inferredDivision = inferDivisionDetails({
    identifier: normalizedDivisionTypeId ?? normalizedDivision,
    sportInput: sportInput ?? undefined,
  });
  const divisionTypeId = normalizedDivisionTypeId ?? inferredDivision.divisionTypeId;
  const divisionTypeName = normalizeText(payload.divisionTypeName)
    ?? normalizeText(existing.divisionTypeName)
    ?? inferredDivision.divisionTypeName;

  const captainId = normalizeText(payload.captainId)
    ?? normalizeText(existing.captainId)
    ?? '';
  const managerId = normalizeText(payload.managerId)
    ?? normalizeText(existing.managerId)
    ?? captainId;

  const playerIdsInput = payload.playerIds ?? existing.playerIds;
  const playerIds = toUniqueStrings(playerIdsInput);
  if (captainId && !playerIds.includes(captainId)) {
    playerIds.unshift(captainId);
  }

  const coachIdsInput = payload.coachIds ?? existing.coachIds;
  const coachIds = toUniqueStrings(coachIdsInput);

  const pendingInput = payload.pending ?? existing.pending;
  const pending = toUniqueStrings(pendingInput)
    .filter((userId) => !playerIds.includes(userId));

  const nextProfileImage = normalizeText(payload.profileImageId ?? payload.profileImage)
    ?? normalizeText(existing.profileImageId)
    ?? null;

  return {
    name: normalizeText(payload.name) ?? normalizeText(existing.name),
    seed: normalizeNumber(payload.seed, normalizeNumber(existing.seed, 0)),
    division: normalizedDivision,
    divisionTypeId,
    divisionTypeName,
    sport: sportInput,
    wins: normalizeNumber(payload.wins, normalizeNumber(existing.wins, 0)),
    losses: normalizeNumber(payload.losses, normalizeNumber(existing.losses, 0)),
    playerIds,
    captainId,
    managerId,
    coachIds,
    pending,
    teamSize: normalizeNumber(payload.teamSize, normalizeNumber(existing.teamSize, playerIds.length)),
    profileImageId: nextProfileImage,
  };
};

const hasVersionedProfileChanges = (
  payload: z.infer<typeof teamPatchSchema>,
  existing: Record<string, any>,
  next: TeamState,
): boolean => {
  const keys = Object.keys(payload).filter((key) => VERSIONED_PROFILE_FIELDS.has(key));
  if (!keys.length) {
    return false;
  }

  for (const key of keys) {
    switch (key) {
      case 'name':
        if ((normalizeText(existing.name) ?? null) !== next.name) return true;
        break;
      case 'seed':
        if (normalizeNumber(existing.seed, 0) !== next.seed) return true;
        break;
      case 'division':
        if ((normalizeText(existing.division) ?? 'Open') !== next.division) return true;
        break;
      case 'divisionTypeId':
        if ((normalizeDivisionIdToken(existing.divisionTypeId) ?? '') !== next.divisionTypeId) return true;
        break;
      case 'divisionTypeName':
        if ((normalizeText(existing.divisionTypeName) ?? '') !== next.divisionTypeName) return true;
        break;
      case 'sport':
        if ((normalizeText(existing.sport) ?? null) !== next.sport) return true;
        break;
      case 'teamSize':
        if (normalizeNumber(existing.teamSize, 0) !== next.teamSize) return true;
        break;
      case 'playerIds': {
        const previous = [...toUniqueStrings(existing.playerIds)].sort();
        const updated = [...next.playerIds].sort();
        if (!arraysEqual(previous, updated)) return true;
        break;
      }
      case 'captainId':
        if ((normalizeText(existing.captainId) ?? '') !== next.captainId) return true;
        break;
      case 'managerId':
        if ((normalizeText(existing.managerId) ?? normalizeText(existing.captainId) ?? '') !== next.managerId) return true;
        break;
      case 'coachIds':
        if (!arraysEqual(toUniqueStrings(existing.coachIds), next.coachIds)) return true;
        break;
      default:
        break;
    }
  }

  return false;
};

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const team = await prisma.volleyBallTeams.findUnique({ where: { id } });
  if (!team) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json(withLegacyFields(team), { status: 200 });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession(req);
  const body = await req.json().catch(() => null);
  const envelope = patchEnvelopeSchema.safeParse(body ?? {});
  if (!envelope.success) {
    return NextResponse.json({ error: 'Invalid input', details: envelope.error.flatten() }, { status: 400 });
  }

  const payloadRaw = envelope.data.team ?? envelope.data ?? {};
  const payloadParsed = teamPatchSchema.safeParse(payloadRaw);
  if (!payloadParsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: payloadParsed.error.flatten() }, { status: 400 });
  }

  const { id } = await params;
  const existing = await prisma.volleyBallTeams.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const isCaptain = existing.captainId === session.userId;
  const isManager = normalizeText((existing as any).managerId) === session.userId;
  if (!session.isAdmin && !isCaptain && !isManager) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const payload = payloadParsed.data;
  const nextState = buildTeamState(existing as Record<string, any>, payload);
  const now = new Date();

  const endedEventCount = await prisma.events.count({
    where: {
      teamIds: { has: id },
      end: { lt: now },
    },
  });
  const shouldVersion = endedEventCount > 0
    && hasVersionedProfileChanges(payload, existing as Record<string, any>, nextState);

  if (!shouldVersion) {
    const updated = await prisma.volleyBallTeams.update({
      where: { id },
      data: {
        ...nextState,
        updatedAt: now,
      },
    });
    return NextResponse.json(withLegacyFields(updated), { status: 200 });
  }

  const nextTeam = await prisma.$transaction(async (tx) => {
    const nextTeamId = crypto.randomUUID();

    const created = await tx.volleyBallTeams.create({
      data: {
        id: nextTeamId,
        ...nextState,
        parentTeamId: null,
        createdAt: now,
        updatedAt: now,
      },
    });

    await tx.volleyBallTeams.update({
      where: { id },
      data: {
        parentTeamId: nextTeamId,
        updatedAt: now,
      },
    });

    const organizations = await tx.organizations.findMany({
      where: { teamIds: { has: id } },
      select: { id: true, teamIds: true },
    });
    for (const organization of organizations) {
      const currentIds = Array.isArray(organization.teamIds) ? organization.teamIds : [];
      const nextIds = replaceTeamId(currentIds, id, nextTeamId);
      await tx.organizations.update({
        where: { id: organization.id },
        data: {
          teamIds: nextIds,
          updatedAt: now,
        },
      });
    }

    const activeEvents = await tx.events.findMany({
      where: {
        teamIds: { has: id },
        end: { gte: now },
      },
      select: { id: true, teamIds: true },
    });
    for (const event of activeEvents) {
      const currentIds = Array.isArray(event.teamIds) ? event.teamIds : [];
      const nextIds = replaceTeamId(currentIds, id, nextTeamId);
      await tx.events.update({
        where: { id: event.id },
        data: {
          teamIds: nextIds,
          updatedAt: now,
        },
      });
    }

    const activeEventIds = activeEvents.map((event) => event.id);
    if (activeEventIds.length) {
      await tx.matches.updateMany({
        where: {
          eventId: { in: activeEventIds },
          team1Id: id,
        },
        data: {
          team1Id: nextTeamId,
          updatedAt: now,
        },
      });

      await tx.matches.updateMany({
        where: {
          eventId: { in: activeEventIds },
          team2Id: id,
        },
        data: {
          team2Id: nextTeamId,
          updatedAt: now,
        },
      });

      await tx.eventRegistrations.updateMany({
        where: {
          eventId: { in: activeEventIds },
          registrantType: 'TEAM',
          registrantId: id,
        },
        data: {
          registrantId: nextTeamId,
          updatedAt: now,
        },
      });
    }

    await tx.invites.updateMany({
      where: { teamId: id },
      data: {
        teamId: nextTeamId,
        updatedAt: now,
      },
    });

    const userOrFilters: Array<Record<string, any>> = [
      { teamIds: { has: id } },
    ];
    if (nextState.playerIds.length) {
      userOrFilters.push({ id: { in: nextState.playerIds } });
    }
    const users = await tx.userData.findMany({
      where: { OR: userOrFilters },
      select: { id: true, teamIds: true },
    });
    const playerSet = new Set(nextState.playerIds);

    for (const user of users) {
      const currentIds = Array.isArray(user.teamIds) ? user.teamIds.map(String) : [];
      const withoutLegacy = currentIds.filter((teamId) => teamId !== id && teamId !== nextTeamId);
      const nextIds = playerSet.has(user.id)
        ? Array.from(new Set([...withoutLegacy, nextTeamId]))
        : withoutLegacy;
      if (arraysEqual(currentIds, nextIds)) {
        continue;
      }

      await tx.userData.update({
        where: { id: user.id },
        data: {
          teamIds: nextIds,
          updatedAt: now,
        },
      });
    }

    return created;
  });

  return NextResponse.json(withLegacyFields(nextTeam), { status: 200 });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession(req);
  const { id } = await params;
  const existing = await prisma.volleyBallTeams.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const isCaptain = existing.captainId === session.userId;
  const isManager = normalizeText((existing as any).managerId) === session.userId;
  if (!session.isAdmin && !isCaptain && !isManager) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await prisma.volleyBallTeams.delete({ where: { id } });
  return NextResponse.json({ deleted: true }, { status: 200 });
}
