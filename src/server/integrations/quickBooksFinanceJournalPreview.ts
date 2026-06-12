import { type FinanceLineItem, type OrganizationFinanceSummary } from '@/server/finance/financeAnalysis';

const QUICKBOOKS_PROVIDER = 'QUICKBOOKS_ONLINE' as const;

type FinanceCategoryAccountingEntryType = 'REVENUE' | 'EXPENSE' | 'LIABILITY' | 'ASSET';

type CategoryAccountingMapping = {
  category: string;
  categoryKey?: string | null;
  entryType: FinanceCategoryAccountingEntryType;
  accountExternalId?: string | null;
  accountName?: string | null;
  isActive?: boolean | null;
};

type FinanceClearingMapping = {
  financeClearingAccountExternalId?: string | null;
  financeClearingAccountName?: string | null;
};

export type QuickBooksFinanceJournalPreviewLine = {
  id: string;
  lineItemId: string;
  lineItemLabel: string;
  category: string;
  sourceType: string;
  sourceName?: string | null;
  customerName?: string | null;
  postingType: 'Debit' | 'Credit';
  amountCents: number;
  accountExternalId?: string | null;
  accountName?: string | null;
  description: string;
  missingAccount: boolean;
  role: 'LINE_ITEM_ACCOUNT' | 'CLEARING_ACCOUNT';
};

export type QuickBooksFinanceJournalEntryPreview = {
  provider: typeof QUICKBOOKS_PROVIDER;
  txnDate: string;
  privateNote: string;
  includedLineItemCount: number;
  skippedLineItemCount: number;
  unmappedLineItemCount: number;
  debitTotalCents: number;
  creditTotalCents: number;
  isBalanced: boolean;
  readyToSync: boolean;
  warnings: string[];
  lines: QuickBooksFinanceJournalPreviewLine[];
  journalEntryPayload: {
    TxnDate: string;
    PrivateNote: string;
    Line: Array<{
      DetailType: 'JournalEntryLineDetail';
      Amount: number;
      Description: string;
      JournalEntryLineDetail: {
        PostingType: 'Debit' | 'Credit';
        AccountRef?: {
          value: string;
          name?: string;
        };
      };
    }>;
  };
};

const normalizeText = (value?: string | null, maxLength = 1000): string | null => {
  const trimmed = value?.trim() ?? '';
  return trimmed ? trimmed.slice(0, maxLength) : null;
};

const normalizeCategoryKey = (value: string): string => value.trim().toLowerCase();

const dateOnly = (value?: Date | string | null): string | null => {
  if (!value) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString().slice(0, 10);
};

const centsToQuickBooksAmount = (cents: number): number => Number((Math.abs(cents) / 100).toFixed(2));

const accountRef = (accountExternalId?: string | null, accountName?: string | null) => {
  const value = normalizeText(accountExternalId, 80);
  if (!value) {
    return undefined;
  }
  const name = normalizeText(accountName, 160);
  return {
    value,
    ...(name ? { name } : {}),
  };
};

const previewableLineItem = (item: FinanceLineItem): boolean => (
  item.amountCents !== 0
    && item.status !== 'VOID'
    && item.timing !== 'POTENTIAL'
    && item.timing !== 'WARNING'
);

const entryTypeForLineItem = (item: FinanceLineItem): Extract<FinanceCategoryAccountingEntryType, 'REVENUE' | 'EXPENSE'> => (
  item.amountCents >= 0 ? 'REVENUE' : 'EXPENSE'
);

const mappingKey = (category: string, entryType: FinanceCategoryAccountingEntryType): string => (
  `${normalizeCategoryKey(category)}::${entryType}`
);

const lineDescription = (item: FinanceLineItem): string => {
  const source = normalizeText(item.sourceName ?? item.sourceEntityType ?? item.scope, 120);
  const customer = normalizeText(item.customerName, 120);
  return [
    item.label,
    source ? `Source: ${source}` : null,
    customer ? `Customer: ${customer}` : null,
  ].filter(Boolean).join(' - ').slice(0, 1000);
};

const buildMappingMap = (mappings: CategoryAccountingMapping[]) => {
  const byKey = new Map<string, CategoryAccountingMapping>();
  mappings.forEach((mapping) => {
    if (mapping.isActive === false) {
      return;
    }
    const category = normalizeText(mapping.category, 100);
    if (!category) {
      return;
    }
    byKey.set(mappingKey(category, mapping.entryType), mapping);
  });
  return byKey;
};

export const buildQuickBooksFinanceJournalEntryPreview = ({
  finance,
  mappings,
  clearingMapping,
  from,
  to,
  now = new Date(),
}: {
  finance: OrganizationFinanceSummary;
  mappings: CategoryAccountingMapping[];
  clearingMapping?: FinanceClearingMapping | null;
  from?: string | null;
  to?: string | null;
  now?: Date;
}): QuickBooksFinanceJournalEntryPreview => {
  const mappingByKey = buildMappingMap(mappings);
  const clearingAccountExternalId = normalizeText(clearingMapping?.financeClearingAccountExternalId, 80);
  const clearingAccountName = normalizeText(clearingMapping?.financeClearingAccountName, 160);
  const includedItems = finance.lineItems.filter(previewableLineItem);
  const skippedLineItemCount = finance.lineItems.length - includedItems.length;
  const warnings = new Set<string>();
  const lines: QuickBooksFinanceJournalPreviewLine[] = [];
  let unmappedLineItemCount = 0;

  if (!clearingAccountExternalId) {
    warnings.add('Set a QuickBooks finance clearing account before syncing this journal entry.');
  }

  includedItems.forEach((item, index) => {
    const entryType = entryTypeForLineItem(item);
    const mapping = mappingByKey.get(mappingKey(item.category, entryType));
    const amountCents = Math.abs(item.amountCents);
    const mappedAccountExternalId = normalizeText(mapping?.accountExternalId, 80);
    const mappedAccountName = normalizeText(mapping?.accountName, 160);
    const description = lineDescription(item);
    const mappedPostingType = entryType === 'REVENUE' ? 'Credit' : 'Debit';
    const clearingPostingType = entryType === 'REVENUE' ? 'Debit' : 'Credit';

    if (!mappedAccountExternalId) {
      unmappedLineItemCount += 1;
      warnings.add(`Map ${item.category} ${entryType === 'REVENUE' ? 'revenue' : 'expense'} before syncing.`);
    }

    lines.push({
      id: `${item.id}:mapped:${index}`,
      lineItemId: item.id,
      lineItemLabel: item.label,
      category: item.category,
      sourceType: item.sourceType,
      sourceName: item.sourceName ?? null,
      customerName: item.customerName ?? null,
      postingType: mappedPostingType,
      amountCents,
      accountExternalId: mappedAccountExternalId,
      accountName: mappedAccountName,
      description,
      missingAccount: !mappedAccountExternalId,
      role: 'LINE_ITEM_ACCOUNT',
    });
    lines.push({
      id: `${item.id}:clearing:${index}`,
      lineItemId: item.id,
      lineItemLabel: item.label,
      category: 'Finance clearing',
      sourceType: item.sourceType,
      sourceName: item.sourceName ?? null,
      customerName: item.customerName ?? null,
      postingType: clearingPostingType,
      amountCents,
      accountExternalId: clearingAccountExternalId,
      accountName: clearingAccountName,
      description: `Clearing entry for ${description}`,
      missingAccount: !clearingAccountExternalId,
      role: 'CLEARING_ACCOUNT',
    });
  });

  const debitTotalCents = lines
    .filter((line) => line.postingType === 'Debit')
    .reduce((total, line) => total + line.amountCents, 0);
  const creditTotalCents = lines
    .filter((line) => line.postingType === 'Credit')
    .reduce((total, line) => total + line.amountCents, 0);
  const isBalanced = debitTotalCents === creditTotalCents;
  if (!isBalanced) {
    warnings.add('Journal entry debit and credit totals do not balance.');
  }
  if (!includedItems.length) {
    warnings.add('No syncable finance line items are available for this range.');
  }

  const txnDate = dateOnly(to) ?? dateOnly(now) ?? now.toISOString().slice(0, 10);
  const range = `${dateOnly(from) ?? 'start'} to ${dateOnly(to) ?? txnDate}`;
  const privateNote = `BracketIQ finance line-item journal entry (${range})`;
  const journalEntryPayload = {
    TxnDate: txnDate,
    PrivateNote: privateNote,
    Line: lines.map((line) => {
      const ref = accountRef(line.accountExternalId, line.accountName);
      return {
        DetailType: 'JournalEntryLineDetail' as const,
        Amount: centsToQuickBooksAmount(line.amountCents),
        Description: line.description,
        JournalEntryLineDetail: {
          PostingType: line.postingType,
          ...(ref ? { AccountRef: ref } : {}),
        },
      };
    }),
  };

  return {
    provider: QUICKBOOKS_PROVIDER,
    txnDate,
    privateNote,
    includedLineItemCount: includedItems.length,
    skippedLineItemCount,
    unmappedLineItemCount,
    debitTotalCents,
    creditTotalCents,
    isBalanced,
    readyToSync: isBalanced
      && includedItems.length > 0
      && lines.every((line) => !line.missingAccount),
    warnings: [...warnings],
    lines,
    journalEntryPayload,
  };
};
