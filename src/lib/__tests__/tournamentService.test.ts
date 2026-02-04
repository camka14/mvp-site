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
      expect.objectContaining({ method: 'PATCH' }),
    );
    expect(result.$id).toBe('match_1');
  });
});
