import { screen } from '@testing-library/react';
import type { Team } from '@/types';
import type { TeamComplianceSummary, TeamComplianceUserSummary } from '@/lib/eventTeamCompliance';
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

  it('uses participant copy without team/player references for participant cards', () => {
    const participantUser: TeamComplianceUserSummary = {
      userId: 'user_1',
      fullName: 'Casey Rivers',
      userName: 'crivers',
      isMinorAtEvent: false,
      registrationType: 'ADULT',
      payment: {
        hasBill: false,
        billId: null,
        totalAmountCents: 0,
        paidAmountCents: 0,
        status: null,
        isPaidInFull: false,
      },
      documents: {
        signedCount: 0,
        requiredCount: 0,
      },
      requiredDocuments: [],
    };

    renderWithMantine(
      <DivisionTeamComplianceCard
        team={createTeam({ name: 'Casey Rivers', currentSize: 1, teamSize: 1 })}
        summary={{
          ...createSummary(),
          payment: {
            ...createSummary().payment,
            hasBill: false,
            billId: null,
            totalAmountCents: 0,
            paidAmountCents: 0,
            status: null,
            isPaidInFull: false,
          },
          users: [participantUser],
        }}
        cardKind="participant"
      />,
    );

    expect(screen.getByText('No bill yet')).toBeInTheDocument();
    expect(screen.queryByText('No team bill yet')).not.toBeInTheDocument();
    expect(screen.queryByText(/players/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/rostered user/i)).not.toBeInTheDocument();
  });

  it('shows pending payment before bill details when registration payment is processing', () => {
    renderWithMantine(
      <DivisionTeamComplianceCard
        team={createTeam()}
        summary={{
          ...createSummary(),
          payment: {
            hasBill: false,
            billId: null,
            totalAmountCents: 0,
            paidAmountCents: 0,
            status: null,
            isPaidInFull: false,
            paymentPending: true,
          },
        }}
      />,
    );

    expect(screen.getByText('Payment pending')).toBeInTheDocument();
    expect(screen.queryByText('No team bill yet')).not.toBeInTheDocument();
  });

  it('renders actions after all team compliance text', () => {
    renderWithMantine(
      <DivisionTeamComplianceCard
        team={createTeam()}
        summary={{
          ...createSummary(),
          payment: {
            ...createSummary().payment,
            hasBill: false,
            billId: null,
            totalAmountCents: 0,
            paidAmountCents: 0,
            status: null,
            isPaidInFull: false,
          },
          documents: {
            signedCount: 0,
            requiredCount: 0,
          },
          users: [
            {
              userId: 'user_1',
              fullName: 'Casey Rivers',
              userName: 'crivers',
              isMinorAtEvent: false,
              registrationType: 'ADULT',
              payment: createSummary().payment,
              documents: createSummary().documents,
              requiredDocuments: [],
            },
          ],
        }}
        actions={<button type="button">Manage billing</button>}
      />,
    );

    const rosteredText = screen.getByText('1 rostered user');
    const actionButton = screen.getByRole('button', { name: /manage billing/i });

    expect(rosteredText.compareDocumentPosition(actionButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('keeps action sizing from stretching the card', () => {
    renderWithMantine(
      <DivisionTeamComplianceCard
        team={createTeam()}
        summary={createSummary()}
        actions={<button type="button">Remove</button>}
      />,
    );

    expect(screen.getByTestId('division-team-compliance-card')).toHaveStyle({
      width: 'fit-content',
      maxWidth: '100%',
    });
    expect(screen.getByTestId('division-team-compliance-actions')).toHaveStyle({
      alignSelf: 'flex-start',
      display: 'inline-flex',
      maxWidth: '100%',
    });
  });
});
