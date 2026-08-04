import type { MatchSegment } from '@/types';

import {
  buildRestartedSegmentBreakMetadata,
  buildSkippedSegmentBreakMetadata,
  resolveMatchSegmentBreakCountdown,
  SEGMENT_BREAK_SKIPPED_AT_METADATA_KEY,
  SEGMENT_BREAK_STARTED_AT_METADATA_KEY,
} from '../matchSegmentBreak';

const segment = (sequence: number, overrides: Partial<MatchSegment> = {}): MatchSegment => ({
  id: `segment-${sequence}`,
  matchId: 'match-1',
  sequence,
  status: 'NOT_STARTED',
  scores: {},
  ...overrides,
});

describe('match segment break controls', () => {
  it('uses the saved segment end until the break is restarted', () => {
    const previous = segment(1, { status: 'COMPLETE', endedAt: '2026-08-03T20:00:00Z' });
    const current = segment(2);

    expect(resolveMatchSegmentBreakCountdown({
      previousSegment: previous,
      currentSegment: current,
      breakDurationMinutes: 5,
      now: new Date('2026-08-03T20:02:00Z').getTime(),
    })?.remainingSeconds).toBe(180);

    const restarted = { ...current, metadata: buildRestartedSegmentBreakMetadata(current, '2026-08-03T20:02:00Z') };
    expect(resolveMatchSegmentBreakCountdown({
      previousSegment: previous,
      currentSegment: restarted,
      breakDurationMinutes: 5,
      now: new Date('2026-08-03T20:02:00Z').getTime(),
    })?.remainingSeconds).toBe(300);
  });

  it('keeps a skipped break inactive and clears the skip when restarted', () => {
    const previous = segment(1, { status: 'COMPLETE', endedAt: '2026-08-03T20:00:00Z' });
    const current = segment(2);
    const skipped = { ...current, metadata: buildSkippedSegmentBreakMetadata(current, '2026-08-03T20:01:00Z') };

    expect(resolveMatchSegmentBreakCountdown({
      previousSegment: previous,
      currentSegment: skipped,
      breakDurationMinutes: 5,
      now: new Date('2026-08-03T20:01:00Z').getTime(),
    })).toBeNull();

    const restartedMetadata = buildRestartedSegmentBreakMetadata(skipped, '2026-08-03T20:01:00Z');
    expect(restartedMetadata[SEGMENT_BREAK_SKIPPED_AT_METADATA_KEY]).toBeUndefined();
    expect(restartedMetadata[SEGMENT_BREAK_STARTED_AT_METADATA_KEY]).toBe('2026-08-03T20:01:00Z');
  });
});
