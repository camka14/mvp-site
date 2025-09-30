import { paymentService } from '@/lib/paymentService';
import type { AppwriteModuleMock } from '../../../test/mocks/appwrite';

jest.mock('@/app/appwrite', () => {
  const { createAppwriteModuleMock } = require('../../../test/mocks/appwrite');
  return createAppwriteModuleMock();
});

const appwriteModuleMock = jest.requireMock('@/app/appwrite') as AppwriteModuleMock;

const BILLING_FUNCTION_ID = 'billing-fn';
const EVENT_MANAGER_FUNCTION_ID = 'event-manager-fn';

describe('paymentService', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_BILLING_FUNCTION_ID = BILLING_FUNCTION_ID;
    process.env.NEXT_PUBLIC_EVENT_MANAGER_FUNCTION_ID = EVENT_MANAGER_FUNCTION_ID;
    jest.clearAllMocks();
  });

  describe('createPaymentIntent', () => {
    it('calls billing function and returns parsed payment intent', async () => {
      appwriteModuleMock.functions.createExecution.mockResolvedValue({
        responseBody: JSON.stringify({ id: 'pi_1', clientSecret: 'secret' }),
      });

      const intent = await paymentService.createPaymentIntent('event_1', 'user_1');

      expect(appwriteModuleMock.functions.createExecution).toHaveBeenCalledWith({
        functionId: BILLING_FUNCTION_ID,
        body: JSON.stringify({
          userId: 'user_1',
          eventId: 'event_1',
          teamId: null,
          isTournament: false,
          command: 'create_purchase_intent',
        }),
        async: false,
      });
      expect(intent).toEqual({ id: 'pi_1', clientSecret: 'secret' });
    });

    it('throws when function returns error', async () => {
      appwriteModuleMock.functions.createExecution.mockResolvedValue({
        responseBody: JSON.stringify({ error: 'failure' }),
      });

      await expect(paymentService.createPaymentIntent('event_1', 'user_1')).rejects.toThrow(
        'failure',
      );
    });
  });

  describe('joinEvent', () => {
    it('throws when event manager reports error', async () => {
      appwriteModuleMock.functions.createExecution.mockResolvedValue({
        responseBody: JSON.stringify({ error: 'not allowed' }),
      });

      await expect(paymentService.joinEvent('event_1', 'user_1')).rejects.toThrow('not allowed');

      expect(appwriteModuleMock.functions.createExecution).toHaveBeenCalledWith({
        functionId: EVENT_MANAGER_FUNCTION_ID,
        body: JSON.stringify({
          eventId: 'event_1',
          userId: 'user_1',
          teamId: null,
          isTournament: false,
          task: 'editEvent',
          command: 'addParticipant',
        }),
        async: false,
      });
    });
  });
});
