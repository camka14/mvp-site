import { productService } from '@/lib/productService';
import { apiRequest } from '@/lib/apiClient';
import type { Product, Subscription, UserData } from '@/types';

jest.mock('@/lib/apiClient', () => ({
  apiRequest: jest.fn(),
}));

const apiRequestMock = apiRequest as jest.MockedFunction<typeof apiRequest>;

describe('productService', () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
  });

  describe('listProducts', () => {
    it('loads products for an organization and normalizes periods', async () => {
      apiRequestMock.mockResolvedValue({
        products: [
          {
            $id: 'prod_1',
            organizationId: 'org_1',
            name: 'Monthly Membership',
            priceCents: 1999,
            period: 'MONTHLY',
          },
        ],
      });

      const products = await productService.listProducts('org_1');

      expect(apiRequestMock).toHaveBeenCalledWith(expect.stringContaining('/api/products?'));
      expect(apiRequestMock.mock.calls[0][0]).toContain('organizationId=org_1');
      expect(products).toEqual([
        expect.objectContaining({
          $id: 'prod_1',
          organizationId: 'org_1',
          name: 'Monthly Membership',
          priceCents: 1999,
          period: 'month',
        }),
      ]);
    });
  });

  describe('createProduct', () => {
    it('creates a product via the API', async () => {
      const mockUser = { $id: 'user_1', firstName: 'Test' } as UserData;
      const responseProduct: Product = {
        $id: 'prod_1',
        organizationId: 'org_1',
        name: 'Gold',
        priceCents: 2500,
        period: 'month',
      };

      apiRequestMock.mockResolvedValue(responseProduct);

      const result = await productService.createProduct({
        user: mockUser,
        organizationId: 'org_1',
        name: 'Gold',
        priceCents: 2500,
        period: 'month',
      });

      expect(apiRequestMock).toHaveBeenCalledWith(
        '/api/products',
        expect.objectContaining({
          method: 'POST',
          body: expect.objectContaining({
            user: expect.objectContaining({ $id: mockUser.$id }),
            organizationId: 'org_1',
            organization: expect.objectContaining({ $id: 'org_1' }),
            product: expect.objectContaining({
              name: 'Gold',
              priceCents: 2500,
              period: 'month',
            }),
          }),
        }),
      );

      expect(result).toEqual(expect.objectContaining({
        $id: 'prod_1',
        organizationId: 'org_1',
        name: 'Gold',
        priceCents: 2500,
        period: 'month',
      }));
    });
  });

  describe('createSubscription', () => {
    it('records a subscription after payment', async () => {
      const mockUser = { $id: 'user_1' } as UserData;
      const responseSubscription: Subscription = {
        $id: 'sub_1',
        productId: 'prod_1',
        userId: 'user_1',
        organizationId: 'org_1',
        startDate: '2025-01-01T00:00:00.000Z',
        priceCents: 2500,
        period: 'year',
        status: 'ACTIVE',
      };

      apiRequestMock.mockResolvedValue(responseSubscription);

      const result = await productService.createSubscription({
        productId: 'prod_1',
        user: mockUser,
        organizationId: 'org_1',
        priceCents: 2500,
        startDate: '2025-01-01T00:00:00.000Z',
      });

      expect(apiRequestMock).toHaveBeenCalledWith(
        '/api/products/prod_1/subscriptions',
        expect.objectContaining({
          method: 'POST',
          body: expect.objectContaining({
            user: expect.objectContaining({ $id: mockUser.$id }),
            organizationId: 'org_1',
            priceCents: 2500,
          }),
        }),
      );

      expect(result).toEqual(expect.objectContaining({
        $id: 'sub_1',
        productId: 'prod_1',
        userId: 'user_1',
        organizationId: 'org_1',
        period: 'year',
        status: 'ACTIVE',
      }));
    });
  });
});
