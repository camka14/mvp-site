import { eventService } from '@/lib/eventService';
import { apiRequest } from '@/lib/apiClient';
import { sportsService } from '@/lib/sportsService';

jest.mock('@/lib/apiClient', () => ({
  apiRequest: jest.fn(),
}));

jest.mock('@/lib/sportsService', () => ({
  sportsService: {
    getAll: jest.fn(),
  },
}));

const apiRequestMock = apiRequest as jest.MockedFunction<typeof apiRequest>;
const sportsServiceMock = sportsService as jest.Mocked<typeof sportsService>;

const baseEventRow = {
  $id: 'evt_1',
  name: 'Test Event',
  description: 'Desc',
  start: '2025-01-01T00:00:00Z',
  end: '2025-01-01T01:00:00Z',
  location: 'Denver',
  coordinates: [0, 0],
  price: 1000,
  imageId: 'img_1',
  hostId: 'host_1',
  state: 'PUBLISHED',
  maxParticipants: 10,
  teamSizeLimit: 6,
  restTimeMinutes: 0,
  teamSignup: false,
  singleDivision: false,
  waitListIds: [],
  freeAgentIds: [],
  cancellationRefundHours: 0,
  registrationCutoffHours: 0,
  seedColor: 0,
  $createdAt: '2025-01-01T00:00:00Z',
  $updatedAt: '2025-01-01T00:00:00Z',
  eventType: 'EVENT',
  sport: { $id: 'sport_1', name: 'Volleyball' },
  divisions: [],
};

describe('eventService', () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
    sportsServiceMock.getAll.mockResolvedValue([] as any);
  });

  it('fetches event by id via apiRequest', async () => {
    apiRequestMock.mockResolvedValue({ ...baseEventRow });

    const event = await eventService.getEvent('evt_1');

    expect(apiRequestMock).toHaveBeenCalledWith('/api/events/evt_1');
    expect(event?.$id).toBe('evt_1');
  });

  it('creates event via apiRequest', async () => {
    apiRequestMock.mockResolvedValue({ event: { ...baseEventRow } });

    const created = await eventService.createEvent({
      $id: 'evt_1',
      name: 'Test Event',
      description: 'Desc',
      start: '2025-01-01T00:00:00Z',
      end: '2025-01-01T01:00:00Z',
      location: 'Denver',
      coordinates: [0, 0],
      price: 1000,
      imageId: 'img_1',
      hostId: 'host_1',
      state: 'PUBLISHED',
      maxParticipants: 10,
      teamSizeLimit: 6,
      teamSignup: false,
      singleDivision: false,
      waitListIds: [],
      freeAgentIds: [],
      cancellationRefundHours: 0,
      registrationCutoffHours: 0,
      seedColor: 0,
      eventType: 'EVENT',
      sport: { $id: 'sport_1', name: 'Volleyball' },
      divisions: [],
    } as any);

    expect(apiRequestMock).toHaveBeenCalledWith('/api/events', expect.objectContaining({ method: 'POST' }));
    expect(created.$id).toBe('evt_1');
  });
});
