import { resolveTournamentSetMode } from '../tournamentSetMode';

describe('resolveTournamentSetMode', () => {
  it('uses sport requirements when available', () => {
    expect(resolveTournamentSetMode(true, {})).toBe(true);
  });

  it('falls back to config signals when sport flags are unavailable', () => {
    expect(
      resolveTournamentSetMode(false, {
        winnerSetCount: 3,
        usesSets: false,
      }),
    ).toBe(true);
  });

  it('stays false for timed matches without set-based signals', () => {
    expect(
      resolveTournamentSetMode(false, {
        winnerSetCount: 1,
        loserSetCount: 1,
        winnerBracketPointsToVictory: [21],
        loserBracketPointsToVictory: [21],
        setDurationMinutes: undefined,
        usesSets: false,
      }),
    ).toBe(false);
  });
});
