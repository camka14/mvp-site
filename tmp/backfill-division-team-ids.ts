import { prisma } from '../src/lib/prisma';
import { extractDivisionTokenFromId } from '../src/lib/divisionTypes';

const normalizeId = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

const normalizeIdList = (value: unknown): string[] => (
  Array.isArray(value)
    ? Array.from(
        new Set(
          value
            .map((entry) => normalizeId(entry))
            .filter((entry): entry is string => Boolean(entry)),
        ),
      )
    : []
);

type LeagueDivisionRow = {
  id: string;
  key: string | null;
  name: string;
  maxParticipants: number | null;
};

const buildDivisionAliasMap = (divisions: LeagueDivisionRow[]): Map<string, string> => {
  const map = new Map<string, string>();
  for (const division of divisions) {
    const aliases = new Set<string>([
      division.id,
      division.key ?? '',
      extractDivisionTokenFromId(division.id) ?? '',
    ]);
    for (const alias of aliases) {
      const normalized = normalizeId(alias)?.toLowerCase();
      if (!normalized) {
        continue;
      }
      map.set(normalized, division.id);
    }
  }
  return map;
};

const run = async (): Promise<void> => {
  const events = await prisma.events.findMany({
    select: {
      id: true,
      singleDivision: true,
    },
    orderBy: { id: 'asc' },
  });

  console.log(`Backfilling division teamIds for ${events.length} event(s)...`);

  for (const event of events) {
    const divisionRows = await prisma.divisions.findMany({
      where: { eventId: event.id },
      select: {
        id: true,
        key: true,
        name: true,
        maxParticipants: true,
        kind: true,
      },
    });

    const leagueDivisions = divisionRows
      .filter((division) => (division.kind ?? 'LEAGUE') !== 'PLAYOFF')
      .map((division) => ({
        id: division.id,
        key: division.key ?? null,
        name: division.name,
        maxParticipants: division.maxParticipants ?? null,
      }));

    if (!leagueDivisions.length) {
      continue;
    }

    if (Boolean(event.singleDivision)) {
      await prisma.$transaction(
        leagueDivisions.map((division) =>
          prisma.divisions.update({
            where: { id: division.id },
            data: {
              teamIds: [],
              updatedAt: new Date(),
            },
          }),
        ),
      );
      console.log(`[${event.id}] single-division event -> cleared teamIds on ${leagueDivisions.length} division(s).`);
      continue;
    }

    const registrations = await prisma.eventRegistrations.findMany({
      where: {
        eventId: event.id,
        registrantType: 'TEAM',
        status: 'ACTIVE',
      },
      select: {
        registrantId: true,
        divisionId: true,
        divisionTypeKey: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    const activeTeamIds = Array.from(
      new Set(
        registrations
          .map((registration) => normalizeId(registration.registrantId))
          .filter((teamId): teamId is string => Boolean(teamId)),
      ),
    );

    const teams = activeTeamIds.length
      ? await prisma.teams.findMany({
          where: { id: { in: activeTeamIds } },
          select: {
            id: true,
            division: true,
            divisionTypeId: true,
            divisionTypeName: true,
          },
        })
      : [];
    const teamById = new Map(teams.map((team) => [team.id, team]));

    const sortedDivisions = [...leagueDivisions].sort((left, right) => left.id.localeCompare(right.id));
    const aliasToDivisionId = buildDivisionAliasMap(sortedDivisions);
    const assignedDivisionByTeamId = new Map<string, string>();
    const assignedTeamIdsByDivision = new Map<string, string[]>(
      sortedDivisions.map((division) => [division.id, []]),
    );

    const canAssignToDivision = (divisionId: string): boolean => {
      const division = sortedDivisions.find((entry) => entry.id === divisionId);
      if (!division) {
        return false;
      }
      if (typeof division.maxParticipants !== 'number' || division.maxParticipants <= 0) {
        return true;
      }
      const currentCount = assignedTeamIdsByDivision.get(divisionId)?.length ?? 0;
      return currentCount < division.maxParticipants;
    };

    const assignTeam = (teamId: string, divisionId: string | null): boolean => {
      if (!divisionId || !canAssignToDivision(divisionId)) {
        return false;
      }
      if (assignedDivisionByTeamId.has(teamId)) {
        return true;
      }
      assignedDivisionByTeamId.set(teamId, divisionId);
      const bucket = assignedTeamIdsByDivision.get(divisionId) ?? [];
      bucket.push(teamId);
      assignedTeamIdsByDivision.set(divisionId, bucket);
      return true;
    };

    const resolveDivisionIdFromAlias = (value: unknown): string | null => {
      const normalized = normalizeId(value)?.toLowerCase();
      if (!normalized) {
        return null;
      }
      return aliasToDivisionId.get(normalized) ?? null;
    };

    // Step 1: direct registration mapping.
    for (const registration of registrations) {
      const teamId = normalizeId(registration.registrantId);
      if (!teamId || assignedDivisionByTeamId.has(teamId)) {
        continue;
      }
      const candidates = [
        resolveDivisionIdFromAlias(registration.divisionId),
        resolveDivisionIdFromAlias(registration.divisionTypeKey),
      ];
      for (const candidate of candidates) {
        if (assignTeam(teamId, candidate)) {
          break;
        }
      }
    }

    // Step 2: team metadata mapping.
    for (const teamId of activeTeamIds) {
      if (assignedDivisionByTeamId.has(teamId)) {
        continue;
      }
      const team = teamById.get(teamId);
      const candidates = [
        resolveDivisionIdFromAlias(team?.division),
        resolveDivisionIdFromAlias(team?.divisionTypeId),
        resolveDivisionIdFromAlias(team?.divisionTypeName),
      ];
      for (const candidate of candidates) {
        if (assignTeam(teamId, candidate)) {
          break;
        }
      }
    }

    // Step 3: deterministic fill by division order with capacity checks.
    const unassignedTeamIds: string[] = [];
    for (const teamId of activeTeamIds) {
      if (assignedDivisionByTeamId.has(teamId)) {
        continue;
      }
      let assigned = false;
      for (const division of sortedDivisions) {
        if (assignTeam(teamId, division.id)) {
          assigned = true;
          break;
        }
      }
      if (!assigned) {
        unassignedTeamIds.push(teamId);
      }
    }

    await prisma.$transaction(
      sortedDivisions.map((division) =>
        prisma.divisions.update({
          where: { id: division.id },
          data: {
            teamIds: assignedTeamIdsByDivision.get(division.id) ?? [],
            updatedAt: new Date(),
          },
        }),
      ),
    );

    const assignedCount = Array.from(assignedTeamIdsByDivision.values())
      .reduce((count, teamIds) => count + teamIds.length, 0);
    const unassignedSummary = unassignedTeamIds.length
      ? ` unassigned=${unassignedTeamIds.join(',')}`
      : '';
    console.log(`[${event.id}] assigned=${assignedCount}/${activeTeamIds.length}.${unassignedSummary}`);
  }
};

run()
  .catch((error) => {
    console.error('Backfill failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
