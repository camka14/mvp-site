import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithMantine } from '../../../../../test/utils/renderWithMantine';
import { apiRequest, isApiRequestError } from '@/lib/apiClient';
import OrganizationFinancePanel from '../OrganizationFinancePanel';

const mockPush = jest.fn();

jest.mock('@/lib/apiClient', () => ({
  apiRequest: jest.fn(),
  isApiRequestError: jest.fn(() => false),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

const financeResponse = {
  finance: {
    organizationId: 'org_1',
    grossRevenueCents: 30000,
    refundCents: 5000,
    feeCents: 1150,
    actualRevenueCents: 23850,
    actualCostCents: 8500,
    actualProfitCents: 15350,
    futureCostCents: 4000,
    projectedProfitCents: 11350,
    staffCostCents: 6000,
    customCostCents: 2500,
    warnings: [],
    lineItems: [
      {
        id: 'organization-bill:bill_1:paid',
        sourceType: 'bill',
        sourceId: 'bill_1',
        scope: 'ORGANIZATION',
        label: 'Summer League - Harbor Strikers',
        sourceName: 'Summer League',
        sourceEntityType: 'event',
        sourceEntityId: 'event_1',
        customerType: 'teams',
        customerId: 'team_1',
        customerName: 'Harbor Strikers',
        category: 'team_registration',
        amountCents: 20000,
        classification: 'revenue',
        status: 'PAID',
        timing: 'ACTUAL',
        serviceStartAt: '2026-06-01T00:00:00.000Z',
        quantity: 1,
        unitLabel: 'team registration',
        isGenerated: true,
      },
      {
        id: 'custom:line_1',
        sourceType: 'custom_line_item',
        sourceId: 'line_1',
        scope: 'ORGANIZATION',
        label: 'Field rental',
        description: 'Court 2',
        category: 'Rentals',
        amountCents: -2500,
        classification: 'custom_cost',
        status: 'ACTUAL',
        timing: 'ACTUAL',
        serviceStartAt: '2026-06-05T00:00:00.000Z',
        serviceEndAt: '2026-06-05T23:59:59.999Z',
        quantity: null,
        unitLabel: null,
        isGenerated: false,
      },
      {
        id: 'labor:event_labor_1',
        sourceType: 'labor',
        sourceId: 'event_labor_1',
        scope: 'ORGANIZATION',
        label: 'Alex Rivera',
        category: 'labor',
        amountCents: -6000,
        classification: 'labor_cost',
        status: 'ACTUAL',
        timing: 'ACTUAL',
        serviceStartAt: '2026-06-01T16:00:00.000Z',
        quantity: 1,
        unitLabel: 'hours',
        isGenerated: true,
      },
    ],
  },
  lineItemCategories: ['Operations', 'Rentals'],
  payRuns: [
    {
      id: 'pay_run_1',
      title: 'June payroll',
      periodStart: '2026-06-01T00:00:00.000Z',
      periodEnd: '2026-06-30T23:59:59.999Z',
      status: 'DRAFT',
      payoutStatus: 'NOT_STARTED',
      totalAmountCents: 6000,
      itemCount: 1,
      approvedAt: null,
      paidAt: null,
      payoutProvider: null,
      payoutProviderBatchId: null,
      notes: null,
      items: [
        {
          id: 'pay_item_1',
          staffMemberId: 'staff_1',
          userId: 'user_1',
          eventId: 'event_1',
          teamId: 'team_1',
          eventTeamId: 'event_team_1',
          eventStaffAssignmentId: 'event_labor_1',
          teamStaffLaborEntryId: null,
          label: 'Alex Rivera',
          wageType: 'HOURLY',
          rateCents: 6000,
          paidMinutes: 60,
          amountCents: 6000,
          status: 'DRAFT',
          payoutStatus: 'NOT_STARTED',
          serviceStartAt: '2026-06-01T16:00:00.000Z',
          serviceEndAt: '2026-06-01T17:00:00.000Z',
          payoutProvider: null,
          payoutProviderTransferId: null,
        },
      ],
    },
  ],
};

const approvedFinanceResponse = {
  ...financeResponse,
  payRuns: [
    {
      ...financeResponse.payRuns[0],
      status: 'APPROVED',
      payoutStatus: 'NOT_STARTED',
      approvedAt: '2026-06-15T17:00:00.000Z',
      items: financeResponse.payRuns[0].items.map((item) => ({
        ...item,
        status: 'APPROVED',
        payoutStatus: 'NOT_STARTED',
      })),
    },
  ],
};

describe('OrganizationFinancePanel', () => {
  const createObjectURLMock = jest.fn(() => 'blob:payroll');
  const revokeObjectURLMock = jest.fn();
  const anchorClickMock = jest.fn();

  beforeEach(() => {
    (apiRequest as jest.Mock).mockReset();
    mockPush.mockReset();
    createObjectURLMock.mockClear();
    revokeObjectURLMock.mockClear();
    anchorClickMock.mockClear();
    Object.defineProperty(window.URL, 'createObjectURL', {
      configurable: true,
      value: createObjectURLMock,
    });
    Object.defineProperty(window.URL, 'revokeObjectURL', {
      configurable: true,
      value: revokeObjectURLMock,
    });
    jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(anchorClickMock);
    (isApiRequestError as jest.Mock).mockReset();
    (isApiRequestError as jest.Mock).mockReturnValue(false);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders organization finance totals, line items, and pay runs', async () => {
    (apiRequest as jest.Mock).mockResolvedValueOnce(financeResponse);

    renderWithMantine(
      <OrganizationFinancePanel organizationId="org_1" isActive canManage />,
    );

    expect(await screen.findByText('Finance and payroll')).toBeInTheDocument();
    expect(await screen.findByText('Gross sales')).toBeInTheDocument();
    expect(screen.getAllByText('$300.00').length).toBeGreaterThan(0);
    expect(screen.getByText('Current profit')).toBeInTheDocument();
    expect(screen.getAllByText('$153.50').length).toBeGreaterThan(0);
    expect(screen.getByText('Summer League - Harbor Strikers')).toBeInTheDocument();
    expect(screen.getByText('1 team registration')).toBeInTheDocument();
    expect(screen.getByText('1 hour')).toBeInTheDocument();
    expect(screen.getByText('Field rental')).toBeInTheDocument();
    expect(screen.getAllByText('INCURRED').length).toBeGreaterThan(0);
    expect(screen.getAllByText('CURRENT').length).toBeGreaterThan(0);
    expect(screen.getAllByText('June payroll').length).toBeGreaterThan(0);
    expect(screen.getByText('Staff payroll ledger')).toBeInTheDocument();
    expect(screen.getByText('Event and team profitability')).toBeInTheDocument();
    expect(apiRequest).toHaveBeenCalledWith(expect.stringContaining('/api/organizations/org_1/finance?'));
    const financeUrl = decodeURIComponent((apiRequest as jest.Mock).mock.calls[0][0]);
    const financeParams = new URL(financeUrl, 'http://localhost').searchParams;
    const from = new Date(financeParams.get('from') ?? '');
    const to = new Date(financeParams.get('to') ?? '');
    expect(Number.isNaN(from.getTime())).toBe(false);
    expect(Number.isNaN(to.getTime())).toBe(false);
    expect(to.getTime() - from.getTime()).toBeGreaterThan(23 * 60 * 60 * 1000);
  });

  it('opens generated line item source and customer actions', async () => {
    (apiRequest as jest.Mock).mockResolvedValueOnce(financeResponse);

    renderWithMantine(
      <OrganizationFinancePanel organizationId="org_1" isActive canManage />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Open actions for Summer League - Harbor Strikers' }));
    expect(await screen.findByLabelText('Go to "Summer League"')).toBeInTheDocument();
    const customerAction = screen.getByLabelText('Go to "Harbor Strikers"');
    fireEvent.click(customerAction);
    expect(mockPush).toHaveBeenCalledWith('/organizations/org_1/customers/teams/team_1');
  });

  it('creates organization custom line items from the finance panel', async () => {
    (apiRequest as jest.Mock)
      .mockResolvedValueOnce(financeResponse)
      .mockResolvedValueOnce({ lineItem: { id: 'line_2' } })
      .mockResolvedValueOnce({
        ...financeResponse,
        finance: {
          ...financeResponse.finance,
          lineItems: [
            ...financeResponse.finance.lineItems,
            {
              ...financeResponse.finance.lineItems[1],
              id: 'custom:line_2',
              sourceId: 'line_2',
              label: 'Tournament supplies',
              amountCents: -4200,
            },
          ],
        },
      });

    renderWithMantine(
      <OrganizationFinancePanel organizationId="org_1" isActive canManage />,
    );

    await screen.findByText('Finance line items');
    fireEvent.click(screen.getByRole('button', { name: 'Add line item' }));
    await screen.findByText('Add financial line item');
    expect(screen.getByLabelText('Line item category')).toHaveValue('Operations');
    fireEvent.change(screen.getByLabelText('Line item title'), {
      target: { value: 'Tournament supplies' },
    });
    fireEvent.change(screen.getByLabelText('Line item category'), {
      target: { value: 'Operations' },
    });
    fireEvent.change(screen.getByLabelText('Line item amount'), {
      target: { value: '42' },
    });
    fireEvent.change(screen.getByLabelText('Line item start date'), {
      target: { value: '2026-06-10' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save line item' }));

    await waitFor(() => {
      expect(apiRequest).toHaveBeenCalledWith('/api/organizations/org_1/finance/line-items', {
        method: 'POST',
        body: expect.objectContaining({
          scope: 'ORGANIZATION',
          title: 'Tournament supplies',
          category: 'Operations',
          amountCents: 4200,
        }),
      });
    });
    expect(await screen.findByText('Tournament supplies')).toBeInTheDocument();
  });

  it('edits custom line items when clicked', async () => {
    (apiRequest as jest.Mock)
      .mockResolvedValueOnce(financeResponse)
      .mockResolvedValueOnce({ lineItem: { id: 'line_1' } })
      .mockResolvedValueOnce({
        ...financeResponse,
        finance: {
          ...financeResponse.finance,
          lineItems: financeResponse.finance.lineItems.map((item) => (
            item.id === 'custom:line_1'
              ? { ...item, label: 'Updated field rental', amountCents: -3000 }
              : item
          )),
        },
      });

    renderWithMantine(
      <OrganizationFinancePanel organizationId="org_1" isActive canManage />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Edit Field rental' }));
    await screen.findByText('Edit financial line item');
    fireEvent.change(screen.getByLabelText('Line item title'), {
      target: { value: 'Updated field rental' },
    });
    fireEvent.change(screen.getByLabelText('Line item amount'), {
      target: { value: '30' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save line item' }));

    await waitFor(() => {
      expect(apiRequest).toHaveBeenCalledWith('/api/organizations/org_1/finance/line-items/line_1', {
        method: 'PATCH',
        body: expect.objectContaining({
          title: 'Updated field rental',
          amountCents: 3000,
        }),
      });
    });
    expect(await screen.findByText('Updated field rental')).toBeInTheDocument();
  });

  it('creates a draft staff pay run and refreshes the finance panel', async () => {
    (apiRequest as jest.Mock)
      .mockResolvedValueOnce(financeResponse)
      .mockResolvedValueOnce({ payRun: { id: 'pay_run_2' } })
      .mockResolvedValueOnce({
        ...financeResponse,
        payRuns: [
          ...financeResponse.payRuns,
          {
            ...financeResponse.payRuns[0],
            id: 'pay_run_2',
            title: 'Late June payroll',
          },
        ],
      });

    renderWithMantine(
      <OrganizationFinancePanel organizationId="org_1" isActive canManage />,
    );

    await screen.findByText('Staff pay runs');

    fireEvent.change(screen.getByLabelText('Pay run title'), {
      target: { value: 'Late June payroll' },
    });
    fireEvent.change(screen.getByLabelText('Period start'), {
      target: { value: '2026-06-15' },
    });
    fireEvent.change(screen.getByLabelText('Period end'), {
      target: { value: '2026-06-30' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create pay run' }));

    await waitFor(() => {
      expect(apiRequest).toHaveBeenCalledWith('/api/organizations/org_1/finance/pay-runs', {
        method: 'POST',
        body: expect.objectContaining({
          title: 'Late June payroll',
          periodStart: expect.any(String),
          periodEnd: expect.any(String),
        }),
      });
    });
    expect(await screen.findByText('Late June payroll')).toBeInTheDocument();
  });

  it('shows pay-run errors beside the create pay-run controls', async () => {
    (apiRequest as jest.Mock)
      .mockResolvedValueOnce(financeResponse)
      .mockRejectedValueOnce(new Error('No unpaid staff labor was found for this pay period.'));

    renderWithMantine(
      <OrganizationFinancePanel organizationId="org_1" isActive canManage />,
    );

    await screen.findByText('Staff pay runs');
    fireEvent.click(screen.getByRole('button', { name: 'Create pay run' }));

    await waitFor(() => {
      expect(apiRequest).toHaveBeenCalledWith('/api/organizations/org_1/finance/pay-runs', expect.objectContaining({
        method: 'POST',
      }));
    });
    expect(await screen.findByText('No unpaid staff labor was found for this pay period.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('approves a draft pay run', async () => {
    (apiRequest as jest.Mock)
      .mockResolvedValueOnce(financeResponse)
      .mockResolvedValueOnce({ payRun: { id: 'pay_run_1', status: 'APPROVED' } })
      .mockResolvedValueOnce({
        ...financeResponse,
        payRuns: [
          {
            ...financeResponse.payRuns[0],
            status: 'APPROVED',
          },
        ],
      });

    renderWithMantine(
      <OrganizationFinancePanel organizationId="org_1" isActive canManage />,
    );

    const approveButtons = await screen.findAllByRole('button', { name: 'Approve' });
    fireEvent.click(approveButtons[0]);

    await waitFor(() => {
      expect(apiRequest).toHaveBeenCalledWith('/api/organizations/org_1/finance/pay-runs/pay_run_1', {
        method: 'PATCH',
        body: { action: 'APPROVE' },
      });
    });
    expect((await screen.findAllByText('APPROVED')).length).toBeGreaterThan(0);
  });

  it('opens pay-run details with wage and source links', async () => {
    (apiRequest as jest.Mock).mockResolvedValueOnce(financeResponse);

    renderWithMantine(
      <OrganizationFinancePanel organizationId="org_1" isActive canManage />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'View pay run June payroll' }));

    expect(await screen.findByText('Staff pay run details')).toBeInTheDocument();
    expect(screen.getByText('Hourly $60.00/hr')).toBeInTheDocument();
    expect(screen.getByText('Event labor')).toBeInTheDocument();
    expect(screen.getAllByText('1h').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: 'Event source' }));
    expect(mockPush).toHaveBeenCalledWith('/events/event_1?tab=details');
  });

  it('exports filtered payroll CSV from loaded pay-run items', async () => {
    (apiRequest as jest.Mock).mockResolvedValueOnce(financeResponse);

    renderWithMantine(
      <OrganizationFinancePanel organizationId="org_1" isActive canManage />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Export filtered CSV' }));

    expect(createObjectURLMock).toHaveBeenCalledWith(expect.any(Blob));
    expect(anchorClickMock).toHaveBeenCalled();
    expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:payroll');
  });

  it('saves pay-run item transfer references', async () => {
    (apiRequest as jest.Mock)
      .mockResolvedValueOnce(approvedFinanceResponse)
      .mockResolvedValueOnce({ payRun: { id: 'pay_run_1', status: 'APPROVED' } })
      .mockResolvedValueOnce({
        ...approvedFinanceResponse,
        payRuns: [
          {
            ...approvedFinanceResponse.payRuns[0],
            items: approvedFinanceResponse.payRuns[0].items.map((item) => ({
              ...item,
              payoutProviderTransferId: 'transfer-1024',
            })),
          },
        ],
      });

    renderWithMantine(
      <OrganizationFinancePanel organizationId="org_1" isActive canManage />,
    );

    const transferButtons = await screen.findAllByRole('button', { name: 'Transfers' });
    fireEvent.click(transferButtons[0]);

    expect(await screen.findByText('Edit transfer references')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Transfer reference for Alex Rivera'), {
      target: { value: 'transfer-1024' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save references' }));

    await waitFor(() => {
      expect(apiRequest).toHaveBeenCalledWith('/api/organizations/org_1/finance/pay-runs/pay_run_1', {
        method: 'PATCH',
        body: {
          action: 'UPDATE_ITEM_TRANSFERS',
          itemTransfers: [
            { itemId: 'pay_item_1', payoutProviderTransferId: 'transfer-1024' },
          ],
        },
      });
    });
    fireEvent.click(await screen.findByRole('button', { name: 'View pay run June payroll' }));
    expect(await screen.findByText('transfer-1024')).toBeInTheDocument();
  });

  it('voids a pay run only after collecting a reason', async () => {
    (apiRequest as jest.Mock)
      .mockResolvedValueOnce(financeResponse)
      .mockResolvedValueOnce({ payRun: { id: 'pay_run_1', status: 'VOID', payoutStatus: 'CANCELLED' } })
      .mockResolvedValueOnce({
        ...financeResponse,
        payRuns: [
          {
            ...financeResponse.payRuns[0],
            status: 'VOID',
            payoutStatus: 'CANCELLED',
            notes: 'Duplicate batch',
          },
        ],
      });

    renderWithMantine(
      <OrganizationFinancePanel organizationId="org_1" isActive canManage />,
    );

    const voidButtons = await screen.findAllByRole('button', { name: 'Void' });
    fireEvent.click(voidButtons[0]);

    const voidDialog = await screen.findByRole('dialog', { name: 'Void staff pay run' });
    fireEvent.click(within(voidDialog).getByRole('button', { name: 'Void pay run' }));
    expect(await screen.findByText('A void reason is required.')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Void reason'), {
      target: { value: 'Duplicate batch' },
    });
    fireEvent.click(within(voidDialog).getByRole('button', { name: 'Void pay run' }));

    await waitFor(() => {
      expect(apiRequest).toHaveBeenCalledWith('/api/organizations/org_1/finance/pay-runs/pay_run_1', {
        method: 'PATCH',
        body: {
          action: 'VOID',
          voidReason: 'Duplicate batch',
        },
      });
    });
    expect((await screen.findAllByText('VOID')).length).toBeGreaterThan(0);
  });

  it('marks a pay run paid with payout metadata from the modal', async () => {
    (apiRequest as jest.Mock)
      .mockResolvedValueOnce(approvedFinanceResponse)
      .mockResolvedValueOnce({ payRun: { id: 'pay_run_1', status: 'PAID', payoutStatus: 'PAID' } })
      .mockResolvedValueOnce({
        ...approvedFinanceResponse,
        payRuns: [
          {
            ...approvedFinanceResponse.payRuns[0],
            status: 'PAID',
            payoutStatus: 'PAID',
            paidAt: '2026-06-15T18:00:00.000Z',
            payoutProvider: 'Check',
            payoutProviderBatchId: 'check-1024',
            notes: 'Paid outside the app',
            items: approvedFinanceResponse.payRuns[0].items.map((item) => ({
              ...item,
              status: 'PAID',
              payoutStatus: 'PAID',
              payoutProvider: 'Check',
            })),
          },
        ],
      });

    renderWithMantine(
      <OrganizationFinancePanel organizationId="org_1" isActive canManage />,
    );

    const markPaidButtons = await screen.findAllByRole('button', { name: 'Mark paid' });
    fireEvent.click(markPaidButtons[0]);

    const payoutDialog = await screen.findByRole('dialog', { name: 'Record staff payout' });
    fireEvent.change(screen.getByLabelText('Payout provider'), {
      target: { value: 'Check' },
    });
    fireEvent.change(screen.getByLabelText('Payout reference'), {
      target: { value: 'check-1024' },
    });
    fireEvent.change(screen.getByLabelText('Payout notes'), {
      target: { value: 'Paid outside the app' },
    });
    fireEvent.click(within(payoutDialog).getByRole('button', { name: 'Mark paid' }));

    await waitFor(() => {
      expect(apiRequest).toHaveBeenCalledWith('/api/organizations/org_1/finance/pay-runs/pay_run_1', {
        method: 'PATCH',
        body: {
          action: 'MARK_PAID',
          payoutProvider: 'Check',
          payoutProviderBatchId: 'check-1024',
          notes: 'Paid outside the app',
        },
      });
    });
    expect((await screen.findAllByText('PAID')).length).toBeGreaterThan(0);
  });
});
