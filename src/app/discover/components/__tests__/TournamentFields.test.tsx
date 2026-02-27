import { fireEvent, screen } from '@testing-library/react';
import TournamentFields from '../TournamentFields';
import { renderWithMantine } from '../../../../../test/utils/renderWithMantine';
import type { Sport, TournamentConfig } from '@/types';

const timedSport: Sport = {
  $id: 'sport-timed',
  name: 'Basketball',
  usePointsForWin: true,
  usePointsForDraw: false,
  usePointsForLoss: true,
  usePointsForForfeitWin: true,
  usePointsForForfeitLoss: true,
  usePointsPerSetWin: false,
  usePointsPerSetLoss: false,
  usePointsPerGameWin: false,
  usePointsPerGameLoss: false,
  usePointsPerGoalScored: false,
  divisions: [],
  attendees: 0,
};

const setSport: Sport = {
  ...timedSport,
  $id: 'sport-sets',
  name: 'Volleyball',
  usePointsPerSetWin: true,
};

const baseTournamentData: TournamentConfig = {
  doubleElimination: false,
  winnerSetCount: 1,
  loserSetCount: 1,
  winnerBracketPointsToVictory: [21],
  loserBracketPointsToVictory: [21],
  prize: '',
  fieldCount: 1,
  restTimeMinutes: 0,
  usesSets: false,
  matchDurationMinutes: 60,
  setDurationMinutes: undefined,
};

describe('TournamentFields', () => {
  it('shows match duration for non-set sports and updates tournament data', () => {
    const setTournamentData = jest.fn();

    renderWithMantine(
      <TournamentFields
        tournamentData={baseTournamentData}
        setTournamentData={setTournamentData}
        sport={timedSport}
      />,
    );

    const matchDuration = screen.getByLabelText(/Match Duration \(minutes\)/i);
    fireEvent.change(matchDuration, { target: { value: '75' } });

    const lastCall = setTournamentData.mock.calls[setTournamentData.mock.calls.length - 1];
    const updater = lastCall?.[0] as
      | ((prev: TournamentConfig) => TournamentConfig)
      | undefined;
    expect(typeof updater).toBe('function');
    const next = updater?.(baseTournamentData);
    expect(next?.matchDurationMinutes).toBe(75);
    expect(next?.setDurationMinutes).toBeUndefined();
  });

  it('shows set duration for set-based sports and updates tournament data', () => {
    const setTournamentData = jest.fn();

    renderWithMantine(
      <TournamentFields
        tournamentData={{
          ...baseTournamentData,
          usesSets: true,
          setDurationMinutes: 20,
        }}
        setTournamentData={setTournamentData}
        sport={setSport}
      />,
    );

    const setDuration = screen.getByLabelText(/Set Duration \(minutes\)/i);
    fireEvent.change(setDuration, { target: { value: '30' } });

    const lastCall = setTournamentData.mock.calls[setTournamentData.mock.calls.length - 1];
    const updater = lastCall?.[0] as
      | ((prev: TournamentConfig) => TournamentConfig)
      | undefined;
    expect(typeof updater).toBe('function');
    const next = updater?.({
      ...baseTournamentData,
      usesSets: true,
      setDurationMinutes: 20,
    });
    expect(next?.setDurationMinutes).toBe(30);
  });

  it('hides duration controls when showDurationControls is false', () => {
    const setTournamentData = jest.fn();

    renderWithMantine(
      <TournamentFields
        tournamentData={baseTournamentData}
        setTournamentData={setTournamentData}
        sport={timedSport}
        showDurationControls={false}
      />,
    );

    expect(screen.queryByLabelText(/Match Duration \(minutes\)/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Set Duration \(minutes\)/i)).not.toBeInTheDocument();
  });
});
