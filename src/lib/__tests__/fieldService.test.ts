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
    apiRequestMock.mockResolvedValue({ id: 'field_1', name: 'Court A' });

    const field = await fieldService.createField({ name: 'Court A', sportIds: ['Basketball'] });

    expect(apiRequestMock).toHaveBeenCalledWith(
      '/api/fields',
      expect.objectContaining({
        method: 'POST',
        body: expect.objectContaining({ sportIds: ['Basketball'] }),
      }),
    );
    expect(field.$id).toBe('field_1');
  });

  it('updates a field via apiRequest', async () => {
    apiRequestMock.mockResolvedValue({ id: 'field_1', name: 'Court A', sportIds: ['Basketball'] });

    const field = await fieldService.updateField({ $id: 'field_1', name: 'Court A', sportIds: ['Basketball'] });

    expect(apiRequestMock).toHaveBeenCalledWith(
      '/api/fields/field_1',
      expect.objectContaining({
        method: 'PATCH',
        body: { field: { name: 'Court A', sportIds: ['Basketball'] } },
      }),
    );
    expect(field.$id).toBe('field_1');
    expect(field.sportIds).toEqual(['Basketball']);
  });

  it('lists fields by ids', async () => {
    apiRequestMock
      .mockResolvedValueOnce({ fields: [{ $id: 'field_1', name: 'Court A', rentalSlotIds: ['slot_1'], sportIds: ['Indoor Soccer'] }] })
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
    expect(fields[0].sportIds).toEqual(['Indoor Soccer']);
    expect(fields[0].rentalSlotIds).toEqual(['slot_1']);
    expect(fields[0].rentalSlots?.map((slot) => slot.$id)).toEqual(['slot_1']);
  });

  it('hydrates field facilities by facilityId', async () => {
    apiRequestMock
      .mockResolvedValueOnce({
        fields: [{
          $id: 'field_1',
          name: 'Court A',
          rentalSlotIds: [],
          facilityId: 'facility_1',
        }],
      })
      .mockResolvedValueOnce({
        facilities: [{
          id: 'facility_1',
          organizationId: 'org_1',
          name: 'River City Sports Complex',
        }],
      });

    const fields = await fieldService.listFields({ fieldIds: ['field_1'] });

    expect(apiRequestMock).toHaveBeenCalledWith(expect.stringContaining('/api/facilities?ids=facility_1'));
    expect(fields[0].facilityId).toBe('facility_1');
    expect(fields[0].facility).toEqual(expect.objectContaining({
      $id: 'facility_1',
      name: 'River City Sports Complex',
    }));
  });

  it('follows the bounded fields pagination contract for organization discovery', async () => {
    apiRequestMock
      .mockResolvedValueOnce({
        fields: [{ $id: 'field_1', name: 'Court A', rentalSlotIds: [] }],
        pagination: { hasMore: true, nextOffset: 100 },
      })
      .mockResolvedValueOnce({
        fields: [{ $id: 'field_2', name: 'Court B', rentalSlotIds: [] }],
        pagination: { hasMore: false, nextOffset: 101 },
      });

    const fields = await fieldService.listFields({ organizationId: 'org_1' });

    expect(apiRequestMock).toHaveBeenNthCalledWith(1, '/api/fields?organizationId=org_1');
    expect(apiRequestMock).toHaveBeenNthCalledWith(2, '/api/fields?organizationId=org_1&offset=100');
    expect(fields.map((field) => field.$id)).toEqual(['field_1', 'field_2']);
  });

  it('hydrates events and matches when range provided', async () => {
    apiRequestMock
      .mockResolvedValueOnce({ fields: [{ $id: 'field_1', name: 'Court A' }] })
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
    const field = { $id: 'field_1', name: 'Court A' } as any;
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
    const field = { $id: 'field_1', name: 'Court A' } as any;
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
        return { $id: 'field_1', name: 'Court A', rentalSlotIds: [createdSlotId] };
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
      { $id: 'field_1', name: 'Court A' } as any,
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
