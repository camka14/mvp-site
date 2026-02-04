import { paymentService } from '@/lib/paymentService';
import { apiRequest } from '@/lib/apiClient';
import type { Event, Product, UserData } from '@/types';
import { buildEvent } from '../../../test/factories';

jest.mock('@/lib/apiClient', () => ({
  apiRequest: jest.fn(),
}));

const apiRequestMock = apiRequest as jest.MockedFunction<typeof apiRequest>;

describe('paymentService', () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
  });

  describe('createPaymentIntent', () => {
    it('calls billing endpoint and returns payment intent', async () => {
      apiRequestMock.mockResolvedValue({ id: 'pi_1', clientSecret: 'secret' });

      const mockUser = { $id: 'user_1' } as UserData;
      const mockEvent = buildEvent({ $id: 'event_1' }) as Event;

      const intent = await paymentService.createPaymentIntent(mockUser, mockEvent);

      expect(apiRequestMock).toHaveBeenCalledWith(
        '/api/billing/purchase-intent',
        expect.objectContaining({
          method: 'POST',
          body: expect.objectContaining({
            user: expect.objectContaining({ $id: mockUser.$id }),
            event: expect.objectContaining({ $id: mockEvent.$id }),
          }),
        }),
      );
      expect(intent).toEqual({ id: 'pi_1', clientSecret: 'secret' });
    });

    it('throws when endpoint returns error', async () => {
      apiRequestMock.mockResolvedValue({ error: 'failure' });

      const mockUser = { $id: 'user_1' } as UserData;
      const mockEvent = buildEvent({ $id: 'event_1' }) as Event;

      await expect(paymentService.createPaymentIntent(mockUser, mockEvent)).rejects.toThrow('failure');
    });
  });

  describe('createProductPaymentIntent', () => {
    it('calls billing endpoint with product payload', async () => {
      apiRequestMock.mockResolvedValue({
        paymentIntent: 'pi_1',
        publishableKey: 'pk_test',
        feeBreakdown: {},
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

      expect(apiRequestMock).toHaveBeenCalledWith(
        '/api/billing/purchase-intent',
        expect.objectContaining({
          method: 'POST',
          body: expect.objectContaining({
            user: expect.objectContaining({ $id: mockUser.$id }),
            productId: mockProduct.$id,
            organization: expect.objectContaining({ $id: 'org_1' }),
          }),
        }),
      );
    });
  });

  describe('joinEvent', () => {
    it('throws when event manager reports error', async () => {
      apiRequestMock.mockResolvedValue({ error: 'not allowed' });

      const mockUser = { $id: 'user_1' } as UserData;
      const mockEvent = buildEvent({ $id: 'event_1' }) as Event;

      await expect(paymentService.joinEvent(mockUser, mockEvent)).rejects.toThrow('not allowed');

      expect(apiRequestMock).toHaveBeenCalledWith(
        `/api/events/${mockEvent.$id}/participants`,
        expect.objectContaining({
          method: 'POST',
          body: expect.objectContaining({
            user: expect.objectContaining({ $id: mockUser.$id }),
            event: expect.objectContaining({ $id: mockEvent.$id }),
          }),
        }),
      );
    });
  });

  describe('leaveEvent', () => {
    it('throws when event manager reports error', async () => {
      apiRequestMock.mockResolvedValue({ error: 'not registered' });

      const mockUser = { $id: 'user_1' } as UserData;
      const mockEvent = buildEvent({ $id: 'event_1' }) as Event;

      await expect(paymentService.leaveEvent(mockUser, mockEvent)).rejects.toThrow('not registered');

      expect(apiRequestMock).toHaveBeenCalledWith(
        `/api/events/${mockEvent.$id}/participants`,
        expect.objectContaining({
          method: 'DELETE',
          body: expect.objectContaining({
            user: expect.objectContaining({ $id: mockUser.$id }),
            event: expect.objectContaining({ $id: mockEvent.$id }),
          }),
        }),
      );
    });
  });
});
