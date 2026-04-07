import { formatEventDivisionPriceRange, getEventDivisionPriceRange, type Event } from '@/types';

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

  it('falls back to the event price for divisions without an explicit price', () => {
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
      maxPriceCents: 5000,
    });
    expect(formatEventDivisionPriceRange(event)).toBe('Free - $50.00');
  });
});
