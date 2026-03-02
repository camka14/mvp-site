import { createElement } from 'react';
import { screen } from '@testing-library/react';

import type { Match } from '@/types';

import MatchCard, { resolveDivisionLabel } from '../MatchCard';
import { renderWithMantine } from '../../../../../../../test/utils/renderWithMantine';

const buildMatch = (overrides: Partial<Match> = {}): Match => ({
  $id: 'match_1',
  matchId: 1,
  start: '2026-03-01T10:00:00.000Z',
  end: '2026-03-01T11:00:00.000Z',
  team1Points: [],
  team2Points: [],
  setResults: [],
  ...overrides,
});

describe('resolveDivisionLabel', () => {
  it('returns explicit division names from hydrated objects', () => {
    const label = resolveDivisionLabel({ name: '  Premier  ' } as any);
    expect(label).toBe('Premier');
  });

  it('infers a display label when division is a string identifier', () => {
    const label = resolveDivisionLabel('open');
    expect(label).not.toBe('TBD');
    expect(label.toLowerCase()).toContain('open');
  });

  it('infers a display label when division object has only an id', () => {
    const label = resolveDivisionLabel({ id: 'rec' } as any);
    expect(label).not.toBe('TBD');
    expect(label.toLowerCase()).toContain('rec');
  });

  it('returns TBD for empty/unsupported values', () => {
    expect(resolveDivisionLabel(undefined)).toBe('TBD');
    expect(resolveDivisionLabel(null)).toBe('TBD');
    expect(resolveDivisionLabel('   ')).toBe('TBD');
  });
});

describe('MatchCard conflict rendering', () => {
  it('shows a red border and no inline conflict message when match has a field-time conflict', () => {
    renderWithMantine(
      createElement(MatchCard, {
        match: buildMatch(),
        hasConflict: true,
      }),
    );

    expect(screen.queryByText(/there is a conflict/i)).not.toBeInTheDocument();
    expect(screen.getByText('Match #1').closest('div.relative')).toHaveClass('border-red-400');
  });
});
