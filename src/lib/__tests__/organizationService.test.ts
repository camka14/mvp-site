import { apiRequest } from '@/lib/apiClient';
import { fieldService } from '@/lib/fieldService';
import { organizationService } from '@/lib/organizationService';
import { productService } from '@/lib/productService';
import { teamService } from '@/lib/teamService';

jest.mock('@/lib/apiClient', () => ({
  apiRequest: jest.fn(),
}));

jest.mock('@/lib/fieldService', () => ({
  fieldService: {
    listFields: jest.fn(),
  },
}));

jest.mock('@/lib/productService', () => ({
  productService: {
    listProducts: jest.fn(),
  },
}));

jest.mock('@/lib/teamService', () => ({
  teamService: {
    getTeamsByOrganizationId: jest.fn(),
  },
}));

jest.mock('@/lib/userService', () => ({
  userService: {
    getUserById: jest.fn(),
    getUsersByIds: jest.fn(),
  },
}));

const apiRequestMock = apiRequest as jest.MockedFunction<typeof apiRequest>;
const listFieldsMock = fieldService.listFields as jest.MockedFunction<typeof fieldService.listFields>;
const listProductsMock = productService.listProducts as jest.MockedFunction<typeof productService.listProducts>;
const getTeamsByOrganizationIdMock = teamService.getTeamsByOrganizationId as jest.MockedFunction<typeof teamService.getTeamsByOrganizationId>;

describe('organizationService', () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
    listFieldsMock.mockReset();
    listProductsMock.mockReset();
    getTeamsByOrganizationIdMock.mockReset();
    getTeamsByOrganizationIdMock.mockResolvedValue([]);
    organizationService.invalidateCachedOrganization('org_1');
  });

  it('loads organization products by organization id even when productIds are empty', async () => {
    apiRequestMock.mockImplementation(async (url) => {
      if (url === '/api/organizations/org_1') {
        return {
        id: 'org_1',
        name: 'Test Org',
        productIds: [],
        };
      }
      if (String(url).startsWith('/api/events?')) {
        return { events: [] };
      }
      if (String(url).startsWith('/api/facilities?')) {
        return { facilities: [] };
      }
      return {};
    });
    listFieldsMock.mockResolvedValue([]);
    listProductsMock.mockResolvedValue([
      {
        $id: 'prod_1',
        organizationId: 'org_1',
        name: 'Membership',
        priceCents: 2500,
        period: 'month',
      },
    ] as any);

    const organization = await organizationService.getOrganizationById('org_1', true);

    expect(listProductsMock).toHaveBeenCalledWith('org_1');
    expect(organization?.products).toEqual([
      expect.objectContaining({
        $id: 'prod_1',
        organizationId: 'org_1',
        name: 'Membership',
      }),
    ]);
    expect(organization?.productIds).toEqual([]);
  });

  it('derives the compatibility productIds alias from hydrated products when the API omits it', async () => {
    apiRequestMock.mockImplementation(async (url) => {
      if (url === '/api/organizations/org_1') {
        return {
          id: 'org_1',
          name: 'Test Org',
        };
      }
      if (String(url).startsWith('/api/events?')) {
        return { events: [] };
      }
      if (String(url).startsWith('/api/facilities?')) {
        return { facilities: [] };
      }
      return {};
    });
    listFieldsMock.mockResolvedValue([]);
    listProductsMock.mockResolvedValue([
      { $id: 'prod_2', organizationId: 'org_1', name: 'Second' },
      { $id: 'prod_1', organizationId: 'org_1', name: 'First' },
      { $id: 'prod_1', organizationId: 'org_1', name: 'Duplicate' },
    ] as any);

    const organization = await organizationService.getOrganizationById('org_1', true);

    expect(organization?.productIds).toEqual(['prod_1', 'prod_2']);
  });

  it('never sends the derived productIds alias in organization creates or updates', async () => {
    apiRequestMock
      .mockResolvedValueOnce({ id: 'org_1', name: 'Created', productIds: [] })
      .mockResolvedValueOnce({ id: 'org_1', name: 'Updated', productIds: [] });

    await organizationService.createOrganization({
      name: 'Created',
      ownerId: 'owner_1',
      productIds: ['prod_stale'],
    });
    await organizationService.updateOrganization('org_1', {
      name: 'Updated',
      productIds: ['prod_stale'],
    });

    expect(apiRequestMock).toHaveBeenNthCalledWith(1, '/api/organizations', expect.objectContaining({
      method: 'POST',
      body: expect.not.objectContaining({ productIds: expect.anything() }),
    }));
    expect(apiRequestMock).toHaveBeenNthCalledWith(2, '/api/organizations/org_1', {
      method: 'PATCH',
      body: { organization: { name: 'Updated' } },
    });
  });

  it('requests affiliate rental organizations when listing organizations with fields for rentals', async () => {
    apiRequestMock.mockImplementation(async (url) => {
      if (String(url).startsWith('/api/organizations?')) {
        return {
          organizations: [
            {
              id: 'org_affiliate_rental',
              name: 'Affiliate Rental Org',
              ownerId: 'owner_1',
              productIds: [],
            },
          ],
        };
      }
      if (String(url).startsWith('/api/facilities?')) {
        return { facilities: [] };
      }
      return {};
    });
    listFieldsMock.mockResolvedValue([]);

    const organizations = await organizationService.listOrganizationsWithFields(100, {
      includeAffiliateRentals: true,
    });

    expect(apiRequestMock).toHaveBeenCalledWith('/api/organizations?limit=100&offset=0&includeAffiliateRentals=true');
    expect(organizations).toEqual([
      expect.objectContaining({ $id: 'org_affiliate_rental', name: 'Affiliate Rental Org' }),
    ]);
  });
});
