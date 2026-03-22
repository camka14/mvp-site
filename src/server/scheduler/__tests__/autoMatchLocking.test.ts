import { applyPersistentAutoLock, shouldAutoLockMatch } from '../updateMatch';

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
