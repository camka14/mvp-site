import { DEFAULT_SPORTS } from '../defaultSports';

type SportAlias = {
  alias: string;
  canonicalName: string;
};

export type AffiliateSportRepair = {
  sourceSportName: string | null;
  canonicalSportNames: string[];
  excludedBlacklistedSportNames: string[];
  canRepair: boolean;
  rationale: string;
};

export const mergeAffiliateOrganizationSports = (
  existingSports: unknown,
  repairedSportNames: string[],
  catalogNames: string[],
): string[] => {
  const catalogSet = new Set(catalogNames);
  const validExistingSports = Array.isArray(existingSports)
    ? existingSports.filter((sport): sport is string => (
      typeof sport === 'string' && catalogSet.has(sport)
    ))
    : [];
  const validRepairedSports = repairedSportNames.filter((sport) => catalogSet.has(sport));
  return Array.from(new Set([...validExistingSports, ...validRepairedSports]));
};

const defaultCanonicalSportNames = Array.from(new Set(
  DEFAULT_SPORTS
    .map((sport) => (typeof sport.name === 'string' ? sport.name.trim() : ''))
    .filter(Boolean),
));

const specialSportAliases: SportAlias[] = [
  { alias: 'Australian Rules Football', canonicalName: 'Australian Football' },
  { alias: 'Australian Football', canonicalName: 'Australian Football' },
  { alias: 'American Football', canonicalName: 'Football' },
  { alias: 'Arena Football', canonicalName: 'Football' },
  { alias: 'Ice Hockey', canonicalName: 'Hockey' },
  { alias: 'Fastpitch Softball', canonicalName: 'Softball' },
  { alias: 'Beach Volleyball', canonicalName: 'Beach Volleyball' },
  { alias: 'Grass Volleyball', canonicalName: 'Grass Volleyball' },
  { alias: 'Indoor Volleyball', canonicalName: 'Indoor Volleyball' },
  { alias: 'Beach Soccer', canonicalName: 'Beach Soccer' },
  { alias: 'Grass Soccer', canonicalName: 'Grass Soccer' },
  { alias: 'Indoor Soccer', canonicalName: 'Indoor Soccer' },
];

const surfaceLessSportNames = new Set(['Soccer', 'Volleyball']);

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const canonicalSportAliases = (canonicalSportNames: string[]): SportAlias[] => {
  const specialCanonicalNames = new Set(
    specialSportAliases
      .filter((alias) => alias.alias === alias.canonicalName)
      .map((alias) => alias.canonicalName),
  );
  const directAliases = canonicalSportNames
    // "Other" is a real catalog row for an explicitly unknown sport, but it
    // must not absorb vague phrases such as "other field sports".
    .filter((canonicalName) => (
      !specialCanonicalNames.has(canonicalName)
      && canonicalName !== 'Other'
      && !surfaceLessSportNames.has(canonicalName)
    ))
    .map((canonicalName) => ({ alias: canonicalName, canonicalName }));
  return [...specialSportAliases, ...directAliases]
    .sort((left, right) => right.alias.length - left.alias.length);
};

const findAliases = (sourceSportName: string, aliases: SportAlias[]) => {
  const matches: Array<{ start: number; end: number; canonicalName: string; alias: string }> = [];
  aliases.forEach(({ alias, canonicalName }) => {
    const pattern = new RegExp(`\\b${escapeRegExp(alias)}\\b`, 'gi');
    let match = pattern.exec(sourceSportName);
    while (match) {
      matches.push({
        start: match.index,
        end: match.index + match[0].length,
        canonicalName,
        alias,
      });
      match = pattern.exec(sourceSportName);
    }
  });

  matches.sort((left, right) => (
    left.start - right.start
    || (right.end - right.start) - (left.end - left.start)
    || left.alias.localeCompare(right.alias)
  ));

  const selected: typeof matches = [];
  matches.forEach((match) => {
    const overlaps = selected.some((selectedMatch) => (
      match.start < selectedMatch.end && match.end > selectedMatch.start
    ));
    if (!overlaps) selected.push(match);
  });
  return selected.sort((left, right) => left.start - right.start);
};

const blacklistedNamesInLabel = (sourceSportName: string): string[] => (
  ['Cheerleading', 'Dance', 'Running', 'Swimming', 'Track and Field', 'Golf']
    .filter((name) => new RegExp(`\\b${escapeRegExp(name)}\\b`, 'i').test(sourceSportName))
);

export const repairAffiliateSportLabel = (
  value: unknown,
  catalogNames: string[] = defaultCanonicalSportNames,
): AffiliateSportRepair => {
  const sourceSportName = typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
  if (!sourceSportName) {
    return {
      sourceSportName: null,
      canonicalSportNames: [],
      excludedBlacklistedSportNames: [],
      canRepair: false,
      rationale: 'The source did not provide a sport label.',
    };
  }

  const catalogSet = new Set(catalogNames);
  const matches = findAliases(sourceSportName, canonicalSportAliases(catalogNames));
  const canonicalSportNames = Array.from(new Set(
    matches
      .map((match) => match.canonicalName)
      .filter((name) => catalogSet.has(name)),
  ));
  const excludedBlacklistedSportNames = blacklistedNamesInLabel(sourceSportName);

  if (canonicalSportNames.length === 0) {
    return {
      sourceSportName,
      canonicalSportNames,
      excludedBlacklistedSportNames,
      canRepair: false,
      rationale: excludedBlacklistedSportNames.length > 0
        ? `The source label contains only blacklisted or unsupported sports: ${excludedBlacklistedSportNames.join(', ')}.`
        : 'The source label does not contain a current canonical sport.',
    };
  }

  const excludedText = excludedBlacklistedSportNames.length > 0
    ? ` Excluded blacklisted sports: ${excludedBlacklistedSportNames.join(', ')}.`
    : '';
  return {
    sourceSportName,
    canonicalSportNames,
    excludedBlacklistedSportNames,
    canRepair: true,
    rationale: `Mapped the explicit source sport label to ${canonicalSportNames.join(', ')}.${excludedText}`,
  };
};
