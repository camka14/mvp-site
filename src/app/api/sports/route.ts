import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ensureDefaultSports } from '@/server/defaultSports';
import { withLegacyList } from '@/server/legacyFormat';

export const dynamic = 'force-dynamic';

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
  let sports = await ensureDefaultSports(prisma);

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
