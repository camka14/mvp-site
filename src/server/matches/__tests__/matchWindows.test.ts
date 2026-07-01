/** @jest-environment node */

import {
  OFFICIAL_MATCH_OPEN_MINUTES_BEFORE,
  assertWindowOpen,
  getOpenAt,
  isWindowOpen,
} from '@/server/matches/matchWindows';

describe('matchWindows', () => {
  const matchStart = new Date('2026-07-01T18:00:00.000Z');

  it('opens official match actions one hour before start', () => {
    expect(getOpenAt(matchStart, OFFICIAL_MATCH_OPEN_MINUTES_BEFORE)?.toISOString()).toBe(
      '2026-07-01T17:00:00.000Z',
    );
    expect(isWindowOpen(matchStart, OFFICIAL_MATCH_OPEN_MINUTES_BEFORE, new Date('2026-07-01T16:59:59.000Z'))).toBe(
      false,
    );
    expect(isWindowOpen(matchStart, OFFICIAL_MATCH_OPEN_MINUTES_BEFORE, new Date('2026-07-01T17:00:00.000Z'))).toBe(
      true,
    );
  });

  it('allows unscheduled matches and rejects scheduled matches before the window', () => {
    expect(isWindowOpen(null, OFFICIAL_MATCH_OPEN_MINUTES_BEFORE, new Date('2026-07-01T16:00:00.000Z'))).toBe(true);

    expect(() => {
      assertWindowOpen(
        matchStart,
        OFFICIAL_MATCH_OPEN_MINUTES_BEFORE,
        'Official match actions open one hour before the scheduled match start.',
        new Date('2026-07-01T16:30:00.000Z'),
      );
    }).toThrow(Response);
  });
});
