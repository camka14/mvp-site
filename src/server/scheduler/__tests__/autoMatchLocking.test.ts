import { applyMatchUpdates, applyPersistentAutoLock, shouldAutoLockMatch } from '../updateMatch';

type MatchShape = {
  locked: boolean;
  officialCheckedIn?: boolean;
  start?: Date | null;
};

const createMatch = (overrides: Partial<MatchShape> = {}): MatchShape => ({
  locked: false,
  officialCheckedIn: false,
  start: null,
  ...overrides,
});

describe('automatic persistent match locking', () => {
  it('locks matches when official has checked in', () => {
    const now = new Date('2026-02-26T12:00:00.000Z');
    const match = createMatch({
      locked: false,
      officialCheckedIn: true,
      start: new Date('2026-02-26T13:00:00.000Z'),
    });

    expect(shouldAutoLockMatch(match as any, now)).toBe(true);
    const changed = applyPersistentAutoLock(match as any, { now });

    expect(changed).toBe(true);
    expect(match.locked).toBe(true);
  });

  it('locks matches that have started', () => {
    const now = new Date('2026-02-26T12:00:00.000Z');
    const match = createMatch({
      locked: false,
      officialCheckedIn: false,
      start: new Date('2026-02-26T11:59:00.000Z'),
    });

    expect(shouldAutoLockMatch(match as any, now)).toBe(true);
    const changed = applyPersistentAutoLock(match as any, { now });

    expect(changed).toBe(true);
    expect(match.locked).toBe(true);
  });

  it('does not auto-lock when host explicitly unlocks a match', () => {
    const now = new Date('2026-02-26T12:00:00.000Z');
    const match = createMatch({
      locked: false,
      officialCheckedIn: true,
      start: new Date('2026-02-26T11:00:00.000Z'),
    });

    const changed = applyPersistentAutoLock(match as any, {
      now,
      explicitLockedValue: false,
    });

    expect(changed).toBe(false);
    expect(match.locked).toBe(false);
  });
});

describe('match official check-in updates', () => {
  it('keeps explicit team-official check-in when empty user-official assignments are synced', () => {
    const match = {
      id: 'match_1',
      official: null,
      officialAssignments: [],
      officialCheckedIn: false,
    };
    const event = {
      officials: [],
      teams: {},
      fields: {},
      matches: { match_1: match },
    };

    applyMatchUpdates(event as any, match as any, {
      officialCheckedIn: true,
      officialAssignments: [],
    });

    expect(match.officialAssignments).toEqual([]);
    expect(match.officialCheckedIn).toBe(true);
  });

  it('derives check-in from non-empty user-official assignments', () => {
    const match = {
      id: 'match_1',
      official: null,
      officialAssignments: [],
      officialCheckedIn: true,
    };
    const official = { id: 'official_1', matches: [] };
    const event = {
      officials: [official],
      teams: {},
      fields: {},
      matches: { match_1: match },
    };

    applyMatchUpdates(event as any, match as any, {
      officialCheckedIn: true,
      officialAssignments: [{
        positionId: 'referee',
        slotIndex: 0,
        holderType: 'OFFICIAL',
        userId: 'official_1',
        checkedIn: false,
        hasConflict: false,
      }],
    });

    expect(match.official).toBe(official);
    expect(match.officialCheckedIn).toBe(false);
  });
});
