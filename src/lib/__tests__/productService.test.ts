import { productService } from '@/lib/productService';
import type { Product, Subscription, UserData } from '@/types';
import { ExecutionMethod } from 'appwrite';
import type { AppwriteModuleMock } from '../../../test/mocks/appwrite';

jest.mock('@/app/appwrite', () => {
  const { createAppwriteModuleMock } = require('../../../test/mocks/appwrite');
  return createAppwriteModuleMock();
});

const appwriteModuleMock = jest.requireMock('@/app/appwrite') as AppwriteModuleMock;

const DATABASE_ID = 'test-db';
const PRODUCTS_TABLE_ID = 'products-table';
const SUBSCRIPTIONS_TABLE_ID = 'subscriptions-table';
const SERVER_FUNCTION_ID = 'server-fn';

const setEnv = () => {
  process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID = DATABASE_ID;
  process.env.NEXT_PUBLIC_APPWRITE_PRODUCTS_TABLE_ID = PRODUCTS_TABLE_ID;
  process.env.NEXT_PUBLIC_APPWRITE_SUBSCRIPTIONS_TABLE_ID = SUBSCRIPTIONS_TABLE_ID;
  process.env.NEXT_PUBLIC_SERVER_FUNCTION_ID = SERVER_FUNCTION_ID;
};

describe('productService', () => {
  beforeEach(() => {
    setEnv();
    jest.clearAllMocks();
  });

  describe('listProducts', () => {
    it('loads products for an organization and normalizes periods', async () => {
      appwriteModuleMock.databases.listRows.mockResolvedValue({
        rows: [
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

      expect(appwriteModuleMock.databases.listRows).toHaveBeenCalledWith(expect.objectContaining({
        databaseId: DATABASE_ID,
        tableId: PRODUCTS_TABLE_ID,
      }));
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
    it('calls the products function and returns the created product', async () => {
      const mockUser = { $id: 'user_1', firstName: 'Test' } as UserData;
      const responseProduct: Product = {
        $id: 'prod_1',
        organizationId: 'org_1',
        name: 'Gold',
        priceCents: 2500,
        period: 'month',
      };

      appwriteModuleMock.functions.createExecution.mockResolvedValue({
        responseBody: JSON.stringify(responseProduct),
      });

      const result = await productService.createProduct({
        user: mockUser,
        organizationId: 'org_1',
        name: 'Gold',
        priceCents: 2500,
        period: 'month',
      });

      expect(appwriteModuleMock.functions.createExecution).toHaveBeenCalledTimes(1);
      const executionArgs = appwriteModuleMock.functions.createExecution.mock.calls[0][0];
      expect(executionArgs.functionId).toBe(SERVER_FUNCTION_ID);
      expect(executionArgs.xpath).toBe('/products');
      expect(executionArgs.method).toBe(ExecutionMethod.POST);

      const parsedBody = JSON.parse(executionArgs.body);
      expect(parsedBody.user).toEqual(expect.objectContaining({ $id: mockUser.$id }));
      expect(parsedBody.organizationId).toBe('org_1');
      expect(parsedBody.organization).toEqual(expect.objectContaining({ $id: 'org_1' }));
      expect(parsedBody.product).toEqual(expect.objectContaining({
        name: 'Gold',
        priceCents: 2500,
        period: 'month',
      }));

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

      appwriteModuleMock.functions.createExecution.mockResolvedValue({
        responseBody: JSON.stringify(responseSubscription),
      });

      const result = await productService.createSubscription({
        productId: 'prod_1',
        user: mockUser,
        organizationId: 'org_1',
        priceCents: 2500,
        startDate: '2025-01-01T00:00:00.000Z',
      });

      const executionArgs = appwriteModuleMock.functions.createExecution.mock.calls[0][0];
      expect(executionArgs.functionId).toBe(SERVER_FUNCTION_ID);
      expect(executionArgs.xpath).toBe('/products/prod_1/subscriptions');
      expect(executionArgs.method).toBe(ExecutionMethod.POST);

      const parsedBody = JSON.parse(executionArgs.body);
      expect(parsedBody.user).toEqual(expect.objectContaining({ $id: mockUser.$id }));
      expect(parsedBody.organizationId).toBe('org_1');
      expect(parsedBody.priceCents).toBe(2500);

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
