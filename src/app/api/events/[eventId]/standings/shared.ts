import { Division, League, Tournament } from '@/server/scheduler/types';
import {
  computeLeagueDivisionStandings,
  getLeagueDivisionById,
  validateDivisionPlayoffMapping,
  validatePlayoffDivisionReferenceCapacities,
} from '@/server/scheduler/standings';

export type StandingsRowResponse = {
  position: number;
  teamId: string;
  teamName: string;
  wins: number;
  losses: number;
  draws: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  matchesPlayed: number;
  basePoints: number;
  finalPoints: number;
  pointsDelta: number;
};

export type DivisionValidationResult = {
  mappingErrors: string[];
  capacityErrors: string[];
};

export type DivisionStandingsResponse = {
  divisionId: string;
  divisionName: string;
  standingsConfirmedAt: string | null;
  standingsConfirmedBy: string | null;
  playoffTeamCount: number | null;
  playoffPlacementDivisionIds: string[];
  standingsOverrides: Record<string, number> | null;
  standings: StandingsRowResponse[];
  validation: DivisionValidationResult;
  playoffDivisions: Array<{ id: string; name: string; maxParticipants: number | null }>;
};

const normalizeToken = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

export const toLeagueEvent = (event: Tournament | League): League | null => {
  if (event instanceof League || event.eventType === 'LEAGUE') {
    return event as League;
  }
  return null;
};

export const getDivisionValidation = (league: League, division: Division): DivisionValidationResult => ({
  mappingErrors: validateDivisionPlayoffMapping(league, division),
  capacityErrors: validatePlayoffDivisionReferenceCapacities(league),
});

export const buildDivisionStandingsResponse = (
  league: League,
  divisionId: string,
): DivisionStandingsResponse => {
  const division = getLeagueDivisionById(league, divisionId);
  if (!division) {
    throw new Error('League division not found.');
  }

  const standings = computeLeagueDivisionStandings(
    league,
    division.id,
    division.standingsOverrides ?? null,
  );

  const validation = getDivisionValidation(league, division);
  return {
    divisionId: division.id,
    divisionName: division.name,
    standingsConfirmedAt: division.standingsConfirmedAt ? division.standingsConfirmedAt.toISOString() : null,
    standingsConfirmedBy: division.standingsConfirmedBy ?? null,
    playoffTeamCount: typeof division.playoffTeamCount === 'number'
      ? Math.max(0, Math.trunc(division.playoffTeamCount))
      : null,
    playoffPlacementDivisionIds: Array.isArray(division.playoffPlacementDivisionIds)
      ? division.playoffPlacementDivisionIds
      : [],
    standingsOverrides: division.standingsOverrides ? { ...division.standingsOverrides } : null,
    standings: standings.map((row, index) => ({
      position: index + 1,
      teamId: row.teamId,
      teamName: row.teamName,
      wins: row.wins,
      losses: row.losses,
      draws: row.draws,
      goalsFor: row.goalsFor,
      goalsAgainst: row.goalsAgainst,
      goalDifference: row.goalDifference,
      matchesPlayed: row.matchesPlayed,
      basePoints: row.basePoints,
      finalPoints: row.finalPoints,
      pointsDelta: row.pointsDelta,
    })),
    validation,
    playoffDivisions: league.playoffDivisions.map((playoffDivision) => ({
      id: playoffDivision.id,
      name: playoffDivision.name,
      maxParticipants: typeof playoffDivision.maxParticipants === 'number'
        ? Math.max(0, Math.trunc(playoffDivision.maxParticipants))
        : null,
    })),
  };
};

export const applyPointsOverrideUpdates = (
  existing: Record<string, number> | null | undefined,
  updates: Array<{ teamId: string; points: number | null }>,
): Record<string, number> | null => {
  const next = { ...(existing ?? {}) };

  for (const update of updates) {
    const teamId = normalizeToken(update.teamId);
    if (!teamId) {
      continue;
    }

    if (update.points === null) {
      delete next[teamId];
      continue;
    }

    if (!Number.isFinite(update.points)) {
      continue;
    }

    next[teamId] = Number(update.points);
  }

  return Object.keys(next).length ? next : null;
};
