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
  headCoachId: z.string().nullable().optional(),
  assistantCoachIds: z.array(z.string()).optional(),
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
  'headCoachId',
  'assistantCoachIds',
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
  headCoachId: string | null;
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
  const headCoachId = normalizeText(payload.headCoachId)
    ?? normalizeText(existing.headCoachId)
    ?? null;

  const playerIdsInput = payload.playerIds ?? existing.playerIds;
  const playerIds = toUniqueStrings(playerIdsInput);
  if (captainId && !playerIds.includes(captainId)) {
    playerIds.unshift(captainId);
  }

  const coachIdsInput = payload.assistantCoachIds ?? payload.coachIds ?? existing.coachIds;
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
    headCoachId,
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
      case 'headCoachId':
        if ((normalizeText(existing.headCoachId) ?? null) !== next.headCoachId) return true;
        break;
      case 'assistantCoachIds':
      case 'coachIds':
        if (!arraysEqual(toUniqueStrings(existing.coachIds), next.coachIds)) return true;
        break;
      default:
        break;
    }
  }

  return false;
};

const withTeamRoleAliases = (team: Record<string, any>) => {
  const formatted = withLegacyFields(team);
  const assistantCoachIds = toUniqueStrings((formatted as any).assistantCoachIds ?? (formatted as any).coachIds);
  return {
    ...formatted,
    assistantCoachIds,
    coachIds: assistantCoachIds,
  };
};

const getTeamsDelegate = (client: any) => client?.teams ?? client?.volleyBallTeams;
const UNKNOWN_ARGUMENT_REGEX = /Unknown argument `([^`]+)`/i;

const extractUnknownArgument = (error: unknown): string | null => {
  const message = error instanceof Error ? error.message : String(error ?? '');
  const match = message.match(UNKNOWN_ARGUMENT_REGEX);
  return match?.[1] ?? null;
};

const omitKeys = (data: Record<string, unknown>, keys: Set<string>): Record<string, unknown> => {
  if (!keys.size) return data;
  return Object.fromEntries(Object.entries(data).filter(([key]) => !keys.has(key)));
};

const updateTeamWithCompatibility = async (
  teamsDelegate: any,
  where: Record<string, unknown>,
  data: Record<string, unknown>,
): Promise<Record<string, unknown>> => {
  const omittedKeys = new Set<string>();
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      return await teamsDelegate.update({
        where,
        data: omitKeys(data, omittedKeys),
      });
    } catch (error) {
      lastError = error;
      const unknownArgument = extractUnknownArgument(error);
      if (!unknownArgument || omittedKeys.has(unknownArgument) || !Object.prototype.hasOwnProperty.call(data, unknownArgument)) {
        throw error;
      }
      omittedKeys.add(unknownArgument);
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Failed to update team with compatible schema.');
};

const createTeamWithCompatibility = async (
  teamsDelegate: any,
  data: Record<string, unknown>,
): Promise<Record<string, unknown>> => {
  const omittedKeys = new Set<string>();
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      return await teamsDelegate.create({
        data: omitKeys(data, omittedKeys),
      });
    } catch (error) {
      lastError = error;
      const unknownArgument = extractUnknownArgument(error);
      if (!unknownArgument || omittedKeys.has(unknownArgument) || !Object.prototype.hasOwnProperty.call(data, unknownArgument)) {
        throw error;
      }
      omittedKeys.add(unknownArgument);
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Failed to create team with compatible schema.');
};

const hasOrganizationTeamManagementAccess = async (teamId: string, userId: string): Promise<boolean> => {
  if (!teamId || !userId) return false;
  const count = await prisma.organizations.count({
    where: {
      teamIds: { has: teamId },
      OR: [
        { ownerId: userId },
        { hostIds: { has: userId } },
      ],
    },
  });
  return count > 0;
};

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const teamsDelegate = getTeamsDelegate(prisma);
  if (!teamsDelegate?.findUnique) {
    return NextResponse.json({ error: 'Team storage is unavailable. Regenerate Prisma client.' }, { status: 500 });
  }

  const team = await teamsDelegate.findUnique({ where: { id } });
  if (!team) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json(withTeamRoleAliases(team as any), { status: 200 });
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
  const teamsDelegate = getTeamsDelegate(prisma);
  if (!teamsDelegate?.findUnique || !teamsDelegate?.update) {
    return NextResponse.json({ error: 'Team storage is unavailable. Regenerate Prisma client.' }, { status: 500 });
  }

  const existing = await teamsDelegate.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const isCaptain = existing.captainId === session.userId;
  const isManager = normalizeText((existing as any).managerId) === session.userId;
  const isOrganizationManager = await hasOrganizationTeamManagementAccess(id, session.userId);
  if (!session.isAdmin && !isCaptain && !isManager && !isOrganizationManager) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const payload = payloadParsed.data;
  const nextState = buildTeamState(existing as Record<string, any>, payload);
  const now = new Date();

  const updated = await prisma.$transaction(async (tx) => {
    const txTeams = getTeamsDelegate(tx);
    if (!txTeams?.update || !txTeams?.findMany) {
      throw new Error('Team storage is unavailable in transaction.');
    }

    const canonical = await updateTeamWithCompatibility(
      txTeams,
      { id },
      {
        ...nextState,
        updatedAt: now,
      },
    );

    const derivedTeams = await txTeams.findMany({
      where: { parentTeamId: id },
      select: { id: true },
    });
    const derivedTeamIds = derivedTeams.map((team: { id: string }) => team.id).filter(Boolean);
    if (!derivedTeamIds.length) {
      return canonical;
    }

    const events = await tx.events.findMany({
      where: {
        end: { gte: now },
        teamIds: { hasSome: derivedTeamIds },
      },
      select: { id: true, teamIds: true },
    });

    if (!events.length) {
      return canonical;
    }

    const derivedSet = new Set(derivedTeamIds);
    const teamIdsToUpdate = new Set<string>();
    for (const event of events) {
      const teamIds = Array.isArray(event.teamIds) ? event.teamIds : [];
      for (const teamId of teamIds) {
        if (derivedSet.has(teamId)) {
          teamIdsToUpdate.add(teamId);
        }
      }
    }

    const updatePayload = {
      name: nextState.name,
      playerIds: nextState.playerIds,
      captainId: nextState.captainId,
      managerId: nextState.managerId,
      headCoachId: nextState.headCoachId,
      coachIds: nextState.coachIds,
      teamSize: nextState.teamSize,
      profileImageId: nextState.profileImageId,
      sport: nextState.sport,
      divisionTypeId: nextState.divisionTypeId,
      divisionTypeName: nextState.divisionTypeName,
      updatedAt: now,
    };

    for (const teamId of teamIdsToUpdate) {
      await updateTeamWithCompatibility(txTeams, { id: teamId }, updatePayload);
    }

    return canonical;
  });

  return NextResponse.json(withTeamRoleAliases(updated as any), { status: 200 });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession(req);
  const { id } = await params;
  const teamsDelegate = getTeamsDelegate(prisma);
  if (!teamsDelegate?.findUnique || !teamsDelegate?.delete) {
    return NextResponse.json({ error: 'Team storage is unavailable. Regenerate Prisma client.' }, { status: 500 });
  }

  const existing = await teamsDelegate.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const isCaptain = existing.captainId === session.userId;
  const isManager = normalizeText((existing as any).managerId) === session.userId;
  const isOrganizationManager = await hasOrganizationTeamManagementAccess(id, session.userId);
  if (!session.isAdmin && !isCaptain && !isManager && !isOrganizationManager) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await teamsDelegate.delete({ where: { id } });
  return NextResponse.json({ deleted: true }, { status: 200 });
}
