import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { withLegacyList, withLegacyFields } from '@/server/legacyFormat';
import {
  inferDivisionDetails,
  normalizeDivisionIdToken,
} from '@/lib/divisionTypes';
import { syncTeamChatByTeamId } from '@/server/teamChatSync';
import {
  applyCanonicalTeamRegistrationMetadata,
  listCanonicalTeamsForUser,
  loadCanonicalTeamById,
  normalizeId,
  normalizeIdList,
  syncCanonicalTeamRoster,
} from '@/server/teams/teamMembership';

export const dynamic = 'force-dynamic';

const playerRegistrationInputSchema = z.object({
  id: z.string().optional(),
  teamId: z.string().nullable().optional(),
  userId: z.string(),
  status: z.string().optional(),
  jerseyNumber: z.string().nullable().optional(),
  position: z.string().nullable().optional(),
  isCaptain: z.boolean().optional(),
}).strict();

const createSchema = z.object({
  id: z.string(),
  name: z.string().trim().min(1, 'Team name is required.'),
  division: z.string().optional(),
  divisionTypeId: z.string().optional(),
  divisionTypeName: z.string().optional(),
  sport: z.string().optional(),
  playerIds: z.array(z.string()).optional(),
  captainId: z.string().optional(),
  managerId: z.string().optional(),
  addSelfAsPlayer: z.boolean().optional(),
  headCoachId: z.string().nullable().optional(),
  assistantCoachIds: z.array(z.string()).optional(),
  coachIds: z.array(z.string()).optional(),
  parentTeamId: z.string().optional(),
  pending: z.array(z.string()).optional(),
  teamSize: z.number().optional(),
  profileImageId: z.string().optional(),
  playerRegistrations: z.array(playerRegistrationInputSchema).optional(),
}).passthrough();

const normalizeText = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length ? normalized : null;
};

const uniqueStrings = (values: unknown[] | null | undefined): string[] => (
  Array.from(
    new Set(
      (values ?? [])
        .map((value) => String(value).trim())
        .filter(Boolean),
    ),
  )
);

const withTeamRoleAliases = (team: Record<string, any>) => {
  const formatted = withLegacyFields(team);
  const assistantCoachIds = uniqueStrings(
    Array.isArray((formatted as any).assistantCoachIds)
      ? (formatted as any).assistantCoachIds
      : (formatted as any).coachIds,
  );
  return {
    ...formatted,
    assistantCoachIds,
    coachIds: assistantCoachIds,
  };
};

const withTeamRoleAliasesList = (teams: Record<string, any>[]) => (
  withLegacyList(teams).map((team) => withTeamRoleAliases(team))
);

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

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const idsParam = params.get('ids');
  const playerId = params.get('playerId');
  const managerId = params.get('managerId');
  const limit = Number(params.get('limit') || '100');

  const ids = idsParam ? idsParam.split(',').map((id) => id.trim()).filter(Boolean) : undefined;
  const teams = await listCanonicalTeamsForUser({
    ids,
    playerId: normalizeId(playerId),
    managerId: normalizeId(managerId),
    limit: Number.isFinite(limit) ? limit : 100,
  }, prisma);
  return NextResponse.json({ teams: withTeamRoleAliasesList(teams as Record<string, any>[]) }, { status: 200 });
}

export async function POST(req: NextRequest) {
  const session = await requireSession(req);
  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;
  const normalizedTeamName = data.name.trim();
  const addSelfAsPlayer = data.addSelfAsPlayer !== false;
  const captainId = addSelfAsPlayer ? session.userId : '';
  const managerId = session.userId;
  const playerIds = uniqueStrings([
    ...(addSelfAsPlayer ? [session.userId] : []),
    ...uniqueStrings(data.playerIds),
  ]);
  const assistantCoachIds = uniqueStrings(data.assistantCoachIds ?? data.coachIds);
  const headCoachId = normalizeText(data.headCoachId);
  const pending = uniqueStrings(data.pending).filter((userId) => !playerIds.includes(userId));
  const normalizedDivision = normalizeText(data.division) ?? 'Open';
  const sportInput = normalizeText(data.sport) ?? null;
  const normalizedDivisionTypeId = normalizeDivisionIdToken(data.divisionTypeId);
  const inferredDivision = inferDivisionDetails({
    identifier: normalizedDivisionTypeId ?? normalizedDivision,
    sportInput: sportInput ?? undefined,
  });
  const divisionTypeId = normalizedDivisionTypeId ?? inferredDivision.divisionTypeId;
  const divisionTypeName = normalizeText(data.divisionTypeName) ?? inferredDivision.divisionTypeName;

  const teamsDelegate = getTeamsDelegate(prisma);
  const canonicalTeamsDelegate: any = (prisma as any).canonicalTeams;
  const teamRegistrationsDelegate: any = (prisma as any).teamRegistrations;
  const teamStaffAssignmentsDelegate: any = (prisma as any).teamStaffAssignments;
  if (!canonicalTeamsDelegate?.create && !teamsDelegate?.create) {
    return NextResponse.json({ error: 'Team storage is unavailable. Regenerate Prisma client.' }, { status: 500 });
  }

  let responseTeam: Record<string, any> | null = null;

  if (canonicalTeamsDelegate?.create && teamRegistrationsDelegate?.upsert && teamStaffAssignmentsDelegate?.upsert) {
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.canonicalTeams.create({
        data: {
          id: data.id,
          name: normalizedTeamName,
          division: normalizedDivision,
          divisionTypeId,
          divisionTypeName,
          sport: sportInput,
          teamSize: data.teamSize ?? 0,
          profileImageId: data.profileImageId ?? null,
          organizationId: null,
          createdBy: session.userId,
          createdAt: now,
          updatedAt: now,
        },
      });
      await syncCanonicalTeamRoster({
        teamId: data.id,
        captainId,
        playerIds,
        pendingPlayerIds: pending,
        managerId,
        headCoachId,
        assistantCoachIds,
        actingUserId: session.userId,
        now,
      }, tx);
      await applyCanonicalTeamRegistrationMetadata({
        client: tx,
        teamId: data.id,
        playerRegistrations: data.playerRegistrations,
        now,
      });
    });
    responseTeam = await loadCanonicalTeamById(data.id, prisma) as Record<string, any> | null;
  } else {
    const team = await createTeamWithCompatibility(teamsDelegate, {
      id: data.id,
      name: normalizedTeamName,
      division: normalizedDivision,
      divisionTypeId,
      divisionTypeName,
      sport: sportInput,
      playerIds,
      captainId,
      managerId,
      headCoachId,
      coachIds: assistantCoachIds,
      parentTeamId: normalizeText(data.parentTeamId),
      pending,
      teamSize: data.teamSize ?? 0,
      profileImageId: data.profileImageId ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    responseTeam = withTeamRoleAliases(team as any);
  }

  await syncTeamChatByTeamId(String(responseTeam?.id ?? data.id));

  return NextResponse.json(withTeamRoleAliases(responseTeam ?? { id: data.id }), { status: 201 });
}
