import { buildQuickBooksFinanceJournalEntryPreview } from '@/server/integrations/quickBooksFinanceJournalPreview';

describe('quickBooksFinanceJournalPreview', () => {
  it('builds balanced journal-entry preview rows from mapped finance line items', () => {
    const preview = buildQuickBooksFinanceJournalEntryPreview({
      from: '2026-06-01T00:00:00.000Z',
      to: '2026-06-30T23:59:59.999Z',
      clearingMapping: {
        financeClearingAccountExternalId: '35',
        financeClearingAccountName: 'Undeposited Funds',
      },
      mappings: [
        {
          category: 'Registrations',
          entryType: 'REVENUE',
          accountExternalId: '79',
          accountName: 'Registration Revenue',
          isActive: true,
        },
        {
          category: 'Rentals',
          entryType: 'EXPENSE',
          accountExternalId: '75',
          accountName: 'Field Rental Expense',
          isActive: true,
        },
      ],
      finance: {
        organizationId: 'org_1',
        grossRevenueCents: 10000,
        refundCents: 0,
        feeCents: 0,
        actualRevenueCents: 10000,
        actualCostCents: 2500,
        actualProfitCents: 7500,
        futureCostCents: 0,
        projectedProfitCents: 7500,
        staffCostCents: 0,
        customCostCents: 2500,
        warnings: [],
        lineItems: [
          {
            id: 'bill:paid',
            sourceType: 'bill',
            scope: 'ORGANIZATION',
            label: 'Summer League - Harbor Strikers',
            category: 'Registrations',
            amountCents: 10000,
            classification: 'revenue',
            status: 'PAID',
            timing: 'ACTUAL',
            isGenerated: true,
          },
          {
            id: 'custom:line_1',
            sourceType: 'custom_line_item',
            scope: 'ORGANIZATION',
            label: 'Field rental',
            category: 'Rentals',
            amountCents: -2500,
            classification: 'custom_cost',
            status: 'ACTUAL',
            timing: 'ACTUAL',
            isGenerated: false,
          },
        ],
      },
    });

    expect(preview.readyToSync).toBe(true);
    expect(preview.isBalanced).toBe(true);
    expect(preview.debitTotalCents).toBe(12500);
    expect(preview.creditTotalCents).toBe(12500);
    expect(preview.journalEntryPayload.Line).toEqual(expect.arrayContaining([
      expect.objectContaining({
        Amount: 100,
        JournalEntryLineDetail: expect.objectContaining({
          PostingType: 'Credit',
          AccountRef: { value: '79', name: 'Registration Revenue' },
        }),
      }),
      expect.objectContaining({
        Amount: 100,
        JournalEntryLineDetail: expect.objectContaining({
          PostingType: 'Debit',
          AccountRef: { value: '35', name: 'Undeposited Funds' },
        }),
      }),
      expect.objectContaining({
        Amount: 25,
        JournalEntryLineDetail: expect.objectContaining({
          PostingType: 'Debit',
          AccountRef: { value: '75', name: 'Field Rental Expense' },
        }),
      }),
      expect.objectContaining({
        Amount: 25,
        JournalEntryLineDetail: expect.objectContaining({
          PostingType: 'Credit',
          AccountRef: { value: '35', name: 'Undeposited Funds' },
        }),
      }),
    ]));
  });

  it('warns when category or clearing accounts are missing', () => {
    const preview = buildQuickBooksFinanceJournalEntryPreview({
      finance: {
        organizationId: 'org_1',
        grossRevenueCents: 0,
        refundCents: 0,
        feeCents: 0,
        actualRevenueCents: 0,
        actualCostCents: 1800,
        actualProfitCents: -1800,
        futureCostCents: 0,
        projectedProfitCents: -1800,
        staffCostCents: 0,
        customCostCents: 1800,
        warnings: [],
        lineItems: [
          {
            id: 'custom:line_1',
            sourceType: 'custom_line_item',
            scope: 'ORGANIZATION',
            label: 'Portable lights',
            category: 'Operations',
            amountCents: -1800,
            classification: 'custom_cost',
            status: 'ACTUAL',
            timing: 'ACTUAL',
            isGenerated: false,
          },
        ],
      },
      mappings: [],
      clearingMapping: null,
    });

    expect(preview.readyToSync).toBe(false);
    expect(preview.unmappedLineItemCount).toBe(1);
    expect(preview.warnings).toEqual(expect.arrayContaining([
      'Set a QuickBooks finance clearing account before syncing this journal entry.',
      'Map Operations expense before syncing.',
    ]));
    expect(preview.lines.every((line) => line.missingAccount)).toBe(true);
  });
});
