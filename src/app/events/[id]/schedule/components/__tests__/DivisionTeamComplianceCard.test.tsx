import { screen } from '@testing-library/react';
import type { Team } from '@/types';
import type { TeamComplianceSummary } from '@/lib/eventTeamCompliance';
import { renderWithMantine } from '../../../../../../../test/utils/renderWithMantine';
import DivisionTeamComplianceCard from '../DivisionTeamComplianceCard';

const createTeam = (overrides: Partial<Team> = {}): Team => ({
  $id: 'team_1',
  name: 'Sandstorm Syndicate',
  division: 'open',
  divisionTypeId: undefined,
  divisionTypeName: undefined,
  sport: 'Beach Volleyball',
  playerIds: [],
  captainId: 'captain_1',
  managerId: 'manager_1',
  headCoachId: null,
  assistantCoachIds: [],
  coachIds: [],
  parentTeamId: null,
  pending: [],
  teamSize: 2,
  profileImageId: undefined,
  players: [],
  captain: undefined,
  manager: undefined,
  headCoach: undefined,
  assistantCoaches: [],
  coaches: [],
  pendingPlayers: [],
  matches: [],
  currentSize: 2,
  isFull: true,
  avatarUrl: '',
  ...overrides,
});

const createSummary = (): TeamComplianceSummary => ({
  teamId: 'team_1',
  teamName: 'Sandstorm Syndicate',
  payment: {
    hasBill: true,
    billId: 'bill_1',
    totalAmountCents: 5000,
    paidAmountCents: 5000,
    status: 'PAID',
    isPaidInFull: true,
    inheritedFromTeamBill: false,
  },
  documents: {
    signedCount: 1,
    requiredCount: 1,
  },
  users: [],
});

describe('DivisionTeamComplianceCard', () => {
  it('renders compliance text by default', () => {
    renderWithMantine(
      <DivisionTeamComplianceCard
        team={createTeam()}
        summary={createSummary()}
      />,
    );

    expect(screen.getByText(/Paid in full/i)).toBeInTheDocument();
    expect(screen.getByText('1/1 signatures complete')).toBeInTheDocument();
  });

  it('hides compliance text when showComplianceDetails is false', () => {
    renderWithMantine(
      <DivisionTeamComplianceCard
        team={createTeam()}
        summary={createSummary()}
        showComplianceDetails={false}
      />,
    );

    expect(screen.queryByText(/Paid in full/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/signatures complete/i)).not.toBeInTheDocument();
    expect(screen.getByText('Sandstorm Syndicate')).toBeInTheDocument();
  });
});
