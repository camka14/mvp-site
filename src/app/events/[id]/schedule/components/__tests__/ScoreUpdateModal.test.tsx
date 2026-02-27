import { fireEvent, screen, waitFor } from '@testing-library/react';

import type { Event, Match } from '@/types';

import ScoreUpdateModal from '../ScoreUpdateModal';
import { renderWithMantine } from '../../../../../../../test/utils/renderWithMantine';

const buildEvent = (overrides: Partial<Event> = {}): Event => ({
  $id: 'event_1',
  eventType: 'LEAGUE',
  sport: {
    usePointsForDraw: false,
  } as Event['sport'],
  usesSets: false,
  winnerSetCount: 3,
  loserSetCount: 3,
  winnerBracketPointsToVictory: [21, 21, 15],
  loserBracketPointsToVictory: [21, 21, 15],
  ...overrides,
} as Event);

const buildMatch = (overrides: Partial<Match> = {}): Match => ({
  $id: 'match_1',
  matchId: 1,
  start: '2026-03-01T10:00:00.000Z',
  end: '2026-03-01T11:00:00.000Z',
  team1Points: [0, 0, 0],
  team2Points: [0, 0, 0],
  setResults: [0, 0, 0],
  losersBracket: false,
  previousLeftId: 'previous_match',
  ...overrides,
} as Match);

describe('ScoreUpdateModal', () => {
  it('uses a single set for timed events and keeps Save Match available', () => {
    renderWithMantine(
      <ScoreUpdateModal
        match={buildMatch()}
        tournament={buildEvent()}
        canManage
        onClose={jest.fn()}
        isOpen
      />,
    );

    expect(screen.getByText(/Best of 1/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save Match' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: /Confirm Set/i })).not.toBeInTheDocument();
  });

  it('writes a single-set winner when saving a timed match score', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);

    renderWithMantine(
      <ScoreUpdateModal
        match={buildMatch({
          team1Points: [3, 0, 0],
          team2Points: [1, 0, 0],
          setResults: [0, 0, 0],
        })}
        tournament={buildEvent()}
        canManage
        onSubmit={onSubmit}
        onClose={jest.fn()}
        isOpen
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Save Match' }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith('match_1', [3], [1], [1]);
    });
  });

  it('shows a field location toggle and expands the embedded map', () => {
    renderWithMantine(
      <ScoreUpdateModal
        match={buildMatch({
          field: {
            $id: 'field_1',
            name: 'Court 1',
            location: '123 Demo St',
            lat: 45.5,
            long: -122.6,
          } as Match['field'],
        })}
        tournament={buildEvent({
          location: 'Fallback Event Location',
          coordinates: [45.4, -122.7],
        } as Partial<Event>)}
        canManage={false}
        onClose={jest.fn()}
        isOpen
      />,
    );

    expect(screen.getByRole('button', { name: 'View Field Location' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'View Field Location' }));
    expect(screen.getByTitle('Match field location preview')).toBeInTheDocument();
  });
});
