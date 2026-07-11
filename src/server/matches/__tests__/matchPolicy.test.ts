import { buildMatchRulesSnapshot, resolveMatchSetPointTargets } from '../matchPolicy';
import type { ResolvedMatchRules } from '@/types';

const baseRules: ResolvedMatchRules = {
  scoringModel: 'SETS',
  segmentCount: 3,
  segmentLabel: 'Set',
  setPointTargets: [21, 21, 15],
  supportsDraw: false,
  supportsOvertime: false,
  supportsShootout: false,
  canUseOvertime: false,
  canUseShootout: false,
  officialRoles: [],
  supportedIncidentTypes: ['POINT', 'DISCIPLINE', 'NOTE', 'ADMIN'],
  incidentTypeDefinitions: [],
  autoCreatePointIncidentType: 'POINT',
  pointIncidentRequiresParticipant: false,
  timekeeping: {
    timerMode: 'NONE',
    segmentDurationMinutes: null,
    segmentDurationMinutesBySequence: [],
    canUseAddedTime: false,
    addedTimeEnabled: false,
    stopAtRegulationEnd: true,
  },
};

describe('matchPolicy', () => {
  it('builds a match snapshot with resized set point targets', () => {
    const snapshot = buildMatchRulesSnapshot({
      baseRules,
      policy: {
        scoringModel: 'SETS',
        segmentCount: 5,
        setPointTargets: [25, 25, 15],
        matchDurationMinutes: 75,
      },
      fallbackSetPointTargets: [21, 21, 15],
    });

    expect(snapshot.segmentCount).toBe(5);
    expect(snapshot.setPointTargets).toEqual([25, 25, 15, 15, 15]);
    expect(snapshot.timekeeping.segmentDurationMinutes).toBe(15);
  });

  it('honors an explicit one-set policy even when legacy rows have three segments', () => {
    const snapshot = buildMatchRulesSnapshot({
      baseRules,
      existingSnapshot: baseRules,
      policy: {
        scoringModel: 'SETS',
        segmentCount: 1,
        setPointTargets: [21],
      },
      fallbackSetPointTargets: [21, 21, 15],
      existingSegmentCount: 3,
    });

    expect(snapshot.segmentCount).toBe(1);
    expect(snapshot.setPointTargets).toEqual([21]);
  });

  it('honors an incoming one-set snapshot even when legacy rows have three segments', () => {
    const snapshot = buildMatchRulesSnapshot({
      baseRules,
      existingSnapshot: baseRules,
      incomingSnapshot: {
        ...baseRules,
        segmentCount: 1,
        setPointTargets: [21],
      },
      fallbackSetPointTargets: [21, 21, 15],
      existingSegmentCount: 3,
    });

    expect(snapshot.segmentCount).toBe(1);
    expect(snapshot.setPointTargets).toEqual([21]);
  });

  it('prefers match snapshot point targets over event defaults', () => {
    const targets = resolveMatchSetPointTargets(
      {
        eventType: 'LEAGUE',
        pointsToVictory: [21, 21, 15],
        leagueConfig: { pointsToVictory: [11] },
      },
      {
        losersBracket: false,
        matchRulesSnapshot: {
          ...baseRules,
          setPointTargets: [25, 25, 15],
        },
      },
    );

    expect(targets).toEqual([25, 25, 15]);
  });
});
