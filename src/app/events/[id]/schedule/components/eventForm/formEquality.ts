import type { LeagueConfig, TournamentConfig } from '@/types';
import type { LeagueSlotForm } from '@/app/discover/components/LeagueFields';

import { normalizeDivisionKeys } from './divisionForm';
import { normalizeSlotFieldIds, normalizeWeekdays } from './slotForm';
import { nullableNumbersEqual, stringArraysEqual, stringSetsEqual } from './shared';

export const tournamentConfigEqual = (left: TournamentConfig, right: TournamentConfig): boolean => (
    left.doubleElimination === right.doubleElimination
    && left.winnerSetCount === right.winnerSetCount
    && left.loserSetCount === right.loserSetCount
    && left.prize === right.prize
    && left.fieldCount === right.fieldCount
    && left.restTimeMinutes === right.restTimeMinutes
    && left.usesSets === right.usesSets
    && left.matchDurationMinutes === right.matchDurationMinutes
    && left.setDurationMinutes === right.setDurationMinutes
    && stringArraysEqual(
        (left.winnerBracketPointsToVictory || []).map((value) => String(value)),
        (right.winnerBracketPointsToVictory || []).map((value) => String(value)),
    )
    && stringArraysEqual(
        (left.loserBracketPointsToVictory || []).map((value) => String(value)),
        (right.loserBracketPointsToVictory || []).map((value) => String(value)),
    )
);

export const leagueConfigEqual = (left: LeagueConfig, right: LeagueConfig): boolean => (
    left.gamesPerOpponent === right.gamesPerOpponent
    && left.includePlayoffs === right.includePlayoffs
    && left.playoffTeamCount === right.playoffTeamCount
    && left.usesSets === right.usesSets
    && nullableNumbersEqual(left.matchDurationMinutes, right.matchDurationMinutes)
    && left.restTimeMinutes === right.restTimeMinutes
    && nullableNumbersEqual(left.setDurationMinutes, right.setDurationMinutes)
    && left.setsPerMatch === right.setsPerMatch
    && stringArraysEqual(
        (left.pointsToVictory || []).map((value) => String(value)),
        (right.pointsToVictory || []).map((value) => String(value)),
    )
);

const toSlotConflictSignature = (conflict: LeagueSlotForm['conflicts'][number]): string => (
    `${String(conflict.event?.$id ?? '')}|${String(conflict.schedule?.$id ?? '')}|${conflict.event?.start ?? ''}|${conflict.event?.end ?? ''}`
);

export const slotConflictsEqual = (
    left: LeagueSlotForm['conflicts'],
    right: LeagueSlotForm['conflicts'],
): boolean => {
    if (left.length !== right.length) {
        return false;
    }
    const leftKeys = left.map(toSlotConflictSignature).sort();
    const rightKeys = right.map(toSlotConflictSignature).sort();
    return leftKeys.every((value, index) => value === rightKeys[index]);
};

export const leagueSlotsEqual = (left: LeagueSlotForm[], right: LeagueSlotForm[]): boolean => {
    if (left.length !== right.length) {
        return false;
    }
    for (let index = 0; index < left.length; index += 1) {
        const first = left[index];
        const second = right[index];
        if (
            first.key !== second.key
            || first.$id !== second.$id
            || !stringSetsEqual(normalizeSlotFieldIds(first), normalizeSlotFieldIds(second))
            || !stringSetsEqual(
                normalizeWeekdays(first).map((value) => String(value)),
                normalizeWeekdays(second).map((value) => String(value)),
            )
            || !stringSetsEqual(normalizeDivisionKeys(first.divisions), normalizeDivisionKeys(second.divisions))
            || first.startDate !== second.startDate
            || first.endDate !== second.endDate
            || first.startTimeMinutes !== second.startTimeMinutes
            || first.endTimeMinutes !== second.endTimeMinutes
            || Boolean(first.repeating) !== Boolean(second.repeating)
            || Boolean(first.checking) !== Boolean(second.checking)
            || (first.error ?? '') !== (second.error ?? '')
            || !slotConflictsEqual(first.conflicts, second.conflicts)
        ) {
            return false;
        }
    }
    return true;
};
