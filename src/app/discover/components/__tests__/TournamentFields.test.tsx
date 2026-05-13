import { fireEvent, screen } from '@testing-library/react';
import TournamentFields from '../TournamentFields';
import { renderWithMantine } from '../../../../../test/utils/renderWithMantine';
import type { Sport, TournamentConfig } from '@/types';

const timedSport: Sport = {
  $id: 'sport-timed',
  name: 'Basketball',
  matchRulesTemplate: {
    scoringModel: 'PERIODS',
    segmentCount: 4,
    segmentLabel: 'Quarter',
  },
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
  matchRulesTemplate: {
    scoringModel: 'SETS',
    segmentCount: 3,
    segmentLabel: 'Set',
  },
  usePointsPerSetWin: true,
};

const soccerSport: Sport = {
  ...timedSport,
  $id: 'sport-soccer',
  name: 'Indoor Soccer',
  matchRulesTemplate: {
    scoringModel: 'PERIODS',
    segmentCount: 2,
    segmentLabel: 'Half',
  },
  usePointsPerSetWin: false,
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

  it('allows zero and blank set duration values while warning', () => {
    const setTournamentData = jest.fn();

    const { unmount } = renderWithMantine(
      <TournamentFields
        tournamentData={{
          ...baseTournamentData,
          usesSets: true,
          setDurationMinutes: 0,
        }}
        setTournamentData={setTournamentData}
        sport={setSport}
      />,
    );

    expect(screen.getByText('Set duration should be greater than 0 before scheduling.')).toBeInTheDocument();
    unmount();

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
    fireEvent.change(setDuration, { target: { value: '0' } });

    let lastCall = setTournamentData.mock.calls[setTournamentData.mock.calls.length - 1];
    let updater = lastCall?.[0] as
      | ((prev: TournamentConfig) => TournamentConfig)
      | undefined;
    expect(typeof updater).toBe('function');
    let next = updater?.({
      ...baseTournamentData,
      usesSets: true,
      setDurationMinutes: 20,
    });
    expect(next?.setDurationMinutes).toBe(0);

    fireEvent.change(setDuration, { target: { value: '' } });

    lastCall = setTournamentData.mock.calls[setTournamentData.mock.calls.length - 1];
    updater = lastCall?.[0] as
      | ((prev: TournamentConfig) => TournamentConfig)
      | undefined;
    expect(typeof updater).toBe('function');
    next = updater?.({
      ...baseTournamentData,
      usesSets: true,
      setDurationMinutes: 20,
    });
    expect(next?.setDurationMinutes).toBeUndefined();
  });

  it('keeps set-based controls when tournament config indicates sets even without sport metadata', () => {
    const setTournamentData = jest.fn();

    renderWithMantine(
      <TournamentFields
        tournamentData={{
          ...baseTournamentData,
          winnerSetCount: 3,
          winnerBracketPointsToVictory: [21, 21, 21],
          usesSets: true,
          setDurationMinutes: 20,
        }}
        setTournamentData={setTournamentData}
      />,
    );

    expect(screen.getByLabelText(/Set Duration \(minutes\)/i)).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /Winner Set Count/i })).toHaveValue('Best of 3');
    expect(screen.getByLabelText(/Set 3/i)).toBeInTheDocument();
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

  it('shows sport segment rules for period-based playoff settings without set controls', () => {
    const setTournamentData = jest.fn();

    renderWithMantine(
      <TournamentFields
        title="Playoff Configuration"
        tournamentData={baseTournamentData}
        setTournamentData={setTournamentData}
        sport={timedSport}
        showDurationControls={false}
      />,
    );

    expect(screen.getByText('Quarter Count')).toBeInTheDocument();
    expect(screen.getByText('4 Quarters from sport rules')).toBeInTheDocument();
    expect(screen.queryByLabelText(/Winner Set Count/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Set 1/i)).not.toBeInTheDocument();
  });

  it('uses the selected sport rules when stale playoff config still has set values', () => {
    const setTournamentData = jest.fn();
    const staleSetConfig: TournamentConfig = {
      ...baseTournamentData,
      winnerSetCount: 3,
      winnerBracketPointsToVictory: [21, 21, 15],
      usesSets: true,
      setDurationMinutes: 20,
    };

    const { unmount } = renderWithMantine(
      <TournamentFields
        title="Playoff Configuration"
        tournamentData={staleSetConfig}
        setTournamentData={setTournamentData}
        sport={setSport}
        showDurationControls={false}
      />,
    );

    expect(screen.getByRole('textbox', { name: /Winner Set Count/i })).toHaveValue('Best of 3');

    unmount();

    renderWithMantine(
      <TournamentFields
        title="Playoff Configuration"
        tournamentData={staleSetConfig}
        setTournamentData={setTournamentData}
        sport={soccerSport}
        showDurationControls={false}
      />,
    );

    expect(screen.getByText('Half Count')).toBeInTheDocument();
    expect(screen.getByText('2 Halves from sport rules')).toBeInTheDocument();
    expect(screen.queryByLabelText(/Winner Set Count/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Set 1/i)).not.toBeInTheDocument();
  });

  it('packs bracket point inputs into fixed-width auto-fit columns', () => {
    const setTournamentData = jest.fn();

    renderWithMantine(
      <TournamentFields
        title="Playoff Configuration"
        tournamentData={{
          ...baseTournamentData,
          doubleElimination: true,
          usesSets: true,
          winnerSetCount: 3,
          loserSetCount: 3,
          winnerBracketPointsToVictory: [25, 25, 15],
          loserBracketPointsToVictory: [21, 21, 15],
          setDurationMinutes: 20,
        }}
        setTournamentData={setTournamentData}
        sport={setSport}
        showDurationControls={false}
      />,
    );

    const winnerGrid = screen.getByTestId('winner-bracket-points-grid');
    const loserGrid = screen.getByTestId('loser-bracket-points-grid');

    expect(winnerGrid.children).toHaveLength(3);
    expect(loserGrid.children).toHaveLength(3);
    expect(winnerGrid.style.display).toBe('grid');
    expect(winnerGrid.style.gridTemplateColumns).toContain('auto-fit');
    expect(winnerGrid.style.justifyContent).toBe('start');
  });
});
