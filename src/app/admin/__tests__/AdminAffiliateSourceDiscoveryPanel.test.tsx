import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import AdminAffiliateSourceDiscoveryPanel from '../AdminAffiliateSourceDiscoveryPanel';

const response = (payload: unknown, ok = true): Response => ({
  ok,
  json: async () => payload,
} as Response);

describe('AdminAffiliateSourceDiscoveryPanel', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    if (originalFetch) globalThis.fetch = originalFetch;
    else Reflect.deleteProperty(globalThis, 'fetch');
    jest.restoreAllMocks();
  });

  it('renders persisted campaigns and queues run-now work', async () => {
    const campaign = {
      id: 'campaign_1', name: 'Portland sources', region: 'Portland, Oregon', location: 'Portland, Oregon',
      sportIds: ['sport_soccer'], sourceTypeHints: ['CLUB'], status: 'PAUSED', autoCreateIntakes: true,
      searchIntervalMinutes: 10080, maxQueriesPerRun: 2, maxResultsPerQuery: 5,
      statusCounts: { NEW: 2 }, latestRun: null,
    };
    const fetchMock = jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/admin/affiliate-source-discovery') {
        return Promise.resolve(response({ campaigns: [campaign], sports: [{ id: 'sport_soccer', name: 'Soccer' }] }));
      }
      if (url.startsWith('/api/admin/affiliate-source-discovery/results?')) {
        return Promise.resolve(response({ rows: [], total: 0 }));
      }
      if (url.endsWith('/campaign_1/runs') && init?.method === 'POST') {
        return Promise.resolve(response({ run: { id: 'run_1', status: 'QUEUED' } }));
      }
      return Promise.resolve(response({ error: `Unexpected ${url}` }, false));
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    render(<MantineProvider><AdminAffiliateSourceDiscoveryPanel active refreshKey={0} /></MantineProvider>);
    expect((await screen.findAllByText('Portland sources')).length).toBeGreaterThan(0);
    expect(screen.getByText('Source Discovery')).toBeInTheDocument();
    expect(screen.getAllByLabelText('Source type').length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText('Sport').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/affiliate-source-discovery/campaign_1/runs',
      expect.objectContaining({ method: 'POST' }),
    ));
  });
});
