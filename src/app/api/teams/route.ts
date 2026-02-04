import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { withLegacyList, withLegacyFields } from '@/server/legacyFormat';

export const dynamic = 'force-dynamic';

const createSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  seed: z.number().optional(),
  division: z.string().optional(),
  sport: z.string().optional(),
  wins: z.number().optional(),
  losses: z.number().optional(),
  playerIds: z.array(z.string()).optional(),
  captainId: z.string(),
  pending: z.array(z.string()).optional(),
  teamSize: z.number().optional(),
  profileImageId: z.string().optional(),
}).passthrough();

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const idsParam = params.get('ids');
  const playerId = params.get('playerId');
  const limit = Number(params.get('limit') || '100');

  const ids = idsParam ? idsParam.split(',').map((id) => id.trim()).filter(Boolean) : undefined;

  const where: any = {};
  if (ids?.length) where.id = { in: ids };
  if (playerId) where.playerIds = { has: playerId };

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

  if (!session.isAdmin && parsed.data.captainId !== session.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const data = parsed.data;
  const team = await prisma.volleyBallTeams.create({
    data: {
      id: data.id,
      name: data.name ?? null,
      seed: data.seed ?? 0,
      division: data.division ?? null,
      sport: data.sport ?? null,
      wins: data.wins ?? 0,
      losses: data.losses ?? 0,
      playerIds: Array.isArray(data.playerIds) ? data.playerIds : [],
      captainId: data.captainId,
      pending: Array.isArray(data.pending) ? data.pending : [],
      teamSize: data.teamSize ?? 0,
      profileImageId: data.profileImageId ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });

  return NextResponse.json(withLegacyFields(team), { status: 201 });
}
