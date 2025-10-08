import { fieldService } from '@/lib/fieldService';
import type { AppwriteModuleMock } from '../../../test/mocks/appwrite';

jest.mock('@/app/appwrite', () => {
  const { createAppwriteModuleMock } = require('../../../test/mocks/appwrite');
  return createAppwriteModuleMock();
});

jest.mock('@/lib/eventService', () => ({
  eventService: {
    getEventsForFieldInRange: jest.fn(),
    getMatchesForFieldInRange: jest.fn(),
  },
}));

const appwriteModuleMock = jest.requireMock('@/app/appwrite') as AppwriteModuleMock;
const eventServiceMock = jest.requireMock('@/lib/eventService').eventService as {
  getEventsForFieldInRange: jest.Mock;
  getMatchesForFieldInRange: jest.Mock;
};

const DATABASE_ID = 'test-db';
const FIELDS_TABLE_ID = 'fields-table';

describe('fieldService', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID = DATABASE_ID;
    process.env.NEXT_PUBLIC_APPWRITE_FIELDS_TABLE_ID = FIELDS_TABLE_ID;
    jest.clearAllMocks();
    eventServiceMock.getEventsForFieldInRange.mockResolvedValue([]);
    eventServiceMock.getMatchesForFieldInRange.mockResolvedValue([]);
  });

  it('creates a field with provided payload', async () => {
    appwriteModuleMock.databases.createRow.mockResolvedValue({
      $id: 'field_1',
      name: 'Court A',
    });

    const field = await fieldService.createField({
      name: 'Court A',
      fieldNumber: 1,
    });

    expect(appwriteModuleMock.databases.createRow).toHaveBeenCalledWith(expect.objectContaining({
      databaseId: DATABASE_ID,
      tableId: FIELDS_TABLE_ID,
      rowId: expect.any(String),
    }));
    expect(appwriteModuleMock.databases.createRow.mock.calls[0][0].data).toEqual(expect.objectContaining({
      name: 'Court A',
      fieldNumber: 1,
    }));
    expect(field.$id).toBe('field_1');
  });

  it('lists fields with optional organization filter', async () => {
    appwriteModuleMock.databases.listRows.mockResolvedValue({
      rows: [{ $id: 'field_1', name: 'Court A' }],
    });

    const fields = await fieldService.listFields('org_1');

    expect(appwriteModuleMock.databases.listRows).toHaveBeenCalledWith(expect.objectContaining({
      databaseId: DATABASE_ID,
      tableId: FIELDS_TABLE_ID,
    }));
    const queries = appwriteModuleMock.databases.listRows.mock.calls[0][0].queries;
    expect(queries).toEqual(expect.arrayContaining([
      expect.stringContaining('organization.$id'),
    ]));
    expect(fields[0].name).toBe('Court A');
  });

  it('hydrates events and matches when range provided', async () => {
    appwriteModuleMock.databases.listRows.mockResolvedValue({
      rows: [{ $id: 'field_1', name: 'Court A' }],
    });

    eventServiceMock.getEventsForFieldInRange.mockResolvedValue([{ $id: 'evt_1', name: 'Tournament' } as any]);
    eventServiceMock.getMatchesForFieldInRange.mockResolvedValue([
      { $id: 'match_1', start: '2024-01-01T10:00:00Z', end: '2024-01-01T11:00:00Z' } as any,
    ]);

    const fields = await fieldService.listFields('org_1', { start: '2024-01-01T00:00:00Z', end: '2024-01-07T00:00:00Z' });

    expect(eventServiceMock.getEventsForFieldInRange).toHaveBeenCalledWith('field_1', '2024-01-01T00:00:00Z', '2024-01-07T00:00:00Z');
    expect(eventServiceMock.getMatchesForFieldInRange).toHaveBeenCalledWith('field_1', '2024-01-01T00:00:00Z', '2024-01-07T00:00:00Z');
    expect(fields[0].events?.[0].$id).toBe('evt_1');
    expect(fields[0].matches?.[0].$id).toBe('match_1');
  });
});
