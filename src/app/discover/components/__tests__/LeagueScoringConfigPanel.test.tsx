import { screen } from '@testing-library/react';
import LeagueScoringConfigPanel from '../LeagueScoringConfigPanel';
import { renderWithMantine } from '../../../../../test/utils/renderWithMantine';
import { createLeagueScoringConfig, createSport } from '@/types/defaults';

const ALL_SCORING_LABELS = [
  'Points for Win',
  'Points for Draw',
  'Points for Loss',
  'Points per Set Win',
  'Points per Set Loss',
  'Points per Game Win',
  'Points per Game Loss',
  'Points per Goal Scored',
  'Points per Goal Conceded',
];

describe('LeagueScoringConfigPanel', () => {
  it('renders all league scoring fields when sport enables them', () => {
    const sport = createSport({
      usePointsForWin: true,
      usePointsForDraw: true,
      usePointsForLoss: true,
      usePointsPerSetWin: true,
      usePointsPerSetLoss: true,
      usePointsPerGameWin: true,
      usePointsPerGameLoss: true,
      usePointsPerGoalScored: true,
      usePointsPerGoalConceded: true,
    });

    renderWithMantine(
      <LeagueScoringConfigPanel
        value={createLeagueScoringConfig()}
        sport={sport}
      />,
    );

    ALL_SCORING_LABELS.forEach((label) => {
      expect(screen.getByText(label)).toBeInTheDocument();
    });
  });

  it('hides fields that are disabled in sport config', () => {
    const sport = createSport({
      usePointsForWin: true,
      usePointsForLoss: true,
      usePointsForDraw: false,
      usePointsPerSetWin: false,
      usePointsPerSetLoss: false,
      usePointsPerGameWin: false,
      usePointsPerGameLoss: false,
      usePointsPerGoalScored: false,
      usePointsPerGoalConceded: false,
    });

    renderWithMantine(
      <LeagueScoringConfigPanel
        value={createLeagueScoringConfig()}
        sport={sport}
      />,
    );

    expect(screen.getByText('Points for Win')).toBeInTheDocument();
    expect(screen.getByText('Points for Loss')).toBeInTheDocument();
    expect(screen.queryByText('Points for Draw')).not.toBeInTheDocument();
    expect(screen.queryByText('Points per Set Win')).not.toBeInTheDocument();
    expect(screen.queryByText('Points per Set Loss')).not.toBeInTheDocument();
    expect(screen.queryByText('Points per Game Win')).not.toBeInTheDocument();
    expect(screen.queryByText('Points per Game Loss')).not.toBeInTheDocument();
    expect(screen.queryByText('Points per Goal Scored')).not.toBeInTheDocument();
    expect(screen.queryByText('Points per Goal Conceded')).not.toBeInTheDocument();
  });
});
