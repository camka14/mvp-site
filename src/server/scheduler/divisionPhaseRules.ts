import { calculateTimedMatchDurationMinutes, resolveDivisionCompetitionPhase } from '@/lib/divisionPhaseSettings';
import {
  resolveMatchRulesForContext,
  resolveMatchRulesForDivisionPhase,
} from '@/server/matches/matchOperations';

import type { Division, League, Match, Tournament } from './types';

type SchedulerEvent = League | Tournament;

const hasBracketLinks = (match: Match): boolean => Boolean(
  match.losersBracket
  || match.previousLeftMatch
  || match.previousRightMatch
  || match.winnerNextMatch
  || match.loserNextMatch
);

export const applyDivisionPhaseRulesToMatch = (
  event: SchedulerEvent,
  match: Match,
): number | null => {
  if (match.matchRulesSnapshot) {
    match.resolvedMatchRules = match.matchRulesSnapshot as NonNullable<typeof match.resolvedMatchRules>;
    return null;
  }

  const division = match.division;
  const bracketMatch = hasBracketLinks(match);
  const phase = resolveDivisionCompetitionPhase({
    eventType: event.eventType,
    divisionKind: division.kind,
    hasBracketLinks: bracketMatch,
  });
  const usesSets = division.kind === 'LEAGUE'
    ? division.leagueConfig?.usesSets ?? event.usesSets
    : event.usesSets;
  const setsPerMatch = division.leagueConfig?.setsPerMatch ?? event.setsPerMatch ?? null;
  const winnerSetCount = division.playoffConfig?.winnerSetCount ?? event.winnerSetCount ?? null;
  const loserSetCount = division.playoffConfig?.loserSetCount ?? event.loserSetCount ?? null;
  const phaseRules = resolveMatchRulesForDivisionPhase({
    phase,
    phaseSettings: division.phaseSettings,
    sportTemplate: event.resolvedMatchRules,
    autoCreatePointMatchIncidents: event.autoCreatePointMatchIncidents,
    usesSets,
    setsPerMatch,
    winnerSetCount,
    matchDurationMinutes: division.leagueConfig?.matchDurationMinutes
      ?? division.playoffConfig?.matchDurationMinutes
      ?? event.matchDurationMinutes,
    officialPositions: event.officialPositions,
  });
  const contextualRules = resolveMatchRulesForContext({
    baseRules: phaseRules,
    eventType: event.eventType,
    usesSets,
    setsPerMatch,
    winnerSetCount,
    loserSetCount,
    losersBracket: match.losersBracket,
    previousLeftMatch: match.previousLeftMatch,
    previousRightMatch: match.previousRightMatch,
    winnerNextMatch: match.winnerNextMatch,
    loserNextMatch: match.loserNextMatch,
    existingSegmentCount: match.setResults.length,
    existingTeam1PointCount: match.team1Points.length,
    existingTeam2PointCount: match.team2Points.length,
    existingResultCount: match.setResults.length,
  }) ?? phaseRules;

  match.resolvedMatchRules = contextualRules;
  match.matchRulesSnapshot = contextualRules;

  if (usesSets) return null;
  const settings = division.phaseSettings[phase];
  return calculateTimedMatchDurationMinutes({
    segmentCount: contextualRules.segmentCount,
    segmentLengthMinutes: settings?.segmentLengthMinutes,
    segmentBreakMinutes: settings?.segmentBreakMinutes,
  });
};

export const resolveScheduledMatchDurationMs = (
  event: SchedulerEvent,
  match: Match,
  fallbackDurationMs: number,
): number => {
  const phaseDurationMinutes = applyDivisionPhaseRulesToMatch(event, match);
  return phaseDurationMinutes == null ? fallbackDurationMs : phaseDurationMinutes * 60 * 1000;
};
