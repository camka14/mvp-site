import {
    renderHook,
    waitFor,
} from '@testing-library/react';

import type { Organization } from '@/types';

import { useEventFormCatalogController } from '../useEventFormCatalogController';

const organizationOne = {
    $id: 'organization_1',
    name: 'River City Sports Club',
} as Organization;

const organizationTwo = {
    $id: 'organization_2',
    name: 'Summit United',
} as Organization;

describe('useEventFormCatalogController', () => {
    const fetchMock = jest.fn();

    beforeEach(() => {
        jest.clearAllMocks();
        global.fetch = fetchMock;
        fetchMock.mockResolvedValue({
            ok: true,
            json: async () => ({ tags: [] }),
        });
    });

    it('loads event tags from the catalog endpoint', async () => {
        const tag = { id: 'tag_1', slug: 'tryouts', name: 'Tryouts' };
        fetchMock.mockResolvedValue({
            ok: true,
            json: async () => ({ tags: [tag] }),
        });

        const { result } = renderHook(() => useEventFormCatalogController({}));

        await waitFor(() => expect(result.current.eventTagOptions).toEqual([tag]));
        expect(fetchMock).toHaveBeenCalledWith('/api/event-tags', {
            signal: expect.any(AbortSignal),
        });
    });

    it('mirrors organization prop changes into the resource hydration boundary', async () => {
        const { result, rerender } = renderHook(
            ({ organization }) => useEventFormCatalogController({ organization }),
            { initialProps: { organization: organizationOne } },
        );
        expect(result.current.hydratedOrganization).toBe(organizationOne);

        rerender({ organization: organizationTwo });

        await waitFor(() => expect(result.current.hydratedOrganization).toBe(organizationTwo));
    });

    it('keeps an empty catalog when the request fails', async () => {
        fetchMock.mockResolvedValue({ ok: false });
        const { result } = renderHook(() => useEventFormCatalogController({}));

        await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
        expect(result.current.eventTagOptions).toEqual([]);
    });
});
