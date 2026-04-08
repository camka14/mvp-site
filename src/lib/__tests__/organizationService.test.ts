import { apiRequest } from '@/lib/apiClient';
import { fieldService } from '@/lib/fieldService';
import { organizationService } from '@/lib/organizationService';
import { productService } from '@/lib/productService';

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
    getTeamsByIds: jest.fn(),
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

describe('organizationService', () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
    listFieldsMock.mockReset();
    listProductsMock.mockReset();
    organizationService.invalidateCachedOrganization('org_1');
  });

  it('loads organization products by organization id even when productIds are empty', async () => {
    apiRequestMock
      .mockResolvedValueOnce({
        $id: 'org_1',
        name: 'Test Org',
        productIds: [],
        teamIds: [],
      })
      .mockResolvedValueOnce({ events: [] });
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
  });
});
