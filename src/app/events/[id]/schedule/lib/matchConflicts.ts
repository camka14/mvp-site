import type { Match } from '@/types';

type MatchWindow = {
  matchId: string;
  fieldId: string;
  startMs: number;
  endMs: number;
};

const DEFAULT_MATCH_DURATION_MS = 60 * 60 * 1000;

export const MATCH_CONFLICT_RESOLUTION_MESSAGE =
  'To auto resolve it, lock one match and reschedule the other.';

const normalizeToken = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

const parseTimestampMs = (value: unknown): number | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const resolveMatchConflictFieldId = (match: Match): string | null => {
  const relationFieldId =
    match.field && typeof match.field === 'object' && typeof match.field.$id === 'string'
      ? normalizeToken(match.field.$id)
      : null;
  if (relationFieldId) {
    return relationFieldId;
  }

  return normalizeToken(match.fieldId);
};

export const toMatchWindow = (match: Match): MatchWindow | null => {
  const matchId = normalizeToken(match.$id);
  const fieldId = resolveMatchConflictFieldId(match);
  const startMs = parseTimestampMs(match.start);
  if (!matchId || !fieldId || startMs === null) {
    return null;
  }

  const parsedEndMs = parseTimestampMs(match.end);
  const endMs = parsedEndMs !== null && parsedEndMs > startMs
    ? parsedEndMs
    : startMs + DEFAULT_MATCH_DURATION_MS;

  return {
    matchId,
    fieldId,
    startMs,
    endMs,
  };
};

const windowsOverlap = (left: MatchWindow, right: MatchWindow): boolean =>
  left.startMs < right.endMs && left.endMs > right.startMs;

export const detectMatchConflictsById = (matches: Match[]): Record<string, string[]> => {
  const windowsByField = new Map<string, MatchWindow[]>();

  matches.forEach((match) => {
    const window = toMatchWindow(match);
    if (!window) {
      return;
    }
    const fieldWindows = windowsByField.get(window.fieldId) ?? [];
    fieldWindows.push(window);
    windowsByField.set(window.fieldId, fieldWindows);
  });

  const conflictSetsByMatchId = new Map<string, Set<string>>();
  const addConflictPair = (leftId: string, rightId: string) => {
    const leftSet = conflictSetsByMatchId.get(leftId) ?? new Set<string>();
    leftSet.add(rightId);
    conflictSetsByMatchId.set(leftId, leftSet);

    const rightSet = conflictSetsByMatchId.get(rightId) ?? new Set<string>();
    rightSet.add(leftId);
    conflictSetsByMatchId.set(rightId, rightSet);
  };

  windowsByField.forEach((windows) => {
    windows.sort((left, right) => left.startMs - right.startMs);

    for (let index = 0; index < windows.length; index += 1) {
      const current = windows[index];
      for (let nextIndex = index + 1; nextIndex < windows.length; nextIndex += 1) {
        const candidate = windows[nextIndex];
        if (candidate.startMs >= current.endMs) {
          break;
        }
        if (windowsOverlap(current, candidate)) {
          addConflictPair(current.matchId, candidate.matchId);
        }
      }
    }
  });

  const result: Record<string, string[]> = {};
  conflictSetsByMatchId.forEach((conflicts, matchId) => {
    result[matchId] = Array.from(conflicts.values()).sort();
  });
  return result;
};
