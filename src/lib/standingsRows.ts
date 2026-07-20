const normalizeDivisionKey = (value: string | null | undefined): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
};

type ShouldUseServerStandingsRowsOptions = {
  selectedDivisionId: string | null | undefined;
  loadedDivisionId: string | null | undefined;
  localRowCount: number;
  serverRowCount: number;
};

export const shouldUseServerStandingsRows = ({
  selectedDivisionId,
  loadedDivisionId,
  localRowCount,
  serverRowCount,
}: ShouldUseServerStandingsRowsOptions): boolean => {
  const selectedDivisionKey = normalizeDivisionKey(selectedDivisionId);
  const loadedDivisionKey = normalizeDivisionKey(loadedDivisionId);

  if (!selectedDivisionKey || !loadedDivisionKey || selectedDivisionKey !== loadedDivisionKey) {
    return false;
  }

  if (localRowCount > 0) {
    return false;
  }

  return serverRowCount > 0;
};

type TeamBelongsToSelectedStandingsDivisionOptions = {
  selectedDivisionId: string | null | undefined;
  fallbackDivisionId?: string | null | undefined;
  selectedDivisionTeamIds?: Iterable<string>;
  teamId: string | null | undefined;
  teamDivisionId: string | null | undefined;
};

export const teamBelongsToSelectedStandingsDivision = ({
  selectedDivisionId,
  fallbackDivisionId,
  selectedDivisionTeamIds,
  teamId,
  teamDivisionId,
}: TeamBelongsToSelectedStandingsDivisionOptions): boolean => {
  const selectedDivisionKey = normalizeDivisionKey(selectedDivisionId);
  if (!selectedDivisionKey) {
    return true;
  }

  const normalizedTeamId = typeof teamId === 'string' ? teamId.trim() : '';
  let hasExplicitDivisionTeamIds = false;
  if (normalizedTeamId && selectedDivisionTeamIds) {
    for (const divisionTeamId of selectedDivisionTeamIds) {
      const normalizedDivisionTeamId = typeof divisionTeamId === 'string' ? divisionTeamId.trim() : '';
      if (!normalizedDivisionTeamId) {
        continue;
      }
      hasExplicitDivisionTeamIds = true;
      if (normalizedDivisionTeamId === normalizedTeamId) {
        return true;
      }
    }
  }

  if (hasExplicitDivisionTeamIds) {
    return false;
  }

  const teamDivisionKey = normalizeDivisionKey(teamDivisionId);
  return teamDivisionKey === selectedDivisionKey || (
    Boolean(teamDivisionKey) && teamDivisionKey === normalizeDivisionKey(fallbackDivisionId)
  );
};
