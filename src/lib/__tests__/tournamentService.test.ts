import { tournamentService } from '@/lib/tournamentService';
import { apiRequest } from '@/lib/apiClient';

jest.mock('@/lib/apiClient', () => ({
  apiRequest: jest.fn(),
}));

const apiRequestMock = apiRequest as jest.MockedFunction<typeof apiRequest>;

describe('tournamentService', () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
  });

  it('normalizes match ids returned by the API', async () => {
    apiRequestMock.mockResolvedValue({
      match: { id: 'match_1', team1Points: [], team2Points: [], setResults: [] },
    });

    const result = await tournamentService.updateMatch('event_1', 'match_1', {
      team1Points: [],
      team2Points: [],
      setResults: [],
    } as any);

    expect(apiRequestMock).toHaveBeenCalledWith(
      '/api/events/event_1/matches/match_1',
      expect.objectContaining({ method: 'PATCH', timeoutMs: 60_000 }),
    );
    expect(result.$id).toBe('match_1');
  });

  it('uses the extended timeout when finalizing a match', async () => {
    apiRequestMock.mockResolvedValue({});

    await tournamentService.completeMatch('event_1', 'match_1', {
      setResults: [1, 0],
      team1Points: [25],
      team2Points: [21],
    } as any);

    expect(apiRequestMock).toHaveBeenCalledWith(
      '/api/events/event_1/matches/match_1',
      expect.objectContaining({
        method: 'PATCH',
        timeoutMs: 60_000,
        body: expect.objectContaining({
          finalize: true,
        }),
      }),
    );
  });
});
