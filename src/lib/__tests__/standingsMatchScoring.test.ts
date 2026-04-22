import { deriveStandingsMatchResult } from '@/lib/standingsMatchScoring';

describe('deriveStandingsMatchResult', () => {
  it('uses linked point incidents when player-recorded scoring is enabled', () => {
    const result = deriveStandingsMatchResult({
      team1: { $id: 'team_1' },
      team2: { $id: 'team_2' },
      team1Points: [9],
      team2Points: [1],
      setResults: [2],
      resolvedMatchRules: {
        scoringModel: 'POINTS_ONLY',
        pointIncidentRequiresParticipant: true,
      },
      segments: [
        {
          id: 'segment_1',
          sequence: 1,
          status: 'COMPLETE',
          winnerEventTeamId: 'team_1',
          scores: {
            team_1: 0,
            team_2: 0,
          },
        },
      ],
      incidents: [
        { segmentId: 'segment_1', eventTeamId: 'team_1', linkedPointDelta: 1, sequence: 1 },
        { segmentId: 'segment_1', eventTeamId: 'team_1', linkedPointDelta: 1, sequence: 2 },
        { segmentId: 'segment_1', eventTeamId: 'team_2', linkedPointDelta: 1, sequence: 3 },
      ],
    });

    expect(result.usesIncidentScoring).toBe(true);
    expect(result.team1Total).toBe(2);
    expect(result.team2Total).toBe(1);
    expect(result.team1Wins).toBe(1);
    expect(result.team2Wins).toBe(0);
    expect(result.outcome).toBe('team1');
  });

  it('falls back to legacy arrays when incident-driven scoring is disabled', () => {
    const result = deriveStandingsMatchResult({
      team1: { $id: 'team_1' },
      team2: { $id: 'team_2' },
      team1Points: [0],
      team2Points: [3],
      setResults: [2],
      resolvedMatchRules: {
        scoringModel: 'POINTS_ONLY',
        pointIncidentRequiresParticipant: false,
      },
      segments: [
        {
          id: 'segment_1',
          sequence: 1,
          status: 'COMPLETE',
          winnerEventTeamId: 'team_1',
          scores: {
            team_1: 0,
            team_2: 0,
          },
        },
      ],
      incidents: [
        { segmentId: 'segment_1', eventTeamId: 'team_1', linkedPointDelta: 2, sequence: 1 },
      ],
    });

    expect(result.usesIncidentScoring).toBe(false);
    expect(result.team1Total).toBe(0);
    expect(result.team2Total).toBe(3);
    expect(result.team1Wins).toBe(0);
    expect(result.team2Wins).toBe(1);
    expect(result.outcome).toBe('team2');
  });

  it('counts a points-based draw even when set results do not declare a winner', () => {
    const result = deriveStandingsMatchResult({
      team1: { $id: 'team_1' },
      team2: { $id: 'team_2' },
      team1Points: [2],
      team2Points: [2],
      setResults: [0],
      resolvedMatchRules: {
        scoringModel: 'POINTS_ONLY',
        pointIncidentRequiresParticipant: false,
      },
    });

    expect(result.team1Wins).toBe(0);
    expect(result.team2Wins).toBe(0);
    expect(result.outcome).toBe('draw');
  });
});
