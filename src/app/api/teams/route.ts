import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { withLegacyList, withLegacyFields } from '@/server/legacyFormat';
import {
  inferDivisionDetails,
  normalizeDivisionIdToken,
} from '@/lib/divisionTypes';

export const dynamic = 'force-dynamic';

const createSchema = z.object({
  id: z.string(),
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
  parentTeamId: z.string().optional(),
  pending: z.array(z.string()).optional(),
  teamSize: z.number().optional(),
  profileImageId: z.string().optional(),
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

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const idsParam = params.get('ids');
  const playerId = params.get('playerId');
  const limit = Number(params.get('limit') || '100');

  const ids = idsParam ? idsParam.split(',').map((id) => id.trim()).filter(Boolean) : undefined;

  const where: any = {};
  if (ids?.length) where.id = { in: ids };
  if (playerId) where.playerIds = { has: playerId };
  if (!ids?.length) where.parentTeamId = null;

  const teams = await prisma.volleyBallTeams.findMany({
    where,
    take: Number.isFinite(limit) ? limit : 100,
    orderBy: { name: 'asc' },
  });

  return NextResponse.json({ teams: withLegacyList(teams) }, { status: 200 });
}

export async function POST(req: NextRequest) {
  const session = await requireSession(req);
  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;
  const captainId = session.userId;
  const managerId = session.userId;
  const playerIds = uniqueStrings([captainId, ...uniqueStrings(data.playerIds)]);
  const coachIds = uniqueStrings(data.coachIds);
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

  const team = await prisma.volleyBallTeams.create({
    data: {
      id: data.id,
      name: data.name ?? null,
      seed: data.seed ?? 0,
      division: normalizedDivision,
      divisionTypeId,
      divisionTypeName,
      sport: sportInput,
      wins: data.wins ?? 0,
      losses: data.losses ?? 0,
      playerIds,
      captainId,
      managerId,
      coachIds,
      parentTeamId: normalizeText(data.parentTeamId),
      pending,
      teamSize: data.teamSize ?? 0,
      profileImageId: data.profileImageId ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });

  return NextResponse.json(withLegacyFields(team), { status: 201 });
}
