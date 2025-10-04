import { fieldService } from '@/lib/fieldService';
import type { AppwriteModuleMock } from '../../../test/mocks/appwrite';

jest.mock('@/app/appwrite', () => {
  const { createAppwriteModuleMock } = require('../../../test/mocks/appwrite');
  return createAppwriteModuleMock();
});

const appwriteModuleMock = jest.requireMock('@/app/appwrite') as AppwriteModuleMock;

const DATABASE_ID = 'test-db';
const FIELDS_TABLE_ID = 'fields-table';

describe('fieldService', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID = DATABASE_ID;
    process.env.NEXT_PUBLIC_APPWRITE_FIELDS_TABLE_ID = FIELDS_TABLE_ID;
    jest.clearAllMocks();
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
});
