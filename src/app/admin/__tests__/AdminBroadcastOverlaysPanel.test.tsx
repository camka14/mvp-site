import { render, screen, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';

import AdminBroadcastOverlaysPanel from '../AdminBroadcastOverlaysPanel';

const jsonResponse = (payload: unknown, ok = true): Response => ({
  ok,
  json: async () => payload,
} as Response);

const renderPanel = () => render(
  <MantineProvider>
    <AdminBroadcastOverlaysPanel active refreshKey={0} />
  </MantineProvider>,
);

describe('AdminBroadcastOverlaysPanel event picker', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    if (originalFetch) {
      globalThis.fetch = originalFetch;
    } else {
      Reflect.deleteProperty(globalThis, 'fetch');
    }
    jest.restoreAllMocks();
  });

  it('loads every admin event page so older events are included in the picker data', async () => {
    const fetchMock = jest.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/admin/events?limit=50&offset=0') {
        return Promise.resolve(jsonResponse({
          total: 4,
          events: [
            { $id: 'event_1', name: 'Newest Event' },
            { $id: 'event_2', name: 'Recent Event' },
          ],
        }));
      }
      if (url === '/api/admin/events?limit=50&offset=2') {
        return Promise.resolve(jsonResponse({
          total: 4,
          events: [
            { $id: 'event_2', name: 'Recent Event' },
            { $id: 'event_tournament', name: 'BracketIQ Leeroy Grass Tournament' },
          ],
        }));
      }
      if (url === '/api/events/event_1/broadcast-overlays') {
        return Promise.resolve(jsonResponse({ overlays: [] }));
      }
      if (url === '/api/events/event_1/matches') {
        return Promise.resolve(jsonResponse({ matches: [] }));
      }
      return Promise.resolve(jsonResponse({ error: `Unexpected fetch ${url}` }, false));
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    renderPanel();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/admin/events?limit=50&offset=2', { credentials: 'include' });
    });

    expect(screen.getByRole('textbox', { name: 'Event' })).toHaveValue('Newest Event');
  });
});
