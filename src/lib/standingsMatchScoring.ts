type StandingsTeamRef = {
  id?: string | null;
  $id?: string | null;
} | null | undefined;

type StandingsMatchRulesLike = {
  scoringModel?: unknown;
  pointIncidentRequiresParticipant?: unknown;
} | null | undefined;

type StandingsMatchSegmentLike = {
  id?: string | null;
  $id?: string | null;
  sequence?: number | null;
  status?: string | null;
  scores?: Record<string, unknown> | null;
  winnerEventTeamId?: string | null;
} | null | undefined;

type StandingsMatchIncidentLike = {
  segmentId?: string | null;
  eventTeamId?: string | null;
  linkedPointDelta?: number | null;
  sequence?: number | null;
} | null | undefined;

export type StandingsMatchLike = {
  team1?: StandingsTeamRef;
  team2?: StandingsTeamRef;
  team1Id?: string | null;
  team2Id?: string | null;
  team1Points?: unknown;
  team2Points?: unknown;
  setResults?: unknown;
  segments?: StandingsMatchSegmentLike[] | null;
  incidents?: StandingsMatchIncidentLike[] | null;
  matchRulesSnapshot?: StandingsMatchRulesLike;
  resolvedMatchRules?: StandingsMatchRulesLike;
};

export type StandingsMatchOutcome = 'team1' | 'team2' | 'draw' | null;

export type DerivedStandingsMatchResult = {
  team1Id: string | null;
  team2Id: string | null;
  team1Total: number;
  team2Total: number;
  team1Wins: number;
  team2Wins: number;
  allSegmentsResolved: boolean;
  usesIncidentScoring: boolean;
  outcome: StandingsMatchOutcome;
};

type CanonicalSegment = {
  id: string;
  sequence: number;
  status: string | null;
  scores: Record<string, number>;
  winnerEventTeamId: string | null;
};

const normalizeIdToken = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

const toFiniteNumber = (value: unknown): number => {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

const toNumberArray = (value: unknown): number[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((entry) => toFiniteNumber(entry));
};

const sumPoints = (values: number[]): number =>
  values.reduce((total, value) => total + (Number.isFinite(value) ? value : 0), 0);

const resolveParticipantId = (team: StandingsTeamRef, fallback: string | null | undefined): string | null => (
  normalizeIdToken(team?.id ?? team?.$id ?? fallback)
);

const getMatchRules = (match: StandingsMatchLike): StandingsMatchRulesLike => (
  match.resolvedMatchRules ?? match.matchRulesSnapshot ?? null
);

const getCanonicalSegments = (match: StandingsMatchLike, team1Id: string | null, team2Id: string | null): CanonicalSegment[] => {
  const segments = Array.isArray(match.segments)
    ? match.segments
        .filter((segment): segment is NonNullable<StandingsMatchSegmentLike> => Boolean(segment))
        .map((segment, index) => ({
          id: normalizeIdToken(segment.id ?? segment.$id) ?? `segment_${index + 1}`,
          sequence: Number.isFinite(Number(segment.sequence)) ? Math.trunc(Number(segment.sequence)) : index + 1,
          status: typeof segment.status === 'string' ? segment.status : null,
          scores: Object.fromEntries(
            Object.entries(segment.scores ?? {}).map(([participantId, score]) => [participantId, toFiniteNumber(score)]),
          ),
          winnerEventTeamId: normalizeIdToken(segment.winnerEventTeamId),
        }))
        .sort((left, right) => left.sequence - right.sequence)
    : [];

  const rules = getMatchRules(match);
  const usesIncidentScoring = rules?.pointIncidentRequiresParticipant === true;
  if (!usesIncidentScoring) {
    return segments;
  }

  const incidents = Array.isArray(match.incidents)
    ? match.incidents.filter((incident): incident is NonNullable<StandingsMatchIncidentLike> => Boolean(incident))
    : [];
  if (!incidents.length) {
    return segments;
  }

  const orderedSegments: CanonicalSegment[] = segments.map((segment) => ({
    ...segment,
    scores: {},
  }));
  const segmentIndexes = new Map<string, number>();
  orderedSegments.forEach((segment, index) => {
    segmentIndexes.set(segment.id, index);
  });

  const sortedIncidents = [...incidents].sort((left, right) => toFiniteNumber(left.sequence) - toFiniteNumber(right.sequence));
  sortedIncidents.forEach((incident) => {
    const segmentId = normalizeIdToken(incident.segmentId);
    const participantId = normalizeIdToken(incident.eventTeamId);
    const delta = Math.trunc(toFiniteNumber(incident.linkedPointDelta));
    if (!segmentId || !participantId || delta === 0) {
      return;
    }
    if (participantId !== team1Id && participantId !== team2Id) {
      return;
    }

    let segmentIndex = segmentIndexes.get(segmentId) ?? null;
    if (segmentIndex === null) {
      segmentIndex = orderedSegments.length;
      orderedSegments.push({
        id: segmentId,
        sequence: segmentIndex + 1,
        status: null,
        scores: {},
        winnerEventTeamId: null,
      });
      segmentIndexes.set(segmentId, segmentIndex);
    }

    const segment = orderedSegments[segmentIndex];
    const currentScore = toFiniteNumber(segment.scores[participantId]);
    segment.scores[participantId] = Math.max(0, currentScore + delta);
  });

  return orderedSegments.sort((left, right) => left.sequence - right.sequence);
};

const getSegmentScore = (segment: CanonicalSegment, participantId: string | null): number => (
  participantId ? toFiniteNumber(segment.scores[participantId]) : 0
);

const getSegmentWinner = (segment: CanonicalSegment, team1Id: string | null, team2Id: string | null): string | null => {
  const explicitWinner = normalizeIdToken(segment.winnerEventTeamId);
  if (explicitWinner && (explicitWinner === team1Id || explicitWinner === team2Id)) {
    return explicitWinner;
  }

  if (segment.status !== 'COMPLETE') {
    return null;
  }

  const team1Score = getSegmentScore(segment, team1Id);
  const team2Score = getSegmentScore(segment, team2Id);
  if (team1Score === team2Score) {
    return null;
  }
  return team1Score > team2Score ? team1Id : team2Id;
};

export const deriveStandingsMatchResult = (match: StandingsMatchLike): DerivedStandingsMatchResult => {
  const team1Id = resolveParticipantId(match.team1, match.team1Id);
  const team2Id = resolveParticipantId(match.team2, match.team2Id);
  const usesIncidentScoring = getMatchRules(match)?.pointIncidentRequiresParticipant === true;
  const segments = usesIncidentScoring
    ? getCanonicalSegments(match, team1Id, team2Id)
    : [];

  let team1Total = 0;
  let team2Total = 0;
  let team1Wins = 0;
  let team2Wins = 0;
  let allSegmentsResolved = false;

  if (segments.length > 0) {
    team1Total = sumPoints(segments.map((segment) => getSegmentScore(segment, team1Id)));
    team2Total = sumPoints(segments.map((segment) => getSegmentScore(segment, team2Id)));
    const segmentWinners = segments
      .map((segment) => getSegmentWinner(segment, team1Id, team2Id))
      .filter((winnerId): winnerId is string => Boolean(winnerId));
    team1Wins = segmentWinners.filter((winnerId) => winnerId === team1Id).length;
    team2Wins = segmentWinners.filter((winnerId) => winnerId === team2Id).length;
    allSegmentsResolved = segments.length > 0 && segments.every((segment) => {
      if (getSegmentWinner(segment, team1Id, team2Id)) {
        return true;
      }
      return segment.status === 'COMPLETE';
    });
  } else {
    const setResults = toNumberArray(match.setResults);
    team1Wins = setResults.filter((result) => result === 1).length;
    team2Wins = setResults.filter((result) => result === 2).length;
    allSegmentsResolved = setResults.length > 0 && setResults.every((result) => result === 1 || result === 2);
    team1Total = sumPoints(toNumberArray(match.team1Points));
    team2Total = sumPoints(toNumberArray(match.team2Points));
  }

  let outcome: StandingsMatchOutcome = null;
  if (team1Wins > team2Wins) {
    outcome = 'team1';
  } else if (team2Wins > team1Wins) {
    outcome = 'team2';
  } else if (allSegmentsResolved) {
    outcome = 'draw';
  } else if (team1Total > 0 || team2Total > 0) {
    if (team1Total > team2Total) {
      outcome = 'team1';
    } else if (team2Total > team1Total) {
      outcome = 'team2';
    } else {
      outcome = 'draw';
    }
  }

  return {
    team1Id,
    team2Id,
    team1Total,
    team2Total,
    team1Wins,
    team2Wins,
    allSegmentsResolved,
    usesIncidentScoring,
    outcome,
  };
};
