import { eventService } from '@/lib/eventService';
import { sportsService } from '@/lib/sportsService';
import { createSport } from '@/types/defaults';
import type { AppwriteModuleMock } from '../../../test/mocks/appwrite';

jest.mock('@/app/appwrite', () => {
  const { createAppwriteModuleMock } = require('../../../test/mocks/appwrite');
  return createAppwriteModuleMock();
});

jest.mock('@/lib/sportsService', () => ({
  sportsService: {
    getAll: jest.fn(),
  },
}));

const appwriteModuleMock = jest.requireMock('@/app/appwrite') as AppwriteModuleMock;
const sportsServiceMock = sportsService as jest.Mocked<typeof sportsService>;

const DATABASE_ID = 'test-db';
const EVENTS_TABLE_ID = 'events-table';
const FIELDS_TABLE_ID = 'fields-table';
const MATCHES_TABLE_ID = 'matches-table';
const TEAMS_TABLE_ID = 'teams-table';
const USERS_TABLE_ID = 'users-table';
const WEEKLY_TABLE_ID = 'weekly';
const LEAGUE_SCORING_TABLE_ID = 'league-config';
const ORGANIZATIONS_TABLE_ID = 'org-table';

const setEnv = () => {
  process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID = DATABASE_ID;
  process.env.NEXT_PUBLIC_APPWRITE_EVENTS_TABLE_ID = EVENTS_TABLE_ID;
  process.env.NEXT_PUBLIC_APPWRITE_FIELDS_TABLE_ID = FIELDS_TABLE_ID;
  process.env.NEXT_PUBLIC_MATCHES_TABLE_ID = MATCHES_TABLE_ID;
  process.env.NEXT_PUBLIC_APPWRITE_TEAMS_TABLE_ID = TEAMS_TABLE_ID;
  process.env.NEXT_PUBLIC_APPWRITE_USERS_TABLE_ID = USERS_TABLE_ID;
  process.env.NEXT_PUBLIC_APPWRITE_WEEKLY_SCHEDULES_TABLE_ID = WEEKLY_TABLE_ID;
  process.env.NEXT_PUBLIC_APPWRITE_LEAGUE_SCORING_CONFIG_TABLE_ID = LEAGUE_SCORING_TABLE_ID;
  process.env.NEXT_PUBLIC_APPWRITE_ORGANIZATIONS_TABLE_ID = ORGANIZATIONS_TABLE_ID;
};

describe('eventService', () => {
  beforeEach(() => {
    setEnv();
    jest.clearAllMocks();
    sportsServiceMock.getAll.mockReset();
    sportsServiceMock.getAll.mockResolvedValue([]);
    appwriteModuleMock.databases.listRows.mockResolvedValue({ rows: [] });
  });

  describe('getEventWithRelations', () => {
    it('normalizes time slots and relationships', async () => {
      appwriteModuleMock.databases.getRow.mockResolvedValue({
        $id: 'evt_1',
        name: 'League Event',
        sport: createSport({ $id: 'volleyball', name: 'Volleyball' }),
        teamSignup: true,
        teamIds: ['team_1'],
        playerIds: [],
        divisions: [],
        lat: 40,
        long: -105,
        timeSlots: [
          {
            $id: 'slot_1',
            dayOfWeek: 1,
            startTime: '09:00',
            endTime: 600,
            scheduledFieldId: 'fld_1',
            field: { $id: 'fld_1', name: 'Court A' },
            startDate: '2025-10-01T00:00:00',
            endDate: null,
            repeating: false,
          },
        ],
      });

      const event = await eventService.getEventWithRelations('evt_1');

      expect(appwriteModuleMock.databases.getRow).toHaveBeenNthCalledWith(1, expect.objectContaining({
        databaseId: DATABASE_ID,
        tableId: EVENTS_TABLE_ID,
        rowId: 'evt_1',
      }));

      expect(event?.timeSlots?.[0]).toMatchObject({
        $id: 'slot_1',
        dayOfWeek: 1,
        startTimeMinutes: 540,
        endTimeMinutes: 600,
        startDate: '2025-10-01T00:00:00',
        endDate: null,
        repeating: false,
      });
      expect(event?.timeSlots?.[0]?.scheduledFieldId).toBe('fld_1');
    });
  });

  describe('getEvent', () => {
    it('hydrates sport relationship when only sportId is returned', async () => {
      const sport = createSport({ $id: 'sport_volleyball', name: 'Volleyball' });
      sportsServiceMock.getAll.mockResolvedValueOnce([sport]);

      appwriteModuleMock.databases.getRow
        .mockResolvedValueOnce({
          $id: 'evt_sport_only',
          name: 'Event',
          sportId: 'sport_volleyball',
          leagueScoringConfigId: 'cfg_1',
          divisions: [],
          teamSignup: false,
          playerIds: [],
        })
        .mockResolvedValueOnce({ $id: 'cfg_1' });

      const event = await eventService.getEvent('evt_sport_only');

      expect(sportsServiceMock.getAll).toHaveBeenCalled();
      expect(event?.sport).toEqual(sport);
    });
  });

  describe('createEvent', () => {
    it('sends coordinates when provided', async () => {
      appwriteModuleMock.ID.unique.mockReturnValueOnce('evt_new');
      appwriteModuleMock.databases.createRow.mockResolvedValueOnce({
        $id: 'evt_new',
        name: 'New Event',
        sport: createSport({ $id: 'volleyball', name: 'Volleyball' }),
        teamSignup: true,
        teamIds: [],
        playerIds: [],
        divisions: [],
      });

      await eventService.createEvent({
        name: 'New Event',
        coordinates: [-105, 40],
      });

      const [eventCallArgs] = appwriteModuleMock.databases.createRow.mock.calls;
      const eventCall = eventCallArgs[0];
      expect(eventCall).toMatchObject({
        databaseId: DATABASE_ID,
        tableId: EVENTS_TABLE_ID,
      });
      expect(eventCall.data).toEqual(expect.objectContaining({
        name: 'New Event',
        coordinates: [-105, 40],
      }));
    });
  });

  describe('updateEvent', () => {
    it('normalizes coordinate payloads', async () => {
      appwriteModuleMock.functions.createExecution.mockResolvedValue({
        responseBody: JSON.stringify({}),
      });
      appwriteModuleMock.databases.getRow.mockResolvedValueOnce({
        $id: 'evt_1',
        sport: createSport({ $id: 'volleyball', name: 'Volleyball' }),
        teamSignup: false,
        playerIds: ['user_1'],
        divisions: [],
        coordinates: [-105, 40],
      });

      await eventService.updateEvent('evt_1', { coordinates: [-105, 40] });

      expect(appwriteModuleMock.functions.createExecution).toHaveBeenCalledWith(
        expect.objectContaining({
          functionId: process.env.NEXT_PUBLIC_EVENT_MANAGER_FUNCTION_ID,
          async: false,
        }),
      );

      const executionCall = appwriteModuleMock.functions.createExecution.mock.calls[0][0];
      const payload = JSON.parse(executionCall.body);
      expect(payload.event.coordinates).toEqual([-105, 40]);
    });
  });

  describe('deleteUnpublishedEvent', () => {
    it('deletes event without removing fields when organization exists', async () => {
      appwriteModuleMock.databases.deleteRow.mockResolvedValue(undefined);

      await eventService.deleteUnpublishedEvent({
        $id: 'evt_1',
        state: 'UNPUBLISHED',
        organization: 'org_1',
      } as any);

      expect(appwriteModuleMock.databases.deleteRow).toHaveBeenCalledTimes(1);
      expect(appwriteModuleMock.databases.deleteRow).toHaveBeenCalledWith({
        databaseId: DATABASE_ID,
        tableId: EVENTS_TABLE_ID,
        rowId: 'evt_1',
      });
    });

    it('removes fields when event lacks organization', async () => {
      appwriteModuleMock.databases.deleteRow
        .mockResolvedValueOnce(undefined) // event delete
        .mockResolvedValueOnce(undefined); // field delete

      await eventService.deleteUnpublishedEvent({
        $id: 'evt_2',
        state: 'UNPUBLISHED',
        fields: [{ $id: 'fld_1' }],
      } as any);

      expect(appwriteModuleMock.databases.deleteRow).toHaveBeenNthCalledWith(1, {
        databaseId: DATABASE_ID,
        tableId: EVENTS_TABLE_ID,
        rowId: 'evt_2',
      });
      expect(appwriteModuleMock.databases.deleteRow).toHaveBeenNthCalledWith(2, {
        databaseId: DATABASE_ID,
        tableId: FIELDS_TABLE_ID,
        rowId: 'fld_1',
      });
    });

    it('throws when field deletion fails', async () => {
      appwriteModuleMock.databases.deleteRow
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('failed delete'));

      await expect(
        eventService.deleteUnpublishedEvent({
          $id: 'evt_3',
          state: 'UNPUBLISHED',
          fields: [{ $id: 'fld_1' }],
        } as any)
      ).rejects.toThrow('Failed to delete fields for unpublished event');
    });
  });

  describe('waitlist helpers', () => {
    it('adds unique waitlist entries when event exists', async () => {
      appwriteModuleMock.databases.getRow.mockResolvedValueOnce({
        $id: 'evt_1',
        sport: createSport({ $id: 'volleyball', name: 'Volleyball' }),
        teamSignup: true,
        teamIds: [],
        playerIds: [],
        divisions: [],
        waitListIds: ['user_1'],
      });

      appwriteModuleMock.databases.updateRow.mockResolvedValue({
        $id: 'evt_1',
        sport: createSport({ $id: 'volleyball', name: 'Volleyball' }),
        teamSignup: true,
        teamIds: [],
        playerIds: [],
        divisions: [],
        waitListIds: ['user_1', 'user_2'],
      });

      const event = await eventService.addToWaitlist('evt_1', 'user_2');

      expect(appwriteModuleMock.databases.updateRow).toHaveBeenCalledWith({
        databaseId: DATABASE_ID,
        tableId: EVENTS_TABLE_ID,
        rowId: 'evt_1',
        data: { waitListIds: ['user_1', 'user_2'] },
      });
      expect(event.waitListIds).toEqual(['user_1', 'user_2']);
    });
  });

  describe('date range filters', () => {
    it('normalizes timezone offsets when fetching matches', async () => {
      appwriteModuleMock.databases.listRows.mockResolvedValue({ rows: [] });

      await eventService.getMatchesForFieldInRange(
        'field_1',
        '2025-10-05T00:00:00-07:00',
        '2025-10-11T23:59:59-07:00'
      );

      const { queries } = appwriteModuleMock.databases.listRows.mock.calls[0][0];
      const gteQuery = (queries as string[]).find((q) => q.includes('"method":"greaterThanEqual"'));
      const lteQuery = (queries as string[]).find((q) => q.includes('"method":"lessThanEqual"'));

      expect(gteQuery).toBeDefined();
      expect(lteQuery).toBeDefined();

      const greaterThanEqual = JSON.parse(gteQuery as string);
      const lessThanEqual = JSON.parse(lteQuery as string);

      expect(greaterThanEqual.values[0]).toBe('2025-10-05T07:00:00Z');
      expect(lessThanEqual.values[0]).toBe('2025-10-12T06:59:59Z');
    });

    it('normalizes timezone offsets when fetching events', async () => {
      appwriteModuleMock.databases.listRows.mockResolvedValue({ rows: [] });

      await eventService.getEventsForFieldInRange(
        'field_1',
        '2025-10-05T00:00:00-07:00',
        '2025-10-11T23:59:59-07:00'
      );

      const { queries } = appwriteModuleMock.databases.listRows.mock.calls[0][0];
      const gteQuery = (queries as string[]).find((q) => q.includes('"method":"greaterThanEqual"'));
      const lteQuery = (queries as string[]).find((q) => q.includes('"method":"lessThanEqual"'));

      expect(gteQuery).toBeDefined();
      expect(lteQuery).toBeDefined();

      const greaterThanEqual = JSON.parse(gteQuery as string);
      const lessThanEqual = JSON.parse(lteQuery as string);

      expect(greaterThanEqual.values[0]).toBe('2025-10-05T07:00:00Z');
      expect(lessThanEqual.values[0]).toBe('2025-10-12T06:59:59Z');
    });
  });
});
