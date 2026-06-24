import {
  canIncreaseSetScore,
  getSetScoreState,
  resolveSetVictoryTarget,
} from '@/lib/matchSetScoring';
import type { MatchSegment } from '@/types';

type SegmentOperationLike = {
  sequence: number;
  status?: string;
  scores?: Record<string, number>;
  winnerEventTeamId?: string | null;
};

type LegacySetScoreUpdate = {
  team1Points?: number[];
  team2Points?: number[];
  setResults?: number[];
};

const normalizeIdToken = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
};

const objectId = (value: unknown): string | null => {
  if (typeof value === 'string') return normalizeIdToken(value);
  if (!value || typeof value !== 'object') return null;
  const row = value as { id?: unknown; $id?: unknown; key?: unknown };
  return normalizeIdToken(row.id) ?? normalizeIdToken(row.$id) ?? normalizeIdToken(row.key);
};

const positiveIntOrNull = (value: unknown): number | null => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : null;
};

const nonNegativeScore = (value: unknown): number => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
};

const pointsList = (value: unknown): number[] | null => {
  if (!Array.isArray(value) || value.length === 0) return null;
  const normalized = value
    .map((entry) => positiveIntOrNull(entry))
    .filter((entry): entry is number => entry !== null);
  return normalized.length ? normalized : null;
};

const divisionKey = (value: unknown): string | null => {
  const id = objectId(value);
  return id ? id.toLowerCase() : null;
};

const matchUsesSetScoring = (event: any, match: any): boolean => {
  const rules = (match?.matchRulesSnapshot ?? match?.resolvedMatchRules ?? event?.resolvedMatchRules ?? {}) as {
    scoringModel?: unknown;
  };
  return rules.scoringModel === 'SETS' || event?.usesSets === true;
};

const isPlayoffMatch = (event: any, match: any): boolean => (
  event?.eventType === 'TOURNAMENT'
  || Boolean(match?.losersBracket || match?.winnerNextMatchId || match?.loserNextMatchId)
);

const resolveMatchDivision = (event: any, match: any, playoff: boolean): any | null => {
  const matchDivisionKey = divisionKey(match?.division)
    ?? divisionKey(match?.team1?.division)
    ?? divisionKey(match?.team2?.division);
  if (!matchDivisionKey) {
    return match?.division && typeof match.division === 'object' ? match.division : null;
  }

  const preferredSources = playoff
    ? [event?.playoffDivisionDetails, event?.playoffDivisions, event?.divisionDetails, event?.divisions]
    : [event?.divisionDetails, event?.divisions, event?.playoffDivisionDetails, event?.playoffDivisions];
  for (const source of preferredSources) {
    if (!Array.isArray(source)) continue;
    const division = source.find((entry) => divisionKey(entry) === matchDivisionKey);
    if (division) return division;
  }

  return match?.division && typeof match.division === 'object' ? match.division : null;
};

const resolvePointTargets = (event: any, match: any): number[] | null => {
  const matchTargets = pointsList(match?.matchRulesSnapshot?.setPointTargets)
    ?? pointsList(match?.resolvedMatchRules?.setPointTargets);
  if (matchTargets) return matchTargets;

  const playoff = isPlayoffMatch(event, match);
  const division = resolveMatchDivision(event, match, playoff);
  if (playoff) {
    const config = division?.playoffConfig;
    const bracketTargets = match?.losersBracket
      ? pointsList(config?.loserBracketPointsToVictory) ?? pointsList(event?.loserBracketPointsToVictory)
      : pointsList(config?.winnerBracketPointsToVictory) ?? pointsList(event?.winnerBracketPointsToVictory);
    return bracketTargets;
  }

  return pointsList(division?.pointsToVictory)
    ?? pointsList(division?.leagueConfig?.pointsToVictory)
    ?? pointsList(event?.pointsToVictory)
    ?? pointsList(event?.leagueConfig?.pointsToVictory);
};

export const resolveSetVictoryTargetForMatch = (
  event: any,
  match: any,
  sequence: number,
): number | null => (
  resolveSetVictoryTarget(resolvePointTargets(event, match), Math.max(0, sequence - 1))
);

const matchTeamIds = (match: any): [string | null, string | null] => [
  normalizeIdToken(match?.team1?.id ?? match?.team1?.$id ?? match?.team1Id),
  normalizeIdToken(match?.team2?.id ?? match?.team2?.$id ?? match?.team2Id),
];

const segmentScore = (
  segment: MatchSegment | undefined,
  eventTeamId: string | null,
  fallback: unknown,
): number => {
  if (!eventTeamId) return nonNegativeScore(fallback);
  return nonNegativeScore(segment?.scores?.[eventTeamId] ?? fallback);
};

const segmentForSequence = (match: any, sequence: number): MatchSegment | undefined => (
  Array.isArray(match?.segments)
    ? match.segments.find((segment: MatchSegment) => segment.sequence === sequence)
    : undefined
);

const invalidSetScoreResponse = () => (
  new Response('A set can only finish at the victory target, or above it when the winner leads by 2.', { status: 400 })
);

export const assertSetScoreUpdateAllowed = (params: {
  event: any;
  match: any;
  segment: MatchSegment;
  nextScores: Record<string, number>;
  previousPoints: number;
  nextPoints: number;
}) => {
  if (!matchUsesSetScoring(params.event, params.match) || params.nextPoints <= params.previousPoints) {
    return;
  }

  const target = resolveSetVictoryTargetForMatch(params.event, params.match, params.segment.sequence);
  if (!target) return;

  const [team1Id, team2Id] = matchTeamIds(params.match);
  const currentTeam1Score = segmentScore(params.segment, team1Id, params.segment.scores?.[team1Id ?? '']);
  const currentTeam2Score = segmentScore(params.segment, team2Id, params.segment.scores?.[team2Id ?? '']);
  const nextTeam1Score = team1Id ? nonNegativeScore(params.nextScores[team1Id]) : currentTeam1Score;
  const nextTeam2Score = team2Id ? nonNegativeScore(params.nextScores[team2Id]) : currentTeam2Score;

  if (!canIncreaseSetScore(currentTeam1Score, currentTeam2Score, nextTeam1Score, nextTeam2Score, target)) {
    throw invalidSetScoreResponse();
  }
};

export const assertSetSegmentOperationsAllowed = (
  event: any,
  match: any,
  operations: SegmentOperationLike[] | undefined,
) => {
  if (!matchUsesSetScoring(event, match) || !Array.isArray(operations)) {
    return;
  }

  const [team1Id, team2Id] = matchTeamIds(match);
  if (!team1Id || !team2Id) return;

  for (const operation of operations) {
    const status = String(operation.status ?? '').trim().toUpperCase();
    const winnerEventTeamId = normalizeIdToken(operation.winnerEventTeamId);
    if (status !== 'COMPLETE' && !winnerEventTeamId) {
      continue;
    }

    const target = resolveSetVictoryTargetForMatch(event, match, operation.sequence);
    if (!target) continue;

    const existing = segmentForSequence(match, operation.sequence);
    const scores = operation.scores ?? existing?.scores ?? {};
    const team1Score = nonNegativeScore(scores[team1Id]);
    const team2Score = nonNegativeScore(scores[team2Id]);
    const state = getSetScoreState(team1Score, team2Score, target);
    const expectedWinnerId = team1Score > team2Score ? team1Id : team2Score > team1Score ? team2Id : null;

    if (!state.isValidFinalScore || !expectedWinnerId || winnerEventTeamId !== expectedWinnerId) {
      throw invalidSetScoreResponse();
    }
  }
};

export const assertLegacySetScoreUpdateAllowed = (
  event: any,
  match: any,
  update: LegacySetScoreUpdate,
) => {
  if (!matchUsesSetScoring(event, match)) {
    return;
  }

  const [team1Id, team2Id] = matchTeamIds(match);
  if (!team1Id || !team2Id) return;

  const nextTeam1Points = Array.isArray(update.team1Points) ? update.team1Points : [];
  const nextTeam2Points = Array.isArray(update.team2Points) ? update.team2Points : [];
  const nextSetResults = Array.isArray(update.setResults) ? update.setResults : [];
  const length = Math.max(nextTeam1Points.length, nextTeam2Points.length, nextSetResults.length);
  for (let index = 0; index < length; index += 1) {
    const sequence = index + 1;
    const target = resolveSetVictoryTargetForMatch(event, match, sequence);
    if (!target) continue;

    const existing = segmentForSequence(match, sequence);
    const currentTeam1Score = segmentScore(existing, team1Id, match?.team1Points?.[index]);
    const currentTeam2Score = segmentScore(existing, team2Id, match?.team2Points?.[index]);
    const nextTeam1Score = Object.prototype.hasOwnProperty.call(nextTeam1Points, index)
      ? nonNegativeScore(nextTeam1Points[index])
      : currentTeam1Score;
    const nextTeam2Score = Object.prototype.hasOwnProperty.call(nextTeam2Points, index)
      ? nonNegativeScore(nextTeam2Points[index])
      : currentTeam2Score;

    if (
      (nextTeam1Score > currentTeam1Score || nextTeam2Score > currentTeam2Score)
      && !canIncreaseSetScore(currentTeam1Score, currentTeam2Score, nextTeam1Score, nextTeam2Score, target)
    ) {
      throw invalidSetScoreResponse();
    }

    const result = Number(nextSetResults[index] ?? 0);
    if (result !== 1 && result !== 2) {
      continue;
    }

    const state = getSetScoreState(nextTeam1Score, nextTeam2Score, target);
    const expectedResult = nextTeam1Score > nextTeam2Score ? 1 : nextTeam2Score > nextTeam1Score ? 2 : 0;
    if (!state.isValidFinalScore || result !== expectedResult) {
      throw invalidSetScoreResponse();
    }
  }
};
