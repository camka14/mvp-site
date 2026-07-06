import {
  formatAffiliateEventPriceRange,
  formatEventDivisionPriceRange,
  getEventDivisionPriceRange,
  type Event,
} from '@/types';

const baseEvent = (): Event => ({
  $id: 'event_1',
  name: 'League Event',
  start: '2026-01-01T00:00:00.000Z',
  end: '2026-01-02T00:00:00.000Z',
  eventType: 'LEAGUE',
  price: 5000,
  divisions: [],
  divisionDetails: [],
} as unknown as Event);

describe('event division price range', () => {
  it('falls back to the event price when divisions are absent', () => {
    const event = baseEvent();

    expect(getEventDivisionPriceRange(event)).toEqual({
      minPriceCents: 5000,
      maxPriceCents: 5000,
    });
    expect(formatEventDivisionPriceRange(event)).toBe('$50.00');
  });

  it('formats the min and max explicit division prices for multi-division events', () => {
    const event = {
      ...baseEvent(),
      divisions: ['division_a', 'division_b'],
      divisionDetails: [
        { id: 'division_a', key: 'division_a', name: 'Division A', price: 3500 },
        { id: 'division_b', key: 'division_b', name: 'Division B', price: 5000 },
      ],
    } as Event;

    expect(getEventDivisionPriceRange(event)).toEqual({
      minPriceCents: 3500,
      maxPriceCents: 5000,
    });
    expect(formatEventDivisionPriceRange(event)).toBe('$35.00 - $50.00');
  });

  it('uses the division price for single-division events when present', () => {
    const event = {
      ...baseEvent(),
      divisions: ['division_a'],
      divisionDetails: [
        { id: 'division_a', key: 'division_a', name: 'Division A', price: 6500 },
      ],
    } as Event;

    expect(getEventDivisionPriceRange(event)).toEqual({
      minPriceCents: 6500,
      maxPriceCents: 6500,
    });
    expect(formatEventDivisionPriceRange(event)).toBe('$65.00');
  });

  it('ignores event price for divisions without an explicit price', () => {
    const event = {
      ...baseEvent(),
      divisions: ['division_a', 'division_b'],
      divisionDetails: [
        { id: 'division_a', key: 'division_a', name: 'Division A', price: 0 },
        { id: 'division_b', key: 'division_b', name: 'Division B' },
      ],
    } as Event;

    expect(getEventDivisionPriceRange(event)).toEqual({
      minPriceCents: 0,
      maxPriceCents: 0,
    });
    expect(formatEventDivisionPriceRange(event)).toBe('Free');
  });

  it('reports missing price when every division is missing price', () => {
    const event = {
      ...baseEvent(),
      divisions: ['division_a'],
      divisionDetails: [
        { id: 'division_a', key: 'division_a', name: 'Division A' },
      ],
    } as Event;

    expect(getEventDivisionPriceRange(event)).toEqual({
      minPriceCents: 0,
      maxPriceCents: 0,
    });
    expect(formatEventDivisionPriceRange(event)).toBe('Price not set');
  });
});

describe('affiliate event price range', () => {
  it('uses division prices before raw affiliate price text', () => {
    const event = {
      ...baseEvent(),
      price: 169500,
      priceText: 'From $1,695 per team; division-specific fall fees go up to $2,295 before any posted late fee.',
      divisions: ['division_open', 'division_65'],
      divisionDetails: [
        { id: 'division_open', key: 'division_open', name: 'Open', price: 229500 },
        { id: 'division_65', key: 'division_65', name: 'Over 65', price: 169500 },
      ],
    } as Event;

    expect(formatAffiliateEventPriceRange(event)).toBe('$1695.00 - $2295.00');
  });

  it('uses event price when division details are absent and ignores raw affiliate price text', () => {
    const event = {
      ...baseEvent(),
      price: 169500,
      priceText: 'From $1,695 per team; division-specific fall fees go up to $2,295 before any posted late fee.',
    } as Event;

    expect(formatAffiliateEventPriceRange(event)).toBe('$1695.00');
  });

  it('uses the stored event price for detailed single-price affiliate text', () => {
    const event = {
      ...baseEvent(),
      price: 53000,
      priceText: '$530 flat fee per team for 8 games including referee payments; $475 promo when paid early.',
    } as Event;

    expect(formatAffiliateEventPriceRange(event)).toBe('$530.00');
  });

  it('does not show free for affiliate events without a specified price', () => {
    const event = {
      ...baseEvent(),
      price: 0,
      priceText: null,
    } as Event;

    expect(formatAffiliateEventPriceRange(event)).toBe('Price not specified');
  });

  it('keeps division-priced free affiliate registrations as free', () => {
    const event = {
      ...baseEvent(),
      price: 0,
      priceText: 'Free new-player registration.',
      divisions: ['division_free'],
      divisionDetails: [
        { id: 'division_free', key: 'division_free', name: 'New Player', price: 0 },
      ],
    } as Event;

    expect(formatAffiliateEventPriceRange(event)).toBe('Free');
  });
});
