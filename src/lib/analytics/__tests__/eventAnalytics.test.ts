import type { Event, Organization } from '@/types';
import {
  trackEventClicked,
  trackEventOutboundClicked,
  trackEventRegistrationStarted,
  trackRentalCheckoutStarted,
  trackRentalClicked,
} from '@/lib/analytics/eventAnalytics';
import { capture } from '@/lib/analytics/posthogClient';

jest.mock('@/lib/analytics/posthogClient', () => ({
  capture: jest.fn(),
}));

const captureMock = capture as jest.MockedFunction<typeof capture>;

const event = {
  $id: 'event_1',
  name: 'River City Pickup',
  eventType: 'WEEKLY_EVENT',
  organizationId: 'org_1',
  sportId: 'sport_1',
  sourceType: 'AFFILIATE',
  sourceId: 'source_1',
  teamSignup: false,
  affiliateUrl: 'https://partner.example.com/events/river-city',
} as Event;

const organization = {
  $id: 'org_1',
  name: 'River City Sports Club',
} as Organization;

describe('eventAnalytics', () => {
  beforeEach(() => {
    captureMock.mockClear();
  });

  it('captures event click properties', () => {
    trackEventClicked(event, 'discover_events');

    expect(captureMock).toHaveBeenCalledWith('event clicked', expect.objectContaining({
      event_id: 'event_1',
      event_type: 'WEEKLY_EVENT',
      organization_id: 'org_1',
      sport_id: 'sport_1',
      source_type: 'AFFILIATE',
      team_signup: 'false',
      is_affiliate_event: true,
      source: 'discover_events',
    }));
  });

  it('captures registration start properties', () => {
    trackEventRegistrationStarted(event, 'team', { division_id: 'division_1' });

    expect(captureMock).toHaveBeenCalledWith('event registration started', expect.objectContaining({
      event_id: 'event_1',
      registration_type: 'team',
      division_id: 'division_1',
    }));
  });

  it('captures outbound destination context without storing query strings', () => {
    trackEventOutboundClicked(event, 'https://partner.example.com/path/to/register?token=secret', 'event_detail');

    expect(captureMock).toHaveBeenCalledWith('event outbound clicked', expect.objectContaining({
      event_id: 'event_1',
      source: 'event_detail',
      destination_host: 'partner.example.com',
      destination_path: '/path/to/register',
    }));
  });

  it('captures rental click and checkout start properties', () => {
    trackRentalClicked(organization, 'public_rental_page', { field_id: 'field_1' });
    trackRentalCheckoutStarted(organization, 'public_rental_page', { amount_cents: 2400 });

    expect(captureMock).toHaveBeenNthCalledWith(1, 'rental clicked', expect.objectContaining({
      organization_id: 'org_1',
      source: 'public_rental_page',
      field_id: 'field_1',
    }));
    expect(captureMock).toHaveBeenNthCalledWith(2, 'rental checkout started', expect.objectContaining({
      organization_id: 'org_1',
      source: 'public_rental_page',
      amount_cents: 2400,
    }));
  });
});
