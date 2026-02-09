import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withLegacyList } from '@/server/legacyFormat';

export const dynamic = 'force-dynamic';

const DEFAULT_SPORTS = [
  // NOTE: These flags intentionally gate which LeagueScoringConfig fields render in the UI.
  // If they are missing (null), the UI will hide scoring controls entirely.
  {
    id: 'Volleyball',
    name: 'Volleyball',
    usePointsForWin: true,
    usePointsForLoss: true,
    usePointsPerSetWin: true,
    usePointsPerSetLoss: true,
    usePointsPerGoalScored: true,
    usePointsPerGoalConceded: true,
    usePointPrecision: true,
  },
  {
    id: 'Basketball',
    name: 'Basketball',
    usePointsForWin: true,
    usePointsForLoss: true,
    usePointsPerGoalScored: true,
    usePointsPerGoalConceded: true,
    usePointPrecision: true,
  },
  {
    id: 'Soccer',
    name: 'Soccer',
    usePointsForWin: true,
    usePointsForDraw: true,
    usePointsForLoss: true,
    usePointsPerGoalScored: true,
    usePointsPerGoalConceded: true,
    usePointPrecision: true,
  },
  {
    id: 'Tennis',
    name: 'Tennis',
    usePointsForWin: true,
    usePointsForLoss: true,
    usePointsPerSetWin: true,
    usePointsPerSetLoss: true,
    usePointsPerGameWin: true,
    usePointsPerGameLoss: true,
    usePointsPerGoalScored: true,
    usePointsPerGoalConceded: true,
    usePointPrecision: true,
  },
  {
    id: 'Pickleball',
    name: 'Pickleball',
    usePointsForWin: true,
    usePointsForLoss: true,
    usePointsPerSetWin: true,
    usePointsPerSetLoss: true,
    usePointsPerGoalScored: true,
    usePointsPerGoalConceded: true,
    usePointPrecision: true,
  },
  {
    id: 'Football',
    name: 'Football',
    usePointsForWin: true,
    usePointsForDraw: true,
    usePointsForLoss: true,
    usePointsPerGoalScored: true,
    usePointsPerGoalConceded: true,
    usePointPrecision: true,
  },
  {
    id: 'Hockey',
    name: 'Hockey',
    usePointsForWin: true,
    usePointsForDraw: true,
    usePointsForLoss: true,
    usePointsPerGoalScored: true,
    usePointsPerGoalConceded: true,
    useOvertimeEnabled: true,
    usePointsForOvertimeWin: true,
    usePointsForOvertimeLoss: true,
    usePointPrecision: true,
  },
  {
    id: 'Baseball',
    name: 'Baseball',
    usePointsForWin: true,
    usePointsForLoss: true,
    usePointsPerGoalScored: true,
    usePointsPerGoalConceded: true,
    usePointPrecision: true,
  },
  {
    id: 'Other',
    name: 'Other',
    usePointsForWin: true,
    usePointsForDraw: true,
    usePointsForLoss: true,
    usePointsPerGoalScored: true,
    usePointsPerGoalConceded: true,
    usePointPrecision: true,
  },
];

export async function GET(_req: NextRequest) {
  let sports = await prisma.sports.findMany({ orderBy: { name: 'asc' } });

  if (sports.length === 0) {
    await prisma.sports.createMany({ data: DEFAULT_SPORTS, skipDuplicates: true });
    sports = await prisma.sports.findMany({ orderBy: { name: 'asc' } });
  } else {
    // Existing installs may have seeded default sports without scoring flags.
    const existingById = new Map(sports.map((sport) => [sport.id, sport]));
    const existingByNameLower = new Map(
      sports
        .map((sport) => [String(sport.name ?? '').toLowerCase(), sport] as const)
        .filter(([key]) => Boolean(key)),
    );

    const toCreate = DEFAULT_SPORTS.filter((sport) => {
      if (existingById.has(sport.id)) return false;
      return !existingByNameLower.has(String(sport.name).toLowerCase());
    });
    if (toCreate.length > 0) {
      await prisma.sports.createMany({ data: toCreate, skipDuplicates: true });
    }

    const updates = DEFAULT_SPORTS.flatMap((spec) => {
      const existing =
        existingById.get(spec.id) ?? existingByNameLower.get(String(spec.name).toLowerCase());
      if (!existing) return [];

      // Ensure key scoring flags are set for default sports so the UI can render scoring inputs.
      const patch: Record<string, boolean> = {};
      Object.entries(spec).forEach(([key, value]) => {
        if (key === 'id' || key === 'name') return;
        if (typeof value !== 'boolean') return;
        const current = (existing as any)[key];
        if (current !== value) {
          patch[key] = value;
        }
      });

      if (Object.keys(patch).length === 0) {
        return [];
      }

      return prisma.sports.update({
        where: { id: existing.id },
        data: patch,
      });
    });

    if (updates.length > 0) {
      await prisma.$transaction(updates);
    }

    sports = await prisma.sports.findMany({ orderBy: { name: 'asc' } });
  }

  return NextResponse.json({ sports: withLegacyList(sports) }, { status: 200 });
}
