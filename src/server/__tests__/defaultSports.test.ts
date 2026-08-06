import { ensureDefaultSports } from '../defaultSports';
import { dedupeCanonicalSports } from '../canonicalSports';

describe('default sports', () => {
  it('seeds Beach Volleyball as a 21, 21, 15 best-of-three format', async () => {
    const createMany = jest.fn().mockResolvedValue(undefined);
    const findMany = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const client = {
      sports: { findMany, createMany, update: jest.fn() },
    };

    await ensureDefaultSports(client as any);

    const seededBeachVolleyball = createMany.mock.calls[0][0].data.find((sport: any) => sport.id === 'Beach Volleyball');
    const seededGrassVolleyball = createMany.mock.calls[0][0].data.find((sport: any) => sport.id === 'Grass Volleyball');
    const seededIndoorVolleyball = createMany.mock.calls[0][0].data.find((sport: any) => sport.id === 'Indoor Volleyball');
    expect(seededBeachVolleyball.matchRulesTemplate).toMatchObject({
      scoringModel: 'SETS',
      segmentCount: 3,
      setPointTargets: [21, 21, 15],
    });
    expect(seededBeachVolleyball.skillDivisionTypes.map((option: any) => option.id)).toEqual([
      'open', 'aa', 'a', 'bb', 'b', 'c',
    ]);
    expect(seededGrassVolleyball.skillDivisionTypes.map((option: any) => option.id)).toEqual([
      'open', 'aa', 'a', 'bb', 'b', 'c',
    ]);
    expect(seededIndoorVolleyball.skillDivisionTypes.map((option: any) => option.id)).toEqual([
      'open',
      'competitive',
      'premier',
      'local',
      'national',
      'regional',
      'gold',
      'elite',
      'select',
      'developmental',
    ]);
  });

  it('seeds Racquetball with game scoring, skill divisions, and an official template', async () => {
    const createMany = jest.fn().mockResolvedValue(undefined);
    const findMany = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const client = {
      sports: { findMany, createMany, update: jest.fn() },
    };

    await ensureDefaultSports(client as any);

    const racquetball = createMany.mock.calls[0][0].data.find(
      (sport: any) => sport.id === 'Racquetball',
    );

    expect(racquetball).toMatchObject({
      id: 'Racquetball',
      name: 'Racquetball',
      usePointsForWin: true,
      usePointsForLoss: true,
      usePointsPerSetWin: true,
      usePointsPerSetLoss: true,
    });
    expect(racquetball.skillDivisionTypes).toEqual([
      { id: 'beginner', name: 'Beginner' },
      { id: 'intermediate', name: 'Intermediate' },
      { id: 'advanced', name: 'Advanced' },
      { id: 'open', name: 'Open' },
    ]);
    expect(racquetball.officialPositionTemplates).toEqual([
      { name: 'Referee', count: 1 },
    ]);
    expect(racquetball.matchRulesTemplate).toMatchObject({
      scoringModel: 'SETS',
      segmentLabel: 'Game',
      supportedIncidentTypes: ['POINT', 'WARNING', 'POINT_PENALTY', 'GAME_PENALTY', 'DEFAULT', 'NOTE', 'ADMIN'],
    });
  });

  it('seeds Badminton and Flag Football with complete event-creation rules', async () => {
    const createMany = jest.fn().mockResolvedValue(undefined);
    const findMany = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const client = {
      sports: { findMany, createMany, update: jest.fn() },
    };

    await ensureDefaultSports(client as any);

    const seeded = createMany.mock.calls[0][0].data;
    const badminton = seeded.find((sport: any) => sport.id === 'Badminton');
    const flagFootball = seeded.find((sport: any) => sport.id === 'Flag Football');
    expect(badminton).toMatchObject({ id: 'Badminton', name: 'Badminton' });
    expect(badminton.matchRulesTemplate).toMatchObject({ scoringModel: 'SETS', segmentLabel: 'Game' });
    expect(badminton.officialPositionTemplates).toEqual([{ name: 'Umpire', count: 1 }]);
    expect(flagFootball).toMatchObject({ id: 'Flag Football', name: 'Flag Football' });
    expect(flagFootball.matchRulesTemplate).toMatchObject({ scoringModel: 'PERIODS', segmentCount: 2 });
    expect(flagFootball.officialPositionTemplates).toEqual([
      { name: 'Referee', count: 1 },
      { name: 'Field Judge', count: 1 },
    ]);
  });

  it('seeds the remaining scoreable team sports with sport-specific divisions and rules', async () => {
    const createMany = jest.fn().mockResolvedValue(undefined);
    const findMany = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const client = {
      sports: { findMany, createMany, update: jest.fn() },
    };

    await ensureDefaultSports(client as any);

    const seeded = createMany.mock.calls[0][0].data;
    const expected = {
      'Field Hockey': {
        scoringModel: 'PERIODS',
        skillNames: ['Recreational', 'Competitive', 'Premier', 'Elite', 'Open'],
      },
      Lacrosse: {
        scoringModel: 'PERIODS',
        skillNames: ['Recreational', 'Competitive', 'Club', 'Elite', 'Open'],
      },
      'Australian Football': {
        scoringModel: 'PERIODS',
        skillNames: ['Recreational', 'Competitive', 'Premier', 'Elite', 'Open'],
      },
      'Ball Hockey': {
        scoringModel: 'PERIODS',
        skillNames: ['Recreational', 'B', 'A', 'AA', 'Open'],
      },
      Futsal: {
        scoringModel: 'PERIODS',
        skillNames: ['Recreational', 'Competitive', 'Premier', 'Open'],
      },
      'Table Tennis': {
        scoringModel: 'SETS',
        skillNames: ['Beginner', 'Intermediate', 'Advanced', 'Open'],
      },
    };

    Object.entries(expected).forEach(([name, configuration]) => {
      const sport = seeded.find((row: any) => row.id === name);
      expect(sport).toMatchObject({ id: name, name });
      expect(sport.skillDivisionTypes.map((option: any) => option.name)).toEqual(configuration.skillNames);
      expect(sport.matchRulesTemplate).toMatchObject({ scoringModel: configuration.scoringModel });
      expect(sport.officialPositionTemplates.length).toBeGreaterThan(0);
    });

    const australianFootball = seeded.find((row: any) => row.id === 'Australian Football');
    expect(australianFootball.matchRulesTemplate.incidentTypeDefinitions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'GOAL', linkedPointDelta: 6 }),
        expect.objectContaining({ code: 'BEHIND', linkedPointDelta: 1 }),
      ]),
    );
    const tableTennis = seeded.find((row: any) => row.id === 'Table Tennis');
    expect(tableTennis.matchRulesTemplate).toMatchObject({
      segmentCount: 5,
      setPointTargets: [11, 11, 11, 11, 11],
    });
  });

  it('prefers the row whose stable ID already matches the canonical name', () => {
    const duplicateWithMoreConfiguration = {
      id: 'sport_indoor_volleyball_duplicate',
      name: ' indoor volleyball ',
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      usePointsForWin: true,
      matchRulesTemplate: { scoringModel: 'SETS' },
    };
    const canonicalIdRow = {
      id: 'Indoor Volleyball',
      name: 'Indoor Volleyball',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      usePointsForWin: null,
      matchRulesTemplate: null,
    };

    expect(dedupeCanonicalSports([
      duplicateWithMoreConfiguration,
      canonicalIdRow,
    ])).toEqual([canonicalIdRow]);
  });

  it('otherwise prefers richer configuration, then the earliest stable row', () => {
    const sparse = {
      id: 'sport_futsal_sparse',
      name: 'Futsal',
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
      matchRulesTemplate: null,
    };
    const richLater = {
      id: 'sport_futsal_rich',
      name: ' FUTSAL ',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      matchRulesTemplate: { scoringModel: 'PERIODS' },
      officialPositionTemplates: [],
    };
    const richEarlier = {
      ...richLater,
      id: 'sport_futsal_rich_earlier',
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
    };

    expect(dedupeCanonicalSports([sparse, richLater, richEarlier])).toEqual([richEarlier]);
  });

  it('returns one deterministic row per canonical name from default reconciliation', async () => {
    const duplicateSports = [
      {
        id: 'custom_sparse',
        name: 'Custom Court Sport',
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
        matchRulesTemplate: null,
      },
      {
        id: 'custom_rich',
        name: ' custom court sport ',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        matchRulesTemplate: { scoringModel: 'POINTS_ONLY' },
      },
    ];
    const findMany = jest.fn()
      .mockResolvedValueOnce(duplicateSports)
      .mockResolvedValueOnce(duplicateSports);
    const client = {
      sports: {
        findMany,
        createMany: jest.fn().mockResolvedValue(undefined),
        update: jest.fn(),
      },
    };

    await expect(ensureDefaultSports(client as any)).resolves.toEqual([duplicateSports[1]]);
  });

  it('rejects a row with an empty canonical name', () => {
    expect(() => dedupeCanonicalSports([{ id: 'blank_sport', name: '   ' }])).toThrow(
      'Sport blank_sport has a blank canonical name.',
    );
  });
});
