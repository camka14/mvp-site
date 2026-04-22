jest.mock('@/lib/apiClient', () => ({
  apiRequest: jest.fn(),
}));

type ApiRequestFn = typeof import('@/lib/apiClient').apiRequest;

const loadSportsService = async () => {
  const [{ sportsService }, { apiRequest }] = await Promise.all([
    import('@/lib/sportsService'),
    import('@/lib/apiClient'),
  ]);

  return {
    sportsService,
    apiRequestMock: apiRequest as jest.MockedFunction<ApiRequestFn>,
  };
};

describe('sportsService', () => {
  beforeEach(() => {
    jest.resetModules();
    localStorage.clear();
  });

  it('preserves match rules templates and official position templates from the sports API', async () => {
    const { sportsService, apiRequestMock } = await loadSportsService();

    apiRequestMock.mockResolvedValue({
      sports: [
        {
          $id: 'Indoor Soccer',
          name: 'Indoor Soccer',
          officialPositionTemplates: [
            { name: 'Referee', count: 2 },
          ],
          matchRulesTemplate: {
            scoringModel: 'PERIODS',
            segmentCount: 2,
            segmentLabel: 'Half',
            supportsDraw: true,
            canUseOvertime: true,
            canUseShootout: true,
            supportedIncidentTypes: ['GOAL', 'DISCIPLINE', 'NOTE', 'ADMIN'],
            autoCreatePointIncidentType: 'GOAL',
            pointIncidentRequiresParticipant: true,
          },
          usePointsForWin: true,
        },
      ],
    });

    const [sport] = await sportsService.getAll(true);

    expect(sport.matchRulesTemplate).toEqual({
      scoringModel: 'PERIODS',
      segmentCount: 2,
      segmentLabel: 'Half',
      supportsDraw: true,
      canUseOvertime: true,
      canUseShootout: true,
      supportedIncidentTypes: ['GOAL', 'DISCIPLINE', 'NOTE', 'ADMIN'],
      autoCreatePointIncidentType: 'GOAL',
      pointIncidentRequiresParticipant: true,
    });
    expect(sport.officialPositionTemplates).toEqual([
      { name: 'Referee', count: 2 },
    ]);
  });

  it('hydrates cached sports with preserved match rules templates', async () => {
    localStorage.setItem('sports-cache-v3', JSON.stringify({
      timestamp: Date.now(),
      items: [
        {
          $id: 'Hockey',
          name: 'Hockey',
          officialPositionTemplates: [
            { name: 'Scorekeeper', count: 1 },
          ],
          matchRulesTemplate: {
            scoringModel: 'PERIODS',
            segmentCount: 3,
            segmentLabel: 'Period',
            supportsOvertime: true,
            supportsShootout: true,
            canUseOvertime: true,
            canUseShootout: true,
          },
        },
      ],
    }));

    const { sportsService } = await loadSportsService();
    const [sport] = sportsService.getCached({ allowStale: true }) ?? [];

    expect(sport.matchRulesTemplate).toEqual({
      scoringModel: 'PERIODS',
      segmentCount: 3,
      segmentLabel: 'Period',
      supportsOvertime: true,
      supportsShootout: true,
      canUseOvertime: true,
      canUseShootout: true,
    });
    expect(sport.officialPositionTemplates).toEqual([
      { name: 'Scorekeeper', count: 1 },
    ]);
  });
});
