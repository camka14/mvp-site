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

describe('userService.listInvites', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it('requests and combines every pending invite page without duplicating boundary rows', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          invites: [
            { $id: 'invite_1', type: 'TEAM', status: 'PENDING' },
            { $id: 'invite_2', type: 'TEAM', status: 'PENDING' },
          ],
          nextCursor: 'cursor_page_2',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          invites: [
            { $id: 'invite_2', type: 'TEAM', status: 'PENDING' },
            { $id: 'invite_3', type: 'TEAM', status: 'PENDING' },
          ],
          nextCursor: null,
        }),
      });

    const invites = await userService.listInvites({ userId: 'user_1', type: 'TEAM' });

    expect(invites.map((invite) => invite.$id)).toEqual(['invite_1', 'invite_2', 'invite_3']);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstUrl = new URL(String(fetchMock.mock.calls[0][0]), 'http://localhost');
    const secondUrl = new URL(String(fetchMock.mock.calls[1][0]), 'http://localhost');
    expect(firstUrl.searchParams.get('status')).toBe('PENDING');
    expect(firstUrl.searchParams.get('limit')).toBe('100');
    expect(firstUrl.searchParams.get('cursor')).toBeNull();
    expect(secondUrl.searchParams.get('cursor')).toBe('cursor_page_2');
  });
});
