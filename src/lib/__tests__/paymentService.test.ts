import { paymentService } from '@/lib/paymentService';
import type { Event, Product, UserData } from '@/types';
import type { AppwriteModuleMock } from '../../../test/mocks/appwrite';
import { buildEvent } from '../../../test/factories';
import { ExecutionMethod } from 'appwrite';

jest.mock('@/app/appwrite', () => {
  const { createAppwriteModuleMock } = require('../../../test/mocks/appwrite');
  return createAppwriteModuleMock();
});

const appwriteModuleMock = jest.requireMock('@/app/appwrite') as AppwriteModuleMock;

const BILLING_FUNCTION_ID = 'billing-fn';
const SERVER_FUNCTION_ID = 'event-manager-fn';

describe('paymentService', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_BILLING_FUNCTION_ID = BILLING_FUNCTION_ID;
    process.env.NEXT_PUBLIC_SERVER_FUNCTION_ID = SERVER_FUNCTION_ID;
    jest.clearAllMocks();
  });

  describe('createPaymentIntent', () => {
    it('calls billing function and returns parsed payment intent', async () => {
      appwriteModuleMock.functions.createExecution.mockResolvedValue({
        responseBody: JSON.stringify({ id: 'pi_1', clientSecret: 'secret' }),
      });

      const mockUser = { $id: 'user_1' } as UserData;
      const mockEvent = buildEvent({ $id: 'event_1' });

      const intent = await paymentService.createPaymentIntent(mockUser, mockEvent);

      expect(appwriteModuleMock.functions.createExecution).toHaveBeenCalledTimes(1);
      const executionArgs = appwriteModuleMock.functions.createExecution.mock.calls[0][0];
      expect(executionArgs.functionId).toBe(SERVER_FUNCTION_ID);
      expect(executionArgs.async).toBe(false);

      const parsedBody = JSON.parse(executionArgs.body);
      expect(executionArgs.xpath).toBe('/billing/purchase-intent');
      expect(executionArgs.method).toBe(ExecutionMethod.POST);
      expect(parsedBody.user).toEqual(expect.objectContaining({ $id: mockUser.$id }));
      expect(parsedBody.event).toEqual(expect.objectContaining({ $id: mockEvent.$id }));
      expect(intent).toEqual({ id: 'pi_1', clientSecret: 'secret' });
    });

    it('throws when function returns error', async () => {
      appwriteModuleMock.functions.createExecution.mockResolvedValue({
        responseBody: JSON.stringify({ error: 'failure' }),
      });

      const mockUser = { $id: 'user_1' } as UserData;
      const mockEvent = buildEvent({ $id: 'event_1' });

      await expect(paymentService.createPaymentIntent(mockUser, mockEvent)).rejects.toThrow('failure');
    });
  });

  describe('createProductPaymentIntent', () => {
    it('calls billing function with product payload', async () => {
      appwriteModuleMock.functions.createExecution.mockResolvedValue({
        responseBody: JSON.stringify({ paymentIntent: 'pi_1', publishableKey: 'pk_test', feeBreakdown: {} }),
      });

      const mockUser = { $id: 'user_1' } as UserData;
      const mockProduct = {
        $id: 'prod_1',
        organizationId: 'org_1',
        name: 'Membership',
        priceCents: 2500,
        period: 'month',
      } as Product;

      await paymentService.createProductPaymentIntent(mockUser, mockProduct, { $id: 'org_1' });

      expect(appwriteModuleMock.functions.createExecution).toHaveBeenCalledTimes(1);
      const executionArgs = appwriteModuleMock.functions.createExecution.mock.calls[0][0];
      expect(executionArgs.functionId).toBe(SERVER_FUNCTION_ID);
      expect(executionArgs.async).toBe(false);

      const parsedBody = JSON.parse(executionArgs.body);
      expect(executionArgs.xpath).toBe('/billing/purchase-intent');
      expect(executionArgs.method).toBe(ExecutionMethod.POST);
      expect(parsedBody.user).toEqual(expect.objectContaining({ $id: mockUser.$id }));
      expect(parsedBody.productId).toBe(mockProduct.$id);
      expect(parsedBody.organization).toEqual(expect.objectContaining({ $id: 'org_1' }));
    });
  });

  describe('joinEvent', () => {
    it('throws when event manager reports error', async () => {
      appwriteModuleMock.functions.createExecution.mockResolvedValue({
        responseBody: JSON.stringify({ error: 'not allowed' }),
      });

      const mockUser = { $id: 'user_1' } as UserData;
      const mockEvent = buildEvent({ $id: 'event_1' });

      await expect(paymentService.joinEvent(mockUser, mockEvent)).rejects.toThrow('not allowed');

      expect(appwriteModuleMock.functions.createExecution).toHaveBeenCalledTimes(1);
      const executionArgs = appwriteModuleMock.functions.createExecution.mock.calls[0][0];
      expect(executionArgs.functionId).toBe(SERVER_FUNCTION_ID);
      expect(executionArgs.async).toBe(false);

      const parsedBody = JSON.parse(executionArgs.body);
      expect(executionArgs.xpath).toBe(`/events/${mockEvent.$id}/participants`);
      expect(executionArgs.method).toBe(ExecutionMethod.POST);
      expect(parsedBody.user).toEqual(expect.objectContaining({ $id: mockUser.$id }));
      expect(parsedBody.event).toEqual(expect.objectContaining({ $id: mockEvent.$id }));
    });
  });

  describe('leaveEvent', () => {
    it('throws when event manager reports error', async () => {
      appwriteModuleMock.functions.createExecution.mockResolvedValue({
        responseBody: JSON.stringify({ error: 'not registered' }),
      });

      const mockUser = { $id: 'user_1' } as UserData;
      const mockEvent = buildEvent({ $id: 'event_1' });

      await expect(paymentService.leaveEvent(mockUser, mockEvent)).rejects.toThrow('not registered');

      expect(appwriteModuleMock.functions.createExecution).toHaveBeenCalledTimes(1);
      const executionArgs = appwriteModuleMock.functions.createExecution.mock.calls[0][0];
      expect(executionArgs.functionId).toBe(SERVER_FUNCTION_ID);
      expect(executionArgs.async).toBe(false);

      const parsedBody = JSON.parse(executionArgs.body);
      expect(executionArgs.xpath).toBe(`/events/${mockEvent.$id}/participants`);
      expect(executionArgs.method).toBe(ExecutionMethod.DELETE);
      expect(parsedBody.user).toEqual(expect.objectContaining({ $id: mockUser.$id }));
      expect(parsedBody.event).toEqual(expect.objectContaining({ $id: mockEvent.$id }));
    });
  });
});
