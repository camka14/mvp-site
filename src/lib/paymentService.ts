import { functions } from '@/app/appwrite';
import type {
  Event,
  EventPayload,
  Field,
  LeagueScoringConfig,
  Match,
  Organization,
  PaymentIntent,
  Team,
  TimeSlot,
  TimeSlotPayload,
  UserData,
} from '@/types';

type PaymentOrganizationContext = Partial<Organization>;

type EventManagerTask = 'billing' | 'editEvent';
type EventManagerCommand = 'create_purchase_intent' | 'addParticipant' | 'removeParticipant';

interface EventManagerPayload {
  task: EventManagerTask;
  command: EventManagerCommand | string;
  event: EventPayload | null;
  timeSlot: TimeSlot | null;
  user: UserData | null;
  team: Team | null;
  organization: PaymentOrganizationContext | null;
  organizationEmail?: string;
}

const removeUndefined = <T extends Record<string, unknown>>(record: T): T => {
  const result: Record<string, unknown> = {};
  Object.keys(record).forEach((key) => {
    const value = record[key];
    if (value !== undefined) {
      result[key] = value;
    }
  });
  return result as T;
};

const mapItemsToIds = <T extends { $id?: string }>(items?: (T | string)[] | null): string[] | undefined => {
  if (!items?.length) {
    return undefined;
  }

  const ids = items
    .map((item) => (typeof item === 'string' ? item : item?.$id))
    .filter((value): value is string => Boolean(value));

  return ids.length ? ids : undefined;
};

const sanitizeTimeSlots = (slots?: TimeSlot[] | null): TimeSlotPayload[] | undefined => {
  if (!slots?.length) {
    return undefined;
  }

  const sanitized = slots
    .map((slot) => {
      if (!slot) {
        return undefined;
      }

      const { $id: _slotId, event: _slotEvent, ...rest } = slot;
      const clone = { ...rest } as Record<string, unknown>;

      if (slot.scheduledFieldId) {
        clone.field = slot.scheduledFieldId;
      }

      const cleaned = removeUndefined(clone) as Partial<TimeSlotPayload>;
      return Object.keys(cleaned).length ? (cleaned as TimeSlotPayload) : undefined;
    })
    .filter((slot): slot is TimeSlotPayload => Boolean(slot));

  return sanitized.length ? sanitized : undefined;
};

const buildEventPayload = (event: Event): EventPayload => {
  const {
    players,
    teams,
    matches,
    timeSlots,
    leagueConfig: _leagueConfig,
    attendees: _attendees,
    sport,
    leagueScoringConfig,
    ...rest
  } = event;

  const payload = removeUndefined({ ...rest }) as EventPayload;

  const playerIds = mapItemsToIds<UserData>(players as unknown as (UserData | string)[] | undefined);
  if (playerIds) {
    payload.players = playerIds;
  }

  const teamIds = mapItemsToIds<Team>(teams as unknown as (Team | string)[] | undefined);
  if (teamIds) {
    payload.teams = teamIds;
  }

  const matchIds = mapItemsToIds<Match>(matches as unknown as (Match | string)[] | undefined);
  if (matchIds) {
    payload.matches = matchIds;
  }

  const sanitizedSlots = sanitizeTimeSlots(timeSlots);
  if (sanitizedSlots) {
    payload.timeSlots = sanitizedSlots;
  }

  if (leagueScoringConfig) {
    payload.leagueScoringConfig = leagueScoringConfig as LeagueScoringConfig;
  }

  if (sport?.$id) {
    payload.sport = sport.$id;
  }

  return payload;
};

const buildEventManagerPayload = (
  task: EventManagerTask,
  command: EventManagerCommand | string,
  user?: UserData,
  event?: Event | null,
  team?: Team | null,
  timeSlot?: TimeSlot | null,
  organization?: PaymentOrganizationContext | null,
  organizationEmail?: string,
): EventManagerPayload => {
  if (!event && !timeSlot && !organization) {
    throw new Error('Payment actions require at least an event, time slot, or organization context.');
  }

  const payloadEvent = event ? buildEventPayload(event) : null;

  return {
    task,
    command,
    user: user ?? null,
    event: payloadEvent,
    team: team ?? null,
    timeSlot: timeSlot ?? null,
    organization: organization ?? null,
    organizationEmail,
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

class PaymentService {
  async createPaymentIntent(
    user: UserData,
    event?: Event | null,
    team?: Team | null,
    timeSlot?: TimeSlot | null,
    organization?: PaymentOrganizationContext | null,
    organizationEmail?: string,
  ): Promise<PaymentIntent> {
    try {
      const payload = buildEventManagerPayload(
        'billing',
        'create_purchase_intent',
        user,
        event,
        team,
        timeSlot,
        organization,
        organizationEmail,
      );

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
    event?: Event | null,
    team?: Team | null,
    timeSlot?: TimeSlot | null,
    organization?: PaymentOrganizationContext | null,
  ): Promise<void> {
    try {
      const payload = buildEventManagerPayload('editEvent', 'addParticipant', user, event, team, timeSlot, organization);

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
    event?: Event | null,
    team?: Team | null,
    timeSlot?: TimeSlot | null,
    organization?: PaymentOrganizationContext | null,
  ): Promise<void> {
    try {
      const payload = buildEventManagerPayload('editEvent', 'removeParticipant', user, event, team, timeSlot, organization);

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
    user: UserData,
    organization?: PaymentOrganizationContext | null,
    organizationEmail?: string,
  ): Promise<{ onboardingUrl: string }> {
    try {
      const payload = buildEventManagerPayload(
        'billing',
        'connect_host_account',
        user,
        null,
        null,
        null,
        organization ?? null,
        organizationEmail,
      );

      const response = await functions.createExecution({
        functionId: process.env.NEXT_PUBLIC_EVENT_MANAGER_FUNCTION_ID!,
        body: JSON.stringify(payload),
        async: false,
      });

      const result = parseExecutionResponse<{ onboardingUrl: string; error?: string }>(response.responseBody);

      if (result.error) {
        throw new Error(result.error);
      }

      return result;
    } catch (error) {
      console.error('Failed to connect Stripe account:', error);
      throw new Error(error instanceof Error ? error.message : 'Failed to connect Stripe account');
    }
  }
}

export const paymentService = new PaymentService();
