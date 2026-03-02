import { Sport } from '@/types';

type ResolveDraftSportParams = {
  sportId?: string | null;
  sportConfig?: Sport | null;
  sportsById: Map<string, Sport>;
};

// Prefer the form's active sport object when it matches the selected id so
// scoring mode mirrors what the user saw while editing.
export const resolveDraftSportForScoring = ({
  sportId,
  sportConfig,
  sportsById,
}: ResolveDraftSportParams): Sport | null => {
  const selectedSportId = typeof sportId === 'string' ? sportId.trim() : '';
  const currentSport =
    sportConfig && typeof sportConfig === 'object' ? sportConfig : null;

  if (!selectedSportId) {
    return currentSport;
  }

  if (currentSport?.$id === selectedSportId) {
    return currentSport;
  }

  return sportsById.get(selectedSportId) ?? currentSport;
};
