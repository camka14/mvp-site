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
const EVENTS_TABLE_ID = 'events';
const EVENT_MANAGER_FUNCTION_ID = process.env.NEXT_PUBLIC_EVENT_MANAGER_FUNCTION_ID || 'eventManager';
const CREATE_LEAGUE_FUNCTION_ID = process.env.NEXT_PUBLIC_CREATE_LEAGUE_FUNCTION_ID || 'create-league';

const setEnv = () => {
  process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID = DATABASE_ID;
  process.env.NEXT_PUBLIC_APPWRITE_WEEKLY_SCHEDULES_TABLE_ID = WEEKLY_TABLE_ID;
  process.env.NEXT_PUBLIC_MATCHES_TABLE_ID = MATCHES_TABLE_ID;
  process.env.NEXT_PUBLIC_APPWRITE_EVENTS_TABLE_ID = EVENTS_TABLE_ID;
  process.env.NEXT_PUBLIC_EVENT_MANAGER_FUNCTION_ID = EVENT_MANAGER_FUNCTION_ID;
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
        type: 'indoor',
        fieldNumber: 1,
      };

      const slot: TimeSlot = {
        $id: 'temp-slot',
        field,
        dayOfWeek: 2,
        startTimeMinutes: 9 * 60,
        endTimeMinutes: 10 * 60,
      };

      appwriteModuleMock.databases.createRow.mockResolvedValue({
        ...slot,
        $id: 'slot_1',
        event: 'event_1',
        field,
      });

      const result = await leagueService.createWeeklySchedules('event_1', [slot]);

      expect(appwriteModuleMock.databases.createRow).toHaveBeenCalledWith(
        expect.objectContaining({
          databaseId: DATABASE_ID,
          tableId: WEEKLY_TABLE_ID,
          data: {
            event: 'event_1',
            field: 'field_1',
            dayOfWeek: 2,
            startTime: 9 * 60,
            endTime: 10 * 60,
          },
          queries: expect.any(Array),
        }),
      );

      expect(result[0]).toMatchObject({
        $id: 'slot_1',
        startTimeMinutes: 9 * 60,
        endTimeMinutes: 10 * 60,
      });
    });
  });

  describe('listWeeklySchedulesByEvent', () => {
    it('returns slots with minute conversions and relationship hydration', async () => {
      appwriteModuleMock.databases.listRows.mockResolvedValue({
        rows: [
          {
            $id: 'slot_1',
            dayOfWeek: 3,
            startTime: '10:00',
            endTime: '11:30',
            field: { $id: 'field_1', name: 'Court B' },
            event: { $id: 'event_1' },
          },
        ],
      });

      const slots = await leagueService.listWeeklySchedulesByEvent('event_1');

      expect(appwriteModuleMock.databases.listRows).toHaveBeenCalledWith(
        expect.objectContaining({
          databaseId: DATABASE_ID,
          tableId: WEEKLY_TABLE_ID,
        }),
      );
      expect(slots[0]).toMatchObject({
        startTimeMinutes: 600,
        endTimeMinutes: 690,
        field: expect.objectContaining({ name: 'Court B' }),
      });
    });
  });

});
