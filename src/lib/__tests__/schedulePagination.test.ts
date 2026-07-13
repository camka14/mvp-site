import { loadCompleteSchedulePayload } from '@/lib/schedulePagination';

describe('loadCompleteSchedulePayload', () => {
  it('follows cursors, preserves the original query, and deduplicates related rows', async () => {
    const loadPage = jest.fn()
      .mockResolvedValueOnce({
        events: [{ id: 'event_1' }],
        teams: [{ id: 'team_1', name: 'Original' }],
        pagination: { hasMore: true, nextCursor: 'next page/+' },
      })
      .mockResolvedValueOnce({
        events: [{ id: 'event_2' }],
        teams: [{ id: 'team_1', name: 'Updated' }],
        pagination: { hasMore: false, nextCursor: null, isComplete: true },
      });

    const result = await loadCompleteSchedulePayload('/api/profile/schedule?limit=200', loadPage);

    expect(loadPage).toHaveBeenNthCalledWith(1, '/api/profile/schedule?limit=200');
    expect(loadPage).toHaveBeenNthCalledWith(
      2,
      '/api/profile/schedule?limit=200&cursor=next%20page%2F%2B',
    );
    expect(result.events).toEqual([{ id: 'event_1' }, { id: 'event_2' }]);
    expect(result.teams).toEqual([{ id: 'team_1', name: 'Updated' }]);
  });

  it('fails closed when the server claims another page without a cursor', async () => {
    await expect(loadCompleteSchedulePayload('/api/profile/schedule', async () => ({
      pagination: { hasMore: true, nextCursor: null },
    }))).rejects.toThrow('Schedule endpoint omitted its continuation cursor');
  });

  it('accepts a legacy single-page endpoint that has no pagination contract', async () => {
    const result = await loadCompleteSchedulePayload('/api/team/schedule', async () => ({
      events: [{ id: 'event_legacy' }],
    }));

    expect(result.events).toEqual([{ id: 'event_legacy' }]);
  });

  it('fails closed when pagination metadata disappears after a continuation', async () => {
    const loadPage = jest.fn()
      .mockResolvedValueOnce({
        events: [{ id: 'event_1' }],
        pagination: { hasMore: true, nextCursor: 'cursor_2', isComplete: false },
      })
      .mockResolvedValueOnce({
        events: [{ id: 'event_1' }],
      });

    await expect(
      loadCompleteSchedulePayload('/api/profile/schedule?limit=200', loadPage),
    ).rejects.toThrow('Schedule endpoint dropped pagination metadata during continuation');
    expect(loadPage).toHaveBeenCalledTimes(2);
  });
});
