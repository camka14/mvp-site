const normalizeIdToken = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

const resolvedParticipantId = (value: unknown): string | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const row = value as Record<string, unknown>;
  return normalizeIdToken(row.id ?? row.$id);
};

export const hasResolvedMatchParticipants = (match: unknown): boolean => {
  if (!match || typeof match !== 'object' || Array.isArray(match)) {
    return false;
  }
  const row = match as Record<string, unknown>;
  const team1Id = resolvedParticipantId(row.team1);
  const team2Id = resolvedParticipantId(row.team2);
  return Boolean(team1Id && team2Id && team1Id !== team2Id);
};
