import {
  resolveMatchRules,
  resolveMatchRulesForContext,
  shouldFreezeMatchRulesSnapshot,
} from '@/server/matches/matchOperations';

describe('shouldFreezeMatchRulesSnapshot', () => {
  it('does not freeze when there are no segment score or incident changes', () => {
    expect(shouldFreezeMatchRulesSnapshot({
      segmentOperations: [{ sequence: 1, scores: {} }],
      incidentOperations: [],
    })).toBe(false);
  });

  it('freezes on the first score update', () => {
    expect(shouldFreezeMatchRulesSnapshot({
      segmentOperations: [{ sequence: 1, scores: { team_1: 1 } }],
    })).toBe(true);
  });

  it('freezes on the first incident update', () => {
    expect(shouldFreezeMatchRulesSnapshot({
      incidentOperations: [{ action: 'CREATE' }],
    })).toBe(true);
  });
});

describe('resolveMatchRules', () => {
  it('falls back to legacy set-based defaults when match rules are absent', () => {
    expect(resolveMatchRules({
      usesSets: true,
      setsPerMatch: 3,
      officialPositions: [{ id: 'ref', name: 'Referee' }],
    })).toEqual(expect.objectContaining({
      scoringModel: 'SETS',
      segmentCount: 3,
      segmentLabel: 'Set',
      officialRoles: ['Referee'],
      supportedIncidentTypes: ['POINT', 'DISCIPLINE', 'NOTE', 'ADMIN'],
      autoCreatePointIncidentType: 'POINT',
      pointIncidentRequiresParticipant: false,
    }));
  });

  it('lets event overrides replace the sport template', () => {
    expect(resolveMatchRules({
      sportTemplate: {
        scoringModel: 'PERIODS',
        segmentCount: 2,
        segmentLabel: 'Half',
        canUseOvertime: true,
        supportedIncidentTypes: ['POINT', 'DISCIPLINE'],
      },
      eventOverride: {
        segmentCount: 4,
        segmentLabel: 'Quarter',
        supportsOvertime: true,
        pointIncidentRequiresParticipant: true,
      },
      autoCreatePointMatchIncidents: true,
    })).toEqual(expect.objectContaining({
      scoringModel: 'PERIODS',
      segmentCount: 4,
      segmentLabel: 'Quarter',
      canUseOvertime: true,
      supportsOvertime: true,
      supportedIncidentTypes: ['POINT', 'DISCIPLINE'],
      pointIncidentRequiresParticipant: true,
    }));
  });

  it('treats automatic scoring incidents as the source of truth for player-recorded scoring', () => {
    expect(resolveMatchRules({
      sportTemplate: {
        scoringModel: 'PERIODS',
        segmentCount: 2,
        segmentLabel: 'Half',
        pointIncidentRequiresParticipant: false,
      },
      autoCreatePointMatchIncidents: true,
    })).toEqual(expect.objectContaining({
      pointIncidentRequiresParticipant: true,
    }));

    expect(resolveMatchRules({
      sportTemplate: {
        scoringModel: 'PERIODS',
        segmentCount: 2,
        segmentLabel: 'Half',
        pointIncidentRequiresParticipant: true,
      },
      autoCreatePointMatchIncidents: false,
    })).toEqual(expect.objectContaining({
      pointIncidentRequiresParticipant: false,
    }));
  });

  it('hides unsupported overtime and shootout paths even when stale event overrides are present', () => {
    expect(resolveMatchRules({
      sportTemplate: {
        scoringModel: 'SETS',
        segmentLabel: 'Set',
        canUseOvertime: false,
        canUseShootout: false,
      },
      eventOverride: {
        supportsOvertime: true,
        supportsShootout: true,
      },
    })).toEqual(expect.objectContaining({
      canUseOvertime: false,
      supportsOvertime: false,
      canUseShootout: false,
      supportsShootout: false,
    }));
  });

  it('turns off the draw path when a shootout or tiebreak path is enabled', () => {
    expect(resolveMatchRules({
      sportTemplate: {
        scoringModel: 'PERIODS',
        segmentCount: 2,
        segmentLabel: 'Half',
        supportsDraw: true,
        canUseShootout: true,
      },
      eventOverride: {
        supportsShootout: true,
      },
    })).toEqual(expect.objectContaining({
      supportsDraw: false,
      canUseShootout: true,
      supportsShootout: true,
    }));
  });

  it('promotes league playoff bracket matches to the configured winner set count', () => {
    expect(resolveMatchRulesForContext({
      baseRules: resolveMatchRules({
        usesSets: true,
        setsPerMatch: 1,
        winnerSetCount: 3,
        officialPositions: [{ id: 'ref', name: 'Referee' }],
      }),
      eventType: 'LEAGUE',
      usesSets: true,
      setsPerMatch: 1,
      winnerSetCount: 3,
      loserSetCount: 1,
      winnerNextMatchId: 'match_final',
      existingSegmentCount: 1,
      existingTeam1PointCount: 1,
      existingTeam2PointCount: 1,
      existingResultCount: 1,
    })).toEqual(expect.objectContaining({
      scoringModel: 'SETS',
      segmentCount: 3,
    }));
  });

  it('keeps loser bracket matches on the configured loser set count', () => {
    expect(resolveMatchRulesForContext({
      baseRules: resolveMatchRules({
        usesSets: true,
        setsPerMatch: 1,
        winnerSetCount: 3,
      }),
      eventType: 'TOURNAMENT',
      usesSets: true,
      setsPerMatch: 1,
      winnerSetCount: 3,
      loserSetCount: 1,
      losersBracket: true,
      existingSegmentCount: 1,
      existingTeam1PointCount: 1,
      existingTeam2PointCount: 1,
      existingResultCount: 1,
    })).toEqual(expect.objectContaining({
      scoringModel: 'SETS',
      segmentCount: 1,
    }));
  });
});
