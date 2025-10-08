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

const setEnv = () => {
  process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID = DATABASE_ID;
  process.env.NEXT_PUBLIC_APPWRITE_EVENTS_TABLE_ID = EVENTS_TABLE_ID;
  process.env.NEXT_PUBLIC_APPWRITE_FIELDS_TABLE_ID = FIELDS_TABLE_ID;
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
        startTime: 540,
        endTime: 600,
      });
      expect((event?.timeSlots?.[0]?.field as any)?.name).toBe('Court A');
    });
  });

  describe('createEvent', () => {
    it('sends coordinates when lat/long present and creates fields', async () => {
    appwriteModuleMock.ID.unique.mockReturnValueOnce('evt_new');
    appwriteModuleMock.databases.createRow
      .mockResolvedValueOnce({
        $id: 'evt_new',
        name: 'New Event',
        sport: 'Volleyball',
        teamSignup: true,
        teamIds: [],
          playerIds: [],
          divisions: [],
          lat: 40,
          long: -105,
        })
        .mockResolvedValue({ $id: 'field_row' });

    await eventService.createEvent({
        name: 'New Event',
        lat: 40,
        long: -105,
        fieldCount: 2,
      });

    const createCalls = appwriteModuleMock.databases.createRow.mock.calls;
    const [eventCall, ...fieldCalls] = createCalls.map(([args]) => args);

    expect(eventCall).toMatchObject({
      databaseId: DATABASE_ID,
      tableId: EVENTS_TABLE_ID,
      data: expect.objectContaining({
        name: 'New Event',
        coordinates: [-105, 40],
      }),
    });

    expect(fieldCalls).toHaveLength(2);
    expect(fieldCalls[0]).toMatchObject({
      tableId: FIELDS_TABLE_ID,
      data: expect.objectContaining({
        eventId: 'evt_new',
        fieldNumber: 1,
      }),
    });
    expect(fieldCalls[1]).toMatchObject({
      tableId: FIELDS_TABLE_ID,
      data: expect.objectContaining({
        eventId: 'evt_new',
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

      const [createArgs] = appwriteModuleMock.databases.createRow.mock.calls;
      const [payload] = createArgs as [{ data: Record<string, any> }];
      const { data } = payload;

      expect(data.fields).toEqual([
        expect.objectContaining({
          $id: 'field_1',
          name: 'Court A',
          organization: 'org_1',
        }),
      ]);
      expect(data.fields[0]).not.toHaveProperty('matches');
      expect(data.fields[0]).not.toHaveProperty('events');
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
});
