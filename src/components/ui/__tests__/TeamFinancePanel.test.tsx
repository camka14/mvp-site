import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithMantine } from '../../../../test/utils/renderWithMantine';
import { apiRequest } from '@/lib/apiClient';
import TeamFinancePanel from '../TeamFinancePanel';

const routerPushMock = jest.fn();

jest.mock('@/lib/apiClient', () => ({
  apiRequest: jest.fn(),
  isApiRequestError: jest.fn(() => false),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: routerPushMock,
  }),
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
        label: 'Summer League - Harbor Strikers',
        sourceName: 'Summer League',
        sourceEntityType: 'event',
        sourceEntityId: 'event_1',
        customerType: 'teams',
        customerId: 'team_1',
        customerName: 'Harbor Strikers',
        category: 'team_registration',
        amountCents: -12000,
        quantity: 1,
        unitLabel: 'registration',
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
        sourceName: 'Harbor Strikers',
        sourceEntityType: 'team',
        sourceEntityId: 'team_1',
        customerType: 'users',
        customerId: 'coach_1',
        customerName: 'Casey Coach',
        category: 'labor',
        amountCents: -6000,
        quantity: 2,
        unitLabel: 'hours',
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
        description: 'Away kit order',
        category: 'Equipment',
        amountCents: -4500,
        quantity: 12,
        unitLabel: 'kits',
        classification: 'custom_cost',
        status: 'ACTUAL',
        timing: 'FUTURE',
        serviceStartAt: '2026-07-01T12:00:00.000Z',
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

const mockTeamFinanceApi = ({
  initialFinance = financeResponse,
  financeAfterLineItem,
  financeAfterStaff,
}: {
  initialFinance?: typeof financeResponse;
  financeAfterLineItem?: typeof financeResponse;
  financeAfterStaff?: typeof financeResponse;
} = {}) => {
  let currentFinance = initialFinance;
  (apiRequest as jest.Mock).mockImplementation((url: string, options?: { method?: string }) => {
    if (url === '/api/teams/team_1/finance') {
      return Promise.resolve(currentFinance);
    }
    if (url === '/api/teams/team_1/finance/staff' && options?.method === 'POST') {
      if (financeAfterStaff) {
        currentFinance = financeAfterStaff;
      }
      return Promise.resolve({ laborEntry: { id: 'team_staff_labor_2' } });
    }
    if (url === '/api/teams/team_1/finance/staff') {
      return Promise.resolve(staffOptionsResponse);
    }
    if (url === '/api/organizations/org_1/finance/line-items' && options?.method === 'POST') {
      if (financeAfterLineItem) {
        currentFinance = financeAfterLineItem;
      }
      return Promise.resolve({ lineItem: { id: 'line_1' } });
    }
    if (url === '/api/organizations/org_1/finance/line-items/future_1' && options?.method === 'PATCH') {
      if (financeAfterLineItem) {
        currentFinance = financeAfterLineItem;
      }
      return Promise.resolve({ lineItem: { id: 'future_1' } });
    }
    throw new Error(`Unhandled apiRequest: ${url}`);
  });
};

describe('TeamFinancePanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    routerPushMock.mockClear();
  });

  it('renders team finance summary and line items', async () => {
    mockTeamFinanceApi();

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
    expect(screen.getAllByText('Summer League - Harbor Strikers').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Registration cost').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Staff cost').length).toBeGreaterThan(0);
    expect(screen.getAllByText('1 registration').length).toBeGreaterThan(0);
    expect(screen.getAllByText('2 hours').length).toBeGreaterThan(0);
    expect(apiRequest).toHaveBeenCalledWith('/api/teams/team_1/finance');
  });

  it('submits a custom team cost and refreshes finance', async () => {
    mockTeamFinanceApi({
      financeAfterLineItem: {
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
              quantity: 2,
              unitLabel: 'kits',
              classification: 'custom_cost',
              status: 'ACTUAL',
              timing: 'ACTUAL',
              serviceStartAt: '2026-07-15T00:00:00.000Z',
              isGenerated: false,
            },
          ],
        },
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

    fireEvent.click(await screen.findByRole('button', { name: 'Add custom cost' }));
    const customCostDialog = await screen.findByRole('dialog', { name: 'Add custom team cost' });

    fireEvent.change(screen.getByLabelText('Title'), {
      target: { value: 'Uniform order' },
    });
    fireEvent.change(within(customCostDialog).getByRole('textbox', { name: 'Category' }), {
      target: { value: 'Equipment' },
    });
    fireEvent.change(screen.getByLabelText('Amount'), {
      target: { value: '35' },
    });
    fireEvent.change(screen.getByLabelText('Quantity'), {
      target: { value: '2' },
    });
    fireEvent.change(screen.getByLabelText('Unit'), {
      target: { value: 'kits' },
    });
    fireEvent.change(screen.getByLabelText('Start date'), {
      target: { value: '2026-07-15' },
    });
    fireEvent.click(within(customCostDialog).getByRole('button', { name: 'Add cost' }));

    await waitFor(() => {
      expect(apiRequest).toHaveBeenCalledWith('/api/organizations/org_1/finance/line-items', {
        method: 'POST',
        body: {
          scope: 'TEAM',
          teamId: 'team_1',
          category: 'Equipment',
          title: 'Uniform order',
          description: null,
          amountCents: 3500,
          quantity: 2,
          unitLabel: 'kits',
          status: 'ACTUAL',
          occurredAt: expect.stringContaining('2026-07-15'),
          serviceStartAt: expect.stringContaining('2026-07-15'),
          serviceEndAt: null,
        },
      });
    });
    expect((await screen.findAllByText('Uniform order')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Custom').length).toBeGreaterThan(0);
  });

  it('edits a custom team cost from the line items table', async () => {
    mockTeamFinanceApi({
      financeAfterLineItem: {
        finance: {
          ...financeResponse.finance,
          lineItems: financeResponse.finance.lineItems.map((item) => (
            item.sourceId === 'future_1'
              ? {
                ...item,
                label: 'Updated uniforms',
                category: 'Apparel',
                amountCents: -5250,
                quantity: 14,
                unitLabel: 'kits',
              }
              : item
          )),
        },
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

    const editableRows = await screen.findAllByTestId('team-finance-line-item-future_1');
    fireEvent.click(editableRows[0]);
    const editDialog = await screen.findByRole('dialog', { name: 'Edit custom team cost' });

    fireEvent.change(within(editDialog).getByLabelText('Title'), {
      target: { value: 'Updated uniforms' },
    });
    fireEvent.change(within(editDialog).getByRole('textbox', { name: 'Category' }), {
      target: { value: 'Apparel' },
    });
    fireEvent.change(within(editDialog).getByLabelText('Amount'), {
      target: { value: '52.50' },
    });
    fireEvent.change(within(editDialog).getByLabelText('Quantity'), {
      target: { value: '14' },
    });
    fireEvent.change(within(editDialog).getByLabelText('Unit'), {
      target: { value: 'kits' },
    });
    fireEvent.click(within(editDialog).getByRole('button', { name: 'Save cost' }));

    await waitFor(() => {
      expect(apiRequest).toHaveBeenCalledWith('/api/organizations/org_1/finance/line-items/future_1', {
        method: 'PATCH',
        body: {
          category: 'Apparel',
          title: 'Updated uniforms',
          description: 'Away kit order',
          amountCents: 5250,
          quantity: 14,
          unitLabel: 'kits',
          status: 'ACTUAL',
          occurredAt: expect.any(String),
          serviceStartAt: expect.any(String),
          serviceEndAt: null,
        },
      });
    });
    expect((await screen.findAllByText('Updated uniforms')).length).toBeGreaterThan(0);
  });

  it('opens generated row actions and navigates to the source target', async () => {
    mockTeamFinanceApi();

    renderWithMantine(
      <TeamFinancePanel
        teamId="team_1"
        organizationId="org_1"
        isActive
        canManage
      />,
    );

    const actionButtons = await screen.findAllByRole('button', {
      name: 'Open actions for Summer League - Harbor Strikers',
    });
    fireEvent.click(actionButtons[0]);
    fireEvent.click(await screen.findByRole('button', { name: 'Go to "Summer League"' }));
    expect(routerPushMock).toHaveBeenCalledWith('/events/event_1?tab=details');
  });

  it('opens generated row actions and navigates to the customer target', async () => {
    mockTeamFinanceApi();

    renderWithMantine(
      <TeamFinancePanel
        teamId="team_1"
        organizationId="org_1"
        isActive
        canManage
      />,
    );

    const actionButtons = await screen.findAllByRole('button', {
      name: 'Open actions for Summer League - Harbor Strikers',
    });
    fireEvent.click(actionButtons[0]);
    const customerButtons = await screen.findAllByRole('button', {
      name: 'Go to "Harbor Strikers"',
      hidden: true,
    });
    fireEvent.click(customerButtons[0]);
    expect(routerPushMock).toHaveBeenCalledWith('/organizations/org_1/customers/teams/team_1');
  });

  it('submits a team staff labor cost and refreshes finance', async () => {
    mockTeamFinanceApi({
      financeAfterStaff: {
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

    fireEvent.click(await screen.findByRole('button', { name: 'Add staff cost' }));
    const staffCostDialog = await screen.findByRole('dialog', { name: 'Add team staff cost' });

    fireEvent.change(screen.getByLabelText('Labor date'), {
      target: { value: '2026-07-01' },
    });
    fireEvent.change(screen.getByLabelText('Start time'), {
      target: { value: '13:00' },
    });
    fireEvent.change(screen.getByLabelText('Paid minutes'), {
      target: { value: '60' },
    });
    fireEvent.click(within(staffCostDialog).getByRole('button', { name: 'Add staff cost' }));

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
