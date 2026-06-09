import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithMantine } from '../../../../test/utils/renderWithMantine';
import { apiRequest } from '@/lib/apiClient';
import TeamFinancePanel from '../TeamFinancePanel';

jest.mock('@/lib/apiClient', () => ({
  apiRequest: jest.fn(),
  isApiRequestError: jest.fn(() => false),
}));

const financeResponse = {
  finance: {
    teamId: 'team_1',
    actualRevenueCents: 0,
    actualCostCents: 18000,
    actualProfitCents: -18000,
    futureCostCents: 4500,
    projectedProfitCents: -22500,
    eventRegistrationCostCents: 12000,
    staffCostCents: 6000,
    warnings: [],
    lineItems: [
      {
        id: 'team-bill:bill_1:paid',
        sourceType: 'bill',
        sourceId: 'bill_1',
        scope: 'TEAM',
        label: 'Event registration cost',
        category: 'team_registration',
        amountCents: -12000,
        classification: 'team_registration_cost',
        status: 'PAID',
        timing: 'ACTUAL',
        serviceStartAt: '2026-06-01T00:00:00.000Z',
        isGenerated: true,
      },
      {
        id: 'team-labor:labor_1',
        sourceType: 'labor',
        sourceId: 'labor_1',
        scope: 'TEAM',
        label: 'Casey Coach',
        category: 'labor',
        amountCents: -6000,
        classification: 'labor_cost',
        status: 'ACTUAL',
        timing: 'ACTUAL',
        serviceStartAt: '2026-06-01T18:00:00.000Z',
        serviceEndAt: '2026-06-01T20:00:00.000Z',
        isGenerated: true,
      },
      {
        id: 'custom:future_1',
        sourceType: 'custom_line_item',
        sourceId: 'future_1',
        scope: 'TEAM',
        label: 'Future uniforms',
        category: 'Equipment',
        amountCents: -4500,
        classification: 'custom_cost',
        status: 'ACTUAL',
        timing: 'FUTURE',
        serviceStartAt: '2026-07-01T00:00:00.000Z',
        isGenerated: false,
      },
    ],
  },
};

const staffOptionsResponse = {
  staffMembers: [
    {
      id: 'staff_1',
      userId: 'coach_1',
      roleId: 'role_coach',
      roleName: 'Coach',
      displayName: 'Casey Coach',
      types: ['STAFF'],
    },
  ],
};

describe('TeamFinancePanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders team finance summary and line items', async () => {
    (apiRequest as jest.Mock).mockResolvedValueOnce(financeResponse);

    renderWithMantine(
      <TeamFinancePanel
        teamId="team_1"
        organizationId="org_1"
        isActive
        canManage={false}
      />,
    );

    expect(await screen.findByText('Team cost analysis')).toBeInTheDocument();
    expect(screen.getAllByText('-$180.00').length).toBeGreaterThan(0);
    expect(screen.getAllByText('-$120.00').length).toBeGreaterThan(0);
    expect(screen.getAllByText('-$60.00').length).toBeGreaterThan(0);
    expect(screen.getAllByText('-$45.00').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Event registration cost').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Registration cost').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Staff cost').length).toBeGreaterThan(0);
    expect(apiRequest).toHaveBeenCalledWith('/api/teams/team_1/finance');
  });

  it('submits a custom team cost and refreshes finance', async () => {
    (apiRequest as jest.Mock)
      .mockResolvedValueOnce(financeResponse)
      .mockResolvedValueOnce(staffOptionsResponse)
      .mockResolvedValueOnce({ lineItem: { id: 'line_1' } })
      .mockResolvedValueOnce({
        finance: {
          ...financeResponse.finance,
          actualCostCents: 21500,
          actualProfitCents: -21500,
          projectedProfitCents: -26000,
          lineItems: [
            ...financeResponse.finance.lineItems,
            {
              id: 'custom:line_1',
              sourceType: 'custom_line_item',
              sourceId: 'line_1',
              scope: 'TEAM',
              label: 'Uniform order',
              category: 'Equipment',
              amountCents: -3500,
              classification: 'custom_cost',
              status: 'ACTUAL',
              timing: 'ACTUAL',
              serviceStartAt: '2026-07-15T00:00:00.000Z',
              isGenerated: false,
            },
          ],
        },
      });

    renderWithMantine(
      <TeamFinancePanel
        teamId="team_1"
        organizationId="org_1"
        isActive
        canManage
      />,
    );

    await screen.findByText('Add custom team cost');

    fireEvent.change(screen.getByLabelText('Title'), {
      target: { value: 'Uniform order' },
    });
    fireEvent.change(screen.getByLabelText('Category'), {
      target: { value: 'Equipment' },
    });
    fireEvent.change(screen.getByLabelText('Amount'), {
      target: { value: '35' },
    });
    fireEvent.change(screen.getByLabelText('Start date'), {
      target: { value: '2026-07-15' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add cost' }));

    await waitFor(() => {
      expect(apiRequest).toHaveBeenCalledWith('/api/organizations/org_1/finance/line-items', {
        method: 'POST',
        body: {
          scope: 'TEAM',
          teamId: 'team_1',
          category: 'Equipment',
          title: 'Uniform order',
          amountCents: 3500,
          status: 'ACTUAL',
          serviceStartAt: expect.stringContaining('2026-07-15'),
          serviceEndAt: null,
        },
      });
    });
    expect((await screen.findAllByText('Uniform order')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Custom').length).toBeGreaterThan(0);
  });

  it('submits a team staff labor cost and refreshes finance', async () => {
    (apiRequest as jest.Mock)
      .mockResolvedValueOnce(financeResponse)
      .mockResolvedValueOnce(staffOptionsResponse)
      .mockResolvedValueOnce({ laborEntry: { id: 'team_staff_labor_2' } })
      .mockResolvedValueOnce({
        finance: {
          ...financeResponse.finance,
          actualCostCents: 21000,
          actualProfitCents: -21000,
          staffCostCents: 9000,
          lineItems: [
            ...financeResponse.finance.lineItems,
            {
              id: 'team-labor:team_staff_labor_2',
              sourceType: 'labor',
              sourceId: 'team_staff_labor_2',
              scope: 'TEAM',
              label: 'Casey Coach',
              category: 'labor',
              amountCents: -3000,
              classification: 'labor_cost',
              status: 'PLANNED',
              timing: 'ACTUAL',
              serviceStartAt: '2026-07-01T20:00:00.000Z',
              serviceEndAt: '2026-07-01T21:00:00.000Z',
              isGenerated: true,
            },
          ],
        },
      });

    renderWithMantine(
      <TeamFinancePanel
        teamId="team_1"
        organizationId="org_1"
        isActive
        canManage
      />,
    );

    await screen.findByRole('button', { name: 'Add staff cost' });

    fireEvent.change(screen.getByLabelText('Labor date'), {
      target: { value: '2026-07-01' },
    });
    fireEvent.change(screen.getByLabelText('Start time'), {
      target: { value: '13:00' },
    });
    fireEvent.change(screen.getByLabelText('Paid minutes'), {
      target: { value: '60' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add staff cost' }));

    await waitFor(() => {
      expect(apiRequest).toHaveBeenCalledWith('/api/teams/team_1/finance/staff', {
        method: 'POST',
        body: {
          staffMemberId: 'staff_1',
          userId: 'coach_1',
          status: 'PLANNED',
          plannedStart: expect.stringContaining('2026-07-01'),
          plannedEnd: expect.stringContaining('2026-07-01'),
          plannedMinutes: 60,
          actualStart: null,
          actualEnd: null,
          actualMinutes: null,
          notes: null,
        },
      });
    });
    expect((await screen.findAllByText('Casey Coach')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Staff cost').length).toBeGreaterThan(0);
  });
});
