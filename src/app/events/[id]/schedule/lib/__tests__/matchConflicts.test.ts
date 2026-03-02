import type { Match } from '@/types';
import { detectMatchConflictsById, resolveMatchConflictFieldId, toMatchWindow } from '../matchConflicts';

const buildMatch = (id: string, overrides: Partial<Match> = {}): Match => ({
  $id: id,
  start: '2026-03-01T10:00:00.000Z',
  end: '2026-03-01T11:00:00.000Z',
  fieldId: 'field_1',
  team1Points: [],
  team2Points: [],
  setResults: [],
  ...overrides,
});

describe('matchConflicts', () => {
  it('detects overlaps between matches on the same field', () => {
    const matches = [
      buildMatch('match_1', {
        start: '2026-03-01T10:00:00.000Z',
        end: '2026-03-01T11:00:00.000Z',
        fieldId: 'field_a',
      }),
      buildMatch('match_2', {
        start: '2026-03-01T10:30:00.000Z',
        end: '2026-03-01T11:30:00.000Z',
        fieldId: 'field_a',
      }),
      buildMatch('match_3', {
        start: '2026-03-01T11:00:00.000Z',
        end: '2026-03-01T12:00:00.000Z',
        fieldId: 'field_a',
      }),
    ];

    const conflicts = detectMatchConflictsById(matches);

    expect(conflicts.match_1).toEqual(['match_2']);
    expect(conflicts.match_2).toEqual(['match_1', 'match_3']);
    expect(conflicts.match_3).toEqual(['match_2']);
  });

  it('does not mark conflicts when fields differ', () => {
    const matches = [
      buildMatch('match_1', {
        start: '2026-03-01T10:00:00.000Z',
        end: '2026-03-01T11:00:00.000Z',
        fieldId: 'field_a',
      }),
      buildMatch('match_2', {
        start: '2026-03-01T10:30:00.000Z',
        end: '2026-03-01T11:30:00.000Z',
        fieldId: 'field_b',
      }),
    ];

    expect(detectMatchConflictsById(matches)).toEqual({});
  });

  it('resolves field id from hydrated relation before fieldId', () => {
    const match = buildMatch('match_1', {
      fieldId: 'field_from_column',
      field: {
        $id: 'field_from_relation',
      } as Match['field'],
    });

    expect(resolveMatchConflictFieldId(match)).toBe('field_from_relation');
  });

  it('defaults missing or invalid end times to a one-hour match window', () => {
    const match = buildMatch('match_1', {
      start: '2026-03-01T10:00:00.000Z',
      end: null,
    });

    const window = toMatchWindow(match);

    expect(window).not.toBeNull();
    expect(window?.endMs).toBe((window?.startMs ?? 0) + 60 * 60 * 1000);
  });
});
