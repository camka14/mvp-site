import { renderWithMantine } from '../../../../../../test/utils/renderWithMantine';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import LeagueSchedulePage from '../page';
import { eventService } from '@/lib/eventService';
import { leagueService } from '@/lib/leagueService';
import type { AppwriteModuleMock } from '../../../../../../test/mocks/appwrite';

jest.mock('next/navigation', () => ({
  useParams: jest.fn(() => ({ id: 'event_1' })),
  useRouter: jest.fn(() => ({ push: jest.fn() })),
}));

const useAppMock = jest.fn();
jest.mock('@/app/providers', () => ({ useApp: () => useAppMock() }));

jest.mock('@/app/appwrite', () => {
  const { createAppwriteModuleMock } = require('../../../../../../test/mocks/appwrite');
  return createAppwriteModuleMock();
});

jest.mock('@/components/layout/Navigation', () => () => <div data-testid="navigation" />);

const appwriteModuleMock = jest.requireMock('@/app/appwrite') as AppwriteModuleMock;

jest.mock('@/lib/eventService', () => ({
  eventService: {
    getEventWithRelations: jest.fn(),
    deleteEvent: jest.fn(),
  },
}));

jest.mock('@/lib/leagueService', () => ({
  leagueService: {
    listMatchesByEvent: jest.fn(),
    deleteWeeklySchedulesForEvent: jest.fn(),
  },
}));

describe('League schedule page', () => {
  beforeEach(() => {
    useAppMock.mockReturnValue({
      user: { $id: 'host_1' },
      isAuthenticated: true,
      isGuest: false,
      loading: false,
    });

    jest.clearAllMocks();

    (eventService.getEventWithRelations as jest.Mock).mockResolvedValue({
      $id: 'event_1',
      name: 'Summer League',
      eventType: 'league',
      status: 'draft',
      start: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      end: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
      location: 'Sports Center',
      hostId: 'host_1',
      teams: [],
      fields: [
        { $id: 'field_1', name: 'Court A', fieldNumber: 1 },
      ],
      timeSlots: [],
    });

    (leagueService.listMatchesByEvent as jest.Mock).mockResolvedValue([
      {
        id: 'match_1',
        fieldId: 'field_1',
        start: new Date(Date.now() + 26 * 60 * 60 * 1000).toISOString(),
        end: new Date(Date.now() + 28 * 60 * 60 * 1000).toISOString(),
        matchType: 'regular',
        team1Id: 'team_a',
        team2Id: 'team_b',
      },
    ]);
  });

  it('loads league schedule and displays matches grouped by week', async () => {
    renderWithMantine(<LeagueSchedulePage />);

    await waitFor(() => {
      expect(screen.getByText(/Summer League/)).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByText(/Week 1/)).toBeInTheDocument();
    });

    expect(screen.getByText(/Court A/)).toBeInTheDocument();
    expect(leagueService.listMatchesByEvent).toHaveBeenCalledWith('event_1');
  });
});
