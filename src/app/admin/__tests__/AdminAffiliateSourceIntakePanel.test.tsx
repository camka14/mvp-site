import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import AdminAffiliateSourceIntakePanel from '../AdminAffiliateSourceIntakePanel';

const response = (payload: unknown, ok = true): Response => ({
  ok,
  json: async () => payload,
} as Response);

describe('AdminAffiliateSourceIntakePanel', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    if (originalFetch) globalThis.fetch = originalFetch;
    else Reflect.deleteProperty(globalThis, 'fetch');
    jest.restoreAllMocks();
  });

  it('shows policy state and queues selected pages only after review', async () => {
    const fetchMock = jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/admin/affiliate-intakes') return Promise.resolve(response({ intakes: [{
        id: 'intake_1', name: 'SF Glens', sourceKey: 'sf-glens', status: 'READY',
        complianceStatus: 'ALLOWED', pageCount: 1, artifactCount: 0, latestRun: null,
      }] }));
      if (url === '/api/admin/affiliate-intakes/intake_1') return Promise.resolve(response({
        intake: { id: 'intake_1', name: 'SF Glens', status: 'READY', complianceStatus: 'ALLOWED' },
        pages: [{ id: 'page_1', url: 'https://example.com', role: 'HOME', status: 'ACTIVE', discoverySource: 'MANUAL', robotsStatus: 'UNCHECKED' }],
        runs: [], artifacts: [], selectedRunId: null,
      }));
      if (url.endsWith('/inspect') && init?.method === 'POST') return Promise.resolve(response({ run: { id: 'run_1', status: 'QUEUED' } }));
      return Promise.resolve(response({ error: `Unexpected ${url}` }, false));
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    render(<MantineProvider><AdminAffiliateSourceIntakePanel active refreshKey={0} /></MantineProvider>);
    await screen.findByText('SF Glens');
    fireEvent.click(screen.getByRole('button', { name: 'Review' }));
    await screen.findByText('https://example.com');
    fireEvent.click(screen.getByRole('button', { name: 'Inspect Selected' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/affiliate-intakes/intake_1/inspect',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ pageIds: ['page_1'] }) }),
    ));
  });
});
