import { fieldService } from '@/lib/fieldService';
import { apiRequest } from '@/lib/apiClient';

jest.mock('@/lib/apiClient', () => ({
  apiRequest: jest.fn(),
}));

jest.mock('@/lib/eventService', () => ({
  eventService: {
    getEventsForFieldInRange: jest.fn(),
    getMatchesForFieldInRange: jest.fn(),
  },
}));

const apiRequestMock = apiRequest as jest.MockedFunction<typeof apiRequest>;
const eventServiceMock = jest.requireMock('@/lib/eventService').eventService as {
  getEventsForFieldInRange: jest.Mock;
  getMatchesForFieldInRange: jest.Mock;
};

describe('fieldService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    apiRequestMock.mockReset();
    eventServiceMock.getEventsForFieldInRange.mockResolvedValue([]);
    eventServiceMock.getMatchesForFieldInRange.mockResolvedValue([]);
  });

  it('creates a field via apiRequest', async () => {
    apiRequestMock.mockResolvedValue({ $id: 'field_1', name: 'Court A', fieldNumber: 1 });

    const field = await fieldService.createField({ name: 'Court A', fieldNumber: 1 });

    expect(apiRequestMock).toHaveBeenCalledWith('/api/fields', expect.objectContaining({ method: 'POST' }));
    expect(field.$id).toBe('field_1');
  });

  it('updates a field via apiRequest', async () => {
    apiRequestMock.mockResolvedValue({ $id: 'field_1', name: 'Court A', fieldNumber: 1 });

    const field = await fieldService.updateField({ $id: 'field_1', name: 'Court A' });

    expect(apiRequestMock).toHaveBeenCalledWith(
      '/api/fields/field_1',
      expect.objectContaining({ method: 'PATCH' }),
    );
    expect(field.$id).toBe('field_1');
  });

  it('lists fields by ids', async () => {
    apiRequestMock.mockResolvedValueOnce({ fields: [{ $id: 'field_1', name: 'Court A', fieldNumber: 1 }] });

    const fields = await fieldService.listFields({ fieldIds: ['field_1'] });

    expect(apiRequestMock).toHaveBeenCalledWith(expect.stringContaining('/api/fields?'));
    expect(fields[0].name).toBe('Court A');
  });

  it('hydrates events and matches when range provided', async () => {
    apiRequestMock.mockResolvedValueOnce({ fields: [{ $id: 'field_1', name: 'Court A', fieldNumber: 1 }] });
    eventServiceMock.getEventsForFieldInRange.mockResolvedValue([{ $id: 'evt_1', name: 'Tournament' } as any]);
    eventServiceMock.getMatchesForFieldInRange.mockResolvedValue([
      { $id: 'match_1', start: '2024-01-01T10:00:00Z', end: '2024-01-01T11:00:00Z' } as any,
    ]);

    const fields = await fieldService.listFields(
      { fieldIds: ['field_1'] },
      { start: '2024-01-01T00:00:00Z', end: '2024-01-07T00:00:00Z' },
    );

    expect(eventServiceMock.getEventsForFieldInRange).toHaveBeenCalled();
    expect(eventServiceMock.getMatchesForFieldInRange).toHaveBeenCalled();
    expect(fields[0].events?.[0].$id).toBe('evt_1');
    expect(fields[0].matches?.[0].$id).toBe('match_1');
  });
});
