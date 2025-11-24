import { leagueService } from '@/lib/leagueService';
import { eventService } from '@/lib/eventService';
import type { Field, TimeSlot } from '@/types';
import type { AppwriteModuleMock } from '../../../test/mocks/appwrite';

jest.mock('@/lib/eventService', () => ({
  eventService: {
    getEvent: jest.fn(),
    getEventWithRelations: jest.fn(),
    createEvent: jest.fn(),
    mapRowFromDatabase: jest.fn(),
  },
}));

jest.mock('@/app/appwrite', () => {
  const { createAppwriteModuleMock } = require('../../../test/mocks/appwrite');
  return createAppwriteModuleMock();
});

const appwriteModuleMock = jest.requireMock('@/app/appwrite') as AppwriteModuleMock;

const DATABASE_ID = 'test-db';
const WEEKLY_TABLE_ID = 'weekly';
const MATCHES_TABLE_ID = 'matches';
const EVENTS_TABLE_ID = 'events-table';
const SERVER_FUNCTION_ID = process.env.NEXT_PUBLIC_SERVER_FUNCTION_ID || 'mvpServer';
const CREATE_LEAGUE_FUNCTION_ID = process.env.NEXT_PUBLIC_CREATE_LEAGUE_FUNCTION_ID || 'create-league';

const setEnv = () => {
  process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID = DATABASE_ID;
  process.env.NEXT_PUBLIC_APPWRITE_WEEKLY_SCHEDULES_TABLE_ID = WEEKLY_TABLE_ID;
  process.env.NEXT_PUBLIC_MATCHES_TABLE_ID = MATCHES_TABLE_ID;
  process.env.NEXT_PUBLIC_APPWRITE_EVENTS_TABLE_ID = EVENTS_TABLE_ID;
  process.env.NEXT_PUBLIC_SERVER_FUNCTION_ID = SERVER_FUNCTION_ID;
  process.env.NEXT_PUBLIC_CREATE_LEAGUE_FUNCTION_ID = CREATE_LEAGUE_FUNCTION_ID;
};

describe('leagueService', () => {
  beforeEach(() => {
    setEnv();
    jest.clearAllMocks();
  });

  describe('createWeeklySchedules', () => {
    it('persists slots with relationships and minutes normalization', async () => {
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

      appwriteModuleMock.databases.createRow.mockResolvedValue({
        $id: 'slot_1',
        scheduledFieldId: field.$id,
        dayOfWeek: 2,
        startTimeMinutes: 9 * 60,
        endTimeMinutes: 10 * 60,
        startDate: '2025-10-01T00:00:00',
        endDate: '2025-12-01T00:00:00',
        repeating: true,
      });

      appwriteModuleMock.databases.getRow.mockResolvedValue({
        $id: 'event_1',
        timeSlotIds: [],
      });

      const result = await leagueService.createWeeklySchedules('event_1', [slot]);

      expect(appwriteModuleMock.databases.createRow).toHaveBeenCalledWith(
        expect.objectContaining({
          databaseId: DATABASE_ID,
          tableId: WEEKLY_TABLE_ID,
          data: {
            eventId: 'event_1',
            scheduledFieldId: 'field_1',
            dayOfWeek: 2,
            startTimeMinutes: 9 * 60,
            endTimeMinutes: 10 * 60,
            startDate: '2025-10-01T00:00:00',
            endDate: '2025-12-01T00:00:00',
            repeating: true,
          },
        }),
      );

      expect(appwriteModuleMock.databases.updateRow).toHaveBeenCalledWith(
        expect.objectContaining({
          databaseId: DATABASE_ID,
          tableId: EVENTS_TABLE_ID,
          rowId: 'event_1',
          data: { timeSlotIds: ['slot_1'] },
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
      (eventService.getEventWithRelations as jest.Mock).mockResolvedValue({
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
      });

      const slots = await leagueService.listWeeklySchedulesByEvent('event_1');

      expect(eventService.getEventWithRelations).toHaveBeenCalledWith('event_1');
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
