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
    apiRequestMock
      .mockResolvedValueOnce({ fields: [{ $id: 'field_1', name: 'Court A', fieldNumber: 1, rentalSlotIds: ['slot_1'] }] })
      .mockResolvedValueOnce({
        timeSlots: [
          {
            id: 'slot_1',
            dayOfWeek: 1,
            daysOfWeek: [1],
            scheduledFieldId: 'field_1',
            scheduledFieldIds: ['field_1'],
          },
        ],
      });

    const fields = await fieldService.listFields({ fieldIds: ['field_1'] });

    expect(apiRequestMock).toHaveBeenCalledWith(expect.stringContaining('/api/fields?'));
    expect(apiRequestMock).toHaveBeenCalledWith(expect.stringContaining('/api/time-slots?ids=slot_1'));
    expect(fields[0].name).toBe('Court A');
    expect(fields[0].rentalSlotIds).toEqual(['slot_1']);
    expect(fields[0].rentalSlots?.map((slot) => slot.$id)).toEqual(['slot_1']);
  });

  it('hydrates events and matches when range provided', async () => {
    apiRequestMock
      .mockResolvedValueOnce({ fields: [{ $id: 'field_1', name: 'Court A', fieldNumber: 1 }] })
      .mockResolvedValueOnce({ timeSlots: [] });
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

  it('forwards rental overlap option when requested', async () => {
    const field = { $id: 'field_1', name: 'Court A', fieldNumber: 1 } as any;
    const range = { start: '2024-01-01T00:00:00Z', end: '2024-01-07T00:00:00Z' };

    await fieldService.getFieldEventsMatches(field, range, { rentalOverlapOnly: true, includeMatches: true });

    expect(eventServiceMock.getEventsForFieldInRange).toHaveBeenCalledWith(
      'field_1',
      range.start,
      range.end,
      { rentalOverlapOnly: true },
    );
    expect(eventServiceMock.getMatchesForFieldInRange).toHaveBeenCalledWith(
      'field_1',
      range.start,
      range.end,
      { rentalOverlapOnly: true },
    );
  });

  it('skips match hydration when rental overlap mode is enabled', async () => {
    const field = { $id: 'field_1', name: 'Court A', fieldNumber: 1 } as any;
    const range = { start: '2024-01-01T00:00:00Z', end: '2024-01-07T00:00:00Z' };

    await fieldService.getFieldEventsMatches(field, range, { rentalOverlapOnly: true, includeMatches: false });

    expect(eventServiceMock.getEventsForFieldInRange).toHaveBeenCalledWith(
      'field_1',
      range.start,
      range.end,
      { rentalOverlapOnly: true },
    );
    expect(eventServiceMock.getMatchesForFieldInRange).not.toHaveBeenCalled();
  });

  it('creates rental slots and patches the field rentalSlotIds list', async () => {
    let createdSlotId = 'slot_1';

    apiRequestMock.mockImplementation(async (url: string, options?: any) => {
      if (url === '/api/time-slots' && options?.method === 'POST') {
        createdSlotId = String(options?.body?.id ?? createdSlotId);
        return {
          id: createdSlotId,
          dayOfWeek: 1,
          daysOfWeek: [1],
          scheduledFieldId: 'field_1',
          scheduledFieldIds: ['field_1'],
        };
      }

      if (url === '/api/fields/field_1' && options?.method === 'PATCH') {
        return { $id: 'field_1' };
      }

      if (url === '/api/fields/field_1') {
        return { $id: 'field_1', name: 'Court A', fieldNumber: 1, rentalSlotIds: [createdSlotId] };
      }

      if (typeof url === 'string' && url.startsWith(`/api/time-slots?ids=${createdSlotId}`)) {
        return {
          timeSlots: [
            {
              id: createdSlotId,
              dayOfWeek: 1,
              daysOfWeek: [1],
              scheduledFieldId: 'field_1',
              scheduledFieldIds: ['field_1'],
            },
          ],
        };
      }

      throw new Error(`Unexpected request: ${url}`);
    });

    const result = await fieldService.createRentalSlot(
      { $id: 'field_1', name: 'Court A', fieldNumber: 1 } as any,
      { dayOfWeek: 1 },
    );

    expect(result.slot.$id).toBe(createdSlotId);
    expect(result.field.rentalSlotIds).toEqual([createdSlotId]);
    expect(apiRequestMock).toHaveBeenCalledWith(
      '/api/fields/field_1',
      expect.objectContaining({
        method: 'PATCH',
        body: { field: { rentalSlotIds: [createdSlotId] } },
      }),
    );
  });
});
