type LegacyOfficialCheckInUpdate = {
  officialCheckIn?: unknown;
  officialCheckedIn?: boolean;
  team1Points?: unknown;
  team2Points?: unknown;
  setResults?: unknown;
  lifecycle?: unknown;
  segmentOperations?: unknown;
  incidentOperations?: unknown;
  matchAction?: unknown;
  finalize?: unknown;
};

type LegacyOfficialCheckInAccess = {
  isHostOrAdmin: boolean;
  isOfficial: boolean;
};

const hasNonZeroScore = (value: unknown): boolean => {
  if (Array.isArray(value)) {
    return value.some((entry) => Number(entry) !== 0);
  }
  if (!value || typeof value !== 'object') {
    return false;
  }
  return Object.values(value).some((entry) => Number(entry) !== 0);
};

const hasSegmentStateMutation = (value: unknown): boolean => {
  if (!Array.isArray(value)) {
    return false;
  }
  return value.some((operation) => {
    if (!operation || typeof operation !== 'object') {
      return true;
    }
    const row = operation as Record<string, unknown>;
    const status = typeof row.status === 'string' ? row.status.trim().toUpperCase() : '';
    return (
      (status.length > 0 && status !== 'NOT_STARTED') ||
      hasNonZeroScore(row.scores) ||
      Boolean(row.winnerEventTeamId) ||
      Boolean(row.startedAt) ||
      Boolean(row.endedAt) ||
      Boolean(row.resultType) ||
      Boolean(row.statusReason)
    );
  });
};

const hasMatchStateMutation = (update: LegacyOfficialCheckInUpdate): boolean => (
  update.lifecycle !== undefined ||
  update.matchAction !== undefined ||
  update.finalize === true ||
  (Array.isArray(update.incidentOperations) && update.incidentOperations.length > 0) ||
  hasNonZeroScore(update.team1Points) ||
  hasNonZeroScore(update.team2Points) ||
  hasNonZeroScore(update.setResults) ||
  hasSegmentStateMutation(update.segmentOperations)
);

/**
 * Older mobile clients send a complete match update to check in an assigned
 * official. Keep that request compatible, but reduce it to the one operation
 * the official is authorized to perform.
 */
export const normalizeLegacyOfficialCheckIn = <T extends LegacyOfficialCheckInUpdate>(
  update: T,
  access: LegacyOfficialCheckInAccess,
): T => {
  const isLegacyOfficialCheckIn =
    !access.isHostOrAdmin &&
    access.isOfficial &&
    update.officialCheckIn === undefined &&
    update.officialCheckedIn === true &&
    !hasMatchStateMutation(update);

  if (!isLegacyOfficialCheckIn) {
    return update;
  }

  return { officialCheckIn: { checkedIn: true } } as T;
};
