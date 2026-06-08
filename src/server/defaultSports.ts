import type { Prisma } from '../generated/prisma/client';
import type { MatchRulesConfig, SportOfficialPositionTemplate } from '../types';
import {
  getSkillDivisionTypeOptionsForSport,
  normalizeDivisionTypeParameterOptions,
} from '@/lib/divisionTypes';

type SportRow = {
  id: string;
  name?: string | null;
  skillDivisionTypes?: unknown;
  matchRulesTemplate?: unknown;
  officialPositionTemplates?: unknown;
  [key: string]: unknown;
};

type SportsClientLike = {
  sports: {
    findMany: (args?: any) => Promise<SportRow[]>;
    createMany: (args: { data: Prisma.SportsCreateManyInput[]; skipDuplicates?: boolean }) => Promise<unknown>;
    update: (args: any) => Promise<unknown>;
  };
  $transaction?: (operations: Promise<unknown>[]) => Promise<unknown>;
};

const asJsonObject = (value: MatchRulesConfig): Prisma.InputJsonObject =>
  value as unknown as Prisma.InputJsonObject;

const asJsonArray = (value: SportOfficialPositionTemplate[]): Prisma.InputJsonArray =>
  value as unknown as Prisma.InputJsonArray;

const asJsonInputArray = (value: unknown[]): Prisma.InputJsonArray =>
  value as Prisma.InputJsonArray;

const skillDivisionTypesForSport = (sportName: string): Prisma.InputJsonArray =>
  asJsonInputArray(getSkillDivisionTypeOptionsForSport(sportName));

const POINT_INCIDENT_TYPES = ['POINT', 'DISCIPLINE', 'NOTE', 'ADMIN'];
const GOAL_INCIDENT_TYPES = ['GOAL', 'DISCIPLINE', 'NOTE', 'ADMIN'];
const RUN_INCIDENT_TYPES = ['RUN', 'DISCIPLINE', 'NOTE', 'ADMIN'];

const scoringIncident = (code: string, label: string) => ({
  code,
  label,
  kind: 'SCORING' as const,
  requiresTeam: true,
  requiresParticipant: false,
  defaultEnabled: true,
  linkedPointDelta: 1,
});

const disciplineIncident = (
  code: string,
  label: string,
  options: { cardColor?: 'yellow' | 'red' | 'blue'; requiresTeam?: boolean; requiresParticipant?: boolean } = {},
) => ({
  code,
  label,
  kind: 'DISCIPLINE' as const,
  requiresTeam: options.requiresTeam ?? true,
  requiresParticipant: options.requiresParticipant ?? false,
  defaultEnabled: true,
  ...(options.cardColor ? { cardColor: options.cardColor } : {}),
});

const noteIncident = { code: 'NOTE', label: 'Match note', kind: 'NOTE' as const, defaultEnabled: true };
const adminIncident = { code: 'ADMIN', label: 'Admin note', kind: 'ADMIN' as const, defaultEnabled: true };

const baseIncidentDefinitions = (scoringCode = 'POINT', scoringLabel = 'Point') => [
  scoringIncident(scoringCode, scoringLabel),
  disciplineIncident('DISCIPLINE', 'Penalty or card'),
  noteIncident,
  adminIncident,
];

const volleyballIncidentDefinitions = [
  scoringIncident('POINT', 'Point'),
  disciplineIncident('YELLOW_CARD', 'Yellow card', { cardColor: 'yellow' }),
  disciplineIncident('RED_CARD', 'Red card', { cardColor: 'red' }),
  disciplineIncident('RED_YELLOW_CARD', 'Red/yellow card', { cardColor: 'red' }),
  disciplineIncident('DELAY_WARNING', 'Delay warning'),
  disciplineIncident('DELAY_PENALTY', 'Delay penalty', { cardColor: 'red' }),
  disciplineIncident('EXPULSION', 'Expulsion', { cardColor: 'red' }),
  disciplineIncident('DISQUALIFICATION', 'Disqualification', { cardColor: 'red' }),
  noteIncident,
  adminIncident,
];

const soccerIncidentDefinitions = [
  scoringIncident('GOAL', 'Goal'),
  disciplineIncident('YELLOW_CARD', 'Yellow card', { cardColor: 'yellow', requiresParticipant: true }),
  disciplineIncident('RED_CARD', 'Red card', { cardColor: 'red', requiresParticipant: true }),
  disciplineIncident('SECOND_YELLOW_CARD', 'Second yellow card', { cardColor: 'yellow', requiresParticipant: true }),
  disciplineIncident('FOUL', 'Foul'),
  noteIncident,
  adminIncident,
];

const basketballIncidentDefinitions = [
  scoringIncident('POINT', 'Point'),
  disciplineIncident('PERSONAL_FOUL', 'Personal foul', { requiresParticipant: true }),
  disciplineIncident('TECHNICAL_FOUL', 'Technical foul', { requiresParticipant: true }),
  disciplineIncident('UNSPORTSMANLIKE_FOUL', 'Unsportsmanlike foul', { requiresParticipant: true }),
  disciplineIncident('FLAGRANT_FOUL', 'Flagrant foul', { requiresParticipant: true }),
  disciplineIncident('DISQUALIFYING_FOUL', 'Disqualifying foul', { cardColor: 'red', requiresParticipant: true }),
  disciplineIncident('EJECTION', 'Ejection', { cardColor: 'red', requiresParticipant: true }),
  noteIncident,
  adminIncident,
];

const footballIncidentDefinitions = [
  scoringIncident('POINT', 'Point'),
  disciplineIncident('PERSONAL_FOUL', 'Personal foul'),
  disciplineIncident('UNSPORTSMANLIKE_CONDUCT', 'Unsportsmanlike conduct'),
  disciplineIncident('DELAY_OF_GAME', 'Delay of game'),
  disciplineIncident('TARGETING', 'Targeting', { cardColor: 'red', requiresParticipant: true }),
  disciplineIncident('EJECTION', 'Ejection', { cardColor: 'red' }),
  noteIncident,
  adminIncident,
];

const hockeyIncidentDefinitions = [
  scoringIncident('GOAL', 'Goal'),
  disciplineIncident('MINOR_PENALTY', 'Minor penalty', { requiresParticipant: true }),
  disciplineIncident('MAJOR_PENALTY', 'Major penalty', { requiresParticipant: true }),
  disciplineIncident('MISCONDUCT', 'Misconduct', { requiresParticipant: true }),
  disciplineIncident('GAME_MISCONDUCT', 'Game misconduct', { cardColor: 'red', requiresParticipant: true }),
  disciplineIncident('MATCH_PENALTY', 'Match penalty', { cardColor: 'red', requiresParticipant: true }),
  noteIncident,
  adminIncident,
];

const baseballIncidentDefinitions = [
  scoringIncident('RUN', 'Run'),
  disciplineIncident('WARNING', 'Warning'),
  disciplineIncident('EJECTION', 'Ejection', { cardColor: 'red' }),
  noteIncident,
  adminIncident,
];

const tennisIncidentDefinitions = [
  scoringIncident('POINT', 'Point'),
  disciplineIncident('WARNING', 'Warning'),
  disciplineIncident('POINT_PENALTY', 'Point penalty'),
  disciplineIncident('GAME_PENALTY', 'Game penalty'),
  disciplineIncident('DEFAULT', 'Default', { cardColor: 'red' }),
  noteIncident,
  adminIncident,
];

const pickleballIncidentDefinitions = [
  scoringIncident('POINT', 'Point'),
  disciplineIncident('VERBAL_WARNING', 'Verbal warning'),
  disciplineIncident('TECHNICAL_WARNING', 'Technical warning'),
  disciplineIncident('TECHNICAL_FOUL', 'Technical foul'),
  disciplineIncident('EJECTION', 'Ejection', { cardColor: 'red' }),
  disciplineIncident('FORFEIT', 'Forfeit', { cardColor: 'red' }),
  noteIncident,
  adminIncident,
];

const noTimer = {
  timerMode: 'NONE' as const,
  segmentDurationMinutes: null,
  segmentDurationMinutesBySequence: [],
  canUseAddedTime: false,
  addedTimeEnabled: false,
  stopAtRegulationEnd: true,
};

const fixedTimer = (segmentDurationMinutes: number) => ({
  timerMode: 'COUNT_UP' as const,
  segmentDurationMinutes,
  segmentDurationMinutesBySequence: [],
  canUseAddedTime: false,
  addedTimeEnabled: false,
  stopAtRegulationEnd: true,
});

const addedTimeTimer = (segmentDurationMinutes: number) => ({
  timerMode: 'COUNT_UP' as const,
  segmentDurationMinutes,
  segmentDurationMinutesBySequence: [],
  canUseAddedTime: true,
  addedTimeEnabled: true,
  stopAtRegulationEnd: false,
});

const incidentCodes = (definitions: Array<{ code: string }>) => definitions.map((definition) => definition.code);

const setBasedRules = (
  overrides: Partial<MatchRulesConfig> = {},
): MatchRulesConfig => ({
  scoringModel: 'SETS',
  segmentLabel: 'Set',
  supportsDraw: false,
  supportsOvertime: false,
  supportsShootout: false,
  canUseOvertime: false,
  canUseShootout: false,
  officialRoles: [],
  supportedIncidentTypes: incidentCodes(volleyballIncidentDefinitions),
  incidentTypeDefinitions: volleyballIncidentDefinitions,
  autoCreatePointIncidentType: 'POINT',
  timekeeping: noTimer,
  ...overrides,
});

const periodRules = (
  segmentCount: number,
  segmentLabel: string,
  segmentDurationMinutes: number,
  overrides: Partial<MatchRulesConfig> = {},
): MatchRulesConfig => ({
  scoringModel: 'PERIODS',
  segmentCount,
  segmentLabel,
  supportsDraw: false,
  supportsOvertime: false,
  supportsShootout: false,
  canUseOvertime: false,
  canUseShootout: false,
  officialRoles: [],
  supportedIncidentTypes: incidentCodes(baseIncidentDefinitions('POINT', 'Point')),
  incidentTypeDefinitions: baseIncidentDefinitions('POINT', 'Point'),
  autoCreatePointIncidentType: 'POINT',
  timekeeping: fixedTimer(segmentDurationMinutes),
  ...overrides,
});

const pointsOnlyRules = (
  overrides: Partial<MatchRulesConfig> = {},
): MatchRulesConfig => ({
  scoringModel: 'POINTS_ONLY',
  segmentCount: 1,
  segmentLabel: 'Total',
  supportsDraw: false,
  supportsOvertime: false,
  supportsShootout: false,
  canUseOvertime: false,
  canUseShootout: false,
  officialRoles: [],
  supportedIncidentTypes: incidentCodes(baseIncidentDefinitions('POINT', 'Point')),
  incidentTypeDefinitions: baseIncidentDefinitions('POINT', 'Point'),
  autoCreatePointIncidentType: 'POINT',
  timekeeping: noTimer,
  ...overrides,
});

const MATCH_RULE_TEMPLATES_BY_SPORT: Record<string, MatchRulesConfig> = {
  'Indoor Volleyball': setBasedRules(),
  'Beach Volleyball': setBasedRules(),
  'Grass Volleyball': setBasedRules(),
  Basketball: periodRules(4, 'Quarter', 10, {
    supportsOvertime: true,
    canUseOvertime: true,
    incidentTypeDefinitions: basketballIncidentDefinitions,
    supportedIncidentTypes: incidentCodes(basketballIncidentDefinitions),
  }),
  'Indoor Soccer': periodRules(2, 'Half', 25, {
    supportsDraw: true,
    canUseOvertime: true,
    canUseShootout: true,
    supportedIncidentTypes: incidentCodes(soccerIncidentDefinitions),
    incidentTypeDefinitions: soccerIncidentDefinitions,
    autoCreatePointIncidentType: 'GOAL',
    timekeeping: addedTimeTimer(25),
  }),
  'Grass Soccer': periodRules(2, 'Half', 45, {
    supportsDraw: true,
    canUseOvertime: true,
    canUseShootout: true,
    supportedIncidentTypes: incidentCodes(soccerIncidentDefinitions),
    incidentTypeDefinitions: soccerIncidentDefinitions,
    autoCreatePointIncidentType: 'GOAL',
    timekeeping: addedTimeTimer(45),
  }),
  'Beach Soccer': periodRules(3, 'Period', 12, {
    supportsDraw: false,
    supportsOvertime: true,
    supportsShootout: true,
    canUseOvertime: true,
    canUseShootout: true,
    supportedIncidentTypes: incidentCodes(soccerIncidentDefinitions),
    incidentTypeDefinitions: soccerIncidentDefinitions,
    autoCreatePointIncidentType: 'GOAL',
  }),
  Tennis: setBasedRules({
    incidentTypeDefinitions: tennisIncidentDefinitions,
    supportedIncidentTypes: incidentCodes(tennisIncidentDefinitions),
  }),
  Pickleball: setBasedRules({
    segmentLabel: 'Game',
    incidentTypeDefinitions: pickleballIncidentDefinitions,
    supportedIncidentTypes: incidentCodes(pickleballIncidentDefinitions),
  }),
  Football: periodRules(4, 'Quarter', 15, {
    supportsDraw: true,
    supportsOvertime: true,
    canUseOvertime: true,
    incidentTypeDefinitions: footballIncidentDefinitions,
    supportedIncidentTypes: incidentCodes(footballIncidentDefinitions),
  }),
  Hockey: periodRules(3, 'Period', 20, {
    supportsDraw: true,
    supportsOvertime: true,
    supportsShootout: true,
    canUseOvertime: true,
    canUseShootout: true,
    supportedIncidentTypes: incidentCodes(hockeyIncidentDefinitions),
    incidentTypeDefinitions: hockeyIncidentDefinitions,
    autoCreatePointIncidentType: 'GOAL',
  }),
  Baseball: {
    scoringModel: 'INNINGS',
    segmentCount: 9,
    segmentLabel: 'Inning',
    supportsDraw: false,
    supportsOvertime: false,
    supportsShootout: false,
    canUseOvertime: false,
    canUseShootout: false,
    officialRoles: [],
    supportedIncidentTypes: incidentCodes(baseballIncidentDefinitions),
    incidentTypeDefinitions: baseballIncidentDefinitions,
    autoCreatePointIncidentType: 'RUN',
    timekeeping: noTimer,
  },
  Other: pointsOnlyRules({
    supportsDraw: true,
    canUseOvertime: true,
    canUseShootout: true,
  }),
};

const OFFICIAL_POSITION_TEMPLATES_BY_SPORT: Record<string, SportOfficialPositionTemplate[]> = {
  'Indoor Volleyball': [
    { name: 'R1', count: 1 },
    { name: 'R2', count: 1 },
    { name: 'Line Judge', count: 2 },
    { name: 'Scorekeeper', count: 1 },
  ],
  'Beach Volleyball': [
    { name: 'R1', count: 1 },
    { name: 'R2', count: 1 },
    { name: 'Scorekeeper', count: 1 },
  ],
  'Grass Volleyball': [
    { name: 'R1', count: 1 },
    { name: 'R2', count: 1 },
    { name: 'Line Judge', count: 2 },
    { name: 'Scorekeeper', count: 1 },
  ],
  Basketball: [
    { name: 'Referee', count: 2 },
    { name: 'Scorekeeper', count: 1 },
    { name: 'Timekeeper', count: 1 },
  ],
  'Indoor Soccer': [
    { name: 'Referee', count: 2 },
    { name: 'Scorekeeper', count: 1 },
  ],
  'Grass Soccer': [
    { name: 'Referee', count: 1 },
    { name: 'Assistant Referee', count: 2 },
  ],
  'Beach Soccer': [
    { name: 'Referee', count: 2 },
    { name: 'Scorekeeper', count: 1 },
  ],
  Tennis: [
    { name: 'Umpire', count: 1 },
  ],
  Pickleball: [
    { name: 'Referee', count: 1 },
  ],
  Football: [
    { name: 'Referee', count: 1 },
    { name: 'Umpire', count: 1 },
    { name: 'Head Linesman', count: 1 },
    { name: 'Line Judge', count: 1 },
    { name: 'Back Judge', count: 1 },
  ],
  Hockey: [
    { name: 'Referee', count: 2 },
    { name: 'Linesperson', count: 2 },
  ],
  Baseball: [
    { name: 'Plate Umpire', count: 1 },
    { name: 'Base Umpire', count: 2 },
  ],
  Other: [
    { name: 'Official', count: 1 },
  ],
};

export const DEFAULT_SPORTS: Prisma.SportsCreateManyInput[] = [
  {
    id: 'Indoor Volleyball',
    name: 'Indoor Volleyball',
    officialPositionTemplates: asJsonArray(OFFICIAL_POSITION_TEMPLATES_BY_SPORT['Indoor Volleyball']),
    skillDivisionTypes: skillDivisionTypesForSport('Indoor Volleyball'),
    matchRulesTemplate: asJsonObject(MATCH_RULE_TEMPLATES_BY_SPORT['Indoor Volleyball']),
    usePointsForWin: true,
    usePointsForLoss: true,
    usePointsPerSetWin: true,
    usePointsPerSetLoss: true,
    usePointsPerGoalScored: false,
    usePointsPerGoalConceded: false,
  },
  {
    id: 'Beach Volleyball',
    name: 'Beach Volleyball',
    officialPositionTemplates: asJsonArray(OFFICIAL_POSITION_TEMPLATES_BY_SPORT['Beach Volleyball']),
    skillDivisionTypes: skillDivisionTypesForSport('Beach Volleyball'),
    matchRulesTemplate: asJsonObject(MATCH_RULE_TEMPLATES_BY_SPORT['Beach Volleyball']),
    usePointsForWin: true,
    usePointsForLoss: true,
    usePointsPerSetWin: true,
    usePointsPerSetLoss: true,
    usePointsPerGoalScored: false,
    usePointsPerGoalConceded: false,
  },
  {
    id: 'Grass Volleyball',
    name: 'Grass Volleyball',
    officialPositionTemplates: asJsonArray(OFFICIAL_POSITION_TEMPLATES_BY_SPORT['Grass Volleyball']),
    skillDivisionTypes: skillDivisionTypesForSport('Grass Volleyball'),
    matchRulesTemplate: asJsonObject(MATCH_RULE_TEMPLATES_BY_SPORT['Grass Volleyball']),
    usePointsForWin: true,
    usePointsForLoss: true,
    usePointsPerSetWin: true,
    usePointsPerSetLoss: true,
    usePointsPerGoalScored: false,
    usePointsPerGoalConceded: false,
  },
  {
    id: 'Basketball',
    name: 'Basketball',
    officialPositionTemplates: asJsonArray(OFFICIAL_POSITION_TEMPLATES_BY_SPORT.Basketball),
    skillDivisionTypes: skillDivisionTypesForSport('Basketball'),
    matchRulesTemplate: asJsonObject(MATCH_RULE_TEMPLATES_BY_SPORT.Basketball),
    usePointsForWin: true,
    usePointsForLoss: true,
    usePointsPerGoalScored: false,
    usePointsPerGoalConceded: false,
  },
  {
    id: 'Indoor Soccer',
    name: 'Indoor Soccer',
    officialPositionTemplates: asJsonArray(OFFICIAL_POSITION_TEMPLATES_BY_SPORT['Indoor Soccer']),
    skillDivisionTypes: skillDivisionTypesForSport('Indoor Soccer'),
    matchRulesTemplate: asJsonObject(MATCH_RULE_TEMPLATES_BY_SPORT['Indoor Soccer']),
    usePointsForWin: true,
    usePointsForDraw: true,
    usePointsForLoss: true,
    usePointsPerGoalScored: false,
    usePointsPerGoalConceded: false,
  },
  {
    id: 'Grass Soccer',
    name: 'Grass Soccer',
    officialPositionTemplates: asJsonArray(OFFICIAL_POSITION_TEMPLATES_BY_SPORT['Grass Soccer']),
    skillDivisionTypes: skillDivisionTypesForSport('Grass Soccer'),
    matchRulesTemplate: asJsonObject(MATCH_RULE_TEMPLATES_BY_SPORT['Grass Soccer']),
    usePointsForWin: true,
    usePointsForDraw: true,
    usePointsForLoss: true,
    usePointsPerGoalScored: false,
    usePointsPerGoalConceded: false,
  },
  {
    id: 'Beach Soccer',
    name: 'Beach Soccer',
    officialPositionTemplates: asJsonArray(OFFICIAL_POSITION_TEMPLATES_BY_SPORT['Beach Soccer']),
    skillDivisionTypes: skillDivisionTypesForSport('Beach Soccer'),
    matchRulesTemplate: asJsonObject(MATCH_RULE_TEMPLATES_BY_SPORT['Beach Soccer']),
    usePointsForWin: true,
    usePointsForDraw: true,
    usePointsForLoss: true,
    usePointsPerGoalScored: false,
    usePointsPerGoalConceded: false,
  },
  {
    id: 'Tennis',
    name: 'Tennis',
    officialPositionTemplates: asJsonArray(OFFICIAL_POSITION_TEMPLATES_BY_SPORT.Tennis),
    skillDivisionTypes: skillDivisionTypesForSport('Tennis'),
    matchRulesTemplate: asJsonObject(MATCH_RULE_TEMPLATES_BY_SPORT.Tennis),
    usePointsForWin: true,
    usePointsForLoss: true,
    usePointsPerSetWin: true,
    usePointsPerSetLoss: true,
    usePointsPerGameWin: true,
    usePointsPerGameLoss: true,
    usePointsPerGoalScored: false,
    usePointsPerGoalConceded: false,
  },
  {
    id: 'Pickleball',
    name: 'Pickleball',
    officialPositionTemplates: asJsonArray(OFFICIAL_POSITION_TEMPLATES_BY_SPORT.Pickleball),
    skillDivisionTypes: skillDivisionTypesForSport('Pickleball'),
    matchRulesTemplate: asJsonObject(MATCH_RULE_TEMPLATES_BY_SPORT.Pickleball),
    usePointsForWin: true,
    usePointsForLoss: true,
    usePointsPerSetWin: true,
    usePointsPerSetLoss: true,
    usePointsPerGoalScored: false,
    usePointsPerGoalConceded: false,
  },
  {
    id: 'Football',
    name: 'Football',
    officialPositionTemplates: asJsonArray(OFFICIAL_POSITION_TEMPLATES_BY_SPORT.Football),
    skillDivisionTypes: asJsonInputArray([
      { id: 'rec', name: 'Recreational' },
      { id: 'competitive', name: 'Competitive' },
      { id: 'open', name: 'Open' },
    ]),
    matchRulesTemplate: asJsonObject(MATCH_RULE_TEMPLATES_BY_SPORT.Football),
    usePointsForWin: true,
    usePointsForDraw: true,
    usePointsForLoss: true,
    usePointsPerGoalScored: false,
    usePointsPerGoalConceded: false,
  },
  {
    id: 'Hockey',
    name: 'Hockey',
    officialPositionTemplates: asJsonArray(OFFICIAL_POSITION_TEMPLATES_BY_SPORT.Hockey),
    skillDivisionTypes: skillDivisionTypesForSport('Hockey'),
    matchRulesTemplate: asJsonObject(MATCH_RULE_TEMPLATES_BY_SPORT.Hockey),
    usePointsForWin: true,
    usePointsForDraw: true,
    usePointsForLoss: true,
    usePointsPerGoalScored: false,
    usePointsPerGoalConceded: false,
  },
  {
    id: 'Baseball',
    name: 'Baseball',
    officialPositionTemplates: asJsonArray(OFFICIAL_POSITION_TEMPLATES_BY_SPORT.Baseball),
    skillDivisionTypes: skillDivisionTypesForSport('Baseball'),
    matchRulesTemplate: asJsonObject(MATCH_RULE_TEMPLATES_BY_SPORT.Baseball),
    usePointsForWin: true,
    usePointsForLoss: true,
    usePointsPerGoalScored: false,
    usePointsPerGoalConceded: false,
  },
  {
    id: 'Other',
    name: 'Other',
    officialPositionTemplates: asJsonArray(OFFICIAL_POSITION_TEMPLATES_BY_SPORT.Other),
    skillDivisionTypes: skillDivisionTypesForSport('Other'),
    matchRulesTemplate: asJsonObject(MATCH_RULE_TEMPLATES_BY_SPORT.Other),
    usePointsForWin: true,
    usePointsForDraw: true,
    usePointsForLoss: true,
    usePointsPerGoalScored: false,
    usePointsPerGoalConceded: false,
  },
];

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

const incidentDefinitionCode = (value: unknown): string | null => {
  if (!isRecord(value) || typeof value.code !== 'string') return null;
  const normalized = value.code.trim().toUpperCase();
  return normalized.length ? normalized : null;
};

const mergeIncidentDefinitionList = (
  defaults: unknown,
  current: unknown,
): { value?: unknown[]; changed: boolean } => {
  if (!Array.isArray(defaults)) {
    return { changed: false };
  }
  if (!Array.isArray(current)) {
    return { value: defaults, changed: true };
  }
  const merged = [...current];
  const existingCodes = new Set(
    current
      .map(incidentDefinitionCode)
      .filter((code): code is string => Boolean(code)),
  );
  defaults.forEach((definition) => {
    const code = incidentDefinitionCode(definition);
    if (code && !existingCodes.has(code)) {
      merged.push(definition);
      existingCodes.add(code);
    }
  });
  return { value: merged, changed: merged.length !== current.length };
};

const mergeStringList = (
  defaults: unknown,
  current: unknown,
): { value?: string[]; changed: boolean } => {
  if (!Array.isArray(defaults)) return { changed: false };
  if (!Array.isArray(current)) {
    return { value: defaults.map((entry) => String(entry)).filter(Boolean), changed: true };
  }
  const merged = current.map((entry) => String(entry)).filter(Boolean);
  const existing = new Set(merged);
  defaults.forEach((entry) => {
    const value = String(entry ?? '').trim();
    if (value && !existing.has(value)) {
      merged.push(value);
      existing.add(value);
    }
  });
  return { value: merged, changed: merged.length !== current.length };
};

const mergeTimekeepingConfig = (
  defaults: unknown,
  current: unknown,
): { value?: Record<string, unknown>; changed: boolean } => {
  if (!isRecord(defaults)) {
    return { changed: false };
  }
  if (!isRecord(current)) {
    return { value: { ...defaults }, changed: true };
  }
  const merged: Record<string, unknown> = { ...current };
  let changed = false;
  Object.entries(defaults).forEach(([key, value]) => {
    if (merged[key] == null) {
      merged[key] = value;
      changed = true;
    }
  });
  return changed ? { value: merged, changed } : { changed: false };
};

const mergeMissingMatchRulesTemplate = (
  defaults: MatchRulesConfig,
  current: unknown,
): MatchRulesConfig | undefined => {
  if (current == null || !isRecord(current)) {
    return defaults;
  }

  const merged: Record<string, unknown> = { ...current };
  let changed = false;
  Object.entries(defaults).forEach(([key, value]) => {
    if (key === 'incidentTypeDefinitions') {
      const result = mergeIncidentDefinitionList(value, merged[key]);
      if (result.changed && result.value) {
        merged[key] = result.value;
        changed = true;
      }
      return;
    }
    if (key === 'supportedIncidentTypes') {
      const result = mergeStringList(value, merged[key]);
      if (result.changed && result.value) {
        merged[key] = result.value;
        changed = true;
      }
      return;
    }
    if (key === 'timekeeping') {
      const result = mergeTimekeepingConfig(value, merged[key]);
      if (result.changed && result.value) {
        merged[key] = result.value;
        changed = true;
      }
      return;
    }
    if (merged[key] == null) {
      merged[key] = value;
      changed = true;
    }
  });
  return changed ? merged as MatchRulesConfig : undefined;
};

export const ensureDefaultSports = async (client: SportsClientLike): Promise<SportRow[]> => {
  let sports = await client.sports.findMany({ orderBy: { name: 'asc' } });

  if (sports.length === 0) {
    await client.sports.createMany({ data: DEFAULT_SPORTS, skipDuplicates: true });
    return client.sports.findMany({ orderBy: { name: 'asc' } });
  }

  const existingById = new Map(sports.map((sport) => [sport.id, sport]));
  const existingByNameLower = new Map(
    sports
      .map((sport) => [String(sport.name ?? '').toLowerCase(), sport] as const)
      .filter(([key]) => Boolean(key)),
  );

  const toCreate = DEFAULT_SPORTS.filter((sport) => {
    if (existingById.has(sport.id)) return false;
    return !existingByNameLower.has(String(sport.name).toLowerCase());
  });
  if (toCreate.length > 0) {
    await client.sports.createMany({ data: toCreate, skipDuplicates: true });
  }

  const updates = DEFAULT_SPORTS.flatMap((spec) => {
    const existing =
      existingById.get(spec.id) ?? existingByNameLower.get(String(spec.name).toLowerCase());
    if (!existing) return [];

    const patch: Record<string, boolean | Prisma.InputJsonValue> = {};
    Object.entries(spec).forEach(([key, value]) => {
      if (key === 'id' || key === 'name') return;
      if (key === 'matchRulesTemplate') {
        const merged = mergeMissingMatchRulesTemplate(value as MatchRulesConfig, existing[key]);
        if (merged !== undefined) {
          patch[key] = asJsonObject(merged);
        }
        return;
      }
      if (key === 'officialPositionTemplates') {
        if (existing[key] == null) {
          patch[key] = value as Prisma.InputJsonValue;
        }
        return;
      }
      if (key === 'skillDivisionTypes') {
        if (normalizeDivisionTypeParameterOptions(existing[key]).length === 0) {
          patch[key] = value as Prisma.InputJsonValue;
        }
        return;
      }
      if (typeof value !== 'boolean') return;
      const current = existing[key];
      if (current == null) {
        patch[key] = value;
      }
    });

    if (Object.keys(patch).length === 0) {
      return [];
    }

    return client.sports.update({
      where: { id: existing.id },
      data: patch,
    });
  });

  if (updates.length > 0) {
    if (typeof client.$transaction === 'function') {
      await client.$transaction(updates);
    } else {
      await Promise.all(updates);
    }
  }

  return client.sports.findMany({ orderBy: { name: 'asc' } });
};
