import {
  applyStandingsDraftPointsInOrder,
  buildStandingsOverrideSave,
  normalizeStandingsDraftInput,
  standingsOverrideReadbackMatches,
  type StandingsDraftOverrides,
  updateStandingsDraftInput,
} from '../standingsOverrideDraft';

const rows = [
  { teamId: 'team-a', teamName: 'Alpha', basePoints: 6, finalPoints: 6 },
  { teamId: 'team-b', teamName: 'Bravo', basePoints: 4, finalPoints: 9 },
  { teamId: 'team-c', teamName: 'Charlie', basePoints: 2, finalPoints: 2 },
];

describe('standings override drafts', () => {
  it('keeps an empty field invalid instead of coercing it to zero', () => {
    expect(normalizeStandingsDraftInput('')).toBe('');

    const result = buildStandingsOverrideSave({
      rows,
      existingOverrides: { 'team-b': 9 },
      draftOverrides: { 'team-a': '' },
    });

    expect(result.invalidTeamIds).toEqual(['team-a']);
    expect(result.updates).toEqual([]);
    expect(result.expectedOverrides).toEqual({ 'team-b': 9 });
  });

  it('does not clear an existing override merely because its draft key is absent', () => {
    const result = buildStandingsOverrideSave({
      rows,
      existingOverrides: { 'team-b': 9 },
      draftOverrides: {},
    });

    expect(result.invalidTeamIds).toEqual([]);
    expect(result.updates).toEqual([]);
    expect(result.expectedOverrides).toEqual({ 'team-b': 9 });
  });

  it('preserves explicit zero and clears an override only when base points are explicitly entered', () => {
    const draftOverrides: StandingsDraftOverrides = {
      'team-a': 0,
      'team-b': 4,
    };

    const result = buildStandingsOverrideSave({
      rows,
      existingOverrides: { 'team-b': 9 },
      draftOverrides,
    });

    expect(result.invalidTeamIds).toEqual([]);
    expect(result.updates).toEqual([
      { teamId: 'team-a', points: 0 },
      { teamId: 'team-b', points: null },
    ]);
    expect(result.expectedOverrides).toEqual({ 'team-a': 0 });
  });

  it('requires the authoritative readback to match the submitted snapshot', () => {
    expect(standingsOverrideReadbackMatches(
      { 'team-a': 0, 'team-c': 12 },
      { 'team-c': 12, 'team-a': 0 },
    )).toBe(true);
    expect(standingsOverrideReadbackMatches(
      { 'team-a': 0, 'team-c': 12 },
      { 'team-a': 0, 'team-c': 2 },
    )).toBe(false);
  });

  it('keeps row identity stable while draft points would change the ranking', () => {
    const result = applyStandingsDraftPointsInOrder(rows, {
      'team-a': 0,
      'team-c': 12,
    });

    expect(result.map((row) => row.teamId)).toEqual(['team-a', 'team-b', 'team-c']);
    expect(result.map((row) => row.finalPoints)).toEqual([0, 9, 12]);
  });

  it('includes the latest synchronous draft snapshot in an immediate save', () => {
    const firstEdit = updateStandingsDraftInput({}, 'team-a', 7);
    const finalEdit = updateStandingsDraftInput(firstEdit, 'team-a', 8);
    const result = buildStandingsOverrideSave({
      rows,
      existingOverrides: {},
      draftOverrides: finalEdit,
    });

    expect(result.updates).toEqual([{ teamId: 'team-a', points: 8 }]);
    expect(result.expectedOverrides).toEqual({ 'team-a': 8 });
  });
});
