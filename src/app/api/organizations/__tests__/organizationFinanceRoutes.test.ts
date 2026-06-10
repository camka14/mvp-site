/** @jest-environment node */

import { NextRequest } from 'next/server';

const prismaMock = {
  organizations: {
    findUnique: jest.fn(),
  },
};
const requireSessionMock = jest.fn();
const canManageOrganizationFinanceMock = jest.fn();
const loadOrganizationFinanceSummaryMock = jest.fn();
const listOrganizationFinancialLineItemCategoriesMock = jest.fn();
const listStaffPayRunsMock = jest.fn();
const createDraftStaffPayRunMock = jest.fn();
const updateStaffPayRunStatusMock = jest.fn();
const listOrganizationAccountingConnectionsMock = jest.fn();

class MockStaffPayRunError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: (...args: any[]) => requireSessionMock(...args) }));
jest.mock('@/server/finance/financeAccess', () => ({
  canManageOrganizationFinance: (...args: any[]) => canManageOrganizationFinanceMock(...args),
}));
jest.mock('@/server/finance/financeRepository', () => ({
  listOrganizationFinancialLineItemCategories: (...args: any[]) => listOrganizationFinancialLineItemCategoriesMock(...args),
  loadOrganizationFinanceSummary: (...args: any[]) => loadOrganizationFinanceSummaryMock(...args),
}));
jest.mock('@/server/finance/staffPayRuns', () => ({
  StaffPayRunError: MockStaffPayRunError,
  listStaffPayRuns: (...args: any[]) => listStaffPayRunsMock(...args),
  createDraftStaffPayRun: (...args: any[]) => createDraftStaffPayRunMock(...args),
  updateStaffPayRunStatus: (...args: any[]) => updateStaffPayRunStatusMock(...args),
}));
jest.mock('@/server/integrations/quickBooksConnection', () => ({
  listOrganizationAccountingConnections: (...args: any[]) => listOrganizationAccountingConnectionsMock(...args),
}));

import { GET as getFinance } from '@/app/api/organizations/[id]/finance/route';
import { POST as postPayRun } from '@/app/api/organizations/[id]/finance/pay-runs/route';
import { PATCH as patchPayRun } from '@/app/api/organizations/[id]/finance/pay-runs/[payRunId]/route';

describe('organization finance routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireSessionMock.mockResolvedValue({ userId: 'owner_1', isAdmin: false });
    prismaMock.organizations.findUnique.mockResolvedValue({
      id: 'org_1',
      ownerId: 'owner_1',
    });
    canManageOrganizationFinanceMock.mockResolvedValue(true);
    loadOrganizationFinanceSummaryMock.mockResolvedValue({
      organizationId: 'org_1',
      actualProfitCents: 12000,
      lineItems: [],
      warnings: [],
    });
    listStaffPayRunsMock.mockResolvedValue([
      {
        id: 'pay_run_1',
        organizationId: 'org_1',
        totalAmountCents: 5000,
        items: [],
      },
    ]);
    listOrganizationFinancialLineItemCategoriesMock.mockResolvedValue(['Operations', 'Rentals']);
    listOrganizationAccountingConnectionsMock.mockResolvedValue([
      {
        id: 'qbo_1',
        provider: 'QUICKBOOKS_ONLINE',
        status: 'CONNECTED',
        externalCompanyId: '1234567890',
      },
    ]);
    createDraftStaffPayRunMock.mockResolvedValue({
      id: 'pay_run_2',
      organizationId: 'org_1',
      totalAmountCents: 7500,
      items: [],
    });
    updateStaffPayRunStatusMock.mockResolvedValue({
      id: 'pay_run_1',
      organizationId: 'org_1',
      status: 'APPROVED',
      items: [],
    });
  });

  it('returns organization finance summary and pay runs for finance managers', async () => {
    const response = await getFinance(
      new NextRequest('http://localhost/api/organizations/org_1/finance?from=2026-06-01&to=2026-06-30'),
      { params: Promise.resolve({ id: 'org_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(canManageOrganizationFinanceMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'owner_1' }),
      expect.objectContaining({ id: 'org_1' }),
      prismaMock,
    );
    expect(loadOrganizationFinanceSummaryMock).toHaveBeenCalledWith('org_1', prismaMock, {
      from: '2026-06-01',
      to: '2026-06-30',
    });
    expect(listStaffPayRunsMock).toHaveBeenCalledWith('org_1', prismaMock);
    expect(listOrganizationFinancialLineItemCategoriesMock).toHaveBeenCalledWith('org_1', prismaMock);
    expect(listOrganizationAccountingConnectionsMock).toHaveBeenCalledWith('org_1', prismaMock);
    expect(payload.finance.actualProfitCents).toBe(12000);
    expect(payload.payRuns[0].id).toBe('pay_run_1');
    expect(payload.lineItemCategories).toEqual(['Operations', 'Rentals']);
    expect(payload.accountingConnections[0].externalCompanyId).toBe('1234567890');
  });

  it('creates a draft staff pay run for finance managers', async () => {
    const response = await postPayRun(
      new NextRequest('http://localhost/api/organizations/org_1/finance/pay-runs', {
        method: 'POST',
        body: JSON.stringify({
          title: 'June payroll',
          periodStart: '2026-06-01T00:00:00.000Z',
          periodEnd: '2026-06-30T23:59:59.999Z',
          scheduledPayDate: '2026-07-05T00:00:00.000Z',
        }),
        headers: { 'content-type': 'application/json' },
      }),
      { params: Promise.resolve({ id: 'org_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(createDraftStaffPayRunMock).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: 'org_1',
      title: 'June payroll',
      periodStart: '2026-06-01T00:00:00.000Z',
      periodEnd: '2026-06-30T23:59:59.999Z',
      scheduledPayDate: '2026-07-05T00:00:00.000Z',
      actingUserId: 'owner_1',
    }), prismaMock);
    expect(payload.payRun.id).toBe('pay_run_2');
  });

  it('updates pay-run status for finance managers', async () => {
    const response = await patchPayRun(
      new NextRequest('http://localhost/api/organizations/org_1/finance/pay-runs/pay_run_1', {
        method: 'PATCH',
        body: JSON.stringify({ action: 'APPROVE' }),
        headers: { 'content-type': 'application/json' },
      }),
      { params: Promise.resolve({ id: 'org_1', payRunId: 'pay_run_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(updateStaffPayRunStatusMock).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: 'org_1',
      payRunId: 'pay_run_1',
      action: 'APPROVE',
      actingUserId: 'owner_1',
    }), prismaMock);
    expect(payload.payRun.status).toBe('APPROVED');
  });

  it('records pay-run export metadata for finance managers', async () => {
    updateStaffPayRunStatusMock.mockResolvedValue({
      id: 'pay_run_1',
      organizationId: 'org_1',
      status: 'DRAFT',
      exportedAt: '2026-06-15T18:00:00.000Z',
      exportCount: 1,
      lastExportFormat: 'CSV',
      items: [],
    });

    const response = await patchPayRun(
      new NextRequest('http://localhost/api/organizations/org_1/finance/pay-runs/pay_run_1', {
        method: 'PATCH',
        body: JSON.stringify({ action: 'RECORD_EXPORT', exportFormat: 'CSV' }),
        headers: { 'content-type': 'application/json' },
      }),
      { params: Promise.resolve({ id: 'org_1', payRunId: 'pay_run_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(updateStaffPayRunStatusMock).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: 'org_1',
      payRunId: 'pay_run_1',
      action: 'RECORD_EXPORT',
      exportFormat: 'CSV',
      actingUserId: 'owner_1',
    }), prismaMock);
    expect(payload.payRun.exportCount).toBe(1);
  });

  it('passes payout metadata when marking a pay run paid', async () => {
    updateStaffPayRunStatusMock.mockResolvedValue({
      id: 'pay_run_1',
      organizationId: 'org_1',
      status: 'PAID',
      payoutStatus: 'PAID',
      payoutProvider: 'Check',
      payoutProviderBatchId: 'check-1024',
      items: [],
    });

    const response = await patchPayRun(
      new NextRequest('http://localhost/api/organizations/org_1/finance/pay-runs/pay_run_1', {
        method: 'PATCH',
        body: JSON.stringify({
          action: 'MARK_PAID',
          payoutProvider: 'Check',
          payoutProviderBatchId: 'check-1024',
          notes: 'Paid outside the app',
        }),
        headers: { 'content-type': 'application/json' },
      }),
      { params: Promise.resolve({ id: 'org_1', payRunId: 'pay_run_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(updateStaffPayRunStatusMock).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: 'org_1',
      payRunId: 'pay_run_1',
      action: 'MARK_PAID',
      payoutProvider: 'Check',
      payoutProviderBatchId: 'check-1024',
      notes: 'Paid outside the app',
      actingUserId: 'owner_1',
    }), prismaMock);
    expect(payload.payRun.payoutProviderBatchId).toBe('check-1024');
  });

  it('passes void reason when voiding a pay run', async () => {
    updateStaffPayRunStatusMock.mockResolvedValue({
      id: 'pay_run_1',
      organizationId: 'org_1',
      status: 'VOID',
      payoutStatus: 'CANCELLED',
      notes: 'Duplicate batch',
      items: [],
    });

    const response = await patchPayRun(
      new NextRequest('http://localhost/api/organizations/org_1/finance/pay-runs/pay_run_1', {
        method: 'PATCH',
        body: JSON.stringify({
          action: 'VOID',
          voidReason: 'Duplicate batch',
        }),
        headers: { 'content-type': 'application/json' },
      }),
      { params: Promise.resolve({ id: 'org_1', payRunId: 'pay_run_1' }) },
    );

    expect(response.status).toBe(200);
    expect(updateStaffPayRunStatusMock).toHaveBeenCalledWith(expect.objectContaining({
      action: 'VOID',
      voidReason: 'Duplicate batch',
      actingUserId: 'owner_1',
    }), prismaMock);
  });

  it('passes item transfer references for payroll handoff', async () => {
    updateStaffPayRunStatusMock.mockResolvedValue({
      id: 'pay_run_1',
      organizationId: 'org_1',
      status: 'APPROVED',
      items: [
        { id: 'pay_item_1', payoutProviderTransferId: 'transfer-1024' },
      ],
    });

    const response = await patchPayRun(
      new NextRequest('http://localhost/api/organizations/org_1/finance/pay-runs/pay_run_1', {
        method: 'PATCH',
        body: JSON.stringify({
          action: 'UPDATE_ITEM_TRANSFERS',
          itemTransfers: [
            { itemId: 'pay_item_1', payoutProviderTransferId: 'transfer-1024' },
          ],
        }),
        headers: { 'content-type': 'application/json' },
      }),
      { params: Promise.resolve({ id: 'org_1', payRunId: 'pay_run_1' }) },
    );

    expect(response.status).toBe(200);
    expect(updateStaffPayRunStatusMock).toHaveBeenCalledWith(expect.objectContaining({
      action: 'UPDATE_ITEM_TRANSFERS',
      itemTransfers: [
        { itemId: 'pay_item_1', payoutProviderTransferId: 'transfer-1024' },
      ],
      actingUserId: 'owner_1',
    }), prismaMock);
  });

  it('rejects finance route access without finance permission', async () => {
    canManageOrganizationFinanceMock.mockResolvedValue(false);

    const response = await getFinance(
      new NextRequest('http://localhost/api/organizations/org_1/finance'),
      { params: Promise.resolve({ id: 'org_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toBe('Forbidden');
    expect(loadOrganizationFinanceSummaryMock).not.toHaveBeenCalled();
  });
});
