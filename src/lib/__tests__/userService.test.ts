/** @jest-environment node */

import { userService } from '@/lib/userService';

describe('userService.lookupEmailMembership', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        matches: [{ email: 'staff@example.com', userId: 'staff_1' }],
      }),
    });
  });

  it('batches a large authorized event lookup within the API bounds', async () => {
    const emails = Array.from({ length: 51 }, (_, index) => `staff-${index}@example.com`);
    const userIds = Array.from({ length: 101 }, (_, index) => `staff_${index}`);

    const matches = await userService.lookupEmailMembership(emails, userIds, { eventId: 'event_1' });

    expect(fetchMock).toHaveBeenCalledTimes(4);
    fetchMock.mock.calls.forEach(([path, init]) => {
      expect(path).toBe('/api/users/email-membership');
      const body = JSON.parse(String((init as RequestInit).body));
      expect(body.eventId).toBe('event_1');
      expect(Array.isArray(body.emails)).toBe(true);
      expect(Array.isArray(body.userIds)).toBe(true);
      expect(body.emails.length).toBeLessThanOrEqual(50);
      expect(body.userIds.length).toBeLessThanOrEqual(100);
    });
    expect(matches).toEqual([{ email: 'staff@example.com', userId: 'staff_1' }]);
  });
});
