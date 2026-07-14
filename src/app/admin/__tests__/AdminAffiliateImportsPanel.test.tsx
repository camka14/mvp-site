import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';

import AdminAffiliateImportsPanel from '../AdminAffiliateImportsPanel';

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
};

const createDeferred = <T,>(): Deferred<T> => {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
};

const jsonResponse = (payload: unknown, ok = true): Response => ({
  ok,
  json: async () => payload,
} as Response);

const sourceRows = [
  {
    id: 'source_1',
    name: 'First Source',
    sourceKey: 'first-source',
    listUrl: 'https://example.com/first',
    targetKind: 'EVENT',
    status: 'ACTIVE',
    organizationId: 'org_1',
    activeMappingId: 'mapping_1',
    lastScrapedAt: null,
    autoScrapeEnabled: false,
    scrapeIntervalMinutes: null,
  },
  {
    id: 'source_2',
    name: 'Second Source',
    sourceKey: 'second-source',
    listUrl: 'https://example.com/second',
    targetKind: 'EVENT',
    status: 'ACTIVE',
    organizationId: 'org_2',
    activeMappingId: 'mapping_2',
    lastScrapedAt: null,
    autoScrapeEnabled: false,
    scrapeIntervalMinutes: null,
  },
];

const renderPanel = () => render(
  <MantineProvider>
    <AdminAffiliateImportsPanel active refreshKey={0} />
  </MantineProvider>,
);

describe('AdminAffiliateImportsPanel scrape queue', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    if (originalFetch) {
      globalThis.fetch = originalFetch;
    } else {
      Reflect.deleteProperty(globalThis, 'fetch');
    }
    jest.restoreAllMocks();
  });

  it('queues multiple scrape clicks and keeps queued buttons loading until each scrape finishes', async () => {
    const firstScrape = createDeferred<Response>();
    const secondScrape = createDeferred<Response>();
    const fetchMock = jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (url === '/api/admin/affiliate-sources') {
        return Promise.resolve(jsonResponse({ sources: sourceRows }));
      }
      if (url.startsWith('/api/admin/affiliate-discoveries')) {
        return Promise.resolve(jsonResponse({ candidates: [] }));
      }
      if (method === 'POST' && url === '/api/admin/affiliate-sources/source_1/scrape') {
        return firstScrape.promise;
      }
      if (method === 'POST' && url === '/api/admin/affiliate-sources/source_2/scrape') {
        return secondScrape.promise;
      }
      return Promise.resolve(jsonResponse({ error: `Unexpected fetch ${method} ${url}` }, false));
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    renderPanel();

    await waitFor(() => {
      expect(screen.getByText('First Source')).toBeInTheDocument();
      expect(screen.getByText('Second Source')).toBeInTheDocument();
    });

    const scrapeButtons = screen.getAllByRole('button', { name: /scrape/i });
    fireEvent.click(scrapeButtons[0]);
    fireEvent.click(scrapeButtons[1]);

    await waitFor(() => {
      expect(scrapeButtons[0]).toBeDisabled();
      expect(scrapeButtons[1]).toBeDisabled();
    });
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/affiliate-sources/source_1/scrape', {
      method: 'POST',
      credentials: 'include',
    });
    expect(fetchMock).not.toHaveBeenCalledWith('/api/admin/affiliate-sources/source_2/scrape', {
      method: 'POST',
      credentials: 'include',
    });

    firstScrape.resolve(jsonResponse({
      run: {
        itemCount: 1,
        candidateCount: 1,
        logs: {
          createdCandidateCount: 1,
          updatedCandidateCount: 0,
          rejectedCount: 0,
          rejectionSummary: {},
        },
      },
    }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/admin/affiliate-sources/source_2/scrape', {
        method: 'POST',
        credentials: 'include',
      });
    });

    secondScrape.resolve(jsonResponse({
      run: {
        itemCount: 2,
        candidateCount: 2,
        logs: {
          createdCandidateCount: 2,
          updatedCandidateCount: 0,
          rejectedCount: 0,
          rejectionSummary: {},
        },
      },
    }));

    await waitFor(() => {
      screen.getAllByRole('button', { name: /scrape/i }).forEach((button) => {
        expect(button).not.toBeDisabled();
      });
    });
  });
});
