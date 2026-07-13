import {
  loadCompleteSchedulePayload,
  normalizeScheduleCalendarRange,
  withScheduleDateWindow,
} from '@/lib/schedulePagination';

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
    const result = await loadCompleteSchedulePayload('/api/team/schedule?limit=2', async () => ({
      events: [{ id: 'event_legacy' }],
    }));

    expect(result.events).toEqual([{ id: 'event_legacy' }]);
  });

  it('fails closed when a legacy first page reaches the requested event limit', async () => {
    await expect(loadCompleteSchedulePayload('/api/team/schedule?limit=2', async () => ({
      events: [{ id: 'event_1' }, { id: 'event_2' }],
    }))).rejects.toThrow(
      'Schedule endpoint reached its requested limit without pagination metadata',
    );
  });

  it('fails closed when a legacy first page reaches the requested match limit', async () => {
    await expect(loadCompleteSchedulePayload('/api/team/schedule?limit=2', async () => ({
      events: [{ id: 'event_1' }],
      matches: [{ id: 'match_1' }, { id: 'match_2' }],
    }))).rejects.toThrow(
      'Schedule endpoint reached its requested limit without pagination metadata',
    );
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

describe('schedule calendar date windows', () => {
  it('normalizes every visible calendar day into an inclusive request window', () => {
    const window = normalizeScheduleCalendarRange([
      new Date(2026, 6, 5, 12),
      new Date(2026, 7, 15, 12),
    ]);

    expect(window).not.toBeNull();
    expect(window?.from).toEqual(new Date(2026, 6, 5, 0, 0, 0, 0));
    expect(window?.to).toEqual(new Date(2026, 7, 15, 23, 59, 59, 999));
  });

  it('replaces stale date and cursor params while preserving the page limit', () => {
    const endpoint = withScheduleDateWindow(
      '/api/profile/schedule?limit=200&from=old&cursor=stale#calendar',
      {
        from: new Date('2027-01-01T00:00:00.000Z'),
        to: new Date('2027-01-31T23:59:59.999Z'),
      },
    );

    expect(endpoint).toBe(
      '/api/profile/schedule?limit=200&from=2027-01-01T00%3A00%3A00.000Z&to=2027-01-31T23%3A59%3A59.999Z#calendar',
    );
  });
});
