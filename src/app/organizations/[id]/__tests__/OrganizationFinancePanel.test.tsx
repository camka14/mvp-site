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
    potentialRevenueCents: 0,
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
  accountingConnections: [
    {
      id: 'qbo_1',
      provider: 'QUICKBOOKS_ONLINE',
      status: 'CONNECTED',
      externalCompanyId: null,
      externalCompanyName: null,
      environment: 'sandbox',
      scopes: ['com.intuit.quickbooks.accounting'],
      tokenType: 'bearer',
      accessTokenExpiresAt: '2026-06-10T20:00:00.000Z',
      refreshTokenExpiresAt: '2026-09-18T19:00:00.000Z',
      refreshTokenHardExpiresAt: null,
      connectedAt: '2026-06-10T19:00:00.000Z',
      connectedByUserId: 'owner_1',
      disconnectedAt: null,
      disconnectedByUserId: null,
      lastSyncedAt: null,
      lastIntuitTid: null,
      lastErrorAt: null,
      lastError: null,
      payrollExpenseAccountExternalId: '62',
      payrollExpenseAccountName: 'Payroll Expenses',
      payrollLiabilityAccountExternalId: '41',
      payrollLiabilityAccountName: 'Payroll Clearing',
      financeClearingAccountExternalId: '35',
      financeClearingAccountName: 'Undeposited Funds',
    },
  ],
  categoryAccountingMappings: [
    {
      id: 'category_mapping_1',
      provider: 'QUICKBOOKS_ONLINE',
      category: 'labor',
      categoryKey: 'labor',
      entryType: 'EXPENSE',
      accountExternalId: '62',
      accountName: 'Payroll Expenses',
      notes: 'Staff labor costs',
      isActive: true,
      updatedAt: '2026-06-10T19:00:00.000Z',
      updatedBy: 'owner_1',
    },
  ],
  payRuns: [
    {
      id: 'pay_run_1',
      title: 'June payroll',
      periodStart: '2026-06-01T00:00:00.000Z',
      periodEnd: '2026-06-30T23:59:59.999Z',
      scheduledPayDate: '2026-07-05T07:00:00.000Z',
      status: 'DRAFT',
      payoutStatus: 'NOT_STARTED',
      totalAmountCents: 6000,
      itemCount: 1,
      approvedAt: null,
      paidAt: null,
      exportedAt: null,
      exportedByUserId: null,
      exportCount: 0,
      lastExportFormat: null,
      payoutProvider: null,
      payoutProviderBatchId: null,
      notes: null,
      accountingSyncs: [],
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
    expect(screen.getAllByText('Pay date').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Jul 5, 2026').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Not exported').length).toBeGreaterThan(0);
    expect(screen.getByText('Staff payroll ledger')).toBeInTheDocument();
    expect(screen.getByText('Event and team profitability')).toBeInTheDocument();
    expect(screen.getByText('QuickBooks')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'QuickBooks settings' })).toBeInTheDocument();
    expect(screen.getByText('Payroll mapping ready')).toBeInTheDocument();
    expect(screen.getByText('1 category mappings')).toBeInTheDocument();
    expect(screen.queryByText('Financial category mappings')).not.toBeInTheDocument();
    expect(screen.queryByText('1234567890')).not.toBeInTheDocument();
    expect(screen.getByText('com.intuit.quickbooks.accounting')).toBeInTheDocument();
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
    fireEvent.change(screen.getByLabelText('Pay date'), {
      target: { value: '2026-07-05' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create pay run' }));

    await waitFor(() => {
      expect(apiRequest).toHaveBeenCalledWith('/api/organizations/org_1/finance/pay-runs', {
        method: 'POST',
        body: expect.objectContaining({
          title: 'Late June payroll',
          periodStart: expect.any(String),
          periodEnd: expect.any(String),
          scheduledPayDate: expect.any(String),
        }),
      });
    });
    const requestBody = (apiRequest as jest.Mock).mock.calls.find((call) => (
      call[0] === '/api/organizations/org_1/finance/pay-runs'
    ))?.[1]?.body;
    const scheduledDate = new Date(requestBody.scheduledPayDate);
    expect(scheduledDate.getFullYear()).toBe(2026);
    expect(scheduledDate.getMonth()).toBe(6);
    expect(scheduledDate.getDate()).toBe(5);
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
    expect(screen.getByText('QuickBooks sync')).toBeInTheDocument();
    expect(screen.getByText('Transaction')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Event source' }));
    expect(mockPush).toHaveBeenCalledWith('/events/event_1?tab=details');
  });

  it('exports filtered payroll CSV from loaded pay-run items', async () => {
    const exportedResponse = {
      ...financeResponse,
      payRuns: [
        {
          ...financeResponse.payRuns[0],
          exportedAt: '2026-06-15T18:00:00.000Z',
          exportCount: 1,
          lastExportFormat: 'CSV',
        },
      ],
    };
    (apiRequest as jest.Mock)
      .mockResolvedValueOnce(financeResponse)
      .mockResolvedValueOnce({ payRun: exportedResponse.payRuns[0] })
      .mockResolvedValueOnce(exportedResponse);

    renderWithMantine(
      <OrganizationFinancePanel organizationId="org_1" isActive canManage />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Export filtered CSV' }));

    await waitFor(() => {
      expect(apiRequest).toHaveBeenCalledWith('/api/organizations/org_1/finance/pay-runs/pay_run_1', {
        method: 'PATCH',
        body: {
          action: 'RECORD_EXPORT',
          exportFormat: 'CSV',
        },
      });
    });
    expect(createObjectURLMock).toHaveBeenCalledWith(expect.any(Blob));
    expect(anchorClickMock).toHaveBeenCalled();
    expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:payroll');
    expect(await screen.findByText('CSV #1')).toBeInTheDocument();
  });

  it('shows QuickBooks connection startup errors beside the connection controls', async () => {
    (apiRequest as jest.Mock)
      .mockResolvedValueOnce({
        ...financeResponse,
        accountingConnections: [],
      })
      .mockRejectedValueOnce(new Error('QuickBooks is not configured.'));

    renderWithMantine(
      <OrganizationFinancePanel organizationId="org_1" isActive canManage />,
    );

    await screen.findByText('QuickBooks');
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));

    await waitFor(() => {
      expect(apiRequest).toHaveBeenCalledWith('/api/organizations/org_1/finance/integrations/quickbooks/connect', {
        method: 'POST',
        body: expect.objectContaining({
          returnUrl: expect.any(String),
          refreshUrl: expect.any(String),
        }),
      });
    });
    expect(await screen.findByText('QuickBooks is not configured.')).toBeInTheDocument();
  });

  it('saves QuickBooks payroll account mappings from QuickBooks settings', async () => {
    (apiRequest as jest.Mock)
      .mockResolvedValueOnce(financeResponse)
      .mockResolvedValueOnce({
        accounts: [
          {
            id: '62',
            name: 'Payroll Expenses',
            fullyQualifiedName: 'Payroll Expenses',
            displayName: 'Payroll Expenses · Expense · PayrollExpenses',
            accountType: 'Expense',
            accountSubType: 'PayrollExpenses',
            classification: 'Expense',
            accountNumber: null,
            active: true,
          },
          {
            id: '41',
            name: 'Payroll Clearing',
            fullyQualifiedName: 'Payroll Clearing',
            displayName: 'Payroll Clearing · Other Current Liability · OtherCurrentLiabilities',
            accountType: 'Other Current Liability',
            accountSubType: 'OtherCurrentLiabilities',
            classification: 'Liability',
            accountNumber: null,
            active: true,
          },
          {
            id: '35',
            name: 'Undeposited Funds',
            fullyQualifiedName: 'Undeposited Funds',
            displayName: 'Undeposited Funds · Other Current Asset · UndepositedFunds',
            accountType: 'Other Current Asset',
            accountSubType: 'UndepositedFunds',
            classification: 'Asset',
            accountNumber: null,
            active: true,
          },
        ],
      })
      .mockResolvedValueOnce({
        connection: {
          ...financeResponse.accountingConnections[0],
          payrollExpenseAccountExternalId: '63',
          payrollExpenseAccountName: 'Staff Payroll Expense',
          payrollLiabilityAccountExternalId: '42',
          payrollLiabilityAccountName: 'Staff Payroll Clearing',
          financeClearingAccountExternalId: '35',
          financeClearingAccountName: 'Undeposited Funds',
        },
      });

    renderWithMantine(
      <OrganizationFinancePanel organizationId="org_1" isActive canManage />,
    );

    await screen.findByText('QuickBooks');
    fireEvent.click(screen.getByRole('button', { name: 'QuickBooks settings' }));
    await screen.findByText('QuickBooks account settings');
    await screen.findByRole('button', { name: 'Refresh accounts' });
    fireEvent.click(screen.getByRole('button', { name: 'Manual entry' }));
    fireEvent.change(screen.getByLabelText('Expense account ID'), {
      target: { value: '63' },
    });
    fireEvent.change(screen.getByLabelText('Expense account name'), {
      target: { value: 'Staff Payroll Expense' },
    });
    fireEvent.change(screen.getByLabelText('Liability account ID'), {
      target: { value: '42' },
    });
    fireEvent.change(screen.getByLabelText('Liability account name'), {
      target: { value: 'Staff Payroll Clearing' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save account settings' }));

    await waitFor(() => {
      expect(apiRequest).toHaveBeenCalledWith('/api/organizations/org_1/finance/integrations/quickbooks/settings', {
        method: 'PATCH',
        body: {
          payrollExpenseAccountExternalId: '63',
          payrollExpenseAccountName: 'Staff Payroll Expense',
          payrollLiabilityAccountExternalId: '42',
          payrollLiabilityAccountName: 'Staff Payroll Clearing',
          financeClearingAccountExternalId: '35',
          financeClearingAccountName: 'Undeposited Funds',
        },
      });
    });
    expect(screen.getByLabelText('Expense account ID')).toHaveValue('63');
  });

  it('loads QuickBooks accounts for assisted payroll mapping choices', async () => {
    (apiRequest as jest.Mock)
      .mockResolvedValueOnce(financeResponse)
      .mockResolvedValueOnce({
        accounts: [
          {
            id: '62',
            name: 'Payroll Expenses',
            fullyQualifiedName: 'Payroll Expenses',
            displayName: 'Payroll Expenses · Expense · PayrollExpenses',
            accountType: 'Expense',
            accountSubType: 'PayrollExpenses',
            classification: 'Expense',
            accountNumber: null,
            active: true,
          },
          {
            id: '41',
            name: 'Payroll Clearing',
            fullyQualifiedName: 'Payroll Clearing',
            displayName: 'Payroll Clearing · Other Current Liability · OtherCurrentLiabilities',
            accountType: 'Other Current Liability',
            accountSubType: 'OtherCurrentLiabilities',
            classification: 'Liability',
            accountNumber: null,
            active: true,
          },
          {
            id: '35',
            name: 'Undeposited Funds',
            fullyQualifiedName: 'Undeposited Funds',
            displayName: 'Undeposited Funds · Other Current Asset · UndepositedFunds',
            accountType: 'Other Current Asset',
            accountSubType: 'UndepositedFunds',
            classification: 'Asset',
            accountNumber: null,
            active: true,
          },
        ],
      });

    renderWithMantine(
      <OrganizationFinancePanel organizationId="org_1" isActive canManage />,
    );

    await screen.findByText('QuickBooks');
    fireEvent.click(screen.getByRole('button', { name: 'QuickBooks settings' }));
    await screen.findByText('QuickBooks account settings');

    await waitFor(() => {
      expect(apiRequest).toHaveBeenCalledWith(
        '/api/organizations/org_1/finance/integrations/quickbooks/accounts',
        { timeoutMs: 30000 },
      );
    });
    expect(await screen.findByRole('button', { name: 'Refresh accounts' })).toBeInTheDocument();
    expect(screen.getAllByText('Expense - PayrollExpenses').length).toBeGreaterThan(0);
    expect(screen.getByText('Other Current Liability - OtherCurrentLiabilities')).toBeInTheDocument();
    expect(screen.getByText('Other Current Asset - UndepositedFunds')).toBeInTheDocument();
  });

  it('shows stale QuickBooks reconnect sync records as retryable when the connection is connected', async () => {
    (apiRequest as jest.Mock).mockResolvedValueOnce({
      ...approvedFinanceResponse,
      payRuns: [
        {
          ...approvedFinanceResponse.payRuns[0],
          accountingSyncs: [
            {
              id: 'accounting_sync_1',
              provider: 'QUICKBOOKS_ONLINE',
              sourceType: 'STAFF_PAY_RUN',
              staffPayRunId: 'pay_run_1',
              status: 'REAUTH_REQUIRED',
              externalTxnId: null,
              externalTxnType: null,
              externalTxnDocNumber: null,
              intuitTid: null,
              errorCode: 'REAUTH_REQUIRED',
              errorMessage: 'Reconnect QuickBooks before syncing this pay run.',
              syncedAt: null,
              syncedByUserId: null,
            },
          ],
        },
      ],
    });

    renderWithMantine(
      <OrganizationFinancePanel organizationId="org_1" isActive canManage />,
    );

    expect(await screen.findByText('Retry')).toBeInTheDocument();
    expect(screen.getByText('QuickBooks reconnected. Try syncing this pay run again.')).toBeInTheDocument();
    expect(screen.queryByText('Reconnect QuickBooks before syncing this pay run.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry QBO' })).toBeEnabled();
  });

  it('shows a reconnect action when the QuickBooks connection requires authorization', async () => {
    (apiRequest as jest.Mock).mockResolvedValueOnce({
      ...approvedFinanceResponse,
      accountingConnections: [
        {
          ...approvedFinanceResponse.accountingConnections[0],
          status: 'REAUTH_REQUIRED',
          lastError: 'QuickBooks authorization expired. Reconnect QuickBooks to continue.',
        },
      ],
      payRuns: [
        {
          ...approvedFinanceResponse.payRuns[0],
          accountingSyncs: [
            {
              id: 'accounting_sync_1',
              provider: 'QUICKBOOKS_ONLINE',
              sourceType: 'STAFF_PAY_RUN',
              staffPayRunId: 'pay_run_1',
              status: 'REAUTH_REQUIRED',
              externalTxnId: null,
              externalTxnType: null,
              externalTxnDocNumber: null,
              intuitTid: 'tid-expired',
              errorCode: 'REAUTH_REQUIRED',
              errorMessage: 'Reconnect QuickBooks before syncing this pay run.',
              syncedAt: null,
              syncedByUserId: null,
            },
          ],
        },
      ],
    });

    renderWithMantine(
      <OrganizationFinancePanel organizationId="org_1" isActive canManage />,
    );

    expect((await screen.findAllByText('Reconnect required')).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: 'Reconnect QBO' }).length).toBeGreaterThan(0);
    expect(screen.getByText('QuickBooks authorization expired. Reconnect QuickBooks to continue.')).toBeInTheDocument();
    expect(screen.getByText('TID tid-expired')).toBeInTheDocument();
  });

  it('explains disabled QuickBooks pay-run sync when payroll account mapping is missing', async () => {
    (apiRequest as jest.Mock).mockResolvedValueOnce({
      ...approvedFinanceResponse,
      accountingConnections: [
        {
          ...approvedFinanceResponse.accountingConnections[0],
          payrollExpenseAccountExternalId: null,
          payrollExpenseAccountName: null,
          payrollLiabilityAccountExternalId: null,
          payrollLiabilityAccountName: null,
        },
      ],
    });

    renderWithMantine(
      <OrganizationFinancePanel organizationId="org_1" isActive canManage />,
    );

    expect(await screen.findByText('Needs mapping')).toBeInTheDocument();
    expect(screen.getByText('Set QuickBooks payroll account mapping before syncing.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sync QBO' })).toBeDisabled();
  });

  it('syncs an approved staff pay run to QuickBooks and refreshes accounting status', async () => {
    const syncedFinanceResponse = {
      ...approvedFinanceResponse,
      payRuns: [
        {
          ...approvedFinanceResponse.payRuns[0],
          exportedAt: '2026-06-15T18:00:00.000Z',
          exportCount: 1,
          lastExportFormat: 'QUICKBOOKS_JOURNAL_ENTRY',
          accountingSyncs: [
            {
              id: 'accounting_sync_1',
              provider: 'QUICKBOOKS_ONLINE',
              sourceType: 'STAFF_PAY_RUN',
              staffPayRunId: 'pay_run_1',
              status: 'SYNCED',
              externalTxnId: '987',
              externalTxnType: 'JournalEntry',
              externalTxnDocNumber: 'JE-14',
              intuitTid: 'tid-123',
              errorCode: null,
              errorMessage: null,
              syncedAt: '2026-06-15T18:00:00.000Z',
              syncedByUserId: 'owner_1',
            },
          ],
        },
      ],
    };
    (apiRequest as jest.Mock)
      .mockResolvedValueOnce(approvedFinanceResponse)
      .mockResolvedValueOnce({
        alreadySynced: false,
        syncRecord: syncedFinanceResponse.payRuns[0].accountingSyncs[0],
      })
      .mockResolvedValueOnce(syncedFinanceResponse);

    renderWithMantine(
      <OrganizationFinancePanel organizationId="org_1" isActive canManage />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Sync QBO' }));

    await waitFor(() => {
      expect(apiRequest).toHaveBeenCalledWith(
        '/api/organizations/org_1/finance/integrations/quickbooks/pay-runs/pay_run_1/sync',
        { method: 'POST', timeoutMs: 30000 },
      );
    });
    expect(await screen.findByText('QuickBooks #1')).toBeInTheDocument();
    expect(screen.getByText('JournalEntry JE-14')).toBeInTheDocument();
    expect(screen.getByText('TID tid-123')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'View pay run June payroll' }));
    expect(await screen.findByText('QuickBooks sync')).toBeInTheDocument();
    expect(screen.getByText('Synced by')).toBeInTheDocument();
    expect(screen.getByText('owner_1')).toBeInTheDocument();
  });

  it('saves future QuickBooks financial category mappings from existing line item categories', async () => {
    (apiRequest as jest.Mock)
      .mockResolvedValueOnce(financeResponse)
      .mockResolvedValueOnce({
        accounts: [
          {
            id: '75',
            name: 'Field Rental Expense',
            fullyQualifiedName: 'Field Rental Expense',
            displayName: 'Field Rental Expense · Expense · RentOrLeaseOfBuildings',
            accountType: 'Expense',
            accountSubType: 'RentOrLeaseOfBuildings',
            classification: 'Expense',
            accountNumber: null,
            active: true,
          },
        ],
      })
      .mockResolvedValueOnce({
        mappings: [
          {
            id: 'category_mapping_2',
            provider: 'QUICKBOOKS_ONLINE',
            category: 'Rentals',
            categoryKey: 'rentals',
            entryType: 'EXPENSE',
            accountExternalId: '75',
            accountName: 'Field Rental Expense',
            notes: 'Custom rental costs',
            isActive: true,
          },
        ],
      });

    renderWithMantine(
      <OrganizationFinancePanel organizationId="org_1" isActive canManage />,
    );

    await screen.findByText('QuickBooks');
    fireEvent.click(screen.getByRole('button', { name: 'QuickBooks settings' }));
    await screen.findByText('Financial category mappings');
    await waitFor(() => {
      expect(apiRequest).toHaveBeenCalledWith(
        '/api/organizations/org_1/finance/integrations/quickbooks/accounts',
        { timeoutMs: 30000 },
      );
    });
    expect(screen.getAllByLabelText('QuickBooks account for Rentals Expense')[0]).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Manual entry' }));
    fireEvent.change(screen.getByLabelText('Account ID for Rentals Expense'), {
      target: { value: '75' },
    });
    fireEvent.change(screen.getByLabelText('Account name for Rentals Expense'), {
      target: { value: 'Field Rental Expense' },
    });
    fireEvent.change(screen.getByLabelText('Accounting notes for Rentals Expense'), {
      target: { value: 'Custom rental costs' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save category mappings' }));

    await waitFor(() => {
      expect(apiRequest).toHaveBeenCalledWith('/api/organizations/org_1/finance/integrations/quickbooks/category-mappings', {
        method: 'PATCH',
        body: {
          mappings: expect.arrayContaining([
            expect.objectContaining({
              category: 'Rentals',
              entryType: 'EXPENSE',
              accountExternalId: '75',
              accountName: 'Field Rental Expense',
              notes: 'Custom rental costs',
            }),
          ]),
        },
      });
    });
  });

  it('previews QuickBooks journal entry rows for finance line items', async () => {
    const journalPreview = {
      provider: 'QUICKBOOKS_ONLINE',
      txnDate: '2026-06-11',
      privateNote: 'BracketIQ finance line-item journal entry (2026-06-01 to 2026-06-11)',
      includedLineItemCount: 2,
      skippedLineItemCount: 0,
      unmappedLineItemCount: 0,
      debitTotalCents: 22500,
      creditTotalCents: 22500,
      isBalanced: true,
      readyToSync: true,
      warnings: [],
      lines: [
        {
          id: 'line_1:mapped',
          lineItemId: 'custom:line_1',
          lineItemLabel: 'Field rental',
          category: 'Rentals',
          sourceType: 'custom_line_item',
          sourceName: null,
          customerName: null,
          postingType: 'Debit',
          amountCents: 2500,
          accountExternalId: '75',
          accountName: 'Field Rental Expense',
          description: 'Field rental',
          missingAccount: false,
          role: 'LINE_ITEM_ACCOUNT',
        },
        {
          id: 'line_1:clearing',
          lineItemId: 'custom:line_1',
          lineItemLabel: 'Field rental',
          category: 'Finance clearing',
          sourceType: 'custom_line_item',
          sourceName: null,
          customerName: null,
          postingType: 'Credit',
          amountCents: 2500,
          accountExternalId: '35',
          accountName: 'Undeposited Funds',
          description: 'Clearing entry for Field rental',
          missingAccount: false,
          role: 'CLEARING_ACCOUNT',
        },
      ],
    };
    (apiRequest as jest.Mock)
      .mockResolvedValueOnce(financeResponse)
      .mockResolvedValueOnce({
        accounts: [
          {
            id: '35',
            name: 'Undeposited Funds',
            fullyQualifiedName: 'Undeposited Funds',
            displayName: 'Undeposited Funds · Other Current Asset · UndepositedFunds',
            accountType: 'Other Current Asset',
            accountSubType: 'UndepositedFunds',
            classification: 'Asset',
            accountNumber: null,
            active: true,
          },
        ],
      })
      .mockResolvedValueOnce({
        preview: journalPreview,
      })
      .mockResolvedValueOnce({
        preview: journalPreview,
        syncRecord: {
          id: 'accounting_sync_1',
          provider: 'QUICKBOOKS_ONLINE',
          sourceType: 'FINANCE_JOURNAL_ENTRY',
          sourceKey: 'organization:org_1:finance-journal:2026-06-01:2026-06-11',
          status: 'SYNCED',
          externalTxnId: '147',
          externalTxnType: 'JournalEntry',
          externalTxnDocNumber: 'JE-25',
          intuitTid: 'tid-147',
          syncedAt: '2026-06-11T20:00:00.000Z',
          syncedByUserId: 'owner_1',
        },
        alreadySynced: false,
      })
      .mockResolvedValueOnce({
        ...financeResponse,
        accountingConnections: [
          {
            ...financeResponse.accountingConnections[0],
            lastSyncedAt: '2026-06-11T20:00:00.000Z',
            lastIntuitTid: 'tid-147',
          },
        ],
      });

    renderWithMantine(
      <OrganizationFinancePanel organizationId="org_1" isActive canManage />,
    );

    await screen.findByText('QuickBooks');
    fireEvent.click(screen.getByRole('button', { name: 'QuickBooks settings' }));
    await screen.findByText('Journal entry preview');
    fireEvent.click(screen.getByRole('button', { name: 'Preview journal entry' }));

    await waitFor(() => {
      expect(apiRequest).toHaveBeenCalledWith(
        expect.stringContaining('/api/organizations/org_1/finance/integrations/quickbooks/journal-entry-preview?'),
        { timeoutMs: 30000 },
      );
    });
    expect(await screen.findByText('Ready to sync')).toBeInTheDocument();
    expect(screen.getByText('Balanced')).toBeInTheDocument();
    expect(screen.getByText('Debit total')).toBeInTheDocument();
    expect(screen.getAllByText('$225.00').length).toBeGreaterThan(0);
    expect(screen.getByText('Field Rental Expense')).toBeInTheDocument();
    expect(screen.getByText('Undeposited Funds')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Sync journal entry' }));

    await waitFor(() => {
      expect(apiRequest).toHaveBeenCalledWith(
        expect.stringContaining('/api/organizations/org_1/finance/integrations/quickbooks/journal-entry-sync?'),
        { method: 'POST', timeoutMs: 30000 },
      );
    });
    expect(await screen.findByText(/Synced to QuickBooks JournalEntry 147/)).toBeInTheDocument();
  });

  it('disconnects QuickBooks and refreshes finance state', async () => {
    (apiRequest as jest.Mock)
      .mockResolvedValueOnce(financeResponse)
      .mockResolvedValueOnce({
        connection: {
          ...financeResponse.accountingConnections[0],
          status: 'DISCONNECTED',
        },
      })
      .mockResolvedValueOnce({
        ...financeResponse,
        accountingConnections: [
          {
            ...financeResponse.accountingConnections[0],
            status: 'DISCONNECTED',
            accessTokenExpiresAt: null,
            disconnectedAt: '2026-06-10T20:00:00.000Z',
          },
        ],
      });

    renderWithMantine(
      <OrganizationFinancePanel organizationId="org_1" isActive canManage />,
    );

    await screen.findByText('QuickBooks');
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));

    await waitFor(() => {
      expect(apiRequest).toHaveBeenCalledWith('/api/organizations/org_1/finance/integrations/quickbooks/disconnect', {
        method: 'POST',
      });
    });
    await waitFor(() => {
      expect(screen.getAllByText('Not connected').length).toBeGreaterThan(0);
    });
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
