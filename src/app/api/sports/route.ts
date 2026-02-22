import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withLegacyList } from '@/server/legacyFormat';

export const dynamic = 'force-dynamic';

const DEFAULT_SPORTS = [
  // NOTE: These flags intentionally gate which LeagueScoringConfig fields render in the UI.
  // If they are missing (null), the UI will hide scoring controls entirely.
  {
    id: 'Indoor Volleyball',
    name: 'Indoor Volleyball',
    usePointsForWin: true,
    usePointsForLoss: true,
    usePointsPerSetWin: true,
    usePointsPerSetLoss: true,
    usePointsPerGoalScored: true,
    usePointsPerGoalConceded: true,
    usePointPrecision: true,
  },
  {
    id: 'Beach Volleyball',
    name: 'Beach Volleyball',
    usePointsForWin: true,
    usePointsForLoss: true,
    usePointsPerSetWin: true,
    usePointsPerSetLoss: true,
    usePointsPerGoalScored: true,
    usePointsPerGoalConceded: true,
    usePointPrecision: true,
  },
  {
    id: 'Grass Volleyball',
    name: 'Grass Volleyball',
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
    id: 'Indoor Soccer',
    name: 'Indoor Soccer',
    usePointsForWin: true,
    usePointsForDraw: true,
    usePointsForLoss: true,
    usePointsPerGoalScored: true,
    usePointsPerGoalConceded: true,
    usePointPrecision: true,
  },
  {
    id: 'Grass Soccer',
    name: 'Grass Soccer',
    usePointsForWin: true,
    usePointsForDraw: true,
    usePointsForLoss: true,
    usePointsPerGoalScored: true,
    usePointsPerGoalConceded: true,
    usePointPrecision: true,
  },
  {
    id: 'Beach Soccer',
    name: 'Beach Soccer',
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

const DEPRECATED_SPORT_TARGET_BY_NAME: Record<string, string> = {
  soccer: 'Indoor Soccer',
  volleyball: 'Indoor Volleyball',
};

const normalizeSportName = (value: unknown): string =>
  String(value ?? '').trim().toLowerCase();

const remapOrganizationSports = (values: string[]): string[] => {
  const mapped = values.map((value) => {
    const target = DEPRECATED_SPORT_TARGET_BY_NAME[normalizeSportName(value)];
    return target ?? value;
  });
  return Array.from(new Set(mapped));
};

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

  const sportsByNameLower = new Map(
    sports
      .map((sport) => [normalizeSportName(sport.name), sport] as const)
      .filter(([name]) => Boolean(name)),
  );
  const deprecatedSports = sports.filter((sport) =>
    Object.prototype.hasOwnProperty.call(
      DEPRECATED_SPORT_TARGET_BY_NAME,
      normalizeSportName(sport.name),
    ),
  );

  if (deprecatedSports.length > 0) {
    const organizationCandidates = await prisma.organizations.findMany({
      where: {
        OR: deprecatedSports.map((sport) => ({ sports: { has: sport.name } })),
      },
      select: {
        id: true,
        sports: true,
      },
    });

    const organizationUpdates = organizationCandidates.flatMap((organization) => {
      const nextSports = remapOrganizationSports(organization.sports ?? []);
      if (nextSports.join('\u0000') === (organization.sports ?? []).join('\u0000')) {
        return [];
      }
      return prisma.organizations.update({
        where: { id: organization.id },
        data: { sports: nextSports },
      });
    });

    const remapOperations = deprecatedSports.flatMap((sport) => {
      const targetName = DEPRECATED_SPORT_TARGET_BY_NAME[normalizeSportName(sport.name)];
      const targetSport = targetName ? sportsByNameLower.get(normalizeSportName(targetName)) : null;
      if (!targetSport) {
        return [];
      }
      return [
        prisma.events.updateMany({
          where: {
            OR: [
              { sportId: sport.id },
              { sportId: { equals: sport.name, mode: 'insensitive' } },
            ],
          },
          data: { sportId: targetSport.id },
        }),
        prisma.divisions.updateMany({
          where: {
            OR: [
              { sportId: sport.id },
              { sportId: { equals: sport.name, mode: 'insensitive' } },
            ],
          },
          data: { sportId: targetSport.id },
        }),
        prisma.teams.updateMany({
          where: { sport: { equals: sport.name, mode: 'insensitive' } },
          data: { sport: targetSport.name },
        }),
      ];
    });

    if (organizationUpdates.length > 0 || remapOperations.length > 0) {
      await prisma.$transaction([...organizationUpdates, ...remapOperations]);
    }

    await prisma.sports.deleteMany({
      where: {
        id: { in: deprecatedSports.map((sport) => sport.id) },
      },
    });

    sports = await prisma.sports.findMany({ orderBy: { name: 'asc' } });
  }

  return NextResponse.json({ sports: withLegacyList(sports) }, { status: 200 });
}
