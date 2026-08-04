import type { MatchSegment } from '@/types';

export const SEGMENT_BREAK_STARTED_AT_METADATA_KEY = 'segmentBreakStartedAt';
export const SEGMENT_BREAK_SKIPPED_AT_METADATA_KEY = 'segmentBreakSkippedAt';

export type MatchSegmentBreakCountdown = {
  totalSeconds: number;
  remainingSeconds: number;
  previousSegmentId: string;
};

const parseTimestamp = (value: unknown): number | null => {
  if (typeof value !== 'string' || !value.trim()) return null;
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
};

export const resolveMatchSegmentBreakCountdown = (input: {
  previousSegment?: MatchSegment | null;
  currentSegment?: MatchSegment | null;
  breakDurationMinutes: number;
  now: number;
}): MatchSegmentBreakCountdown | null => {
  const { previousSegment, currentSegment } = input;
  if (!previousSegment || !currentSegment || input.breakDurationMinutes <= 0) return null;
  if (String(previousSegment.status).toUpperCase() !== 'COMPLETE') return null;
  if (currentSegment.startedAt) return null;
  if (currentSegment.sequence !== previousSegment.sequence + 1) return null;
  if (parseTimestamp(currentSegment.metadata?.[SEGMENT_BREAK_SKIPPED_AT_METADATA_KEY]) !== null) return null;

  const breakStartedAt = parseTimestamp(currentSegment.metadata?.[SEGMENT_BREAK_STARTED_AT_METADATA_KEY])
    ?? parseTimestamp(previousSegment.endedAt);
  if (breakStartedAt === null) return null;

  const totalSeconds = Math.max(0, Math.trunc(input.breakDurationMinutes)) * 60;
  const elapsedSeconds = Math.max(0, Math.floor((input.now - breakStartedAt) / 1000));
  const remainingSeconds = totalSeconds - elapsedSeconds;
  if (remainingSeconds <= 0) return null;

  return {
    totalSeconds,
    remainingSeconds,
    previousSegmentId: previousSegment.id ?? previousSegment.$id ?? '',
  };
};

export const buildRestartedSegmentBreakMetadata = (
  segment: MatchSegment,
  restartedAt: string,
): Record<string, unknown> => {
  const metadata = { ...(segment.metadata ?? {}) };
  delete metadata[SEGMENT_BREAK_SKIPPED_AT_METADATA_KEY];
  metadata[SEGMENT_BREAK_STARTED_AT_METADATA_KEY] = restartedAt;
  return metadata;
};

export const buildSkippedSegmentBreakMetadata = (
  segment: MatchSegment,
  skippedAt: string,
): Record<string, unknown> => ({
  ...(segment.metadata ?? {}),
  [SEGMENT_BREAK_SKIPPED_AT_METADATA_KEY]: skippedAt,
});
