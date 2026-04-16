import {
  resolveMatchRules,
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
        supportedIncidentTypes: ['POINT', 'DISCIPLINE'],
      },
      eventOverride: {
        segmentCount: 4,
        segmentLabel: 'Quarter',
        pointIncidentRequiresParticipant: true,
      },
    })).toEqual(expect.objectContaining({
      scoringModel: 'PERIODS',
      segmentCount: 4,
      segmentLabel: 'Quarter',
      supportedIncidentTypes: ['POINT', 'DISCIPLINE'],
      pointIncidentRequiresParticipant: true,
    }));
  });
});
