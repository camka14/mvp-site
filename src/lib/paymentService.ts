import { apiRequest } from '@/lib/apiClient';
import type {
  BillingAddress,
  Event,
  Organization,
  PaymentIntent,
  Product,
  Team,
  TimeSlot,
  UserData,
} from '@/types';
import { buildPayload } from './utils';
import type { DivisionRegistrationSelection } from '@/lib/registrationService';
import type { WeeklyOccurrenceSelection } from '@/lib/eventService';

type PaymentOrganizationContext = Partial<Organization>;

type StripeOnboardingLinkResult = {
  onboardingUrl: string;
  expiresAt?: number;
};

type LeaveEventOptions = {
  refundMode?: 'auto' | 'request';
  refundReason?: string;
};

class PaymentService {
  async reserveRentalCheckoutLock(
    event: Event,
    timeSlot: TimeSlot,
  ): Promise<{ ok?: boolean; expiresAt?: string }> {
    if (!event) {
      throw new Error('Event is required to reserve a rental checkout lock.');
    }
    if (!timeSlot) {
      throw new Error('Time slot is required to reserve a rental checkout lock.');
    }
    const payloadEvent = buildPayload(event);
    return apiRequest<{ ok?: boolean; expiresAt?: string; error?: string }>('/api/billing/rental-lock', {
      method: 'POST',
      body: {
        event: payloadEvent,
        timeSlot,
      },
    }).then((result) => {
      if (result?.error) {
        throw new Error(result.error);
      }
      return result;
    });
  }

  async releaseRentalCheckoutLock(
    event: Event,
    timeSlot: TimeSlot,
  ): Promise<void> {
    if (!event || !timeSlot) {
      return;
    }
    const payloadEvent = buildPayload(event);
    const result = await apiRequest<{ ok?: boolean; error?: string }>('/api/billing/rental-lock', {
      method: 'DELETE',
      body: {
        event: payloadEvent,
        timeSlot,
      },
    });
    if (result?.error) {
      throw new Error(result.error);
    }
  }

  async createPaymentIntent(
    user: UserData,
    event?: Event,
    team?: Team,
    timeSlot?: TimeSlot,
    organization?: PaymentOrganizationContext,
    selection?: DivisionRegistrationSelection,
    billingAddress?: BillingAddress,
    occurrence?: WeeklyOccurrenceSelection,
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
        billingAddress,
        ...selection,
        ...(occurrence?.slotId ? { slotId: occurrence.slotId } : {}),
        ...(occurrence?.occurrenceDate ? { occurrenceDate: occurrence.occurrenceDate } : {}),
      };

      const result = await apiRequest<PaymentIntent & { error?: string }>('/api/billing/purchase-intent', {
        method: 'POST',
        body: payload,
      });

      if (result && 'error' in result && result.error) {
        throw new Error(result.error);
      }

      if (!result || Object.keys(result).length === 0) {
        throw new Error('Received empty response when creating payment intent.');
      }

      return result as PaymentIntent;
    } catch (error) {
      console.error('Failed to create payment intent:', error);
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('Failed to create payment intent');
    }
  }

  async createProductPaymentIntent(
    user: UserData,
    product: Product,
    organization?: PaymentOrganizationContext,
    billingAddress?: BillingAddress,
  ): Promise<PaymentIntent> {
    try {
      const payload = {
        user,
        productId: product.$id,
        organization,
        billingAddress,
      };

      const result = await apiRequest<PaymentIntent & { error?: string }>('/api/billing/purchase-intent', {
        method: 'POST',
        body: payload,
      });

      if (result && 'error' in result && result.error) {
        throw new Error(result.error);
      }

      return result as PaymentIntent;
    } catch (error) {
      console.error('Failed to create product payment intent:', error);
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('Failed to start product purchase');
    }
  }

  async joinEvent(
    user?: UserData,
    event?: Event,
    team?: Team,
    selection?: DivisionRegistrationSelection,
    timeoutMs?: number,
    occurrence?: WeeklyOccurrenceSelection,
  ): Promise<void> {
    try {
      if (!event?.$id) {
        throw new Error('Event is required to join.');
      }
      const teamId = typeof team?.$id === 'string' ? team.$id : undefined;
      const userId = teamId ? undefined : (typeof user?.$id === 'string' ? user.$id : undefined);
      if (!userId && !teamId) {
        throw new Error('Specify exactly one participant target via userId or teamId.');
      }
      const payload = {
        ...(userId ? { userId } : {}),
        ...(teamId ? { teamId } : {}),
        ...selection,
        ...(occurrence?.slotId ? { slotId: occurrence.slotId } : {}),
        ...(occurrence?.occurrenceDate ? { occurrenceDate: occurrence.occurrenceDate } : {}),
      };

      const result = await apiRequest<{ error?: string }>(`/api/events/${event.$id}/participants`, {
        method: 'POST',
        timeoutMs,
        body: payload,
      });

      if (result && result.error) {
        throw new Error(result.error);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to join event';
      if (!message.toLowerCase().includes('already registered')) {
        console.error('Failed to join event:', error);
      }
      throw new Error(message);
    }
  }

  async leaveEvent(
    user?: UserData,
    event?: Event,
    team?: Team,
    targetUserId?: string,
    options?: LeaveEventOptions,
    timeoutMs?: number,
    occurrence?: WeeklyOccurrenceSelection,
  ): Promise<void> {
    try {
      if (!event?.$id) {
        throw new Error('Event is required to leave.');
      }
      const teamId = typeof team?.$id === 'string' ? team.$id : undefined;
      const resolvedUserId = teamId ? undefined : (targetUserId ?? user?.$id);
      if (!resolvedUserId && !teamId) {
        throw new Error('Specify exactly one participant target via userId or teamId.');
      }
      const payload = {
        ...(resolvedUserId ? { userId: resolvedUserId } : {}),
        ...(teamId ? { teamId } : {}),
        refundMode: options?.refundMode,
        refundReason: options?.refundReason,
        ...(occurrence?.slotId ? { slotId: occurrence.slotId } : {}),
        ...(occurrence?.occurrenceDate ? { occurrenceDate: occurrence.occurrenceDate } : {}),
      };

      const result = await apiRequest<{ error?: string }>(`/api/events/${event.$id}/participants`, {
        method: 'DELETE',
        timeoutMs,
        body: payload,
      });

      if (result && result.error) {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error('Failed to leave event:', error);
      throw new Error(error instanceof Error ? error.message : 'Failed to leave event');
    }
  }

  async requestRefund(event: Event, user: UserData, reason?: string, targetUserId?: string): Promise<{
    success: boolean;
    message?: string;
    emailSent?: boolean;
  }> {
    const payloadEvent = buildPayload(event)

    try {
      const result = await apiRequest<{ error?: string; success: boolean; message?: string; emailSent?: boolean }>(
        '/api/billing/refund',
        {
          method: 'POST',
              body: {
                payloadEvent,
                user,
                userId: targetUserId ?? user.$id,
                reason: reason || 'requested_by_customer',
              },
        },
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

  async requestTeamRefund(
    eventId: string,
    teamId: string,
    reason?: string,
  ): Promise<{
    success: boolean;
    refundId?: string;
    refundAlreadyPending?: boolean;
  }> {
    try {
      const result = await apiRequest<{
        error?: string;
        success: boolean;
        refundId?: string;
        refundAlreadyPending?: boolean;
      }>('/api/billing/refund-all', {
        method: 'POST',
        body: {
          eventId,
          teamId,
          reason: reason || 'team_refund_requested',
        },
      });

      if (result.error) {
        throw new Error(result.error);
      }

      if (!result || !result.success) {
        throw new Error('Failed to request team refund');
      }

      return result;
    } catch (error) {
      console.error('Failed to request team refund:', error);
      throw new Error(error instanceof Error ? error.message : 'Failed to request team refund');
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

      const result = await apiRequest<StripeOnboardingLinkResult & { error?: string }>('/api/billing/host/connect', {
        method: 'POST',
        body: payload,
      });

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

      const result = await apiRequest<StripeOnboardingLinkResult & { error?: string }>(
        '/api/billing/host/onboarding-link',
        {
          method: 'POST',
          body: payload,
        },
      );

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
