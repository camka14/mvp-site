import { functions } from '@/app/appwrite';
import type {
  Event,
  Organization,
  PaymentIntent,
  Team,
  TimeSlot,
  UserData,
} from '@/types';

type PaymentOrganizationContext = Partial<Organization>;

type EventManagerTask = 'billing' | 'editEvent';
type EventManagerCommand = 'create_purchase_intent' | 'addParticipant' | 'removeParticipant';

interface EventManagerPayload {
  task: EventManagerTask;
  command: EventManagerCommand | string;
  event?: Event | null;
  timeSlot?: TimeSlot | null;
  user?: UserData | null;
  team?: Team | null;
  organization?: PaymentOrganizationContext | null;
  organizationEmail?: string | null;
  refreshUrl?: string | null;
  returnUrl?: string | null;
}

interface BuildEventManagerPayloadOptions {
  task: EventManagerTask;
  command: EventManagerCommand | string;
  user?: UserData | null;
  event?: Event | null;
  team?: Team | null;
  timeSlot?: TimeSlot | null;
  organization?: PaymentOrganizationContext | null;
  organizationEmail?: string | null;
  refreshUrl?: string | null;
  returnUrl?: string | null;
}

const buildEventManagerPayload = ({
  task,
  command,
  user,
  event,
  team,
  timeSlot,
  organization,
  organizationEmail,
  refreshUrl,
  returnUrl,
}: BuildEventManagerPayloadOptions): EventManagerPayload => {
  if (!event && !timeSlot && !organization && !user && !team) {
    throw new Error('Payment actions require at least a user, team, event, time slot, or organization context.');
  }

  return {
    task,
    command,
    user: user ?? null,
    event: event ?? null,
    team: team ?? null,
    timeSlot: timeSlot ?? null,
    organization: organization ?? null,
    organizationEmail: organizationEmail ?? null,
    refreshUrl: refreshUrl ?? null,
    returnUrl: returnUrl ?? null,
  };
};

const parseExecutionResponse = <T = unknown>(responseBody: string | null | undefined): T => {
  if (!responseBody) {
    return {} as T;
  }

  try {
    return JSON.parse(responseBody) as T;
  } catch (error) {
    throw new Error('Unable to parse Appwrite function response.');
  }
};

type StripeOnboardingLinkResult = {
  onboardingUrl: string;
  expiresAt?: number;
};

class PaymentService {
  async createPaymentIntent(
    user: UserData,
    event?: Event,
    team?: Team,
    timeSlot?: TimeSlot,
    organization?: PaymentOrganizationContext,
    organizationEmail?: string,
  ): Promise<PaymentIntent> {
    try {
      const payload = buildEventManagerPayload({
        task: 'billing',
        command: 'create_purchase_intent',
        user,
        event,
        team,
        timeSlot,
        organization,
        organizationEmail,
      });

      const response = await functions.createExecution({
        functionId: process.env.NEXT_PUBLIC_EVENT_MANAGER_FUNCTION_ID!,
        body: JSON.stringify(payload),
        async: false,
      });

      const result = parseExecutionResponse<PaymentIntent & { error?: string }>(response.responseBody);

      if (result && 'error' in result && result.error) {
        throw new Error(result.error);
      }

      if (!result || Object.keys(result).length === 0) {
        throw new Error('Received empty response when creating payment intent.');
      }

      return result as PaymentIntent;
    } catch (error) {
      console.error('Failed to create payment intent:', error);
      throw new Error(error instanceof Error ? error.message : 'Failed to create payment intent');
    }
  }

  async joinEvent(
    user?: UserData,
    event?: Event,
    team?: Team,
    timeSlot?: TimeSlot,
    organization?: PaymentOrganizationContext,
  ): Promise<void> {
    try {
      const payload = buildEventManagerPayload({
        task: 'editEvent',
        command: 'addParticipant',
        user,
        event,
        team,
        timeSlot,
        organization,
      });

      const response = await functions.createExecution({
        functionId: process.env.NEXT_PUBLIC_EVENT_MANAGER_FUNCTION_ID!,
        body: JSON.stringify(payload),
        async: false,
      });

      const result = parseExecutionResponse<{ error?: string }>(response.responseBody);

      if (result && result.error) {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error('Failed to join event:', error);
      throw new Error(error instanceof Error ? error.message : 'Failed to join event');
    }
  }

  async leaveEvent(
    user?: UserData,
    event?: Event,
    team?: Team,
    timeSlot?: TimeSlot,
    organization?: PaymentOrganizationContext,
  ): Promise<void> {
    try {
      const payload = buildEventManagerPayload({
        task: 'editEvent',
        command: 'removeParticipant',
        user,
        event,
        team,
        timeSlot,
        organization,
      });

      const response = await functions.createExecution({
        functionId: process.env.NEXT_PUBLIC_EVENT_MANAGER_FUNCTION_ID!,
        body: JSON.stringify(payload),
        async: false,
      });

      const result = parseExecutionResponse<{ error?: string }>(response.responseBody);

      if (result && result.error) {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error('Failed to leave event:', error);
      throw new Error(error instanceof Error ? error.message : 'Failed to leave event');
    }
  }

  async requestRefund(eventId: string, userId: string, reason?: string): Promise<{
    success: boolean;
    message?: string;
    emailSent?: boolean;
  }> {
    try {
      const response = await functions.createExecution({
        functionId: process.env.NEXT_PUBLIC_EVENT_MANAGER_FUNCTION_ID!,
        body: JSON.stringify({
          eventId,
          userId,
          reason: reason || 'requested_by_customer',
          command: 'refund_payment',
        }),
        async: false,
      });

      const result = parseExecutionResponse<{ error?: string; success: boolean; message?: string; emailSent?: boolean }>(
        response.responseBody,
      );

      if (result.error) {
        throw new Error(result.error);
      }

      if (!result || !result.success) {
        throw new Error('Failed to request refund');
      }

      return result;
    } catch (error) {
      console.error('Failed to request refund:', error);
      throw new Error(error instanceof Error ? error.message : 'Failed to request refund');
    }
  }

  async connectStripeAccount(
    {
      user,
      organization,
      organizationEmail,
      refreshUrl,
      returnUrl,
    }: {
      user?: UserData;
      organization?: PaymentOrganizationContext;
      organizationEmail?: string;
      refreshUrl: string;
      returnUrl: string;
    },
  ): Promise<StripeOnboardingLinkResult> {
    try {
      const payload = buildEventManagerPayload({
        task: 'billing',
        command: 'connect_host_account',
        user,
        organization,
        organizationEmail,
        refreshUrl,
        returnUrl,
      });

      const response = await functions.createExecution({
        functionId: process.env.NEXT_PUBLIC_EVENT_MANAGER_FUNCTION_ID!,
        body: JSON.stringify(payload),
        async: false,
      });

      const result = parseExecutionResponse<StripeOnboardingLinkResult & { error?: string }>(response.responseBody);

      if (result.error) {
        throw new Error(result.error);
      }

      return result;
    } catch (error) {
      console.error('Failed to connect Stripe account:', error);
      throw new Error(error instanceof Error ? error.message : 'Failed to connect Stripe account');
    }
  }

  async manageStripeAccount({
    user,
    organization,
    refreshUrl,
    returnUrl,
  }: {
    user?: UserData;
    organization?: PaymentOrganizationContext;
    refreshUrl: string;
    returnUrl: string;
  }): Promise<StripeOnboardingLinkResult> {
    try {
      const payload = buildEventManagerPayload({
        task: 'billing',
        command: 'get_host_onboarding_link',
        user,
        organization,
        refreshUrl,
        returnUrl,
      });

      const response = await functions.createExecution({
        functionId: process.env.NEXT_PUBLIC_EVENT_MANAGER_FUNCTION_ID!,
        body: JSON.stringify(payload),
        async: false,
      });

      const result = parseExecutionResponse<StripeOnboardingLinkResult & { error?: string }>(response.responseBody);

      if (result.error) {
        throw new Error(result.error);
      }

      return result;
    } catch (error) {
      console.error('Failed to manage Stripe account:', error);
      throw new Error(error instanceof Error ? error.message : 'Failed to manage Stripe account');
    }
  }
}

export const paymentService = new PaymentService();
