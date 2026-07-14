import { fireEvent, screen, waitFor } from '@testing-library/react';

import { renderWithMantine } from '../../../../test/utils/renderWithMantine';
import ScheduleCalendarPanel from '@/components/schedule/ScheduleCalendarPanel';

const routerPushMock = jest.fn();
const originalFetch = globalThis.fetch;

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPushMock }),
}));

jest.mock('react-big-calendar', () => ({
  Calendar: ({ onRangeChange }: { onRangeChange: (range: Date[]) => void }) => (
    <button
      type="button"
      onClick={() => onRangeChange([
        new Date(2027, 0, 1, 12),
        new Date(2027, 0, 31, 12),
      ])}
    >
      Show January 2027
    </button>
  ),
  dateFnsLocalizer: () => ({}),
}));

describe('ScheduleCalendarPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('reloads a complete range-specific snapshot when the visible calendar range changes', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        events: [],
        matches: [],
        fields: [],
        teams: [],
        pagination: { hasMore: false, nextCursor: null, isComplete: true },
      }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    renderWithMantine(
      <ScheduleCalendarPanel endpoint="/api/profile/schedule?limit=200" />,
    );

    const navigate = await screen.findByRole('button', { name: 'Show January 2027' });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/profile/schedule?limit=200',
      { credentials: 'include' },
    );

    fireEvent.click(navigate);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const rangeEndpoint = String(fetchMock.mock.calls[1][0]);
    const parsed = new URL(rangeEndpoint, 'http://localhost');
    expect(parsed.searchParams.get('limit')).toBe('200');
    expect(new Date(parsed.searchParams.get('from') ?? '')).toEqual(
      new Date(2027, 0, 1, 0, 0, 0, 0),
    );
    expect(new Date(parsed.searchParams.get('to') ?? '')).toEqual(
      new Date(2027, 0, 31, 23, 59, 59, 999),
    );
  });
});
