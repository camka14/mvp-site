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
    expect(seededBeachVolleyball.matchRulesTemplate).toMatchObject({
      scoringModel: 'SETS',
      segmentCount: 3,
      setPointTargets: [21, 21, 15],
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
