import {
  isMultiSportEventType,
  normalizeEventSportIds,
  validateEventSportIds,
} from '@/server/eventSports';

describe('event sport normalization', () => {
  it('keeps the first canonical sport as the primary sport', () => {
    expect(normalizeEventSportIds([' sport_a ', 'sport_b', 'sport_a'])).toEqual([
      'sport_a',
      'sport_b',
    ]);
    expect(normalizeEventSportIds([])).toEqual([]);
  });

  it.each(['EVENT', 'WEEKLY_EVENT'])('allows multiple sports for %s events', (eventType) => {
    expect(isMultiSportEventType(eventType)).toBe(true);
    expect(() => validateEventSportIds({
      eventType,
      sportIds: ['sport_a', 'sport_b'],
    })).not.toThrow();
  });

  it.each(['LEAGUE', 'TOURNAMENT'])('rejects multiple sports for %s events', (eventType) => {
    expect(isMultiSportEventType(eventType)).toBe(false);
    expect(() => validateEventSportIds({
      eventType,
      sportIds: ['sport_a', 'sport_b'],
    })).toThrow('must use one sport');
  });
});
