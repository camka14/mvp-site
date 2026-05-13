import { fireEvent, screen } from '@testing-library/react';
import { renderWithMantine } from '../../../../../../../test/utils/renderWithMantine';
import type { Sport } from '@/types';
import MatchRulesSection from '../MatchRulesSection';

const soccerSport = {
  $id: 'sport_soccer',
  name: 'Indoor Soccer',
  matchRulesTemplate: {
    scoringModel: 'PERIODS',
    segmentCount: 2,
    segmentLabel: 'Half',
    supportsDraw: true,
    supportsOvertime: false,
    canUseOvertime: true,
    supportsShootout: false,
    canUseShootout: true,
    supportedIncidentTypes: ['GOAL', 'DISCIPLINE', 'NOTE', 'ADMIN'],
    autoCreatePointIncidentType: 'GOAL',
  },
  $createdAt: '',
  $updatedAt: '',
} as Sport;

describe('MatchRulesSection', () => {
  it('keeps sport format fields read-only and removes stale segment-count overrides', () => {
    const handleChange = jest.fn();

    renderWithMantine(
      <MatchRulesSection
        sport={soccerSport}
        value={{ segmentCount: 4, supportsOvertime: true }}
        onChange={handleChange}
        autoCreatePointMatchIncidents={false}
        onAutoCreatePointMatchIncidentsChange={jest.fn()}
      />,
    );

    expect(screen.queryByText('Scoring model')).not.toBeInTheDocument();
    expect(screen.queryByText('Segment label')).not.toBeInTheDocument();
    expect(screen.queryByText('Point incident type')).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/half count/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(/allow overtime/i));

    expect(handleChange).toHaveBeenLastCalledWith(null);
  });

  it('does not write participant requirement overrides when automatic scoring incidents change', () => {
    const handleChange = jest.fn();
    const handleAutoCreateChange = jest.fn();

    renderWithMantine(
      <MatchRulesSection
        sport={soccerSport}
        value={null}
        onChange={handleChange}
        autoCreatePointMatchIncidents={false}
        onAutoCreatePointMatchIncidentsChange={handleAutoCreateChange}
      />,
    );

    fireEvent.click(screen.getByLabelText(/create a scoring incident/i));

    expect(handleAutoCreateChange).toHaveBeenLastCalledWith(true);
    expect(handleChange).toHaveBeenLastCalledWith(null);
  });
});
