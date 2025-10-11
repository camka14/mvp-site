import { Query } from 'appwrite';

export interface TablesMock {
  getRow: jest.Mock;
  listRows: jest.Mock;
  createRow: jest.Mock;
  updateRow: jest.Mock;
  deleteRow: jest.Mock;
  upsertRow: jest.Mock;
}

export const createTablesMock = (): TablesMock => ({
  getRow: jest.fn(),
  listRows: jest.fn(),
  createRow: jest.fn(),
  updateRow: jest.fn(),
  deleteRow: jest.fn(),
  upsertRow: jest.fn(),
});

export const createFunctionsMock = () => ({
  createExecution: jest.fn(),
});

export const createStorageMock = () => ({
  createFile: jest.fn(),
  getFilePreview: jest.fn(() => ({ href: 'https://example.com/preview.png' })),
});

export const createAccountMock = () => ({
  create: jest.fn(),
  createEmailPasswordSession: jest.fn(),
  get: jest.fn(),
  deleteSession: jest.fn(),
});

export const createMockID = (uniqueValue = 'mocked-id') => ({
  unique: jest.fn(() => uniqueValue),
});

export const createAppwriteModuleMock = (overrides: Partial<Record<string, unknown>> = {}) => {
  const tables = createTablesMock();
  const functions = createFunctionsMock();
  const storage = createStorageMock();
  const account = createAccountMock();

  return {
    client: {},
    account,
    databases: tables,
    tables,
    storage,
    functions,
    ID: createMockID(),
    Query,
    ...overrides,
  };
};

export type AppwriteModuleMock = ReturnType<typeof createAppwriteModuleMock>;
