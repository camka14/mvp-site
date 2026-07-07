'use client';

import type { Event, Organization } from '@/types';
import { capture, type AnalyticsProperties } from './posthogClient';

type EventClickSource =
  | 'discover_events'
  | 'event_detail'
  | 'event_card_host'
  | 'mobile_discover';

export type RegistrationAttemptType =
  | 'affiliate'
  | 'self'
  | 'team'
  | 'child'
  | 'waitlist'
  | 'team_waitlist'
  | 'free_agent';

type RentalSource = 'public_rental_page' | 'discover_rentals';

const normalizeString = (value: unknown): string | undefined => (
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
);

const normalizeBooleanString = (value: unknown): string | undefined => (
  typeof value === 'boolean' ? String(value) : undefined
);

const destinationProperties = (url: string | null | undefined): AnalyticsProperties => {
  const normalizedUrl = normalizeString(url);
  if (!normalizedUrl) {
    return {};
  }

  try {
    const parsed = new URL(normalizedUrl);
    return {
      destination_host: parsed.host,
      destination_path: parsed.pathname || '/',
    };
  } catch {
    return {
      destination_url_available: true,
    };
  }
};

export const eventAnalyticsProperties = (event: Event): AnalyticsProperties => ({
  event_id: event.$id,
  event_type: normalizeString(event.eventType),
  event_name: normalizeString(event.name),
  organization_id: normalizeString(event.organizationId),
  sport_id: normalizeString(event.sportId),
  source_type: normalizeString(event.sourceType),
  source_id: normalizeString(event.sourceId),
  team_signup: normalizeBooleanString(event.teamSignup),
  is_affiliate_event: Boolean(normalizeString(event.affiliateUrl)),
});

export const rentalAnalyticsProperties = (
  organization: Organization,
  extra: AnalyticsProperties = {},
): AnalyticsProperties => ({
  organization_id: organization.$id,
  organization_name: normalizeString(organization.name),
  ...extra,
});

export function trackEventClicked(event: Event, source: EventClickSource): void {
  capture('event clicked', {
    ...eventAnalyticsProperties(event),
    source,
  });
}

export function trackEventRegistrationStarted(
  event: Event,
  registrationType: RegistrationAttemptType,
  extra: AnalyticsProperties = {},
): void {
  capture('event registration started', {
    ...eventAnalyticsProperties(event),
    registration_type: registrationType,
    ...extra,
  });
}

export function trackEventOutboundClicked(
  event: Event,
  destinationUrl: string,
  source: EventClickSource,
): void {
  capture('event outbound clicked', {
    ...eventAnalyticsProperties(event),
    source,
    ...destinationProperties(destinationUrl),
  });
}

export function trackRentalClicked(
  organization: Organization,
  source: RentalSource,
  extra: AnalyticsProperties = {},
): void {
  capture('rental clicked', rentalAnalyticsProperties(organization, {
    source,
    ...extra,
  }));
}

export function trackRentalCheckoutStarted(
  organization: Organization,
  source: RentalSource,
  extra: AnalyticsProperties = {},
): void {
  capture('rental checkout started', rentalAnalyticsProperties(organization, {
    source,
    ...extra,
  }));
}

export function trackRentalOutboundClicked(
  organization: Organization,
  destinationUrl: string,
  source: RentalSource,
): void {
  capture('rental outbound clicked', rentalAnalyticsProperties(organization, {
    source,
    ...destinationProperties(destinationUrl),
  }));
}
