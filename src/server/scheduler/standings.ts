import { Brackets } from './Brackets';
import { deriveStandingsMatchResult } from '@/lib/standingsMatchScoring';
import {
  Division,
  League,
  Match,
  PlayoffDivisionConfig,
  PlayingField,
  SchedulerContext,
  Team,
  Tournament,
  UserData,
} from './types';

export type LeagueStanding = {
  teamId: string;
  teamName: string;
  team: Team | null;
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

type ComputeStandingsOptions = {
  includedTeamIds?: Set<string>;
  overridesByTeamId?: Record<string, number> | null;
};

type BuildEntrantsOptions = {
  includeUnconfirmedDivisionId?: string | null;
};

const noopContext: SchedulerContext = {
  log: () => {},
  error: () => {},
};

const normalizeToken = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
};

export const isPlayoffMatch = (match: Match): boolean => (
  Boolean(match.previousLeftMatch || match.previousRightMatch || match.winnerNextMatch || match.loserNextMatch)
);

export const isMatchScored = (match: Match): boolean => {
  if (!match.setResults?.length) {
    return false;
  }
  return match.setResults.every((result) => result === 1 || result === 2);
};

const resolveLeagueScoringValue = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const getMatchDivisionId = (match: Match): string | null => {
  const direct = normalizeToken(match.division?.id);
  if (direct) {
    return direct;
  }
  const fromTeam1 = normalizeToken(match.team1?.division?.id);
  if (fromTeam1) {
    return fromTeam1;
  }
  return normalizeToken(match.team2?.division?.id);
};

export const getLeagueDivisionById = (league: League, divisionId: string): Division | null => {
  const normalizedDivisionId = normalizeToken(divisionId);
  if (!normalizedDivisionId) {
    return null;
  }
  for (const division of league.divisions) {
    if (normalizeToken(division.id) === normalizedDivisionId) {
      return division;
    }
  }
  return null;
};

export const getPlayoffDivisionById = (league: League, divisionId: string): Division | null => {
  const normalizedDivisionId = normalizeToken(divisionId);
  if (!normalizedDivisionId) {
    return null;
  }
  for (const division of league.playoffDivisions) {
    if (normalizeToken(division.id) === normalizedDivisionId) {
      return division;
    }
  }
  return null;
};

export const getLeagueDivisionTeamIds = (league: League, divisionId: string): Set<string> => {
  const normalizedDivisionId = normalizeToken(divisionId);
  const teamIds = new Set<string>();
  if (!normalizedDivisionId) {
    return teamIds;
  }

  const division = getLeagueDivisionById(league, divisionId);
  const hasConfiguredMembership = league.divisions.some(
    (entry) => Array.isArray(entry.teamIds) && entry.teamIds.length > 0,
  );
  if (!league.singleDivision && division && hasConfiguredMembership) {
    const configuredTeamIds = Array.isArray(division.teamIds)
      ? division.teamIds
      : [];
    for (const rawTeamId of configuredTeamIds) {
      const teamId = typeof rawTeamId === 'string' ? rawTeamId.trim() : '';
      if (!teamId || !league.teams[teamId]) {
        continue;
      }
      teamIds.add(teamId);
    }
    return teamIds;
  }

  // Single-division leagues intentionally ignore per-division teamIds.
  if (league.singleDivision && league.divisions.length === 1) {
    for (const teamId of Object.keys(league.teams)) {
      teamIds.add(teamId);
    }
    return teamIds;
  }

  for (const team of Object.values(league.teams)) {
    if (normalizeToken(team.division?.id) === normalizedDivisionId) {
      teamIds.add(team.id);
    }
  }

  return teamIds;
};

export const getLeagueRegularSeasonMatches = (league: League, divisionId?: string): Match[] => {
  const normalizedDivisionId = normalizeToken(divisionId);
  return Object.values(league.matches).filter((match) => {
    if (isPlayoffMatch(match)) {
      return false;
    }
    if (!normalizedDivisionId) {
      return true;
    }
    return getMatchDivisionId(match) === normalizedDivisionId;
  });
};

export const computeLeagueStandings = (
  league: League,
  matches: Iterable<Match>,
  options?: ComputeStandingsOptions,
): LeagueStanding[] => {
  const standings = new Map<string, LeagueStanding>();
  const scoring = league.leagueScoringConfig ?? {};
  const pointsForWin = resolveLeagueScoringValue((scoring as any).pointsForWin);
  const pointsForDraw = resolveLeagueScoringValue((scoring as any).pointsForDraw);
  const pointsForLoss = resolveLeagueScoringValue((scoring as any).pointsForLoss);

  const ensureRow = (teamObj: Team | null): LeagueStanding | null => {
    if (!teamObj) {
      return null;
    }
    if (options?.includedTeamIds && !options.includedTeamIds.has(teamObj.id)) {
      return null;
    }
    if (!standings.has(teamObj.id)) {
      standings.set(teamObj.id, {
        teamId: teamObj.id,
        teamName: teamObj.name || teamObj.id,
        team: teamObj,
        wins: 0,
        losses: 0,
        draws: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        goalDifference: 0,
        matchesPlayed: 0,
        basePoints: 0,
        finalPoints: 0,
        pointsDelta: 0,
      });
    }
    return standings.get(teamObj.id) ?? null;
  };

  for (const team of Object.values(league.teams)) {
    if (options?.includedTeamIds && !options.includedTeamIds.has(team.id)) {
      continue;
    }
    ensureRow(team);
  }

  for (const match of matches) {
    const team1 = match.team1;
    const team2 = match.team2;
    if (options?.includedTeamIds) {
      if (!team1 || !team2 || !options.includedTeamIds.has(team1.id) || !options.includedTeamIds.has(team2.id)) {
        continue;
      }
    }

    const row1 = ensureRow(team1 ?? null);
    const row2 = ensureRow(team2 ?? null);
    if (!row1 || !row2) {
      continue;
    }

    const result = deriveStandingsMatchResult(match);
    if (!result.outcome) {
      continue;
    }

    row1.goalsFor += result.team1Total;
    row1.goalsAgainst += result.team2Total;
    row2.goalsFor += result.team2Total;
    row2.goalsAgainst += result.team1Total;
    row1.matchesPlayed += 1;
    row2.matchesPlayed += 1;

    if (result.outcome === 'team1') {
      row1.wins += 1;
      row2.losses += 1;
      row1.basePoints += pointsForWin;
      row2.basePoints += pointsForLoss;
    } else if (result.outcome === 'team2') {
      row2.wins += 1;
      row1.losses += 1;
      row2.basePoints += pointsForWin;
      row1.basePoints += pointsForLoss;
    } else {
      row1.draws += 1;
      row2.draws += 1;
      row1.basePoints += pointsForDraw;
      row2.basePoints += pointsForDraw;
    }
  }

  for (const row of standings.values()) {
    row.goalDifference = row.goalsFor - row.goalsAgainst;

    const overrideRaw = options?.overridesByTeamId?.[row.teamId];
    const hasOverride = typeof overrideRaw === 'number' && Number.isFinite(overrideRaw);
    row.finalPoints = hasOverride ? Number(overrideRaw) : row.basePoints;
    row.pointsDelta = row.finalPoints - row.basePoints;
  }

  return Array.from(standings.values()).sort((a, b) => {
    if (b.finalPoints !== a.finalPoints) return b.finalPoints - a.finalPoints;
    if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
    if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
    return a.teamName.toLowerCase().localeCompare(b.teamName.toLowerCase());
  });
};

export const computeLeagueDivisionStandings = (
  league: League,
  divisionId: string,
  overridesByTeamId?: Record<string, number> | null,
): LeagueStanding[] => {
  const includedTeamIds = getLeagueDivisionTeamIds(league, divisionId);
  const matches = getLeagueRegularSeasonMatches(league, divisionId);
  return computeLeagueStandings(league, matches, {
    includedTeamIds,
    overridesByTeamId,
  });
};

const getDivisionPlayoffTeamCount = (league: League, division: Division): number => {
  const divisionCount = typeof division.playoffTeamCount === 'number' && Number.isFinite(division.playoffTeamCount)
    ? Math.max(0, Math.trunc(division.playoffTeamCount))
    : null;
  const leagueCount = typeof league.playoffTeamCount === 'number' && Number.isFinite(league.playoffTeamCount)
    ? Math.max(0, Math.trunc(league.playoffTeamCount))
    : 0;
  return divisionCount ?? leagueCount;
};

export const normalizeLeaguePlayoffPlacementMappings = (league: League): string[] => {
  if (!league.includePlayoffs) {
    return [];
  }
  if (!league.singleDivision) {
    return [];
  }

  const playoffDivisionIdsByToken = new Map<string, string>();
  const orderedPlayoffDivisionIds: string[] = [];
  for (const playoffDivision of league.playoffDivisions) {
    const normalizedPlayoffDivisionId = normalizeToken(playoffDivision.id);
    if (!normalizedPlayoffDivisionId) {
      continue;
    }
    if (playoffDivisionIdsByToken.has(normalizedPlayoffDivisionId)) {
      continue;
    }
    playoffDivisionIdsByToken.set(normalizedPlayoffDivisionId, playoffDivision.id);
    orderedPlayoffDivisionIds.push(playoffDivision.id);
  }

  if (!orderedPlayoffDivisionIds.length) {
    return [];
  }

  const changedDivisionIds: string[] = [];

  for (const division of league.divisions) {
    const playoffTeamCount = getDivisionPlayoffTeamCount(league, division);
    const currentMapping = Array.isArray(division.playoffPlacementDivisionIds)
      ? division.playoffPlacementDivisionIds
      : [];

    const nextMapping: string[] = [];
    for (let index = 0; index < playoffTeamCount; index += 1) {
      const mappedDivisionToken = normalizeToken(currentMapping[index]);
      const mappedDivisionId = mappedDivisionToken ? playoffDivisionIdsByToken.get(mappedDivisionToken) : null;
      if (mappedDivisionId) {
        nextMapping.push(mappedDivisionId);
        continue;
      }
      nextMapping.push(orderedPlayoffDivisionIds[index % orderedPlayoffDivisionIds.length]);
    }

    const unchanged = currentMapping.length === nextMapping.length
      && nextMapping.every((value, index) => value === currentMapping[index]);
    if (unchanged) {
      continue;
    }

    division.playoffPlacementDivisionIds = nextMapping;
    changedDivisionIds.push(division.id);
  }

  return changedDivisionIds;
};

export const validateDivisionPlayoffMapping = (league: League, division: Division): string[] => {
  const errors: string[] = [];
  if (!league.includePlayoffs) {
    return errors;
  }
  if (!league.splitLeaguePlayoffDivisions) {
    return errors;
  }

  const playoffTeamCount = getDivisionPlayoffTeamCount(league, division);
  if (playoffTeamCount <= 0) {
    errors.push('Playoff team count must be set to a value of at least 1.');
    return errors;
  }

  const playoffDivisionIds = new Set(league.playoffDivisions.map((entry) => normalizeToken(entry.id)).filter((entry): entry is string => Boolean(entry)));
  const mapping = Array.isArray(division.playoffPlacementDivisionIds)
    ? division.playoffPlacementDivisionIds
    : [];

  for (let index = 0; index < playoffTeamCount; index += 1) {
    const referencedDivisionId = normalizeToken(mapping[index]);
    if (!referencedDivisionId) {
      errors.push(`Position ${index + 1} must be mapped to a playoff division.`);
      continue;
    }
    if (!playoffDivisionIds.has(referencedDivisionId)) {
      errors.push(`Position ${index + 1} references an unknown playoff division.`);
    }
  }

  return errors;
};

export const validatePlayoffDivisionReferenceCapacities = (league: League): string[] => {
  const errors: string[] = [];
  if (!league.includePlayoffs) {
    return errors;
  }
  if (!league.splitLeaguePlayoffDivisions) {
    return errors;
  }

  const referenceCounts = new Map<string, number>();
  for (const division of league.divisions) {
    const playoffTeamCount = getDivisionPlayoffTeamCount(league, division);
    if (playoffTeamCount <= 0) {
      continue;
    }

    const mapping = Array.isArray(division.playoffPlacementDivisionIds)
      ? division.playoffPlacementDivisionIds
      : [];

    for (let index = 0; index < playoffTeamCount; index += 1) {
      const referencedDivisionId = normalizeToken(mapping[index]);
      if (!referencedDivisionId) {
        continue;
      }
      referenceCounts.set(referencedDivisionId, (referenceCounts.get(referencedDivisionId) ?? 0) + 1);
    }
  }

  for (const playoffDivision of league.playoffDivisions) {
    const normalizedPlayoffDivisionId = normalizeToken(playoffDivision.id);
    if (!normalizedPlayoffDivisionId) {
      continue;
    }
    const assignedCount = referenceCounts.get(normalizedPlayoffDivisionId) ?? 0;
    if (assignedCount <= 0) {
      continue;
    }

    const capacity = typeof playoffDivision.maxParticipants === 'number' && Number.isFinite(playoffDivision.maxParticipants)
      ? Math.max(0, Math.trunc(playoffDivision.maxParticipants))
      : 0;
    if (capacity <= 0) {
      errors.push(`Playoff division "${playoffDivision.name}" must define a team count before assignments can be validated.`);
      continue;
    }

    if (assignedCount > capacity) {
      errors.push(`Playoff division "${playoffDivision.name}" has ${assignedCount} mapped positions but only ${capacity} team slots.`);
    }
  }

  return errors;
};

export const buildPlayoffEntrantsByDivision = (
  league: League,
  options?: BuildEntrantsOptions,
): Map<string, Team[]> => {
  const entrantsByPlayoffDivision = new Map<string, Team[]>();
  const standingsByLeagueDivision = new Map<string, LeagueStanding[]>();

  const includeUnconfirmedDivisionId = normalizeToken(options?.includeUnconfirmedDivisionId ?? null);

  const includedDivisions = league.divisions.filter((division) => {
    if (includeUnconfirmedDivisionId && normalizeToken(division.id) === includeUnconfirmedDivisionId) {
      return true;
    }
    return Boolean(division.standingsConfirmedAt);
  });

  if (!includedDivisions.length) {
    return entrantsByPlayoffDivision;
  }

  let maxPlacementIndex = 0;
  for (const division of includedDivisions) {
    const divisionKey = normalizeToken(division.id) ?? division.id;
    const standings = computeLeagueDivisionStandings(
      league,
      division.id,
      division.standingsOverrides ?? null,
    );
    standingsByLeagueDivision.set(divisionKey, standings);
    maxPlacementIndex = Math.max(maxPlacementIndex, getDivisionPlayoffTeamCount(league, division));
  }

  for (let placementIndex = 0; placementIndex < maxPlacementIndex; placementIndex += 1) {
    for (const division of league.divisions) {
      if (!includedDivisions.includes(division)) {
        continue;
      }

      const playoffTeamCount = getDivisionPlayoffTeamCount(league, division);
      if (placementIndex >= playoffTeamCount) {
        continue;
      }

      const mapping = Array.isArray(division.playoffPlacementDivisionIds)
        ? division.playoffPlacementDivisionIds
        : [];
      const playoffDivisionId = normalizeToken(mapping[placementIndex]);
      if (!playoffDivisionId) {
        continue;
      }

      const standings = standingsByLeagueDivision.get(normalizeToken(division.id) ?? division.id) ?? [];
      const standing = standings[placementIndex];
      const team = standing?.team;
      if (!team) {
        continue;
      }

      const bucket = entrantsByPlayoffDivision.get(playoffDivisionId) ?? [];
      bucket.push(team);
      entrantsByPlayoffDivision.set(playoffDivisionId, bucket);
    }
  }

  return entrantsByPlayoffDivision;
};

const detachMatchFromTeam = (team: Team | null | undefined, match: Match): void => {
  if (!team?.matches) {
    return;
  }
  team.matches = team.matches.filter((entry) => entry.id !== match.id);
};

const assignTeamOfficialToMatch = (match: Match, team: Team): void => {
  const previousTeamOfficial = match.teamOfficial;
  if (previousTeamOfficial) {
    detachMatchFromTeam(previousTeamOfficial, match);
  }
  match.teamOfficial = team;
  if (!team.matches) {
    team.matches = [];
  }
  if (!team.matches.includes(match)) {
    team.matches.push(match);
  }
};

const windowsOverlap = (
  startA: Date,
  endA: Date,
  startB: Date,
  endB: Date,
): boolean => startA < endB && endA > startB;

const assignTeamToMatch = (
  match: Match,
  attribute: 'team1' | 'team2',
  team: Team,
  seed: number | null = null,
): void => {
  const previousTeam = match[attribute];
  if (previousTeam) {
    detachMatchFromTeam(previousTeam, match);
  }
  match[attribute] = team;
  if (attribute === 'team1') {
    if (typeof seed === 'number') {
      match.team1Seed = seed;
    }
  } else {
    if (typeof seed === 'number') {
      match.team2Seed = seed;
    }
  }
  if (!team.matches) {
    team.matches = [];
  }
  if (!team.matches.includes(match)) {
    team.matches.push(match);
  }
};

const clearPendingPlayoffAssignments = (matches: Match[]): void => {
  for (const match of matches) {
    if (isMatchScored(match)) {
      continue;
    }

    if (match.team1) {
      detachMatchFromTeam(match.team1, match);
    }
    if (match.team2) {
      detachMatchFromTeam(match.team2, match);
    }
    if (match.teamOfficial) {
      detachMatchFromTeam(match.teamOfficial, match);
    }

    match.team1 = null;
    match.team2 = null;
    match.teamOfficial = null;
    match.team1Seed = null;
    match.team2Seed = null;
  }
};

const assignTeamOfficialsForKnownMatches = (matches: Match[], candidates: Team[]): void => {
  const candidatesById = new Map<string, Team>();
  candidates.forEach((team) => {
    if (!team.id || candidatesById.has(team.id)) {
      return;
    }
    candidatesById.set(team.id, team);
  });

  const orderedCandidates = Array.from(candidatesById.values()).sort((left, right) => {
    const leftName = left.name?.trim().toLowerCase() ?? '';
    const rightName = right.name?.trim().toLowerCase() ?? '';
    if (leftName !== rightName) {
      return leftName.localeCompare(rightName);
    }
    return left.id.localeCompare(right.id);
  });

  const orderedMatches = [...matches].sort((left, right) => {
    const startDiff = left.start.getTime() - right.start.getTime();
    if (startDiff !== 0) {
      return startDiff;
    }
    const endDiff = left.end.getTime() - right.end.getTime();
    if (endDiff !== 0) {
      return endDiff;
    }
    return (left.matchId ?? 0) - (right.matchId ?? 0);
  });

  for (const match of orderedMatches) {
    if (isMatchScored(match)) {
      continue;
    }

    const team1 = match.team1;
    const team2 = match.team2;
    if (!team1 || !team2) {
      if (match.teamOfficial) {
        detachMatchFromTeam(match.teamOfficial, match);
        match.teamOfficial = null;
      }
      continue;
    }

    if (match.teamOfficial && (match.teamOfficial.id === team1.id || match.teamOfficial.id === team2.id)) {
      detachMatchFromTeam(match.teamOfficial, match);
      match.teamOfficial = null;
    }

    if (match.teamOfficial) {
      const existingRef = match.teamOfficial;
      const conflict = (existingRef.matches ?? []).some((existingMatch) =>
        existingMatch.id !== match.id
        && windowsOverlap(existingMatch.start, existingMatch.end, match.start, match.end),
      );
      if (!conflict) {
        if (!existingRef.matches) {
          existingRef.matches = [];
        }
        if (!existingRef.matches.includes(match)) {
          existingRef.matches.push(match);
        }
        continue;
      }

      detachMatchFromTeam(existingRef, match);
      match.teamOfficial = null;
    }

    const candidate = orderedCandidates.find((team) => {
      if (team.id === team1.id || team.id === team2.id) {
        return false;
      }
      const teamMatches = team.matches ?? [];
      return !teamMatches.some((teamMatch) =>
        teamMatch.id !== match.id
        && windowsOverlap(teamMatch.start, teamMatch.end, match.start, match.end),
      );
    });

    if (!candidate) {
      continue;
    }

    assignTeamOfficialToMatch(match, candidate);
  }
};

type EntrantSlot = {
  match: Match;
  attribute: 'team1' | 'team2';
  seed: number | null;
  team: Team | null;
};

const collectEntrantSlots = (
  match: Match | null,
  slots: EntrantSlot[],
  visited: Set<string>,
): void => {
  if (!match || visited.has(match.id)) {
    return;
  }
  visited.add(match.id);

  if (match.previousLeftMatch) {
    collectEntrantSlots(match.previousLeftMatch, slots, visited);
  } else {
    slots.push({
      match,
      attribute: 'team1',
      seed: typeof match.team1Seed === 'number' ? match.team1Seed : null,
      team: match.team1 ?? null,
    });
  }

  if (match.previousRightMatch) {
    collectEntrantSlots(match.previousRightMatch, slots, visited);
  } else {
    slots.push({
      match,
      attribute: 'team2',
      seed: typeof match.team2Seed === 'number' ? match.team2Seed : null,
      team: match.team2 ?? null,
    });
  }
};

const countEntrantSlots = (matches: Match[]): number => {
  let slotCount = 0;
  for (const match of matches) {
    if (!match.previousLeftMatch) {
      slotCount += 1;
    }
    if (!match.previousRightMatch) {
      slotCount += 1;
    }
  }
  return slotCount;
};

const maxConfiguredPlayoffEntrants = (
  league: League,
  playoffDivision: Division,
): number => {
  const divisionCapacity = [
    playoffDivision.maxParticipants,
    playoffDivision.playoffTeamCount,
  ]
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
    .map((value) => Math.max(0, Math.trunc(value)));
  const leagueCapacity = typeof league.playoffTeamCount === 'number' && Number.isFinite(league.playoffTeamCount)
    ? Math.max(0, Math.trunc(league.playoffTeamCount))
    : 0;
  return Math.max(leagueCapacity, ...divisionCapacity, 0);
};

const resolveTemplateEntrantCount = (
  league: League,
  playoffDivision: Division,
  playoffMatches: Match[],
  seededTeamCount: number,
): number => {
  const configured = maxConfiguredPlayoffEntrants(league, playoffDivision);
  const observedSlotCount = countEntrantSlots(playoffMatches);
  const observedSeed = playoffMatches.reduce((maxSeed, match) => {
    const team1Seed = typeof match.team1Seed === 'number' ? match.team1Seed : 0;
    const team2Seed = typeof match.team2Seed === 'number' ? match.team2Seed : 0;
    return Math.max(maxSeed, team1Seed, team2Seed);
  }, 0);
  return Math.max(seededTeamCount, configured, observedSlotCount, observedSeed, 2);
};

const buildTemplateEntrants = (
  league: League,
  playoffDivision: Division,
  seededTeams: Team[],
  entrantCount: number,
): Team[] => {
  const entrants: Team[] = [...seededTeams];
  const targetCount = Math.max(entrantCount, seededTeams.length, 2);
  for (let index = seededTeams.length; index < targetCount; index += 1) {
    const seed = index + 1;
    entrants.push(new Team({
      id: `${league.id}__${playoffDivision.id}__seed_placeholder_${seed}`,
      captainId: '',
      division: playoffDivision,
      name: `Seed ${seed}`,
      matches: [],
      playerIds: [],
    }));
  }
  return entrants;
};

const applyTemplateEntrantAssignments = (
  actualRoot: Match,
  templateRoot: Match,
  teamLookup: Record<string, Team>,
): void => {
  const actualSlots: EntrantSlot[] = [];
  const templateSlots: EntrantSlot[] = [];
  collectEntrantSlots(actualRoot, actualSlots, new Set<string>());
  collectEntrantSlots(templateRoot, templateSlots, new Set<string>());

  for (let index = 0; index < actualSlots.length; index += 1) {
    const actualSlot = actualSlots[index];
    if (isMatchScored(actualSlot.match)) {
      continue;
    }
    const templateSlot = templateSlots[index] ?? null;
    const templateSeed = typeof templateSlot?.seed === 'number' ? templateSlot.seed : null;
    const templateTeamId = templateSlot?.team?.id ?? null;
    const mappedTeam = templateTeamId ? (teamLookup[templateTeamId] ?? null) : null;

    if (actualSlot.attribute === 'team1') {
      actualSlot.match.team1Seed = templateSeed;
      actualSlot.match.team1 = null;
    } else {
      actualSlot.match.team2Seed = templateSeed;
      actualSlot.match.team2 = null;
    }

    if (!mappedTeam) {
      continue;
    }

    assignTeamToMatch(actualSlot.match, actualSlot.attribute, mappedTeam, templateSeed);
  }
};

const findPlayoffRootMatch = (matches: Match[]): Match | null => {
  if (!matches.length) {
    return null;
  }

  const finals = matches.filter(
    (match) => !match.winnerNextMatch && !match.losersBracket && (match.previousLeftMatch || match.previousRightMatch),
  );
  if (finals.length) {
    return finals.sort((left, right) => (right.matchId ?? 0) - (left.matchId ?? 0))[0];
  }

  return matches.sort((left, right) => (right.matchId ?? 0) - (left.matchId ?? 0))[0];
};

const resolvePlayoffDivisionTournamentConfig = (
  league: League,
  playoffDivision: Division,
): PlayoffDivisionConfig => {
  const divisionConfig = playoffDivision.playoffConfig ?? null;
  const normalizePositiveInt = (value: unknown, fallback: number): number => {
    const parsed = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }
    return Math.max(1, Math.trunc(parsed));
  };
  const normalizeNonNegativeInt = (value: unknown, fallback: number): number => {
    const parsed = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }
    return Math.max(0, Math.trunc(parsed));
  };
  const normalizePoints = (value: unknown, expectedLength: number, fallback: number[]): number[] => {
    const values = Array.isArray(value)
      ? value
          .map((entry) => (typeof entry === 'number' ? entry : Number(entry)))
          .filter((entry) => Number.isFinite(entry))
          .map((entry) => Math.max(1, Math.trunc(entry)))
      : [...fallback];
    const next = values.slice(0, expectedLength);
    while (next.length < expectedLength) {
      next.push(21);
    }
    return next;
  };

  const doubleElimination = typeof divisionConfig?.doubleElimination === 'boolean'
    ? divisionConfig.doubleElimination
    : Boolean(league.doubleElimination);
  const winnerSetCount = normalizePositiveInt(
    divisionConfig?.winnerSetCount,
    typeof league.winnerSetCount === 'number' && Number.isFinite(league.winnerSetCount)
      ? league.winnerSetCount
      : 1,
  );
  const fallbackLoserSetCount = typeof league.loserSetCount === 'number' && Number.isFinite(league.loserSetCount)
    ? league.loserSetCount
    : 1;
  const rawLoserSetCount = normalizePositiveInt(divisionConfig?.loserSetCount, fallbackLoserSetCount);
  const loserSetCount = doubleElimination ? rawLoserSetCount : 1;
  const winnerPointsFallback = Array.isArray(league.winnerBracketPointsToVictory)
    ? league.winnerBracketPointsToVictory
    : [];
  const loserPointsFallback = Array.isArray(league.loserBracketPointsToVictory)
    ? league.loserBracketPointsToVictory
    : [];
  const fallbackFieldCount = (() => {
    const configuredFieldCount = Object.keys(league.fields ?? {}).length;
    if (configuredFieldCount > 0) {
      return configuredFieldCount;
    }
    if (typeof league.fieldCount === 'number' && Number.isFinite(league.fieldCount)) {
      return Math.max(1, Math.trunc(league.fieldCount));
    }
    return 1;
  })();

  return {
    doubleElimination,
    winnerSetCount,
    loserSetCount,
    winnerBracketPointsToVictory: normalizePoints(
      divisionConfig?.winnerBracketPointsToVictory,
      winnerSetCount,
      winnerPointsFallback,
    ),
    loserBracketPointsToVictory: normalizePoints(
      divisionConfig?.loserBracketPointsToVictory,
      loserSetCount,
      loserPointsFallback,
    ),
    prize: typeof divisionConfig?.prize === 'string' ? divisionConfig.prize : (league.prize ?? ''),
    fieldCount: normalizePositiveInt(
      divisionConfig?.fieldCount,
      fallbackFieldCount,
    ),
    restTimeMinutes: normalizeNonNegativeInt(
      divisionConfig?.restTimeMinutes,
      typeof league.restTimeMinutes === 'number' && Number.isFinite(league.restTimeMinutes)
        ? league.restTimeMinutes
        : 0,
    ),
  };
};

const buildTemplateBracket = (
  league: League,
  playoffDivision: Division,
  seededTeams: Team[],
  context: SchedulerContext,
): Match | null => {
  const playoffConfig = resolvePlayoffDivisionTournamentConfig(league, playoffDivision);
  const clonedTeams: Record<string, Team> = {};
  for (const team of seededTeams) {
    clonedTeams[team.id] = new Team({
      id: team.id,
      captainId: team.captainId,
      division: playoffDivision,
      name: team.name,
      matches: [],
      playerIds: [...(team.playerIds ?? [])],
    });
  }

  if (Object.keys(clonedTeams).length < 2) {
    return null;
  }

  const tournamentFields: Record<string, PlayingField> = {};
  for (const field of Object.values(league.fields)) {
    tournamentFields[field.id] = new PlayingField({
      id: field.id,
      organizationId: field.organizationId ?? null,
      divisions: [playoffDivision],
      matches: [],
      events: [...field.events],
      rentalSlots: [...field.rentalSlots],
      name: field.name,
    });
  }

  const tournament = new Tournament({
    id: `${league.id}-template-${playoffDivision.id}`,
    name: `${league.name} ${playoffDivision.name} Template`,
    start: league.start,
    end: league.end,
    fields: tournamentFields,
    doubleElimination: playoffConfig.doubleElimination,
    matches: {},
    location: league.location,
    organizationId: league.organizationId ?? null,
    winnerSetCount: playoffConfig.winnerSetCount,
    loserSetCount: playoffConfig.loserSetCount,
    winnerBracketPointsToVictory: [...playoffConfig.winnerBracketPointsToVictory],
    loserBracketPointsToVictory: [...playoffConfig.loserBracketPointsToVictory],
    prize: playoffConfig.prize,
    fieldCount: playoffConfig.fieldCount,
    teams: clonedTeams,
    players: league.players,
    waitListIds: [],
    freeAgentIds: [],
    maxParticipants: Object.keys(clonedTeams).length,
    teamSignup: true,
    divisions: [playoffDivision],
    eventType: 'TOURNAMENT',
    timeSlots: league.timeSlots,
    restTimeMinutes: playoffConfig.restTimeMinutes,
    matchDurationMinutes: league.matchDurationMinutes,
    usesSets: league.usesSets,
    setDurationMinutes: league.setDurationMinutes,
  });

  const bracketBuilder = new Brackets(tournament, context);
  bracketBuilder.buildBrackets();
  const matches = Object.values(bracketBuilder.tournament.matches)
    .filter((match) => normalizeToken(match.division?.id) === normalizeToken(playoffDivision.id));
  return findPlayoffRootMatch(matches);
};

export const assignTeamsToPlayoffDivisionMatches = (
  league: League,
  playoffDivisionId: string,
  teams: Team[],
  context: SchedulerContext = noopContext,
): string[] => {
  const playoffDivision = getPlayoffDivisionById(league, playoffDivisionId);
  if (!playoffDivision) {
    return [];
  }

  const normalizedPlayoffDivisionId = normalizeToken(playoffDivision.id);
  if (!normalizedPlayoffDivisionId) {
    return [];
  }

  const playoffMatches = Object.values(league.matches).filter(
    (match) => normalizeToken(match.division?.id) === normalizedPlayoffDivisionId && isPlayoffMatch(match),
  );
  if (!playoffMatches.length) {
    return [];
  }

  const seededTeamIds = teams.map((team) => team.id);
  const templateEntrantCount = resolveTemplateEntrantCount(
    league,
    playoffDivision,
    playoffMatches,
    teams.length,
  );

  clearPendingPlayoffAssignments(playoffMatches);
  if (teams.length < 2) {
    return [];
  }

  const actualRoot = findPlayoffRootMatch(playoffMatches);
  if (!actualRoot) {
    return [];
  }

  const templateEntrants = buildTemplateEntrants(league, playoffDivision, teams, templateEntrantCount);
  const templateRoot = buildTemplateBracket(league, playoffDivision, templateEntrants, context);

  if (!templateRoot) {
    const firstRoundMatch = playoffMatches.find(
      (match) => !match.losersBracket && !match.previousLeftMatch && !match.previousRightMatch,
    );
    if (firstRoundMatch && teams[0] && teams[1]) {
      const team1Seed = typeof firstRoundMatch.team1Seed === 'number' ? firstRoundMatch.team1Seed : 1;
      const team2Seed = typeof firstRoundMatch.team2Seed === 'number' ? firstRoundMatch.team2Seed : 2;
      assignTeamToMatch(firstRoundMatch, 'team1', teams[0], team1Seed);
      assignTeamToMatch(firstRoundMatch, 'team2', teams[1], team2Seed);
    }
    if (league.doTeamsOfficiate) {
      assignTeamOfficialsForKnownMatches(playoffMatches, teams);
    }
    return seededTeamIds;
  }

  const teamLookup = Object.fromEntries(teams.map((team) => [team.id, team]));
  applyTemplateEntrantAssignments(actualRoot, templateRoot, teamLookup);

  if (league.doTeamsOfficiate) {
    assignTeamOfficialsForKnownMatches(playoffMatches, teams);
  }

  return seededTeamIds;
};

export const applyLeagueDivisionPlayoffReassignment = (
  league: League,
  divisionId: string,
  context: SchedulerContext = noopContext,
): {
  affectedPlayoffDivisionIds: string[];
  seededTeamIds: string[];
  teamIdsByPlayoffDivision: Record<string, string[]>;
} => {
  const leagueDivision = getLeagueDivisionById(league, divisionId);
  if (!leagueDivision) {
    throw new Error('League division not found.');
  }

  const playoffTeamCount = getDivisionPlayoffTeamCount(league, leagueDivision);
  if (playoffTeamCount <= 0) {
    return { affectedPlayoffDivisionIds: [], seededTeamIds: [], teamIdsByPlayoffDivision: {} };
  }

  const affectedPlayoffDivisionIds = Array.from(
    new Set(
      (leagueDivision.playoffPlacementDivisionIds ?? [])
        .slice(0, playoffTeamCount)
        .map((entry) => normalizeToken(entry))
        .filter((entry): entry is string => Boolean(entry)),
    ),
  );

  const entrantsByPlayoffDivision = buildPlayoffEntrantsByDivision(league, {
    includeUnconfirmedDivisionId: leagueDivision.id,
  });

  const seededTeamIds: string[] = [];
  const teamIdsByPlayoffDivision: Record<string, string[]> = {};

  for (const playoffDivisionId of affectedPlayoffDivisionIds) {
    const playoffDivision = getPlayoffDivisionById(league, playoffDivisionId);
    if (!playoffDivision) {
      continue;
    }

    const capacity = typeof playoffDivision.maxParticipants === 'number' && Number.isFinite(playoffDivision.maxParticipants)
      ? Math.max(0, Math.trunc(playoffDivision.maxParticipants))
      : 0;
    const entrants = entrantsByPlayoffDivision.get(playoffDivisionId) ?? [];

    if (capacity > 0 && entrants.length > capacity) {
      throw new Error(`Playoff division "${playoffDivision.name}" exceeded capacity (${entrants.length}/${capacity}).`);
    }

    const assignedTeamIds = assignTeamsToPlayoffDivisionMatches(
      league,
      playoffDivisionId,
      entrants,
      context,
    );
    const normalizedAssignedTeamIds = Array.from(
      new Set(
        assignedTeamIds
          .map((teamId) => (typeof teamId === 'string' ? teamId.trim() : ''))
          .filter((teamId): teamId is string => teamId.length > 0),
      ),
    );
    playoffDivision.teamIds = normalizedAssignedTeamIds;
    teamIdsByPlayoffDivision[playoffDivision.id] = normalizedAssignedTeamIds;
    seededTeamIds.push(...assignedTeamIds);
  }

  return {
    affectedPlayoffDivisionIds,
    seededTeamIds: Array.from(new Set(seededTeamIds)),
    teamIdsByPlayoffDivision,
  };
};

