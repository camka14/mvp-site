import {
  divisionTypeIdsEquivalent,
  getDivisionTypeOptionsForSport,
  type DivisionRatingType,
} from '@/lib/divisionTypes';
import type { Division, Team } from '@/types';

const FILTER_VALUE_DELIMITER = '::';

export type TeamDivisionFilterOption = {
  value: string;
  label: string;
  sport: string;
  divisionTypeId: string;
  divisionTypeName: string;
  ratingType: DivisionRatingType;
};

export const normalizeTeamFilterText = (value: unknown): string => String(value ?? '')
  .trim()
  .toLowerCase();

const sportMatchesFilter = (sport: unknown, selectedSport: unknown): boolean => {
  const normalizedSport = normalizeTeamFilterText(sport);
  const normalizedSelectedSport = normalizeTeamFilterText(selectedSport);
  if (!normalizedSport || !normalizedSelectedSport) {
    return false;
  }
  return (
    normalizedSport === normalizedSelectedSport
    || normalizedSport.includes(normalizedSelectedSport)
    || normalizedSelectedSport.includes(normalizedSport)
  );
};

const getUniqueSportsInOrder = (sports: string[]): string[] => {
  const seen = new Set<string>();
  const ordered: string[] = [];
  sports.forEach((sport) => {
    const trimmed = sport.trim();
    const normalized = normalizeTeamFilterText(trimmed);
    if (!trimmed || seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    ordered.push(trimmed);
  });
  return ordered;
};

export const buildTeamDivisionFilterValue = (sport: string, divisionTypeId: string): string => (
  `${normalizeTeamFilterText(sport)}${FILTER_VALUE_DELIMITER}${normalizeTeamFilterText(divisionTypeId)}`
);

export const buildTeamDivisionFilterOptions = (selectedSports: string[]): TeamDivisionFilterOption[] => {
  const sports = getUniqueSportsInOrder(selectedSports);
  const shouldScopeSkillLabels = sports.length > 1;

  return sports.flatMap((sport) =>
    getDivisionTypeOptionsForSport(sport).map((option) => ({
      value: buildTeamDivisionFilterValue(sport, option.id),
      label: shouldScopeSkillLabels && option.ratingType === 'SKILL'
        ? `${sport}: ${option.name}`
        : option.name,
      sport,
      divisionTypeId: option.id,
      divisionTypeName: option.name,
      ratingType: option.ratingType,
    })),
  );
};

const getDivisionObject = (team: Team): Division | null => (
  team.division && typeof team.division === 'object' ? team.division : null
);

const getTeamDivisionCandidates = (team: Team): unknown[] => {
  const division = getDivisionObject(team);
  return [
    team.divisionTypeId,
    division?.divisionTypeId,
    division?.id,
    division?.key,
    division?.divisionTypeName,
    division?.name,
    division?.skillLevel,
    typeof team.division === 'string' ? team.division : null,
  ];
};

const teamMatchesDivisionOption = (team: Team, option: TeamDivisionFilterOption): boolean => {
  if (!sportMatchesFilter(team.sport, option.sport)) {
    return false;
  }

  const normalizedOptionName = normalizeTeamFilterText(option.divisionTypeName);
  const normalizedOptionId = normalizeTeamFilterText(option.divisionTypeId);

  return getTeamDivisionCandidates(team).some((candidate) => {
    const normalizedCandidate = normalizeTeamFilterText(candidate);
    if (!normalizedCandidate) {
      return false;
    }
    return (
      divisionTypeIdsEquivalent(normalizedCandidate, option.divisionTypeId)
      || normalizedCandidate === normalizedOptionId
      || normalizedCandidate === normalizedOptionName
    );
  });
};

export const filterOpenRegistrationTeams = (
  teams: Team[],
  params: {
    selectedSports: string[];
    selectedDivisionTypeValues: string[];
    divisionTypeOptions: TeamDivisionFilterOption[];
  },
): Team[] => {
  const selectedSports = getUniqueSportsInOrder(params.selectedSports);
  const selectedDivisionValues = new Set(params.selectedDivisionTypeValues);
  const selectedDivisionOptions = params.divisionTypeOptions.filter((option) =>
    selectedDivisionValues.has(option.value),
  );

  return teams.filter((team) => {
    if (team.openRegistration !== true) {
      return false;
    }
    if (selectedSports.length && !selectedSports.some((sport) => sportMatchesFilter(team.sport, sport))) {
      return false;
    }
    if (
      selectedDivisionOptions.length
      && !selectedDivisionOptions.some((option) => teamMatchesDivisionOption(team, option))
    ) {
      return false;
    }
    return true;
  });
};
