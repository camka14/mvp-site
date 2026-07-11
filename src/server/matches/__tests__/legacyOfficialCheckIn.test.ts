import { normalizeLegacyOfficialCheckIn } from '@/server/matches/legacyOfficialCheckIn';

describe('normalizeLegacyOfficialCheckIn', () => {
  it('converts a legacy official bulk update into only an official check-in operation', () => {
    const normalized = normalizeLegacyOfficialCheckIn(
      {
        officialCheckedIn: true,
        team1Points: [0, 0, 0],
        team2Points: [0, 0, 0],
        setResults: [0, 0, 0],
        segmentOperations: [{ sequence: 1, status: 'NOT_STARTED', scores: {} }],
      },
      { isHostOrAdmin: false, isOfficial: true },
    );

    expect(normalized).toEqual({ officialCheckIn: { checkedIn: true } });
  });

  it('preserves a set confirmation from a checked-in official', () => {
    const confirmation = {
      officialCheckedIn: true,
      team1Points: [17, 0, 0],
      team2Points: [21, 0, 0],
      setResults: [2, 0, 0],
      segmentOperations: [{
        sequence: 1,
        status: 'COMPLETE',
        scores: { team1: 17, team2: 21 },
        winnerEventTeamId: 'team2',
      }],
    };

    expect(normalizeLegacyOfficialCheckIn(confirmation, { isHostOrAdmin: false, isOfficial: true }))
      .toBe(confirmation);
  });

  it('leaves explicit official check-in operations and privileged updates unchanged', () => {
    const explicitOperation = { officialCheckIn: { checkedIn: true }, team1Points: [0] };
    const hostUpdate = { officialCheckedIn: true, team1Points: [0] };

    expect(normalizeLegacyOfficialCheckIn(explicitOperation, { isHostOrAdmin: false, isOfficial: true }))
      .toBe(explicitOperation);
    expect(normalizeLegacyOfficialCheckIn(hostUpdate, { isHostOrAdmin: true, isOfficial: true }))
      .toBe(hostUpdate);
  });

  it('does not let a non-official convert a bulk update into a check-in operation', () => {
    const update = { officialCheckedIn: true, team1Points: [0] };

    expect(normalizeLegacyOfficialCheckIn(update, { isHostOrAdmin: false, isOfficial: false }))
      .toBe(update);
  });
});
