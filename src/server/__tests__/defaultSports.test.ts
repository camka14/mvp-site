import { ensureDefaultSports } from '../defaultSports';

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
});
