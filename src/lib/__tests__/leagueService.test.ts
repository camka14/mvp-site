import { leagueService, WeeklySlotInput } from '@/lib/leagueService';
import { eventService } from '@/lib/eventService';
import type { AppwriteModuleMock } from '../../../test/mocks/appwrite';

jest.mock('@/lib/eventService', () => ({
  eventService: {
    getEvent: jest.fn(),
    getEventWithRelations: jest.fn(),
    createEvent: jest.fn(),
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
const CREATE_LEAGUE_FUNCTION_ID = 'create-league';

const setEnv = () => {
  process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID = DATABASE_ID;
  process.env.NEXT_PUBLIC_APPWRITE_WEEKLY_SCHEDULES_TABLE_ID = WEEKLY_TABLE_ID;
  process.env.NEXT_PUBLIC_MATCHES_COLLECTION_ID = MATCHES_TABLE_ID;
  process.env.NEXT_PUBLIC_APPWRITE_EVENTS_TABLE_ID = EVENTS_TABLE_ID;
  process.env.NEXT_PUBLIC_CREATE_LEAGUE_FUNCTION_ID = CREATE_LEAGUE_FUNCTION_ID;
};

describe('leagueService', () => {
  beforeEach(() => {
    setEnv();
    jest.clearAllMocks();
  });

  describe('createWeeklySchedules', () => {
    it('persists slots with relationships and minutes normalization', async () => {
      const slot: WeeklySlotInput = {
        fieldId: 'field_1',
        dayOfWeek: 2,
        startTime: 9 * 60,
        endTime: 10 * 60,
        timezone: 'UTC',
      };

      appwriteModuleMock.databases.createRow.mockResolvedValue({
        $id: 'slot_1',
        ...slot,
        event: 'event_1',
        field: 'field_1',
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
            timezone: 'UTC',
          },
        }),
      );

      expect(result[0]).toMatchObject({
        $id: 'slot_1',
        startTime: 9 * 60,
        endTime: 10 * 60,
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
            timezone: 'America/New_York',
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
        startTime: 600,
        endTime: 690,
        field: expect.objectContaining({ name: 'Court B' }),
      });
    });
  });

  describe('checkConflictsForSlot', () => {
    it('detects conflicts when overlapping schedules exist', async () => {
      appwriteModuleMock.databases.listRows.mockResolvedValue({
        rows: [
          {
            $id: 'slot_existing',
            dayOfWeek: 1,
            startTime: 9 * 60,
            endTime: 11 * 60,
            timezone: 'UTC',
            field: 'field_1',
            event: 'event_other',
          },
        ],
      });

      (eventService.getEvent as jest.Mock).mockResolvedValue({
        $id: 'event_other',
        start: new Date().toISOString(),
        end: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        name: 'Other Event',
      });

      const conflicts = await leagueService.checkConflictsForSlot(
        {
          fieldId: 'field_1',
          dayOfWeek: 1,
          startTime: 10 * 60,
          endTime: 11 * 60,
          timezone: 'UTC',
        },
        new Date().toISOString(),
        new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      );

      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].event.name).toBe('Other Event');
      expect(eventService.getEvent).toHaveBeenCalledWith('event_other');
    });
  });

  describe('generateSchedule', () => {
    it('calls Appwrite function and parses response', async () => {
      appwriteModuleMock.functions.createExecution.mockResolvedValue({
        responseBody: JSON.stringify({ matches: [] }),
      });

      const result = await leagueService.generateSchedule('event_1');

      expect(appwriteModuleMock.functions.createExecution).toHaveBeenCalledWith({
        functionId: CREATE_LEAGUE_FUNCTION_ID,
        body: JSON.stringify({ eventId: 'event_1', dryRun: false }),
        async: false,
      });
      expect(result.matches).toEqual([]);
    });
  });
});
