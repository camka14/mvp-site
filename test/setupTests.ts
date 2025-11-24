import '@testing-library/jest-dom';

afterEach(() => {
  jest.clearAllMocks();
});

const ensureEnv = (key: string, fallback: string) => {
  if (!process.env[key]) {
    process.env[key] = fallback;
  }
};

ensureEnv('NEXT_PUBLIC_APPWRITE_DATABASE_ID', 'test-db');
ensureEnv('NEXT_PUBLIC_APPWRITE_EVENTS_TABLE_ID', 'events-table');
ensureEnv('NEXT_PUBLIC_APPWRITE_FIELDS_TABLE_ID', 'fields-table');
ensureEnv('NEXT_PUBLIC_APPWRITE_WEEKLY_SCHEDULES_TABLE_ID', 'weekly');
ensureEnv('NEXT_PUBLIC_MATCHES_TABLE_ID', 'matches');
ensureEnv('NEXT_PUBLIC_CREATE_LEAGUE_FUNCTION_ID', 'create-league');
ensureEnv('NEXT_PUBLIC_APPWRITE_TEAMS_TABLE_ID', 'teams-table');
ensureEnv('NEXT_PUBLIC_APPWRITE_USERS_TABLE_ID', 'users-table');
ensureEnv('NEXT_PUBLIC_BILLING_FUNCTION_ID', 'billing-fn');
ensureEnv('NEXT_PUBLIC_SERVER_FUNCTION_ID', 'event-manager-fn');

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

if (typeof window !== 'undefined') {
  (window as any).ResizeObserver = ResizeObserverMock;
}

(globalThis as any).ResizeObserver = ResizeObserverMock;
