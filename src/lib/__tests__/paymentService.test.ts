import { paymentService } from '@/lib/paymentService';
import type { Event, UserData } from '@/types';
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

      const mockUser = { $id: 'user_1' } as UserData;
      const mockEvent = { $id: 'event_1' } as Partial<Event>;

      const intent = await paymentService.createPaymentIntent(mockUser, mockEvent);

      expect(appwriteModuleMock.functions.createExecution).toHaveBeenCalledWith({
        functionId: EVENT_MANAGER_FUNCTION_ID,
        body: JSON.stringify({
          task: 'billing',
          command: 'create_purchase_intent',
          user: mockUser,
          event: mockEvent,
          team: null,
          timeSlot: null,
          organization: null,
          organizationEmail: undefined,
        }),
        async: false,
      });
      expect(intent).toEqual({ id: 'pi_1', clientSecret: 'secret' });
    });

    it('throws when function returns error', async () => {
      appwriteModuleMock.functions.createExecution.mockResolvedValue({
        responseBody: JSON.stringify({ error: 'failure' }),
      });

      const mockUser = { $id: 'user_1' } as UserData;
      const mockEvent = { $id: 'event_1' } as Partial<Event>;

      await expect(paymentService.createPaymentIntent(mockUser, mockEvent)).rejects.toThrow('failure');
    });
  });

  describe('joinEvent', () => {
    it('throws when event manager reports error', async () => {
      appwriteModuleMock.functions.createExecution.mockResolvedValue({
        responseBody: JSON.stringify({ error: 'not allowed' }),
      });

      const mockUser = { $id: 'user_1' } as UserData;
      const mockEvent = { $id: 'event_1' } as Partial<Event>;

      await expect(paymentService.joinEvent(mockUser, mockEvent)).rejects.toThrow('not allowed');

      expect(appwriteModuleMock.functions.createExecution).toHaveBeenCalledWith({
        functionId: EVENT_MANAGER_FUNCTION_ID,
        body: JSON.stringify({
          task: 'editEvent',
          command: 'addParticipant',
          user: mockUser,
          event: mockEvent,
          team: null,
          timeSlot: null,
          organization: null,
        }),
        async: false,
      });
    });
  });

  describe('leaveEvent', () => {
    it('throws when event manager reports error', async () => {
      appwriteModuleMock.functions.createExecution.mockResolvedValue({
        responseBody: JSON.stringify({ error: 'not registered' }),
      });

      const mockUser = { $id: 'user_1' } as UserData;
      const mockEvent = { $id: 'event_1' } as Partial<Event>;

      await expect(paymentService.leaveEvent(mockUser, mockEvent)).rejects.toThrow('not registered');

      expect(appwriteModuleMock.functions.createExecution).toHaveBeenCalledWith({
        functionId: EVENT_MANAGER_FUNCTION_ID,
        body: JSON.stringify({
          task: 'editEvent',
          command: 'removeParticipant',
          user: mockUser,
          event: mockEvent,
          team: null,
          timeSlot: null,
          organization: null,
        }),
        async: false,
      });
    });
  });
});
