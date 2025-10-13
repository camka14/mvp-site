import { eventService } from '@/lib/eventService';
import type { AppwriteModuleMock } from '../../../test/mocks/appwrite';

jest.mock('@/app/appwrite', () => {
  const { createAppwriteModuleMock } = require('../../../test/mocks/appwrite');
  return createAppwriteModuleMock();
});

const appwriteModuleMock = jest.requireMock('@/app/appwrite') as AppwriteModuleMock;

const DATABASE_ID = 'test-db';
const EVENTS_TABLE_ID = 'events-table';
const FIELDS_TABLE_ID = 'fields-table';
const MATCHES_TABLE_ID = 'matches-table';

const setEnv = () => {
  process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID = DATABASE_ID;
  process.env.NEXT_PUBLIC_APPWRITE_EVENTS_TABLE_ID = EVENTS_TABLE_ID;
  process.env.NEXT_PUBLIC_APPWRITE_FIELDS_TABLE_ID = FIELDS_TABLE_ID;
  process.env.NEXT_PUBLIC_MATCHES_TABLE_ID = MATCHES_TABLE_ID;
};

describe('eventService', () => {
  beforeEach(() => {
    setEnv();
    jest.clearAllMocks();
  });

  describe('getEventWithRelations', () => {
    it('normalizes time slots and relationships', async () => {
      appwriteModuleMock.databases.getRow.mockResolvedValue({
        $id: 'evt_1',
        name: 'League Event',
        sport: 'Volleyball',
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
            field: { $id: 'fld_1', name: 'Court A' },
            startDate: '2025-10-01T00:00:00',
            endDate: null,
            repeating: false,
          },
        ],
      });

      const event = await eventService.getEventWithRelations('evt_1');

      expect(appwriteModuleMock.databases.getRow).toHaveBeenCalledWith({
        databaseId: DATABASE_ID,
        tableId: EVENTS_TABLE_ID,
        rowId: 'evt_1',
        queries: expect.any(Array),
      });

      expect(event?.timeSlots?.[0]).toMatchObject({
        $id: 'slot_1',
        dayOfWeek: 1,
        startTimeMinutes: 540,
        endTimeMinutes: 600,
        startDate: '2025-10-01T00:00:00',
        endDate: null,
        repeating: false,
      });
      expect((event?.timeSlots?.[0]?.scheduledFieldId as any)?.name).toBe('Court A');
    });
  });

  describe('createEvent', () => {
    it('sends coordinates when lat/long present and creates fields', async () => {
    appwriteModuleMock.ID.unique.mockReturnValueOnce('evt_new');
    appwriteModuleMock.databases.createRow.mockResolvedValueOnce({
      $id: 'evt_new',
      name: 'New Event',
      sport: 'Volleyball',
      teamSignup: true,
      teamIds: [],
      playerIds: [],
      divisions: [],
      lat: 40,
      long: -105,
    });
    appwriteModuleMock.databases.upsertRow.mockResolvedValue({ $id: 'field_row' });

    await eventService.createEvent({
      name: 'New Event',
      lat: 40,
      long: -105,
      fields: [
        { $id: 'field_1', name: 'Field A', fieldNumber: 1 } as any,
        { $id: 'field_2', name: 'Field B', fieldNumber: 2 } as any,
      ],
    });

    const [eventCallArgs] = appwriteModuleMock.databases.createRow.mock.calls;
    const eventCall = eventCallArgs[0];
    expect(eventCall).toMatchObject({
      databaseId: DATABASE_ID,
      tableId: EVENTS_TABLE_ID,
      data: expect.objectContaining({
        name: 'New Event',
        coordinates: [-105, 40],
        fields: ['field_1', 'field_2'],
      }),
    });

    const fieldCalls = appwriteModuleMock.databases.upsertRow.mock.calls;
    expect(fieldCalls).toHaveLength(2);
    expect(fieldCalls[0][0]).toMatchObject({
      databaseId: DATABASE_ID,
      tableId: FIELDS_TABLE_ID,
      rowId: 'field_1',
      data: expect.objectContaining({
        name: 'Field A',
        fieldNumber: 1,
      }),
    });
    expect(fieldCalls[1][0]).toMatchObject({
      databaseId: DATABASE_ID,
      tableId: FIELDS_TABLE_ID,
      rowId: 'field_2',
      data: expect.objectContaining({
        name: 'Field B',
        fieldNumber: 2,
      }),
    });
    });

    it('sanitizes nested fields before submitting to Appwrite', async () => {
      appwriteModuleMock.ID.unique.mockReturnValueOnce('evt_nested');
      appwriteModuleMock.databases.createRow.mockResolvedValueOnce({
        $id: 'evt_nested',
        name: 'Nested Event',
        sport: 'Volleyball',
        teamSignup: false,
        playerIds: [],
        teamIds: [],
        divisions: [],
        lat: 40,
        long: -105,
      });

      await eventService.createEvent({
        name: 'Nested Event',
        sport: 'Volleyball',
        teamSignup: false,
        playerIds: [],
        teamIds: [],
        divisions: [],
        lat: 40,
        long: -105,
        fields: [
          {
            $id: 'field_1',
            name: 'Court A',
            location: 'Gym',
            lat: 39.5,
            long: -104.9,
            type: 'indoor',
            fieldNumber: 1,
            organization: { $id: 'org_1', name: 'Org 1' } as any,
            matches: [{ $id: 'match_1' }] as any,
            events: [{ $id: 'evt_other' }] as any,
          } as any,
        ],
      });

      const fieldCalls = appwriteModuleMock.databases.upsertRow.mock.calls;
      expect(fieldCalls).toHaveLength(1);
      const [fieldArgs] = fieldCalls as Array<[Record<string, any>]>;
      const fieldPayload = fieldArgs[0];

      expect(fieldPayload).toMatchObject({
        databaseId: DATABASE_ID,
        tableId: FIELDS_TABLE_ID,
        rowId: 'field_1',
        data: expect.objectContaining({
          name: 'Court A',
          organization: 'org_1',
        }),
      });
      expect(fieldPayload.data).not.toHaveProperty('matches');
      expect(fieldPayload.data).not.toHaveProperty('events');
    });
  });

  describe('updateEvent', () => {
    it('normalizes coordinate payloads', async () => {
      appwriteModuleMock.databases.updateRow.mockResolvedValue({
        $id: 'evt_1',
        sport: 'Volleyball',
        teamSignup: false,
        playerIds: ['user_1'],
        divisions: [],
        lat: 40,
        long: -105,
      });

      await eventService.updateEvent('evt_1', { lat: 40, long: -105 });

      expect(appwriteModuleMock.databases.updateRow).toHaveBeenCalledWith({
        databaseId: DATABASE_ID,
        tableId: EVENTS_TABLE_ID,
        rowId: 'evt_1',
        data: expect.objectContaining({
          coordinates: [-105, 40],
        }),
      });
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
        sport: 'Volleyball',
        teamSignup: true,
        teamIds: [],
        playerIds: [],
        divisions: [],
        waitListIds: ['user_1'],
      });

      appwriteModuleMock.databases.updateRow.mockResolvedValue({
        $id: 'evt_1',
        sport: 'Volleyball',
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
