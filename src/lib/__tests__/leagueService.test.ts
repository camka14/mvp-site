import { leagueService } from '@/lib/leagueService';
import { apiRequest } from '@/lib/apiClient';
import { eventService } from '@/lib/eventService';
import type { Field, TimeSlot } from '@/types';

jest.mock('@/lib/apiClient', () => ({
  apiRequest: jest.fn(),
}));

jest.mock('@/lib/eventService', () => ({
  eventService: {
    getEventWithRelations: jest.fn(),
  },
}));

const apiRequestMock = apiRequest as jest.MockedFunction<typeof apiRequest>;
const eventServiceMock = eventService as jest.Mocked<typeof eventService>;

describe('leagueService', () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
    eventServiceMock.getEventWithRelations.mockReset();
  });

  describe('createWeeklySchedules', () => {
    it('creates slots and appends them to the event', async () => {
      const field: Field = {
        $id: 'field_1',
        name: 'Court A',
        location: '',
        lat: 0,
        long: 0,
        type: 'INDOOR',
        fieldNumber: 1,
      };

      const slot: TimeSlot = {
        $id: 'temp-slot',
        scheduledFieldId: field.$id,
        dayOfWeek: 2,
        startTimeMinutes: 9 * 60,
        endTimeMinutes: 10 * 60,
        startDate: '2025-10-01T00:00:00',
        endDate: '2025-12-01T00:00:00',
        repeating: true,
      };

      apiRequestMock
        .mockResolvedValueOnce({
          $id: 'slot_1',
          scheduledFieldId: field.$id,
          dayOfWeek: 2,
          startTimeMinutes: 9 * 60,
          endTimeMinutes: 10 * 60,
          startDate: '2025-10-01T00:00:00',
          endDate: '2025-12-01T00:00:00',
          repeating: true,
        })
        .mockResolvedValueOnce({
          timeSlotIds: [],
        })
        .mockResolvedValueOnce({});

      const result = await leagueService.createWeeklySchedules('event_1', [slot]);

      expect(apiRequestMock).toHaveBeenNthCalledWith(
        1,
        '/api/time-slots',
        expect.objectContaining({
          method: 'POST',
          body: expect.objectContaining({
            eventId: 'event_1',
            scheduledFieldId: 'field_1',
            dayOfWeek: 2,
            startTimeMinutes: 9 * 60,
            endTimeMinutes: 10 * 60,
            startDate: '2025-10-01T00:00:00',
            endDate: '2025-12-01T00:00:00',
            repeating: true,
          }),
        }),
      );

      expect(apiRequestMock).toHaveBeenNthCalledWith(2, '/api/events/event_1');
      expect(apiRequestMock).toHaveBeenNthCalledWith(
        3,
        '/api/events/event_1',
        expect.objectContaining({
          method: 'PATCH',
          body: { event: { timeSlotIds: ['slot_1'] } },
        }),
      );

      expect(result[0]).toMatchObject({
        $id: 'slot_1',
        startTimeMinutes: 9 * 60,
        endTimeMinutes: 10 * 60,
        repeating: true,
      });
    });
  });

  describe('listWeeklySchedulesByEvent', () => {
    it('returns slots with minute conversions and relationship hydration', async () => {
      eventServiceMock.getEventWithRelations.mockResolvedValue({
        timeSlots: [
          {
            $id: 'slot_1',
            dayOfWeek: 3,
            startTimeMinutes: 600,
            endTimeMinutes: 690,
            scheduledFieldId: 'field_1',
            startDate: '2025-10-01T00:00:00',
            endDate: null,
            repeating: false,
          },
        ],
      } as any);

      const slots = await leagueService.listWeeklySchedulesByEvent('event_1');

      expect(eventServiceMock.getEventWithRelations).toHaveBeenCalledWith('event_1');
      expect(slots[0]).toMatchObject({
        startTimeMinutes: 600,
        endTimeMinutes: 690,
        startDate: '2025-10-01T00:00:00',
        endDate: null,
        repeating: false,
      });
      expect(slots[0].scheduledFieldId).toBe('field_1');
    });
  });
});
