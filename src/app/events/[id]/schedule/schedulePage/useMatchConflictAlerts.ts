import { useCallback, useEffect, useMemo, useState } from 'react';

import type { Match } from '@/types';

import { detectMatchConflictsById } from '../lib/matchConflicts';
import {
  buildMatchConflictAlertMessage,
  listMatchConflictPairs,
} from './helpers';

type UseMatchConflictAlertsParams = {
  matches: Match[];
};

export default function useMatchConflictAlerts({ matches }: UseMatchConflictAlertsParams) {
  const [dismissedMatchConflictSignature, setDismissedMatchConflictSignature] = useState<string | null>(null);
  const [matchConflictOverrideMessage, setMatchConflictOverrideMessage] = useState<string | null>(null);

  const matchConflictsById = useMemo<Record<string, string[]>>(
    () => detectMatchConflictsById(matches),
    [matches],
  );
  const matchConflictPairs = useMemo(
    () => listMatchConflictPairs(matchConflictsById),
    [matchConflictsById],
  );
  const matchConflictSignature = useMemo(
    () => matchConflictPairs.map((pair) => `${pair.firstId}|${pair.secondId}`).join(','),
    [matchConflictPairs],
  );
  const hasMatchConflicts = matchConflictPairs.length > 0;
  const baseMatchConflictMessage = useMemo(
    () => (
      hasMatchConflicts
        ? buildMatchConflictAlertMessage({
            matches,
            pairs: matchConflictPairs,
          })
        : null
    ),
    [hasMatchConflicts, matchConflictPairs, matches],
  );
  const visibleMatchConflictMessage = useMemo(() => {
    if (!hasMatchConflicts) {
      return null;
    }
    if (matchConflictOverrideMessage) {
      return matchConflictOverrideMessage;
    }
    if (dismissedMatchConflictSignature === matchConflictSignature) {
      return null;
    }
    return baseMatchConflictMessage;
  }, [
    baseMatchConflictMessage,
    dismissedMatchConflictSignature,
    hasMatchConflicts,
    matchConflictOverrideMessage,
    matchConflictSignature,
  ]);

  useEffect(() => {
    if (!hasMatchConflicts) {
      setDismissedMatchConflictSignature(null);
      setMatchConflictOverrideMessage(null);
      return;
    }
    setMatchConflictOverrideMessage(null);
    setDismissedMatchConflictSignature((current) => (current === matchConflictSignature ? current : null));
  }, [hasMatchConflicts, matchConflictSignature]);

  const clearMatchConflictDraftAlerts = useCallback(() => {
    setDismissedMatchConflictSignature(null);
    setMatchConflictOverrideMessage(null);
  }, []);

  const dismissMatchConflictMessage = useCallback(() => {
    setDismissedMatchConflictSignature(matchConflictSignature);
    setMatchConflictOverrideMessage(null);
  }, [matchConflictSignature]);

  const showCurrentMatchConflictOverride = useCallback(() => {
    if (!hasMatchConflicts) {
      return;
    }
    setDismissedMatchConflictSignature(null);
    setMatchConflictOverrideMessage(
      buildMatchConflictAlertMessage({
        matches,
        pairs: matchConflictPairs,
      }),
    );
  }, [hasMatchConflicts, matchConflictPairs, matches]);

  return {
    clearMatchConflictDraftAlerts,
    dismissMatchConflictMessage,
    hasMatchConflicts,
    matchConflictPairs,
    matchConflictSignature,
    matchConflictsById,
    showCurrentMatchConflictOverride,
    visibleMatchConflictMessage,
  };
}
