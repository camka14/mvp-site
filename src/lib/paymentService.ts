import { functions } from '@/app/appwrite';
import type {
  Event,
  Organization,
  PaymentIntent,
  Product,
  Team,
  TimeSlot,
  UserData,
} from '@/types';
import { ExecutionMethod } from 'appwrite';
import { buildPayload } from './utils';

type PaymentOrganizationContext = Partial<Organization>;

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
  ): Promise<PaymentIntent> {
    try {
      if (!event) {
        throw new Error('Event is required to create a payment intent.');
      }
      const payloadEvent = buildPayload(event);
      const payload = {
        user,
        event: payloadEvent,
        team,
        timeSlot,
        organization,
      };

      const response = await functions.createExecution({
        functionId: process.env.NEXT_PUBLIC_SERVER_FUNCTION_ID!,
        xpath: '/billing/purchase-intent',
        method: ExecutionMethod.POST,
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

  async createProductPaymentIntent(
    user: UserData,
    product: Product,
    organization?: PaymentOrganizationContext,
  ): Promise<PaymentIntent> {
    try {
      const payload = {
        user,
        productId: product.$id,
        organization,
      };

      const response = await functions.createExecution({
        functionId: process.env.NEXT_PUBLIC_SERVER_FUNCTION_ID!,
        xpath: '/billing/purchase-intent',
        method: ExecutionMethod.POST,
        body: JSON.stringify(payload),
        async: false,
      });

      const result = parseExecutionResponse<PaymentIntent & { error?: string }>(response.responseBody);

      if (result && 'error' in result && result.error) {
        throw new Error(result.error);
      }

      return result as PaymentIntent;
    } catch (error) {
      console.error('Failed to create product payment intent:', error);
      throw new Error(error instanceof Error ? error.message : 'Failed to start product purchase');
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
      if (!event?.$id) {
        throw new Error('Event is required to join.');
      }
      const payloadEvent = buildPayload(event)

      const payload = {
        user,
        event: payloadEvent,
        team,
        timeSlot,
        organization,
      };

      const response = await functions.createExecution({
        functionId: process.env.NEXT_PUBLIC_SERVER_FUNCTION_ID!,
        xpath: `/events/${event.$id}/participants`,
        method: ExecutionMethod.POST,
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
      if (!event?.$id) {
        throw new Error('Event is required to leave.');
      }
      const payloadEvent = buildPayload(event)

      const payload = {
        user,
        event: payloadEvent,
        team,
        timeSlot,
        organization,
      };

      const response = await functions.createExecution({
        functionId: process.env.NEXT_PUBLIC_SERVER_FUNCTION_ID!,
        xpath: `/events/${event.$id}/participants`,
        method: ExecutionMethod.DELETE,
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

  async requestRefund(event: Event, user: UserData, reason?: string): Promise<{
    success: boolean;
    message?: string;
    emailSent?: boolean;
  }> {
    const payloadEvent = buildPayload(event)

    try {
      const response = await functions.createExecution({
        functionId: process.env.NEXT_PUBLIC_SERVER_FUNCTION_ID!,
        xpath: '/billing/refund_payment',
        method: ExecutionMethod.POST,
        body: JSON.stringify({
          payloadEvent,
          user,
          reason: reason || 'requested_by_customer',
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
      const payload = {
        user,
        organization,
        organizationEmail,
        refreshUrl,
        returnUrl,
      };

      const response = await functions.createExecution({
        functionId: process.env.NEXT_PUBLIC_SERVER_FUNCTION_ID!,
        xpath: '/billing/host/connect',
        method: ExecutionMethod.POST,
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
      const payload = {
        user,
        organization,
        refreshUrl,
        returnUrl,
      };

      const response = await functions.createExecution({
        functionId: process.env.NEXT_PUBLIC_SERVER_FUNCTION_ID!,
        xpath: '/billing/host/onboarding-link',
        method: ExecutionMethod.POST,
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
