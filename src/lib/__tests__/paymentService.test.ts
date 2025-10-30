import { paymentService } from '@/lib/paymentService';
import type { Event, UserData } from '@/types';
import type { AppwriteModuleMock } from '../../../test/mocks/appwrite';
import { buildEvent } from '../../../test/factories';

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
      const mockEvent = buildEvent({ $id: 'event_1' });

      const intent = await paymentService.createPaymentIntent(mockUser, mockEvent);

      expect(appwriteModuleMock.functions.createExecution).toHaveBeenCalledTimes(1);
      const executionArgs = appwriteModuleMock.functions.createExecution.mock.calls[0][0];
      expect(executionArgs.functionId).toBe(EVENT_MANAGER_FUNCTION_ID);
      expect(executionArgs.async).toBe(false);

      const parsedBody = JSON.parse(executionArgs.body);
      expect(parsedBody).toMatchObject({
        task: 'billing',
        command: 'create_purchase_intent',
        team: null,
        timeSlot: null,
        organization: null,
      });
      expect(parsedBody.organizationEmail ?? undefined).toBeUndefined();
      expect(parsedBody.user).toEqual(expect.objectContaining({ $id: mockUser.$id }));
      expect(parsedBody.event).toEqual(
        expect.objectContaining({
          sport: mockEvent.sport.$id,
        }),
      );
      expect(parsedBody.event?.leagueScoringConfig).toEqual(mockEvent.leagueScoringConfig);
      expect(typeof parsedBody.event.sport).toBe('string');
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
      expect(executionArgs.functionId).toBe(EVENT_MANAGER_FUNCTION_ID);
      expect(executionArgs.async).toBe(false);

      const parsedBody = JSON.parse(executionArgs.body);
      expect(parsedBody).toMatchObject({
        task: 'editEvent',
        command: 'addParticipant',
        team: null,
        timeSlot: null,
        organization: null,
      });
      expect(parsedBody.user).toEqual(expect.objectContaining({ $id: mockUser.$id }));
      expect(parsedBody.event).toEqual(
        expect.objectContaining({
          sport: mockEvent.sport.$id,
        }),
      );
      expect(parsedBody.event?.leagueScoringConfig).toEqual(mockEvent.leagueScoringConfig);
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
      expect(executionArgs.functionId).toBe(EVENT_MANAGER_FUNCTION_ID);
      expect(executionArgs.async).toBe(false);

      const parsedBody = JSON.parse(executionArgs.body);
      expect(parsedBody).toMatchObject({
        task: 'editEvent',
        command: 'removeParticipant',
        team: null,
        timeSlot: null,
        organization: null,
      });
      expect(parsedBody.user).toEqual(expect.objectContaining({ $id: mockUser.$id }));
      expect(parsedBody.event).toEqual(
        expect.objectContaining({
          sport: mockEvent.sport.$id,
        }),
      );
      expect(parsedBody.event?.leagueScoringConfig).toEqual(mockEvent.leagueScoringConfig);
    });
  });
});
