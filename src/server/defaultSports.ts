import type { Prisma } from '../generated/prisma/client';
import type { MatchRulesConfig, SportOfficialPositionTemplate } from '../types';

type SportRow = {
  id: string;
  name?: string | null;
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

const POINT_INCIDENT_TYPES = ['POINT', 'DISCIPLINE', 'NOTE', 'ADMIN'];
const GOAL_INCIDENT_TYPES = ['GOAL', 'DISCIPLINE', 'NOTE', 'ADMIN'];
const RUN_INCIDENT_TYPES = ['RUN', 'DISCIPLINE', 'NOTE', 'ADMIN'];

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
  supportedIncidentTypes: POINT_INCIDENT_TYPES,
  autoCreatePointIncidentType: 'POINT',
  pointIncidentRequiresParticipant: false,
  ...overrides,
});

const periodRules = (
  segmentCount: number,
  segmentLabel: string,
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
  supportedIncidentTypes: POINT_INCIDENT_TYPES,
  autoCreatePointIncidentType: 'POINT',
  pointIncidentRequiresParticipant: false,
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
  supportedIncidentTypes: POINT_INCIDENT_TYPES,
  autoCreatePointIncidentType: 'POINT',
  pointIncidentRequiresParticipant: false,
  ...overrides,
});

const MATCH_RULE_TEMPLATES_BY_SPORT: Record<string, MatchRulesConfig> = {
  'Indoor Volleyball': setBasedRules(),
  'Beach Volleyball': setBasedRules(),
  'Grass Volleyball': setBasedRules(),
  Basketball: periodRules(4, 'Quarter', {
    supportsOvertime: true,
    canUseOvertime: true,
  }),
  'Indoor Soccer': periodRules(2, 'Half', {
    supportsDraw: true,
    canUseOvertime: true,
    canUseShootout: true,
    supportedIncidentTypes: GOAL_INCIDENT_TYPES,
    autoCreatePointIncidentType: 'GOAL',
    pointIncidentRequiresParticipant: true,
  }),
  'Grass Soccer': periodRules(2, 'Half', {
    supportsDraw: true,
    canUseOvertime: true,
    canUseShootout: true,
    supportedIncidentTypes: GOAL_INCIDENT_TYPES,
    autoCreatePointIncidentType: 'GOAL',
    pointIncidentRequiresParticipant: true,
  }),
  'Beach Soccer': periodRules(2, 'Half', {
    supportsDraw: true,
    canUseOvertime: true,
    canUseShootout: true,
    supportedIncidentTypes: GOAL_INCIDENT_TYPES,
    autoCreatePointIncidentType: 'GOAL',
    pointIncidentRequiresParticipant: true,
  }),
  Tennis: setBasedRules(),
  Pickleball: setBasedRules({ segmentLabel: 'Game' }),
  Football: periodRules(4, 'Quarter', {
    supportsDraw: true,
    supportsOvertime: true,
    canUseOvertime: true,
  }),
  Hockey: periodRules(3, 'Period', {
    supportsDraw: true,
    supportsOvertime: true,
    supportsShootout: true,
    canUseOvertime: true,
    canUseShootout: true,
    supportedIncidentTypes: GOAL_INCIDENT_TYPES,
    autoCreatePointIncidentType: 'GOAL',
    pointIncidentRequiresParticipant: true,
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
    supportedIncidentTypes: RUN_INCIDENT_TYPES,
    autoCreatePointIncidentType: 'RUN',
    pointIncidentRequiresParticipant: false,
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
