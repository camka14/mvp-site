import { screen } from '@testing-library/react';

import EventCard from '../EventCard';
import { Event } from '@/types';
import { renderWithMantine } from '../../../../test/utils/renderWithMantine';

jest.mock('next/image', () => ({
  __esModule: true,
  default: ({
    fill: _fill,
    priority: _priority,
    unoptimized: _unoptimized,
    ...props
  }: React.ImgHTMLAttributes<HTMLImageElement> & {
    fill?: boolean;
    priority?: boolean;
    unoptimized?: boolean;
  }) => <img {...props} alt={props.alt ?? ''} />,
}));

const createEvent = (overrides: Partial<Event> = {}): Event => ({
  $id: 'event_1',
  name: 'Team Play Thursdays',
  description: 'Male and female mixed-traditional open gym.',
  affiliateUrl: 'https://example.com/register',
  sourceUrl: 'https://example.com/event',
  organizerName: 'Rose City Volleyball',
  scheduleText: '8:05 PM - TEAM PLAY THURSDAYS Beaverton - duplicate scraped text',
  dateDisplayMode: 'SCHEDULED',
  dateDisplayText: null,
  priceText: '$13.00',
  statusText: null,
  start: '2026-07-02T20:05:00',
  end: '2026-07-02T22:05:00',
  location: 'Beaverton Hoop YMCA',
  address: '9685 SW Harvest Court',
  coordinates: [-122.7901, 45.4842],
  price: 1300,
  minAge: null,
  maxAge: null,
  imageId: null,
  hostId: null,
  state: 'PUBLISHED',
  maxParticipants: 42,
  teamSizeLimit: 0,
  teamSignup: false,
  singleDivision: true,
  waitListIds: [],
  freeAgentIds: [],
  eventType: 'AFFILIATE',
  sport: {
    $id: 'sport_volleyball',
    name: 'Indoor Volleyball',
    description: '',
    icon: '',
    defaultDivisions: [],
    defaultRules: [],
    defaultMatchSettings: {},
  },
  divisions: [],
  attendees: 0,
  cancellationRefundHours: null,
  registrationCutoffHours: null,
  seedColor: 0,
  $createdAt: '2026-07-01T00:00:00.000Z',
  $updatedAt: '2026-07-01T00:00:00.000Z',
  ...overrides,
} as Event);

describe('EventCard affiliate schedule display', () => {
  it('uses the event start date and time instead of duplicated scraped schedule text', () => {
    renderWithMantine(<EventCard event={createEvent()} />);

    expect(screen.getByText('07/02/2026 at 08:05 PM')).toBeInTheDocument();
    expect(screen.queryByText(/duplicate scraped text/i)).not.toBeInTheDocument();
    expect(screen.getByText('Beaverton Hoop YMCA')).toBeInTheDocument();
    expect(screen.getByText('Source: Rose City Volleyball')).toBeInTheDocument();
  });

  it('keeps no-fixed-date affiliate programs on their display text', () => {
    renderWithMantine(
      <EventCard
        event={createEvent({
          dateDisplayMode: 'NO_FIXED_DATE',
          dateDisplayText: 'Open registration',
        })}
      />,
    );

    expect(screen.getByText('Open registration')).toBeInTheDocument();
    expect(screen.queryByText('07/02/2026 at 08:05 PM')).not.toBeInTheDocument();
  });
});
