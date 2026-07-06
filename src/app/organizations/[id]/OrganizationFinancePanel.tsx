'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Badge,
  Button,
  Group,
  Loader,
  Modal,
  NumberInput,
  Paper,
  Popover,
  ScrollArea,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core';
import { Download, ExternalLink, Pencil, Plus, Settings2, UserRound } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { apiRequest, isApiRequestError } from '@/lib/apiClient';
import { formatBillAmount } from '@/types';
import {
  buildOrganizationCustomerPath,
  buildOrganizationTabPath,
  type OrganizationCustomerRouteType,
} from './organizationTabs';

type FinanceLineItem = {
  id: string;
  sourceType: string;
  sourceId?: string | null;
  scope: 'EVENT' | 'TEAM' | 'ORGANIZATION' | 'EVENT_TEAM';
  label: string;
  sourceName?: string | null;
  sourceEntityType?: 'event' | 'rental' | 'organization' | 'team' | null;
  sourceEntityId?: string | null;
  customerType?: OrganizationCustomerRouteType | null;
  customerId?: string | null;
  customerName?: string | null;
  description?: string | null;
  category: string;
  amountCents: number;
  quantity?: number | null;
  unitLabel?: string | null;
  classification: string;
  status: string;
  timing: 'ACTUAL' | 'FUTURE' | 'POTENTIAL' | 'WARNING';
  serviceStartAt?: string | null;
  serviceEndAt?: string | null;
  isGenerated: boolean;
};

type OrganizationFinanceSummary = {
  organizationId: string;
  grossRevenueCents: number;
  refundCents: number;
  feeCents: number;
  actualRevenueCents: number;
  actualCostCents: number;
  actualProfitCents: number;
  futureCostCents: number;
  potentialRevenueCents: number;
  projectedProfitCents: number;
  staffCostCents: number;
  customCostCents: number;
  lineItems: FinanceLineItem[];
  warnings: Array<{ code: string; message: string }>;
};

type StaffPayRunItem = {
  id: string;
  staffMemberId?: string | null;
  userId?: string | null;
  eventId?: string | null;
  teamId?: string | null;
  eventTeamId?: string | null;
  eventStaffAssignmentId?: string | null;
  teamStaffLaborEntryId?: string | null;
  label: string;
  description?: string | null;
  wageType?: 'HOURLY' | 'SALARY' | 'FLAT_PER_EVENT' | null;
  rateCents?: number | null;
  paidMinutes?: number | null;
  amountCents: number;
  status: string;
  payoutStatus: string;
  approvedAt?: string | null;
  paidAt?: string | null;
  payoutProvider?: string | null;
  payoutProviderTransferId?: string | null;
  notes?: string | null;
  serviceStartAt?: string | null;
  serviceEndAt?: string | null;
};

type AccountingSyncRecord = {
  id: string;
  provider: 'QUICKBOOKS_ONLINE';
  sourceType: 'STAFF_PAY_RUN' | 'FINANCE_JOURNAL_ENTRY';
  staffPayRunId?: string | null;
  sourceKey?: string | null;
  status: 'PENDING' | 'SYNCED' | 'FAILED' | 'REAUTH_REQUIRED' | 'VOID';
  externalTxnId?: string | null;
  externalTxnType?: string | null;
  externalTxnDocNumber?: string | null;
  intuitTid?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  syncedAt?: string | null;
  syncedByUserId?: string | null;
};

type FinanceCategoryAccountingEntryType = 'REVENUE' | 'EXPENSE' | 'LIABILITY' | 'ASSET';

type CategoryAccountingMapping = {
  id: string;
  provider: 'QUICKBOOKS_ONLINE';
  category: string;
  categoryKey: string;
  entryType: FinanceCategoryAccountingEntryType;
  accountExternalId?: string | null;
  accountName?: string | null;
  notes?: string | null;
  isActive: boolean;
  updatedAt?: string | null;
  updatedBy?: string | null;
};

type StaffPayRun = {
  id: string;
  title: string;
  periodStart: string;
  periodEnd: string;
  scheduledPayDate?: string | null;
  status: string;
  payoutStatus: string;
  totalAmountCents: number;
  itemCount: number;
  approvedAt?: string | null;
  approvedByUserId?: string | null;
  paidAt?: string | null;
  paidByUserId?: string | null;
  exportedAt?: string | null;
  exportedByUserId?: string | null;
  exportCount?: number | null;
  lastExportFormat?: string | null;
  payoutProvider?: string | null;
  payoutProviderBatchId?: string | null;
  notes?: string | null;
  items: StaffPayRunItem[];
  accountingSyncs?: AccountingSyncRecord[];
};

type FinanceResponse = {
  finance: OrganizationFinanceSummary;
  payRuns: StaffPayRun[];
  lineItemCategories?: string[];
  accountingConnections?: AccountingConnection[];
  categoryAccountingMappings?: CategoryAccountingMapping[];
};

type AccountingConnection = {
  id: string;
  provider: 'QUICKBOOKS_ONLINE';
  status: 'CONNECTED' | 'REAUTH_REQUIRED' | 'DISCONNECTED';
  externalCompanyId?: string | null;
  externalCompanyName?: string | null;
  environment: string;
  scopes: string[];
  tokenType?: string | null;
  accessTokenExpiresAt?: string | null;
  refreshTokenExpiresAt?: string | null;
  refreshTokenHardExpiresAt?: string | null;
  connectedAt?: string | null;
  connectedByUserId?: string | null;
  disconnectedAt?: string | null;
  disconnectedByUserId?: string | null;
  lastSyncedAt?: string | null;
  lastIntuitTid?: string | null;
  lastErrorAt?: string | null;
  lastError?: string | null;
  payrollExpenseAccountExternalId?: string | null;
  payrollExpenseAccountName?: string | null;
  payrollLiabilityAccountExternalId?: string | null;
  payrollLiabilityAccountName?: string | null;
  financeClearingAccountExternalId?: string | null;
  financeClearingAccountName?: string | null;
};

type QuickBooksAccount = {
  id: string;
  name: string;
  fullyQualifiedName?: string | null;
  displayName: string;
  accountType?: string | null;
  accountSubType?: string | null;
  classification?: string | null;
  accountNumber?: string | null;
  active: boolean;
};

type QuickBooksAccountsResponse = {
  accounts: QuickBooksAccount[];
};

type QuickBooksJournalPreviewLine = {
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

type QuickBooksJournalPreview = {
  provider: 'QUICKBOOKS_ONLINE';
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
  lines: QuickBooksJournalPreviewLine[];
};

type QuickBooksJournalSyncResponse = {
  preview: QuickBooksJournalPreview;
  syncRecord: AccountingSyncRecord;
  alreadySynced: boolean;
};

type LineItemStatus = 'ESTIMATED' | 'APPROVED' | 'ACTUAL' | 'PAID' | 'VOID';

type LineItemDraft = {
  title: string;
  category: string;
  description: string;
  amount: string | number;
  status: LineItemStatus;
  serviceStartDate: string;
  serviceEndDate: string;
  quantity: string | number;
  unitLabel: string;
};

type PayRunAction = 'APPROVE' | 'MARK_PAID' | 'VOID' | 'UPDATE_ITEM_TRANSFERS' | 'RECORD_EXPORT';

type MarkPaidDraft = {
  payoutProvider: string;
  payoutProviderBatchId: string;
  notes: string;
};

type PayRunItemTransferDraft = {
  itemId: string;
  label: string;
  payoutProviderTransferId: string;
};

type QuickBooksMappingDraft = {
  payrollExpenseAccountExternalId: string;
  payrollExpenseAccountName: string;
  payrollLiabilityAccountExternalId: string;
  payrollLiabilityAccountName: string;
  financeClearingAccountExternalId: string;
  financeClearingAccountName: string;
};

type QuickBooksAccountIntent = 'asset' | 'expense' | 'liability' | 'revenue';

type CategoryAccountingMappingDraft = {
  key: string;
  category: string;
  entryType: FinanceCategoryAccountingEntryType;
  accountExternalId: string;
  accountName: string;
  notes: string;
};

type PayRunStatusFilter = 'ALL' | 'DRAFT' | 'APPROVED' | 'PAID' | 'VOID';

type OrganizationFinancePanelProps = {
  organizationId: string;
  isActive: boolean;
  canManage: boolean;
};

type LineItemNavigationTarget = {
  label: string;
  href: string;
};

const dateInputValue = (date = new Date()): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const monthStartValue = (): string => {
  const now = new Date();
  return dateInputValue(new Date(now.getFullYear(), now.getMonth(), 1));
};

const LINE_ITEM_STATUS_OPTIONS = [
  { value: 'ESTIMATED', label: 'Estimated' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'ACTUAL', label: 'Incurred' },
  { value: 'PAID', label: 'Paid' },
  { value: 'VOID', label: 'Void' },
] satisfies Array<{ value: LineItemStatus; label: string }>;

const LINE_ITEM_STATUS_LABELS = new Map<LineItemStatus, string>(
  LINE_ITEM_STATUS_OPTIONS.map((option) => [option.value, option.label]),
);

const dateInputToIso = (value: string, endOfDay = false): string | null => {
  if (!value.trim()) {
    return null;
  }
  const suffix = endOfDay ? 'T23:59:59.999' : 'T00:00:00.000';
  const parsed = new Date(`${value}${suffix}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

const dateValueFromIso = (value?: string | null): string => {
  if (!value) {
    return '';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }
  return dateInputValue(parsed);
};

const centsFromDollars = (amountCents: number): string => {
  const prefix = amountCents < 0 ? '-' : '';
  return `${prefix}${formatBillAmount(Math.abs(amountCents))}`;
};

const dollarsToCents = (value: string | number): number => {
  const numericValue = typeof value === 'number' ? value : Number(String(value).replace(/^\$/, ''));
  return Number.isFinite(numericValue) ? Math.round(numericValue * 100) : 0;
};

const dollarsFromCents = (amountCents: number | null | undefined): string => {
  if (!Number.isFinite(amountCents)) {
    return '';
  }
  return (Number(amountCents) / 100).toFixed(2);
};

const formatDate = (value?: string | null): string => {
  if (!value) {
    return 'No date';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'No date';
  }
  return parsed.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

const formatDateTime = (value?: string | null): string => {
  if (!value) {
    return 'Not set';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'Not set';
  }
  return parsed.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

const formatPeriod = (start?: string | null, end?: string | null): string => {
  const startLabel = formatDate(start);
  const endLabel = formatDate(end);
  return startLabel === endLabel ? startLabel : `${startLabel} - ${endLabel}`;
};

const formatLineItemStatus = (status: string): string => (
  LINE_ITEM_STATUS_LABELS.get(status as LineItemStatus)?.toUpperCase() ?? status
);

const formatLineItemTiming = (timing: FinanceLineItem['timing']): string => (
  timing === 'ACTUAL' ? 'CURRENT' : timing
);

const formatQuantityAndUnit = (quantity?: number | null, unitLabel?: string | null): string => {
  const normalizedUnit = unitLabel?.trim();
  if (quantity == null || !Number.isFinite(quantity)) {
    return normalizedUnit || '-';
  }
  const quantityLabel = Number.isInteger(quantity)
    ? String(quantity)
    : quantity.toLocaleString(undefined, { maximumFractionDigits: 2 });
  const displayUnit = quantity === 1 && normalizedUnit === 'hours'
    ? 'hour'
    : normalizedUnit;
  return displayUnit ? `${quantityLabel} ${displayUnit}` : quantityLabel;
};

const formatLaborMinutes = (minutes?: number | null): string => {
  if (!minutes || !Number.isFinite(minutes) || minutes <= 0) {
    return '-';
  }
  const wholeMinutes = Math.round(minutes);
  const hours = Math.floor(wholeMinutes / 60);
  const remainder = wholeMinutes % 60;
  if (hours && remainder) {
    return `${hours}h ${remainder}m`;
  }
  if (hours) {
    return `${hours}h`;
  }
  return `${remainder}m`;
};

const formatWageType = (wageType?: StaffPayRunItem['wageType']): string => {
  if (wageType === 'HOURLY') {
    return 'Hourly';
  }
  if (wageType === 'SALARY') {
    return 'Salary';
  }
  if (wageType === 'FLAT_PER_EVENT') {
    return 'Flat per event';
  }
  return 'No rate';
};

const formatWageRate = (item: StaffPayRunItem): string => {
  if (!item.rateCents || item.rateCents <= 0) {
    return formatWageType(item.wageType);
  }
  const suffix = item.wageType === 'HOURLY'
    ? '/hr'
    : item.wageType === 'SALARY'
      ? '/yr'
      : item.wageType === 'FLAT_PER_EVENT'
        ? '/event'
        : '';
  return `${formatWageType(item.wageType)} ${centsFromDollars(item.rateCents)}${suffix}`;
};

const payRunPayoutColor = (status: string): string => {
  if (status === 'PAID') {
    return 'green';
  }
  if (status === 'FAILED' || status === 'CANCELLED') {
    return 'red';
  }
  if (status === 'PROCESSING' || status === 'PENDING') {
    return 'orange';
  }
  return 'gray';
};

const accountingStatusColor = (status?: AccountingConnection['status'] | null): string => {
  if (status === 'CONNECTED') {
    return 'green';
  }
  if (status === 'REAUTH_REQUIRED') {
    return 'orange';
  }
  return 'gray';
};

const accountingStatusLabel = (status?: AccountingConnection['status'] | null): string => {
  if (status === 'CONNECTED') {
    return 'Connected';
  }
  if (status === 'REAUTH_REQUIRED') {
    return 'Reconnect required';
  }
  return 'Not connected';
};

const accountingSyncStatusColor = (status?: AccountingSyncRecord['status'] | null): string => {
  if (status === 'SYNCED') {
    return 'green';
  }
  if (status === 'FAILED') {
    return 'red';
  }
  if (status === 'REAUTH_REQUIRED') {
    return 'orange';
  }
  if (status === 'PENDING') {
    return 'yellow';
  }
  return 'gray';
};

const accountingSyncStatusLabel = (status?: AccountingSyncRecord['status'] | null): string => {
  if (status === 'SYNCED') {
    return 'Synced';
  }
  if (status === 'FAILED') {
    return 'Failed';
  }
  if (status === 'REAUTH_REQUIRED') {
    return 'Reconnect';
  }
  if (status === 'PENDING') {
    return 'Pending';
  }
  return 'Not synced';
};

const isRetryableQuickBooksReauthSync = (
  sync?: AccountingSyncRecord | null,
  connection?: AccountingConnection | null,
): boolean => (
  sync?.provider === 'QUICKBOOKS_ONLINE'
    && sync.status === 'REAUTH_REQUIRED'
    && connection?.status === 'CONNECTED'
);

const quickBooksSyncStatusColor = (
  sync?: AccountingSyncRecord | null,
  connection?: AccountingConnection | null,
): string => (
  isRetryableQuickBooksReauthSync(sync, connection)
    ? 'blue'
    : accountingSyncStatusColor(sync?.status)
);

const quickBooksSyncStatusLabel = (
  sync?: AccountingSyncRecord | null,
  connection?: AccountingConnection | null,
): string => (
  isRetryableQuickBooksReauthSync(sync, connection)
    ? 'Retry'
    : accountingSyncStatusLabel(sync?.status)
);

const quickBooksSyncErrorMessage = (
  sync?: AccountingSyncRecord | null,
  connection?: AccountingConnection | null,
): string | null => {
  if (!sync?.errorMessage) {
    return null;
  }
  if (isRetryableQuickBooksReauthSync(sync, connection)) {
    return 'QuickBooks reconnected. Try syncing this pay run again.';
  }
  return sync.errorMessage;
};

const quickBooksConnectionActionLabel = (connection?: AccountingConnection | null): string => (
  connection?.status === 'CONNECTED' || connection?.status === 'REAUTH_REQUIRED'
    ? 'Reconnect'
    : 'Connect'
);

const quickBooksPayRunActionLabel = (sync?: AccountingSyncRecord | null): string => (
  sync?.status === 'FAILED' || sync?.status === 'REAUTH_REQUIRED' ? 'Retry QBO' : 'Sync QBO'
);

const accountingEntryTypeLabel = (entryType: FinanceCategoryAccountingEntryType): string => {
  if (entryType === 'REVENUE') {
    return 'Revenue';
  }
  if (entryType === 'EXPENSE') {
    return 'Expense';
  }
  if (entryType === 'LIABILITY') {
    return 'Liability';
  }
  return 'Asset';
};

const accountingEntryTypeColor = (entryType: FinanceCategoryAccountingEntryType): string => {
  if (entryType === 'REVENUE') {
    return 'green';
  }
  if (entryType === 'EXPENSE') {
    return 'red';
  }
  if (entryType === 'LIABILITY') {
    return 'orange';
  }
  return 'blue';
};

const isQuickBooksPayRunSyncEligible = (payRun: StaffPayRun): boolean => (
  payRun.status === 'APPROVED' || payRun.status === 'PAID'
);

const getQuickBooksSync = (payRun: StaffPayRun): AccountingSyncRecord | null => (
  payRun.accountingSyncs?.find((sync) => sync.provider === 'QUICKBOOKS_ONLINE') ?? null
);

const categoryMappingKey = (category: string, entryType: FinanceCategoryAccountingEntryType): string => (
  `${category.trim().toLowerCase()}::${entryType}`
);

const inferLineItemEntryType = (item: FinanceLineItem): FinanceCategoryAccountingEntryType => (
  item.amountCents >= 0 ? 'REVENUE' : 'EXPENSE'
);

const buildCategoryAccountingMappingDrafts = ({
  lineItems,
  categories,
  mappings,
}: {
  lineItems: FinanceLineItem[];
  categories: string[];
  mappings: CategoryAccountingMapping[];
}): CategoryAccountingMappingDraft[] => {
  const rows = new Map<string, CategoryAccountingMappingDraft>();
  const addRow = (category: string, entryType: FinanceCategoryAccountingEntryType) => {
    const normalizedCategory = category.trim();
    if (!normalizedCategory) {
      return;
    }
    const key = categoryMappingKey(normalizedCategory, entryType);
    if (!rows.has(key)) {
      rows.set(key, {
        key,
        category: normalizedCategory,
        entryType,
        accountExternalId: '',
        accountName: '',
        notes: '',
      });
    }
  };

  lineItems.forEach((item) => addRow(item.category, inferLineItemEntryType(item)));
  categories.forEach((category) => addRow(category, 'EXPENSE'));
  mappings.forEach((mapping) => {
    addRow(mapping.category, mapping.entryType);
    const key = categoryMappingKey(mapping.category, mapping.entryType);
    const current = rows.get(key);
    if (current) {
      rows.set(key, {
        ...current,
        accountExternalId: mapping.accountExternalId ?? '',
        accountName: mapping.accountName ?? '',
        notes: mapping.notes ?? '',
      });
    }
  });

  return [...rows.values()].sort((a, b) => (
    a.category.localeCompare(b.category) || a.entryType.localeCompare(b.entryType)
  ));
};

const defaultQuickBooksMappingDraft = (connection?: AccountingConnection | null): QuickBooksMappingDraft => ({
  payrollExpenseAccountExternalId: connection?.payrollExpenseAccountExternalId ?? '',
  payrollExpenseAccountName: connection?.payrollExpenseAccountName ?? '',
  payrollLiabilityAccountExternalId: connection?.payrollLiabilityAccountExternalId ?? '',
  payrollLiabilityAccountName: connection?.payrollLiabilityAccountName ?? '',
  financeClearingAccountExternalId: connection?.financeClearingAccountExternalId ?? '',
  financeClearingAccountName: connection?.financeClearingAccountName ?? '',
});

const normalizeQuickBooksText = (value?: string | null): string => (
  value?.trim().toLowerCase() ?? ''
);

const quickBooksAccountHasKeyword = (account: QuickBooksAccount, keywords: string[]): boolean => {
  const searchable = [
    account.name,
    account.fullyQualifiedName,
    account.accountType,
    account.accountSubType,
    account.classification,
  ].map(normalizeQuickBooksText).join(' ');
  return keywords.some((keyword) => searchable.includes(keyword));
};

const quickBooksMappingScore = (
  account: QuickBooksAccount,
  intent: QuickBooksAccountIntent,
): number => {
  const accountType = normalizeQuickBooksText(account.accountType);
  const accountSubType = normalizeQuickBooksText(account.accountSubType);
  if (intent === 'expense') {
    let score = accountType === 'expense' || accountType === 'cost of goods sold' || accountType === 'other expense' ? 60 : 0;
    if (quickBooksAccountHasKeyword(account, ['payroll', 'wage', 'salary', 'labor', 'staff', 'contractor'])) {
      score += 30;
    }
    if (accountSubType.includes('payroll') || accountSubType.includes('labor')) {
      score += 10;
    }
    return score;
  }

  if (intent === 'revenue') {
    let score = accountType === 'income' || accountType === 'other income' ? 60 : 0;
    if (quickBooksAccountHasKeyword(account, ['sales', 'revenue', 'income', 'registration', 'fees'])) {
      score += 30;
    }
    if (accountSubType.includes('income') || accountSubType.includes('sales')) {
      score += 10;
    }
    return score;
  }

  if (intent === 'asset') {
    let score = accountType === 'bank'
      || accountType === 'accounts receivable'
      || accountType === 'other current asset'
      ? 60
      : 0;
    if (quickBooksAccountHasKeyword(account, ['cash', 'bank', 'receivable', 'asset', 'clearing'])) {
      score += 30;
    }
    if (accountSubType.includes('cash') || accountSubType.includes('receivable')) {
      score += 10;
    }
    return score;
  }

  let score = accountType === 'other current liability'
    || accountType === 'long term liability'
    || accountType === 'accounts payable'
    ? 60
    : 0;
  if (quickBooksAccountHasKeyword(account, ['payroll', 'liabil', 'clearing', 'accrued', 'payable', 'withholding'])) {
    score += 30;
  }
  if (accountSubType.includes('liabil') || accountSubType.includes('payroll')) {
    score += 10;
  }
  return score;
};

const sortQuickBooksAccountsForMapping = (
  accounts: QuickBooksAccount[],
  intent: QuickBooksAccountIntent,
): QuickBooksAccount[] => (
  [...accounts].sort((a, b) => {
    const scoreDelta = quickBooksMappingScore(b, intent) - quickBooksMappingScore(a, intent);
    if (scoreDelta !== 0) {
      return scoreDelta;
    }
    return a.displayName.localeCompare(b.displayName);
  })
);

const quickBooksAccountIntentForEntryType = (
  entryType: FinanceCategoryAccountingEntryType,
): QuickBooksAccountIntent => {
  if (entryType === 'REVENUE') {
    return 'revenue';
  }
  if (entryType === 'LIABILITY') {
    return 'liability';
  }
  if (entryType === 'ASSET') {
    return 'asset';
  }
  return 'expense';
};

const quickBooksAccountSelectOption = (account: QuickBooksAccount) => ({
  value: account.id,
  label: account.displayName,
});

const selectedQuickBooksAccountFallback = (
  id: string,
  name: string,
): QuickBooksAccount | null => {
  const trimmedId = id.trim();
  const trimmedName = name.trim();
  if (!trimmedId) {
    return null;
  }
  return {
    id: trimmedId,
    name: trimmedName || trimmedId,
    fullyQualifiedName: trimmedName || null,
    displayName: trimmedName ? `${trimmedName} · ${trimmedId}` : trimmedId,
    accountType: null,
    accountSubType: null,
    classification: null,
    accountNumber: null,
    active: true,
  };
};

const mergeSelectedQuickBooksAccount = (
  accounts: QuickBooksAccount[],
  selected: QuickBooksAccount | null,
): QuickBooksAccount[] => {
  if (!selected || accounts.some((account) => account.id === selected.id)) {
    return accounts;
  }
  return [selected, ...accounts];
};

const formatPayRunExportStatus = (payRun: StaffPayRun): string => {
  if (!payRun.exportedAt) {
    return 'Not exported';
  }
  const format = payRun.lastExportFormat === 'QUICKBOOKS_JOURNAL_ENTRY'
    ? 'QuickBooks'
    : payRun.lastExportFormat ?? 'CSV';
  return `${format} #${payRun.exportCount ?? 1}`;
};

const defaultMarkPaidDraft = (payRun?: StaffPayRun | null): MarkPaidDraft => ({
  payoutProvider: payRun?.payoutProvider ?? '',
  payoutProviderBatchId: payRun?.payoutProviderBatchId ?? '',
  notes: payRun?.notes ?? '',
});

const csvCell = (value: string | number | null | undefined): string => {
  const raw = value == null ? '' : String(value);
  return `"${raw.replace(/"/g, '""')}"`;
};

const centsToCsvDollars = (amountCents?: number | null): string => (
  Number.isFinite(amountCents) ? (Number(amountCents) / 100).toFixed(2) : ''
);

const sourceLabelForPayRunItem = (item: StaffPayRunItem): string => {
  if (item.eventStaffAssignmentId) {
    return 'Event labor';
  }
  if (item.teamStaffLaborEntryId) {
    return 'Team labor';
  }
  return 'Staff labor';
};

const buildPayRunCsv = (payRunsToExport: StaffPayRun[]): string => {
  const headers = [
    'Pay Run',
    'Pay Run Status',
    'Payout Status',
    'Period Start',
    'Period End',
    'Scheduled Pay Date',
    'Exported At',
    'Export Count',
    'Export Format',
    'Staff',
    'User ID',
    'Staff Member ID',
    'Source Type',
    'Event ID',
    'Team ID',
    'Event Team ID',
    'Service Start',
    'Service End',
    'Wage Type',
    'Rate',
    'Paid Minutes',
    'Amount',
    'Payout Provider',
    'Batch Reference',
    'Transfer Reference',
    'Item Status',
    'Item Payout Status',
    'Notes',
  ];
  const rows = payRunsToExport.flatMap((payRun) => (
    payRun.items.map((item) => [
      payRun.title,
      payRun.status,
      payRun.payoutStatus,
      payRun.periodStart,
      payRun.periodEnd,
      payRun.scheduledPayDate ?? '',
      payRun.exportedAt ?? '',
      payRun.exportCount ?? '',
      payRun.lastExportFormat ?? '',
      item.label,
      item.userId ?? '',
      item.staffMemberId ?? '',
      sourceLabelForPayRunItem(item),
      item.eventId ?? '',
      item.teamId ?? '',
      item.eventTeamId ?? '',
      item.serviceStartAt ?? '',
      item.serviceEndAt ?? '',
      item.wageType ?? '',
      centsToCsvDollars(item.rateCents),
      item.paidMinutes ?? '',
      centsToCsvDollars(item.amountCents),
      item.payoutProvider ?? payRun.payoutProvider ?? '',
      payRun.payoutProviderBatchId ?? '',
      item.payoutProviderTransferId ?? '',
      item.status,
      item.payoutStatus,
      item.notes ?? payRun.notes ?? '',
    ])
  ));
  return [
    headers.map(csvCell).join(','),
    ...rows.map((row) => row.map(csvCell).join(',')),
  ].join('\n');
};

const downloadCsv = (filename: string, csv: string): void => {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
};

const defaultLineItemDraft = (): LineItemDraft => ({
  title: '',
  category: 'Operations',
  description: '',
  amount: '',
  status: 'ACTUAL',
  serviceStartDate: dateInputValue(),
  serviceEndDate: '',
  quantity: '',
  unitLabel: '',
});

const lineItemDraftFromItem = (item: FinanceLineItem): LineItemDraft => ({
  title: item.label,
  category: item.category,
  description: item.description ?? '',
  amount: dollarsFromCents(Math.abs(item.amountCents)),
  status: LINE_ITEM_STATUS_OPTIONS.some((option) => option.value === item.status)
    ? item.status as LineItemStatus
    : 'ACTUAL',
  serviceStartDate: dateValueFromIso(item.serviceStartAt),
  serviceEndDate: dateValueFromIso(item.serviceEndAt),
  quantity: item.quantity ?? '',
  unitLabel: item.unitLabel ?? '',
});

const messageForError = (error: unknown, fallback: string): string => {
  if (isApiRequestError(error)) {
    return error.message;
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
};

function FinanceMetric({
  label,
  value,
  description,
  tone,
}: {
  label: string;
  value: number;
  description: string;
  tone: 'green' | 'red' | 'orange' | 'gray';
}) {
  const toneClassName = {
    green: 'border-green-200 bg-green-50 text-green-800',
    red: 'border-red-200 bg-red-50 text-red-800',
    orange: 'border-orange-200 bg-orange-50 text-orange-800',
    gray: 'border-gray-200 bg-gray-50 text-gray-800',
  }[tone];

  return (
    <Paper withBorder radius="md" p="md" className={toneClassName}>
      <Stack gap={4}>
        <Text size="xs" fw={700} tt="uppercase">{label}</Text>
        <Text size="xl" fw={800}>{centsFromDollars(value)}</Text>
        <Text size="xs">{description}</Text>
      </Stack>
    </Paper>
  );
}

export default function OrganizationFinancePanel({
  organizationId,
  isActive,
  canManage,
}: OrganizationFinancePanelProps) {
  const router = useRouter();
  const [fromDate, setFromDate] = useState(monthStartValue);
  const [toDate, setToDate] = useState(() => dateInputValue());
  const [finance, setFinance] = useState<OrganizationFinanceSummary | null>(null);
  const [payRuns, setPayRuns] = useState<StaffPayRun[]>([]);
  const [lineItemCategories, setLineItemCategories] = useState<string[]>([]);
  const [accountingConnections, setAccountingConnections] = useState<AccountingConnection[]>([]);
  const [categoryAccountingMappings, setCategoryAccountingMappings] = useState<CategoryAccountingMapping[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payRunTitle, setPayRunTitle] = useState('');
  const [payRunStart, setPayRunStart] = useState(monthStartValue);
  const [payRunEnd, setPayRunEnd] = useState(() => dateInputValue());
  const [payRunPayDate, setPayRunPayDate] = useState(() => dateInputValue());
  const [payRunSaving, setPayRunSaving] = useState(false);
  const [updatingPayRunId, setUpdatingPayRunId] = useState<string | null>(null);
  const [payrollError, setPayrollError] = useState<string | null>(null);
  const [selectedPayRunId, setSelectedPayRunId] = useState<string | null>(null);
  const [markPaidPayRunId, setMarkPaidPayRunId] = useState<string | null>(null);
  const [markPaidDraft, setMarkPaidDraft] = useState<MarkPaidDraft>(() => defaultMarkPaidDraft());
  const [markPaidError, setMarkPaidError] = useState<string | null>(null);
  const [voidPayRunId, setVoidPayRunId] = useState<string | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [voidError, setVoidError] = useState<string | null>(null);
  const [transferPayRunId, setTransferPayRunId] = useState<string | null>(null);
  const [transferDraft, setTransferDraft] = useState<PayRunItemTransferDraft[]>([]);
  const [transferError, setTransferError] = useState<string | null>(null);
  const [payRunStatusFilter, setPayRunStatusFilter] = useState<PayRunStatusFilter>('ALL');
  const [payRunStaffFilter, setPayRunStaffFilter] = useState('ALL');
  const [payRunFromFilter, setPayRunFromFilter] = useState('');
  const [payRunToFilter, setPayRunToFilter] = useState('');
  const [quickBooksSaving, setQuickBooksSaving] = useState(false);
  const [quickBooksMappingSaving, setQuickBooksMappingSaving] = useState(false);
  const [quickBooksMappingDraft, setQuickBooksMappingDraft] = useState<QuickBooksMappingDraft>(() => defaultQuickBooksMappingDraft());
  const [quickBooksAccounts, setQuickBooksAccounts] = useState<QuickBooksAccount[]>([]);
  const [quickBooksAccountsLoading, setQuickBooksAccountsLoading] = useState(false);
  const [quickBooksAccountsError, setQuickBooksAccountsError] = useState<string | null>(null);
  const [quickBooksSettingsOpen, setQuickBooksSettingsOpen] = useState(false);
  const [quickBooksManualMappingOpen, setQuickBooksManualMappingOpen] = useState(false);
  const [syncingQuickBooksPayRunId, setSyncingQuickBooksPayRunId] = useState<string | null>(null);
  const [quickBooksError, setQuickBooksError] = useState<string | null>(null);
  const [categoryMappingDrafts, setCategoryMappingDrafts] = useState<CategoryAccountingMappingDraft[]>([]);
  const [categoryMappingSaving, setCategoryMappingSaving] = useState(false);
  const [categoryMappingError, setCategoryMappingError] = useState<string | null>(null);
  const [journalPreview, setJournalPreview] = useState<QuickBooksJournalPreview | null>(null);
  const [journalPreviewLoading, setJournalPreviewLoading] = useState(false);
  const [journalPreviewError, setJournalPreviewError] = useState<string | null>(null);
  const [journalSyncLoading, setJournalSyncLoading] = useState(false);
  const [journalSyncError, setJournalSyncError] = useState<string | null>(null);
  const [journalSyncRecord, setJournalSyncRecord] = useState<AccountingSyncRecord | null>(null);
  const [lineItemModalOpen, setLineItemModalOpen] = useState(false);
  const [editingLineItem, setEditingLineItem] = useState<FinanceLineItem | null>(null);
  const [lineItemDraft, setLineItemDraft] = useState<LineItemDraft>(() => defaultLineItemDraft());
  const [lineItemSaving, setLineItemSaving] = useState(false);
  const [lineItemError, setLineItemError] = useState<string | null>(null);

  const loadFinance = useCallback(async () => {
    if (!isActive) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (fromDate.trim()) {
        params.set('from', dateInputToIso(fromDate) ?? fromDate);
      }
      if (toDate.trim()) {
        params.set('to', dateInputToIso(toDate, true) ?? toDate);
      }
      const suffix = params.toString() ? `?${params.toString()}` : '';
      const response = await apiRequest<FinanceResponse>(`/api/organizations/${organizationId}/finance${suffix}`);
      setFinance(response.finance);
      setPayRuns(response.payRuns ?? []);
      setLineItemCategories(response.lineItemCategories ?? []);
      setAccountingConnections(response.accountingConnections ?? []);
      setCategoryAccountingMappings(response.categoryAccountingMappings ?? []);
    } catch (loadError) {
      setError(messageForError(loadError, 'Failed to load organization finance.'));
    } finally {
      setLoading(false);
    }
  }, [fromDate, isActive, organizationId, toDate]);

  useEffect(() => {
    void loadFinance();
  }, [loadFinance]);

  const sortedLineItems = useMemo(() => (
    [...(finance?.lineItems ?? [])].sort((a, b) => {
      const aDate = a.serviceStartAt ? new Date(a.serviceStartAt).getTime() : 0;
      const bDate = b.serviceStartAt ? new Date(b.serviceStartAt).getTime() : 0;
      return bDate - aDate;
    })
  ), [finance?.lineItems]);

  const selectedPayRun = useMemo(() => (
    payRuns.find((payRun) => payRun.id === selectedPayRunId) ?? null
  ), [payRuns, selectedPayRunId]);

  const markPaidPayRun = useMemo(() => (
    payRuns.find((payRun) => payRun.id === markPaidPayRunId) ?? null
  ), [markPaidPayRunId, payRuns]);

  const voidPayRun = useMemo(() => (
    payRuns.find((payRun) => payRun.id === voidPayRunId) ?? null
  ), [payRuns, voidPayRunId]);

  const transferPayRun = useMemo(() => (
    payRuns.find((payRun) => payRun.id === transferPayRunId) ?? null
  ), [payRuns, transferPayRunId]);

  const quickBooksConnection = useMemo(() => (
    accountingConnections.find((connection) => connection.provider === 'QUICKBOOKS_ONLINE') ?? null
  ), [accountingConnections]);

  useEffect(() => {
    setQuickBooksMappingDraft(defaultQuickBooksMappingDraft(quickBooksConnection));
  }, [
    quickBooksConnection?.id,
    quickBooksConnection?.payrollExpenseAccountExternalId,
    quickBooksConnection?.payrollExpenseAccountName,
    quickBooksConnection?.payrollLiabilityAccountExternalId,
    quickBooksConnection?.payrollLiabilityAccountName,
    quickBooksConnection?.financeClearingAccountExternalId,
    quickBooksConnection?.financeClearingAccountName,
  ]);

  const quickBooksMappingReady = Boolean(
    quickBooksConnection?.payrollExpenseAccountExternalId
      && quickBooksConnection?.payrollLiabilityAccountExternalId,
  );
  const quickBooksMappingDisabled = !quickBooksConnection || quickBooksConnection.status !== 'CONNECTED';
  const quickBooksCategoryMappingDisabled = !quickBooksConnection || quickBooksConnection.status === 'DISCONNECTED';

  const activeQuickBooksAccounts = useMemo(() => (
    quickBooksAccounts.filter((account) => account.active)
  ), [quickBooksAccounts]);

  const configuredCategoryMappingCount = useMemo(() => (
    categoryAccountingMappings.filter((mapping) => mapping.isActive && mapping.accountExternalId).length
  ), [categoryAccountingMappings]);

  const expenseAccountOptions = useMemo(() => {
    const selectedAccount = selectedQuickBooksAccountFallback(
      quickBooksMappingDraft.payrollExpenseAccountExternalId,
      quickBooksMappingDraft.payrollExpenseAccountName,
    );
    return mergeSelectedQuickBooksAccount(
      sortQuickBooksAccountsForMapping(activeQuickBooksAccounts, 'expense'),
      selectedAccount,
    ).map(quickBooksAccountSelectOption);
  }, [
    activeQuickBooksAccounts,
    quickBooksMappingDraft.payrollExpenseAccountExternalId,
    quickBooksMappingDraft.payrollExpenseAccountName,
  ]);

  const liabilityAccountOptions = useMemo(() => {
    const selectedAccount = selectedQuickBooksAccountFallback(
      quickBooksMappingDraft.payrollLiabilityAccountExternalId,
      quickBooksMappingDraft.payrollLiabilityAccountName,
    );
    return mergeSelectedQuickBooksAccount(
      sortQuickBooksAccountsForMapping(activeQuickBooksAccounts, 'liability'),
      selectedAccount,
    ).map(quickBooksAccountSelectOption);
  }, [
    activeQuickBooksAccounts,
    quickBooksMappingDraft.payrollLiabilityAccountExternalId,
    quickBooksMappingDraft.payrollLiabilityAccountName,
  ]);

  const clearingAccountOptions = useMemo(() => {
    const selectedAccount = selectedQuickBooksAccountFallback(
      quickBooksMappingDraft.financeClearingAccountExternalId,
      quickBooksMappingDraft.financeClearingAccountName,
    );
    return mergeSelectedQuickBooksAccount(
      sortQuickBooksAccountsForMapping(activeQuickBooksAccounts, 'asset'),
      selectedAccount,
    ).map(quickBooksAccountSelectOption);
  }, [
    activeQuickBooksAccounts,
    quickBooksMappingDraft.financeClearingAccountExternalId,
    quickBooksMappingDraft.financeClearingAccountName,
  ]);

  const getCategoryAccountOptions = useCallback((draft: CategoryAccountingMappingDraft) => {
    const selectedAccount = selectedQuickBooksAccountFallback(
      draft.accountExternalId,
      draft.accountName,
    );
    return mergeSelectedQuickBooksAccount(
      sortQuickBooksAccountsForMapping(
        activeQuickBooksAccounts,
        quickBooksAccountIntentForEntryType(draft.entryType),
      ),
      selectedAccount,
    ).map(quickBooksAccountSelectOption);
  }, [activeQuickBooksAccounts]);

  const getSelectedCategoryAccount = useCallback((draft: CategoryAccountingMappingDraft) => (
    activeQuickBooksAccounts.find((account) => account.id === draft.accountExternalId)
      ?? selectedQuickBooksAccountFallback(draft.accountExternalId, draft.accountName)
  ), [activeQuickBooksAccounts]);

  const selectedExpenseAccount = useMemo(() => (
    activeQuickBooksAccounts.find((account) => account.id === quickBooksMappingDraft.payrollExpenseAccountExternalId)
      ?? selectedQuickBooksAccountFallback(
        quickBooksMappingDraft.payrollExpenseAccountExternalId,
        quickBooksMappingDraft.payrollExpenseAccountName,
      )
  ), [
    activeQuickBooksAccounts,
    quickBooksMappingDraft.payrollExpenseAccountExternalId,
    quickBooksMappingDraft.payrollExpenseAccountName,
  ]);

  const selectedLiabilityAccount = useMemo(() => (
    activeQuickBooksAccounts.find((account) => account.id === quickBooksMappingDraft.payrollLiabilityAccountExternalId)
      ?? selectedQuickBooksAccountFallback(
        quickBooksMappingDraft.payrollLiabilityAccountExternalId,
        quickBooksMappingDraft.payrollLiabilityAccountName,
      )
  ), [
    activeQuickBooksAccounts,
    quickBooksMappingDraft.payrollLiabilityAccountExternalId,
    quickBooksMappingDraft.payrollLiabilityAccountName,
  ]);

  const selectedClearingAccount = useMemo(() => (
    activeQuickBooksAccounts.find((account) => account.id === quickBooksMappingDraft.financeClearingAccountExternalId)
      ?? selectedQuickBooksAccountFallback(
        quickBooksMappingDraft.financeClearingAccountExternalId,
        quickBooksMappingDraft.financeClearingAccountName,
      )
  ), [
    activeQuickBooksAccounts,
    quickBooksMappingDraft.financeClearingAccountExternalId,
    quickBooksMappingDraft.financeClearingAccountName,
  ]);

  const payRunStaffOptions = useMemo(() => {
    const staffByKey = new Map<string, string>();
    payRuns.forEach((payRun) => {
      payRun.items.forEach((item) => {
        const key = item.userId ?? item.staffMemberId ?? item.label;
        if (!staffByKey.has(key)) {
          staffByKey.set(key, item.label);
        }
      });
    });
    return [
      { value: 'ALL', label: 'All staff' },
      ...[...staffByKey.entries()]
        .map(([value, label]) => ({ value, label }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    ];
  }, [payRuns]);

  const filteredPayRuns = useMemo(() => {
    const filterStart = payRunFromFilter.trim() ? new Date(`${payRunFromFilter}T00:00:00.000`).getTime() : null;
    const filterEnd = payRunToFilter.trim() ? new Date(`${payRunToFilter}T23:59:59.999`).getTime() : null;
    return payRuns.filter((payRun) => {
      if (payRunStatusFilter !== 'ALL' && payRun.status !== payRunStatusFilter) {
        return false;
      }
      if (payRunStaffFilter !== 'ALL') {
        const hasStaff = payRun.items.some((item) => (
          item.userId === payRunStaffFilter
          || item.staffMemberId === payRunStaffFilter
          || item.label === payRunStaffFilter
        ));
        if (!hasStaff) {
          return false;
        }
      }
      const payRunStart = new Date(payRun.periodStart).getTime();
      const payRunEnd = new Date(payRun.periodEnd).getTime();
      if (filterStart != null && Number.isFinite(filterStart) && Number.isFinite(payRunEnd) && payRunEnd < filterStart) {
        return false;
      }
      if (filterEnd != null && Number.isFinite(filterEnd) && Number.isFinite(payRunStart) && payRunStart > filterEnd) {
        return false;
      }
      return true;
    });
  }, [payRunFromFilter, payRunStaffFilter, payRunStatusFilter, payRunToFilter, payRuns]);

  const payRunLedgerRows = useMemo(() => {
    const rowsByStaff = new Map<string, {
      key: string;
      label: string;
      itemCount: number;
      minutes: number;
      draftCents: number;
      approvedCents: number;
      paidCents: number;
      totalCents: number;
    }>();
    filteredPayRuns.forEach((payRun) => {
      payRun.items.forEach((item) => {
        const key = item.userId ?? item.staffMemberId ?? item.label;
        const current = rowsByStaff.get(key) ?? {
          key,
          label: item.label,
          itemCount: 0,
          minutes: 0,
          draftCents: 0,
          approvedCents: 0,
          paidCents: 0,
          totalCents: 0,
        };
        current.itemCount += 1;
        current.minutes += item.paidMinutes ?? 0;
        current.totalCents += item.amountCents;
        if (item.status === 'PAID') {
          current.paidCents += item.amountCents;
        } else if (item.status === 'APPROVED') {
          current.approvedCents += item.amountCents;
        } else if (item.status === 'DRAFT') {
          current.draftCents += item.amountCents;
        }
        rowsByStaff.set(key, current);
      });
    });
    return [...rowsByStaff.values()].sort((a, b) => b.totalCents - a.totalCents);
  }, [filteredPayRuns]);

  const profitabilityRows = useMemo(() => {
    const rowsBySource = new Map<string, {
      key: string;
      name: string;
      type: string;
      sourceId: string | null;
      customerType: OrganizationCustomerRouteType | null;
      revenueCents: number;
      costCents: number;
      profitCents: number;
      itemCount: number;
    }>();
    (finance?.lineItems ?? []).forEach((item) => {
      const normalizedType = item.sourceEntityType === 'team' || item.scope === 'TEAM' || item.scope === 'EVENT_TEAM'
        ? 'Team'
        : item.sourceEntityType === 'event' || item.scope === 'EVENT'
          ? 'Event'
          : null;
      if (!normalizedType) {
        return;
      }
      const sourceId = item.sourceEntityId ?? item.customerId ?? item.sourceId ?? null;
      const key = `${normalizedType}:${sourceId ?? item.sourceName ?? item.label}`;
      const current = rowsBySource.get(key) ?? {
        key,
        name: item.sourceName ?? item.customerName ?? item.label,
        type: normalizedType,
        sourceId,
        customerType: normalizedType === 'Team' ? 'teams' : null,
        revenueCents: 0,
        costCents: 0,
        profitCents: 0,
        itemCount: 0,
      };
      if (item.amountCents >= 0) {
        current.revenueCents += item.amountCents;
      } else {
        current.costCents += Math.abs(item.amountCents);
      }
      current.profitCents += item.amountCents;
      current.itemCount += 1;
      rowsBySource.set(key, current);
    });
    return [...rowsBySource.values()].sort((a, b) => b.profitCents - a.profitCents);
  }, [finance?.lineItems]);

  const lineItemCategoryOptions = useMemo(() => {
    const categoriesByKey = new Map<string, string>();
    [...lineItemCategories, ...(finance?.lineItems ?? [])
      .filter((item) => !item.isGenerated)
      .map((item) => item.category)]
      .forEach((category) => {
        const normalizedCategory = category.trim();
        if (!normalizedCategory) {
          return;
        }
        const key = normalizedCategory.toLowerCase();
        if (!categoriesByKey.has(key)) {
          categoriesByKey.set(key, normalizedCategory);
        }
      });
    return [...categoriesByKey.values()].sort((a, b) => a.localeCompare(b));
  }, [finance?.lineItems, lineItemCategories]);

  useEffect(() => {
    setCategoryMappingDrafts(buildCategoryAccountingMappingDrafts({
      lineItems: finance?.lineItems ?? [],
      categories: lineItemCategories,
      mappings: categoryAccountingMappings,
    }));
  }, [categoryAccountingMappings, finance?.lineItems, lineItemCategories]);

  const updateLineItemDraft = useCallback((patch: Partial<LineItemDraft>) => {
    setLineItemDraft((current) => ({ ...current, ...patch }));
  }, []);

  const updateCategoryMappingDraft = useCallback((
    key: string,
    patch: Partial<Pick<CategoryAccountingMappingDraft, 'accountExternalId' | 'accountName' | 'notes'>>,
  ) => {
    setJournalPreview(null);
    setJournalSyncRecord(null);
    setCategoryMappingDrafts((current) => current.map((draft) => (
      draft.key === key ? { ...draft, ...patch } : draft
    )));
  }, []);

  const selectCategoryMappingAccount = useCallback((key: string, accountId: string | null) => {
    setJournalPreview(null);
    setJournalSyncRecord(null);
    setCategoryMappingDrafts((current) => current.map((draft) => {
      if (draft.key !== key) {
        return draft;
      }
      if (!accountId) {
        return {
          ...draft,
          accountExternalId: '',
          accountName: '',
        };
      }
      const account = activeQuickBooksAccounts.find((entry) => entry.id === accountId);
      if (!account) {
        return {
          ...draft,
          accountExternalId: accountId,
        };
      }
      return {
        ...draft,
        accountExternalId: account.id,
        accountName: account.fullyQualifiedName ?? account.name ?? '',
      };
    }));
  }, [activeQuickBooksAccounts]);

  const getLineItemSourceTarget = useCallback((item: FinanceLineItem): LineItemNavigationTarget | null => {
    const sourceId = item.sourceEntityId?.trim();
    const sourceType = item.sourceEntityType;
    if (!sourceId || !sourceType) {
      return null;
    }
    const label = item.sourceName?.trim() || 'Source';
    if (sourceType === 'event') {
      return { label, href: `/events/${encodeURIComponent(sourceId)}?tab=details` };
    }
    if (sourceType === 'rental') {
      return { label, href: buildOrganizationTabPath(organizationId, 'fields') };
    }
    if (sourceType === 'team') {
      return { label, href: buildOrganizationCustomerPath(organizationId, 'teams', sourceId) };
    }
    if (sourceType === 'organization') {
      return { label, href: buildOrganizationTabPath(organizationId, 'overview') };
    }
    return null;
  }, [organizationId]);

  const getLineItemCustomerTarget = useCallback((item: FinanceLineItem): LineItemNavigationTarget | null => {
    const customerId = item.customerId?.trim();
    const customerType = item.customerType;
    if (!customerId || (customerType !== 'users' && customerType !== 'teams')) {
      return null;
    }
    return {
      label: item.customerName?.trim() || (customerType === 'teams' ? 'Team customer' : 'Customer'),
      href: buildOrganizationCustomerPath(organizationId, customerType, customerId),
    };
  }, [organizationId]);

  const navigateToLineItemTarget = useCallback((target: LineItemNavigationTarget | null) => {
    if (!target) {
      return;
    }
    router.push(target.href);
  }, [router]);

  const getPayRunItemTargets = useCallback((item: StaffPayRunItem): LineItemNavigationTarget[] => {
    const targets: LineItemNavigationTarget[] = [];
    if (item.eventId) {
      targets.push({
        label: 'Event source',
        href: `/events/${encodeURIComponent(item.eventId)}?tab=details`,
      });
    }
    if (item.teamId) {
      targets.push({
        label: 'Team source',
        href: buildOrganizationCustomerPath(organizationId, 'teams', item.teamId),
      });
    }
    if (item.userId) {
      targets.push({
        label: 'Staff profile',
        href: buildOrganizationCustomerPath(organizationId, 'users', item.userId),
      });
    }
    return targets;
  }, [organizationId]);

  const openMarkPaidModal = useCallback((payRun: StaffPayRun) => {
    setMarkPaidPayRunId(payRun.id);
    setMarkPaidDraft(defaultMarkPaidDraft(payRun));
    setMarkPaidError(null);
    setPayrollError(null);
  }, []);

  const openVoidModal = useCallback((payRun: StaffPayRun) => {
    setVoidPayRunId(payRun.id);
    setVoidReason('');
    setVoidError(null);
    setPayrollError(null);
  }, []);

  const openTransferModal = useCallback((payRun: StaffPayRun) => {
    setTransferPayRunId(payRun.id);
    setTransferDraft(payRun.items.map((item) => ({
      itemId: item.id,
      label: item.label,
      payoutProviderTransferId: item.payoutProviderTransferId ?? '',
    })));
    setTransferError(null);
    setPayrollError(null);
  }, []);

  const connectQuickBooks = useCallback(async () => {
    setQuickBooksSaving(true);
    setQuickBooksError(null);
    try {
      const currentUrl = typeof window !== 'undefined'
        ? window.location.href
        : `/organizations/${organizationId}/finance`;
      const response = await apiRequest<{ authorizationUrl: string }>(
        `/api/organizations/${organizationId}/finance/integrations/quickbooks/connect`,
        {
          method: 'POST',
          body: {
            returnUrl: currentUrl,
            refreshUrl: currentUrl,
          },
        },
      );
      if (typeof window !== 'undefined') {
        window.location.assign(response.authorizationUrl);
      }
    } catch (connectError) {
      setQuickBooksError(messageForError(connectError, 'Failed to start QuickBooks connection.'));
      setQuickBooksSaving(false);
    }
  }, [organizationId]);

  const disconnectQuickBooks = useCallback(async () => {
    setQuickBooksSaving(true);
    setQuickBooksError(null);
    try {
      await apiRequest(`/api/organizations/${organizationId}/finance/integrations/quickbooks/disconnect`, {
        method: 'POST',
      });
      setQuickBooksAccounts([]);
      setQuickBooksAccountsError(null);
      await loadFinance();
    } catch (disconnectError) {
      setQuickBooksError(messageForError(disconnectError, 'Failed to disconnect QuickBooks.'));
    } finally {
      setQuickBooksSaving(false);
    }
  }, [loadFinance, organizationId]);

  const loadQuickBooksAccounts = useCallback(async () => {
    if (quickBooksMappingDisabled) {
      return;
    }
    setQuickBooksAccountsLoading(true);
    setQuickBooksAccountsError(null);
    try {
      const response = await apiRequest<QuickBooksAccountsResponse>(
        `/api/organizations/${organizationId}/finance/integrations/quickbooks/accounts`,
        { timeoutMs: 30000 },
      );
      setQuickBooksAccounts(response.accounts ?? []);
    } catch (accountsError) {
      setQuickBooksAccountsError(messageForError(accountsError, 'Failed to load QuickBooks accounts.'));
      setQuickBooksManualMappingOpen(true);
    } finally {
      setQuickBooksAccountsLoading(false);
    }
  }, [organizationId, quickBooksMappingDisabled]);

  useEffect(() => {
    if (
      !quickBooksSettingsOpen
      || quickBooksMappingDisabled
      || quickBooksAccounts.length > 0
      || quickBooksAccountsLoading
      || quickBooksAccountsError
    ) {
      return;
    }
    void loadQuickBooksAccounts();
  }, [
    loadQuickBooksAccounts,
    quickBooksAccounts.length,
    quickBooksAccountsError,
    quickBooksAccountsLoading,
    quickBooksMappingDisabled,
    quickBooksSettingsOpen,
  ]);

  const updateQuickBooksMappingDraft = useCallback((patch: Partial<QuickBooksMappingDraft>) => {
    setQuickBooksMappingDraft((current) => ({ ...current, ...patch }));
  }, []);

  const selectQuickBooksExpenseAccount = useCallback((accountId: string | null) => {
    const account = activeQuickBooksAccounts.find((entry) => entry.id === accountId) ?? null;
    updateQuickBooksMappingDraft({
      payrollExpenseAccountExternalId: account?.id ?? '',
      payrollExpenseAccountName: account?.fullyQualifiedName ?? account?.name ?? '',
    });
  }, [activeQuickBooksAccounts, updateQuickBooksMappingDraft]);

  const selectQuickBooksLiabilityAccount = useCallback((accountId: string | null) => {
    const account = activeQuickBooksAccounts.find((entry) => entry.id === accountId) ?? null;
    updateQuickBooksMappingDraft({
      payrollLiabilityAccountExternalId: account?.id ?? '',
      payrollLiabilityAccountName: account?.fullyQualifiedName ?? account?.name ?? '',
    });
  }, [activeQuickBooksAccounts, updateQuickBooksMappingDraft]);

  const selectQuickBooksClearingAccount = useCallback((accountId: string | null) => {
    const account = activeQuickBooksAccounts.find((entry) => entry.id === accountId) ?? null;
    updateQuickBooksMappingDraft({
      financeClearingAccountExternalId: account?.id ?? '',
      financeClearingAccountName: account?.fullyQualifiedName ?? account?.name ?? '',
    });
    setJournalPreview(null);
    setJournalSyncRecord(null);
  }, [activeQuickBooksAccounts, updateQuickBooksMappingDraft]);

  const saveQuickBooksMapping = useCallback(async () => {
    setQuickBooksMappingSaving(true);
    setQuickBooksError(null);
    try {
      const response = await apiRequest<{ connection: AccountingConnection }>(
        `/api/organizations/${organizationId}/finance/integrations/quickbooks/settings`,
        {
          method: 'PATCH',
          body: {
            payrollExpenseAccountExternalId: quickBooksMappingDraft.payrollExpenseAccountExternalId.trim() || null,
            payrollExpenseAccountName: quickBooksMappingDraft.payrollExpenseAccountName.trim() || null,
            payrollLiabilityAccountExternalId: quickBooksMappingDraft.payrollLiabilityAccountExternalId.trim() || null,
            payrollLiabilityAccountName: quickBooksMappingDraft.payrollLiabilityAccountName.trim() || null,
            financeClearingAccountExternalId: quickBooksMappingDraft.financeClearingAccountExternalId.trim() || null,
            financeClearingAccountName: quickBooksMappingDraft.financeClearingAccountName.trim() || null,
          },
        },
      );
      setAccountingConnections((current) => {
        const withoutQuickBooks = current.filter((connection) => connection.provider !== 'QUICKBOOKS_ONLINE');
        return [...withoutQuickBooks, response.connection];
      });
      setJournalPreview(null);
      setJournalSyncRecord(null);
    } catch (mappingError) {
      setQuickBooksError(messageForError(mappingError, 'Failed to save QuickBooks account mapping.'));
    } finally {
      setQuickBooksMappingSaving(false);
    }
  }, [organizationId, quickBooksMappingDraft]);

  const saveCategoryAccountingMappings = useCallback(async () => {
    setCategoryMappingSaving(true);
    setCategoryMappingError(null);
    setJournalPreview(null);
    setJournalSyncRecord(null);
    try {
      const response = await apiRequest<{ mappings: CategoryAccountingMapping[] }>(
        `/api/organizations/${organizationId}/finance/integrations/quickbooks/category-mappings`,
        {
          method: 'PATCH',
          body: {
            mappings: categoryMappingDrafts.map((draft) => ({
              category: draft.category,
              entryType: draft.entryType,
              accountExternalId: draft.accountExternalId.trim() || null,
              accountName: draft.accountName.trim() || null,
              notes: draft.notes.trim() || null,
            })),
          },
        },
      );
      setCategoryAccountingMappings(response.mappings ?? []);
    } catch (mappingError) {
      setCategoryMappingError(messageForError(mappingError, 'Failed to save financial category mappings.'));
    } finally {
      setCategoryMappingSaving(false);
    }
  }, [categoryMappingDrafts, organizationId]);

  const loadJournalEntryPreview = useCallback(async () => {
    setJournalPreviewLoading(true);
    setJournalPreviewError(null);
    setJournalSyncError(null);
    setJournalSyncRecord(null);
    try {
      const params = new URLSearchParams();
      if (fromDate.trim()) {
        params.set('from', dateInputToIso(fromDate) ?? fromDate);
      }
      if (toDate.trim()) {
        params.set('to', dateInputToIso(toDate, true) ?? toDate);
      }
      const suffix = params.toString() ? `?${params.toString()}` : '';
      const response = await apiRequest<{ preview: QuickBooksJournalPreview }>(
        `/api/organizations/${organizationId}/finance/integrations/quickbooks/journal-entry-preview${suffix}`,
        { timeoutMs: 30000 },
      );
      setJournalPreview(response.preview);
    } catch (previewError) {
      setJournalPreviewError(messageForError(previewError, 'Failed to build QuickBooks journal entry preview.'));
    } finally {
      setJournalPreviewLoading(false);
    }
  }, [fromDate, organizationId, toDate]);

  const syncJournalEntryToQuickBooks = useCallback(async () => {
    setJournalSyncLoading(true);
    setJournalSyncError(null);
    try {
      const params = new URLSearchParams();
      if (fromDate.trim()) {
        params.set('from', dateInputToIso(fromDate) ?? fromDate);
      }
      if (toDate.trim()) {
        params.set('to', dateInputToIso(toDate, true) ?? toDate);
      }
      const suffix = params.toString() ? `?${params.toString()}` : '';
      const response = await apiRequest<QuickBooksJournalSyncResponse>(
        `/api/organizations/${organizationId}/finance/integrations/quickbooks/journal-entry-sync${suffix}`,
        { method: 'POST', timeoutMs: 30000 },
      );
      setJournalPreview(response.preview);
      setJournalSyncRecord(response.syncRecord);
      await loadFinance();
    } catch (syncError) {
      setJournalSyncError(messageForError(syncError, 'Failed to sync QuickBooks journal entry.'));
    } finally {
      setJournalSyncLoading(false);
    }
  }, [fromDate, loadFinance, organizationId, toDate]);

  const syncPayRunToQuickBooks = useCallback(async (payRun: StaffPayRun) => {
    setSyncingQuickBooksPayRunId(payRun.id);
    setQuickBooksError(null);
    try {
      await apiRequest(
        `/api/organizations/${organizationId}/finance/integrations/quickbooks/pay-runs/${payRun.id}/sync`,
        { method: 'POST', timeoutMs: 30000 },
      );
      await loadFinance();
    } catch (syncError) {
      setQuickBooksError(messageForError(syncError, 'Failed to sync staff pay run to QuickBooks.'));
      await loadFinance();
    } finally {
      setSyncingQuickBooksPayRunId(null);
    }
  }, [loadFinance, organizationId]);

  const exportPayRunsCsv = useCallback(async (payRunsToExport: StaffPayRun[], filename = 'staff-pay-runs.csv') => {
    if (payRunsToExport.length === 0) {
      setPayrollError('No pay runs match the current export.');
      return;
    }
    setPayrollError(null);
    if (canManage) {
      try {
        await Promise.all(payRunsToExport.map((payRun) => apiRequest(
          `/api/organizations/${organizationId}/finance/pay-runs/${payRun.id}`,
          {
            method: 'PATCH',
            body: {
              action: 'RECORD_EXPORT',
              exportFormat: 'CSV',
            },
          },
        )));
      } catch (exportError) {
        setPayrollError(messageForError(exportError, 'Failed to record staff pay run export.'));
        return;
      }
    }
    downloadCsv(filename, buildPayRunCsv(payRunsToExport));
    if (canManage) {
      await loadFinance();
    }
  }, [canManage, loadFinance, organizationId]);

  const openNewLineItem = useCallback(() => {
    setEditingLineItem(null);
    setLineItemDraft(defaultLineItemDraft());
    setLineItemError(null);
    setLineItemModalOpen(true);
  }, []);

  const openEditLineItem = useCallback((item: FinanceLineItem) => {
    if (item.isGenerated || !item.sourceId) {
      return;
    }
    setEditingLineItem(item);
    setLineItemDraft(lineItemDraftFromItem(item));
    setLineItemError(null);
    setLineItemModalOpen(true);
  }, []);

  const saveLineItem = useCallback(async () => {
    const title = lineItemDraft.title.trim();
    const category = lineItemDraft.category.trim();
    const amountCents = dollarsToCents(lineItemDraft.amount);
    if (!title || !category || amountCents <= 0) {
      setLineItemError('Title, category, and amount are required.');
      return;
    }
    const serviceStartAt = dateInputToIso(lineItemDraft.serviceStartDate);
    const serviceEndAt = dateInputToIso(lineItemDraft.serviceEndDate, true);
    if (serviceStartAt && serviceEndAt && new Date(serviceEndAt).getTime() < new Date(serviceStartAt).getTime()) {
      setLineItemError('End date must be on or after the start date.');
      return;
    }
    const quantity = lineItemDraft.quantity === '' ? null : Number(lineItemDraft.quantity);
    if (quantity != null && (!Number.isFinite(quantity) || quantity <= 0)) {
      setLineItemError('Quantity must be greater than zero.');
      return;
    }

    setLineItemSaving(true);
    setLineItemError(null);
    try {
      const baseBody = {
        title,
        category,
        description: lineItemDraft.description.trim() || null,
        amountCents,
        quantity,
        unitLabel: lineItemDraft.unitLabel.trim() || null,
        status: lineItemDraft.status,
        occurredAt: serviceStartAt,
        serviceStartAt,
        serviceEndAt,
      };
      if (editingLineItem?.sourceId) {
        await apiRequest(`/api/organizations/${organizationId}/finance/line-items/${editingLineItem.sourceId}`, {
          method: 'PATCH',
          body: baseBody,
        });
      } else {
        await apiRequest(`/api/organizations/${organizationId}/finance/line-items`, {
          method: 'POST',
          body: {
            scope: 'ORGANIZATION',
            ...baseBody,
          },
        });
      }
      setLineItemModalOpen(false);
      setEditingLineItem(null);
      setLineItemDraft(defaultLineItemDraft());
      await loadFinance();
    } catch (saveError) {
      setLineItemError(messageForError(saveError, 'Failed to save line item.'));
    } finally {
      setLineItemSaving(false);
    }
  }, [editingLineItem?.sourceId, lineItemDraft, loadFinance, organizationId]);

  const createPayRun = useCallback(async () => {
    setPayRunSaving(true);
    setPayrollError(null);
    try {
      await apiRequest(`/api/organizations/${organizationId}/finance/pay-runs`, {
        method: 'POST',
        body: {
          title: payRunTitle.trim() || null,
          periodStart: dateInputToIso(payRunStart),
          periodEnd: dateInputToIso(payRunEnd, true),
          scheduledPayDate: payRunPayDate.trim() ? dateInputToIso(payRunPayDate) : null,
        },
      });
      setPayRunTitle('');
      setPayRunPayDate(dateInputValue());
      await loadFinance();
    } catch (createError) {
      setPayrollError(messageForError(createError, 'Failed to create staff pay run.'));
    } finally {
      setPayRunSaving(false);
    }
  }, [loadFinance, organizationId, payRunEnd, payRunPayDate, payRunStart, payRunTitle]);

  const updatePayRun = useCallback(async (
    payRunId: string,
    action: PayRunAction,
    details?: Partial<MarkPaidDraft> & {
      voidReason?: string | null;
      exportFormat?: string | null;
      itemTransfers?: Array<{ itemId: string; payoutProviderTransferId?: string | null }>;
    },
  ): Promise<boolean> => {
    setUpdatingPayRunId(payRunId);
    setPayrollError(null);
    setMarkPaidError(null);
    setVoidError(null);
    setTransferError(null);
    try {
      await apiRequest(`/api/organizations/${organizationId}/finance/pay-runs/${payRunId}`, {
        method: 'PATCH',
        body: {
          action,
          ...(details?.payoutProvider !== undefined ? { payoutProvider: details.payoutProvider.trim() || null } : {}),
          ...(details?.payoutProviderBatchId !== undefined ? { payoutProviderBatchId: details.payoutProviderBatchId.trim() || null } : {}),
          ...(details?.exportFormat !== undefined ? { exportFormat: details.exportFormat?.trim() || null } : {}),
          ...(details?.notes !== undefined ? { notes: details.notes.trim() || null } : {}),
          ...(details?.voidReason !== undefined ? { voidReason: details.voidReason?.trim() || null } : {}),
          ...(details?.itemTransfers !== undefined ? { itemTransfers: details.itemTransfers } : {}),
        },
      });
      await loadFinance();
      return true;
    } catch (updateError) {
      const message = messageForError(updateError, 'Failed to update staff pay run.');
      if (action === 'MARK_PAID') {
        setMarkPaidError(message);
      } else if (action === 'VOID') {
        setVoidError(message);
      } else if (action === 'UPDATE_ITEM_TRANSFERS') {
        setTransferError(message);
      } else {
        setPayrollError(message);
      }
      return false;
    } finally {
      setUpdatingPayRunId(null);
    }
  }, [loadFinance, organizationId]);

  const markPayRunPaid = useCallback(async () => {
    if (!markPaidPayRunId) {
      return;
    }
    const didUpdate = await updatePayRun(markPaidPayRunId, 'MARK_PAID', markPaidDraft);
    if (didUpdate) {
      setMarkPaidPayRunId(null);
      setMarkPaidDraft(defaultMarkPaidDraft());
      setMarkPaidError(null);
    }
  }, [markPaidDraft, markPaidPayRunId, updatePayRun]);

  const voidSelectedPayRun = useCallback(async () => {
    if (!voidPayRunId) {
      return;
    }
    if (!voidReason.trim()) {
      setVoidError('A void reason is required.');
      return;
    }
    const didUpdate = await updatePayRun(voidPayRunId, 'VOID', { voidReason });
    if (didUpdate) {
      setVoidPayRunId(null);
      setVoidReason('');
      setVoidError(null);
    }
  }, [updatePayRun, voidPayRunId, voidReason]);

  const saveTransferReferences = useCallback(async () => {
    if (!transferPayRunId) {
      return;
    }
    const didUpdate = await updatePayRun(transferPayRunId, 'UPDATE_ITEM_TRANSFERS', {
      itemTransfers: transferDraft.map((item) => ({
        itemId: item.itemId,
        payoutProviderTransferId: item.payoutProviderTransferId.trim() || null,
      })),
    });
    if (didUpdate) {
      setTransferPayRunId(null);
      setTransferDraft([]);
      setTransferError(null);
    }
  }, [transferDraft, transferPayRunId, updatePayRun]);

  const profitTone = (finance?.actualProfitCents ?? 0) >= 0 ? 'green' : 'red';
  const projectedTone = (finance?.projectedProfitCents ?? 0) >= 0 ? 'green' : 'red';

  const renderLineItemName = (item: FinanceLineItem, canEditLineItem: boolean) => {
    if (canEditLineItem) {
      return (
        <button
          type="button"
          aria-label={`Edit ${item.label}`}
          className="block w-full border-0 bg-transparent p-0 text-left"
          onClick={(event) => {
            event.stopPropagation();
            openEditLineItem(item);
          }}
        >
          <Stack gap={1}>
            <Text size="sm" fw={600}>{item.label}</Text>
            <Text size="xs" c="dimmed">Custom</Text>
          </Stack>
        </button>
      );
    }

    const sourceTarget = item.isGenerated ? getLineItemSourceTarget(item) : null;
    const customerTarget = item.isGenerated ? getLineItemCustomerTarget(item) : null;
    if (item.isGenerated && (sourceTarget || customerTarget)) {
      return (
        <Popover width={260} position="bottom-start" shadow="md" withArrow withinPortal>
          <Popover.Target>
            <button
              type="button"
              aria-label={`Open actions for ${item.label}`}
              className="block w-full border-0 bg-transparent p-0 text-left"
              onClick={(event) => event?.stopPropagation?.()}
            >
              <Stack gap={1}>
                <Text size="sm" fw={600}>{item.label}</Text>
                <Text size="xs" c="dimmed">Generated</Text>
              </Stack>
            </button>
          </Popover.Target>
          <Popover.Dropdown>
            <Stack gap={4}>
              <Button
                size="xs"
                variant="subtle"
                justify="flex-start"
                aria-label={`Go to "${sourceTarget?.label ?? 'Source'}"`}
                leftSection={<ExternalLink size={14} />}
                disabled={!sourceTarget}
                onClick={() => navigateToLineItemTarget(sourceTarget)}
              >
                Go to &quot;{sourceTarget?.label ?? 'Source'}&quot;
              </Button>
              <Button
                size="xs"
                variant="subtle"
                justify="flex-start"
                aria-label={`Go to "${customerTarget?.label ?? 'Customer'}"`}
                leftSection={<UserRound size={14} />}
                disabled={!customerTarget}
                onClick={() => navigateToLineItemTarget(customerTarget)}
              >
                Go to &quot;{customerTarget?.label ?? 'Customer'}&quot;
              </Button>
            </Stack>
          </Popover.Dropdown>
        </Popover>
      );
    }

    return (
      <Stack gap={1}>
        <Text size="sm" fw={600}>{item.label}</Text>
        <Text size="xs" c="dimmed">{item.isGenerated ? 'Generated' : 'Custom'}</Text>
      </Stack>
    );
  };

  const renderQuickBooksPayRunSyncDetails = (payRun: StaffPayRun) => {
    const quickBooksSync = getQuickBooksSync(payRun);
    const quickBooksSyncEligible = isQuickBooksPayRunSyncEligible(payRun);
    const quickBooksSyncNeedsMapping = quickBooksSyncEligible
      && quickBooksConnection?.status === 'CONNECTED'
      && !quickBooksMappingReady
      && quickBooksSync?.status !== 'SYNCED';
    const quickBooksSyncError = quickBooksSyncNeedsMapping
      ? 'Set QuickBooks payroll account mapping before syncing.'
      : quickBooksSyncErrorMessage(quickBooksSync, quickBooksConnection);
    const canSyncPayRunToQuickBooks = canManage
      && quickBooksConnection?.status === 'CONNECTED'
      && quickBooksMappingReady
      && quickBooksSyncEligible
      && quickBooksSync?.status !== 'SYNCED';
    const canReconnectQuickBooks = canManage
      && quickBooksConnection?.status === 'REAUTH_REQUIRED'
      && quickBooksSyncEligible
      && quickBooksSync?.status !== 'SYNCED';

    return (
      <Paper withBorder radius="md" p="sm">
        <Group justify="space-between" align="flex-start">
          <Stack gap={4}>
            <Group gap={6}>
              <Text size="xs" fw={700} tt="uppercase" c="dimmed">QuickBooks sync</Text>
              <Badge
                size="xs"
                variant="light"
                color={quickBooksSyncNeedsMapping ? 'yellow' : quickBooksSyncStatusColor(quickBooksSync, quickBooksConnection)}
              >
                {quickBooksSyncNeedsMapping ? 'Needs mapping' : quickBooksSyncStatusLabel(quickBooksSync, quickBooksConnection)}
              </Badge>
            </Group>
            <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="xs">
              <Stack gap={1}>
                <Text size="xs" c="dimmed">Transaction</Text>
                <Text size="sm">
                  {quickBooksSync?.externalTxnId
                    ? `${quickBooksSync.externalTxnType ?? 'Txn'} ${quickBooksSync.externalTxnDocNumber || quickBooksSync.externalTxnId}`
                    : 'Not synced'}
                </Text>
              </Stack>
              <Stack gap={1}>
                <Text size="xs" c="dimmed">Last synced</Text>
                <Text size="sm">{formatDateTime(quickBooksSync?.syncedAt)}</Text>
              </Stack>
              <Stack gap={1}>
                <Text size="xs" c="dimmed">Synced by</Text>
                <Text size="sm">{quickBooksSync?.syncedByUserId || 'Not set'}</Text>
              </Stack>
              <Stack gap={1}>
                <Text size="xs" c="dimmed">Intuit TID</Text>
                <Text size="sm">{quickBooksSync?.intuitTid || 'Not set'}</Text>
              </Stack>
            </SimpleGrid>
            {quickBooksSyncError && (
              <Text
                size="sm"
                c={
                  quickBooksSyncNeedsMapping
                    ? 'orange'
                    : isRetryableQuickBooksReauthSync(quickBooksSync, quickBooksConnection)
                      ? 'blue'
                      : 'red'
                }
                fw={600}
              >
                {quickBooksSyncError}
              </Text>
            )}
          </Stack>
          {canManage && (
            <Group gap="xs">
              {canReconnectQuickBooks && (
                <Button
                  size="xs"
                  variant="light"
                  leftSection={<ExternalLink size={12} />}
                  loading={quickBooksSaving}
                  onClick={() => void connectQuickBooks()}
                >
                  Reconnect QBO
                </Button>
              )}
              {quickBooksSyncEligible && (
                <Button
                  size="xs"
                  variant="light"
                  disabled={!canSyncPayRunToQuickBooks}
                  loading={syncingQuickBooksPayRunId === payRun.id}
                  onClick={() => void syncPayRunToQuickBooks(payRun)}
                >
                  {quickBooksPayRunActionLabel(quickBooksSync)}
                </Button>
              )}
            </Group>
          )}
        </Group>
      </Paper>
    );
  };

  return (
    <Stack gap="md">
      <Modal
        opened={lineItemModalOpen}
        onClose={() => {
          setLineItemModalOpen(false);
          setLineItemError(null);
        }}
        title={editingLineItem ? 'Edit financial line item' : 'Add financial line item'}
        size="lg"
        centered
      >
        <Stack gap="md">
          {lineItemError && <Alert color="red">{lineItemError}</Alert>}
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
            <TextInput
              label="Title"
              aria-label="Line item title"
              placeholder="Field rental"
              value={lineItemDraft.title}
              onChange={(event) => updateLineItemDraft({ title: event.currentTarget.value })}
              required
            />
            <Autocomplete
              label="Category"
              aria-label="Line item category"
              placeholder="Rentals"
              data={lineItemCategoryOptions}
              value={lineItemDraft.category}
              onChange={(value) => updateLineItemDraft({ category: value })}
              comboboxProps={{ withinPortal: true }}
              required
            />
            <NumberInput
              label="Amount"
              aria-label="Line item amount"
              prefix="$"
              decimalScale={2}
              min={0}
              value={lineItemDraft.amount}
              onChange={(value) => updateLineItemDraft({ amount: value })}
              required
            />
            <Select
              label="Status"
              aria-label="Line item status"
              data={LINE_ITEM_STATUS_OPTIONS}
              value={lineItemDraft.status}
              onChange={(value) => updateLineItemDraft({ status: (value as LineItemStatus | null) ?? 'ACTUAL' })}
              allowDeselect={false}
            />
            <TextInput
              label="Start date"
              aria-label="Line item start date"
              type="date"
              value={lineItemDraft.serviceStartDate}
              onChange={(event) => updateLineItemDraft({ serviceStartDate: event.currentTarget.value })}
            />
            <TextInput
              label="End date"
              aria-label="Line item end date"
              type="date"
              value={lineItemDraft.serviceEndDate}
              onChange={(event) => updateLineItemDraft({ serviceEndDate: event.currentTarget.value })}
            />
            <NumberInput
              label="Quantity"
              aria-label="Line item quantity"
              decimalScale={2}
              min={0}
              value={lineItemDraft.quantity}
              onChange={(value) => updateLineItemDraft({ quantity: value })}
            />
            <TextInput
              label="Unit"
              aria-label="Line item unit"
              placeholder="hours"
              value={lineItemDraft.unitLabel}
              onChange={(event) => updateLineItemDraft({ unitLabel: event.currentTarget.value })}
            />
          </SimpleGrid>
          <Textarea
            label="Description"
            aria-label="Line item description"
            value={lineItemDraft.description}
            onChange={(event) => updateLineItemDraft({ description: event.currentTarget.value })}
            autosize
            minRows={3}
          />
          <Group justify="flex-end">
            <Button
              variant="default"
              onClick={() => {
                setLineItemModalOpen(false);
                setLineItemError(null);
              }}
            >
              Cancel
            </Button>
            <Button onClick={() => void saveLineItem()} loading={lineItemSaving}>
              Save line item
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={Boolean(selectedPayRun)}
        onClose={() => setSelectedPayRunId(null)}
        title="Staff pay run details"
        size="xl"
        centered
      >
        {selectedPayRun && (
          <Stack gap="md">
            <Group justify="space-between" align="flex-start">
              <Stack gap={2}>
                <Title order={5}>{selectedPayRun.title}</Title>
                <Text size="sm" c="dimmed">{formatPeriod(selectedPayRun.periodStart, selectedPayRun.periodEnd)}</Text>
              </Stack>
              <Group gap={6}>
                <Badge size="sm" variant="light">{selectedPayRun.status}</Badge>
                <Badge size="sm" variant="light" color={payRunPayoutColor(selectedPayRun.payoutStatus)}>
                  {selectedPayRun.payoutStatus}
                </Badge>
              </Group>
            </Group>

            <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="sm">
              <Paper withBorder radius="md" p="sm">
                <Text size="xs" fw={700} tt="uppercase" c="dimmed">Total</Text>
                <Text fw={800}>{centsFromDollars(selectedPayRun.totalAmountCents)}</Text>
              </Paper>
              <Paper withBorder radius="md" p="sm">
                <Text size="xs" fw={700} tt="uppercase" c="dimmed">Items</Text>
                <Text fw={800}>{selectedPayRun.itemCount}</Text>
              </Paper>
              <Paper withBorder radius="md" p="sm">
                <Text size="xs" fw={700} tt="uppercase" c="dimmed">Pay date</Text>
                <Text size="sm">{formatDate(selectedPayRun.scheduledPayDate)}</Text>
              </Paper>
              <Paper withBorder radius="md" p="sm">
                <Text size="xs" fw={700} tt="uppercase" c="dimmed">Approved</Text>
                <Text size="sm">{formatDateTime(selectedPayRun.approvedAt)}</Text>
              </Paper>
              <Paper withBorder radius="md" p="sm">
                <Text size="xs" fw={700} tt="uppercase" c="dimmed">Paid</Text>
                <Text size="sm">{formatDateTime(selectedPayRun.paidAt)}</Text>
              </Paper>
              <Paper withBorder radius="md" p="sm">
                <Text size="xs" fw={700} tt="uppercase" c="dimmed">Exported</Text>
                <Text size="sm">
                  {selectedPayRun.exportedAt
                    ? `${formatDateTime(selectedPayRun.exportedAt)} (${formatPayRunExportStatus(selectedPayRun)})`
                    : 'Not exported'}
                </Text>
              </Paper>
              <Paper withBorder radius="md" p="sm">
                <Text size="xs" fw={700} tt="uppercase" c="dimmed">Provider</Text>
                <Text size="sm">{selectedPayRun.payoutProvider || 'Not set'}</Text>
              </Paper>
              <Paper withBorder radius="md" p="sm">
                <Text size="xs" fw={700} tt="uppercase" c="dimmed">Reference</Text>
                <Text size="sm">{selectedPayRun.payoutProviderBatchId || 'Not set'}</Text>
              </Paper>
              <Paper withBorder radius="md" p="sm">
                <Text size="xs" fw={700} tt="uppercase" c="dimmed">Approved by</Text>
                <Text size="sm">{selectedPayRun.approvedByUserId || 'Not set'}</Text>
              </Paper>
              <Paper withBorder radius="md" p="sm">
                <Text size="xs" fw={700} tt="uppercase" c="dimmed">Paid by</Text>
                <Text size="sm">{selectedPayRun.paidByUserId || 'Not set'}</Text>
              </Paper>
            </SimpleGrid>

            {selectedPayRun.notes && (
              <Paper withBorder radius="md" p="sm">
                <Text size="xs" fw={700} tt="uppercase" c="dimmed">Notes</Text>
                <Text size="sm">{selectedPayRun.notes}</Text>
              </Paper>
            )}

            {renderQuickBooksPayRunSyncDetails(selectedPayRun)}

            <ScrollArea.Autosize mah={360} type="scroll" scrollHideDelay={900} offsetScrollbars>
              <Table striped highlightOnHover withColumnBorders style={{ minWidth: 1180 }}>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Staff</Table.Th>
                    <Table.Th>Source</Table.Th>
                    <Table.Th>Service</Table.Th>
                    <Table.Th>Wage</Table.Th>
                    <Table.Th>Transfer</Table.Th>
                    <Table.Th>Status</Table.Th>
                    <Table.Th ta="right">Amount</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {selectedPayRun.items.map((item) => {
                    const sourceLabel = item.eventStaffAssignmentId
                      ? 'Event labor'
                      : item.teamStaffLaborEntryId
                        ? 'Team labor'
                        : 'Staff labor';
                    const targets = getPayRunItemTargets(item);
                    return (
                      <Table.Tr key={item.id}>
                        <Table.Td>
                          <Stack gap={1}>
                            <Text size="sm" fw={600}>{item.label}</Text>
                            {item.description && <Text size="xs" c="dimmed">{item.description}</Text>}
                          </Stack>
                        </Table.Td>
                        <Table.Td>
                          <Stack gap={4}>
                            <Text size="sm">{sourceLabel}</Text>
                            {targets.length > 0 && (
                              <Group gap={4}>
                                {targets.map((target) => (
                                  <Button
                                    key={target.href}
                                    size="xs"
                                    variant="subtle"
                                    px={6}
                                    leftSection={<ExternalLink size={12} />}
                                    onClick={() => navigateToLineItemTarget(target)}
                                  >
                                    {target.label}
                                  </Button>
                                ))}
                              </Group>
                            )}
                          </Stack>
                        </Table.Td>
                        <Table.Td>
                          <Stack gap={1}>
                            <Text size="sm">{formatPeriod(item.serviceStartAt, item.serviceEndAt)}</Text>
                            <Text size="xs" c="dimmed">{formatLaborMinutes(item.paidMinutes)}</Text>
                          </Stack>
                        </Table.Td>
                        <Table.Td>
                          <Stack gap={1}>
                            <Text size="sm">{formatWageRate(item)}</Text>
                            {item.payoutProvider && (
                              <Text size="xs" c="dimmed">{item.payoutProvider}</Text>
                            )}
                          </Stack>
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm" c={item.payoutProviderTransferId ? undefined : 'dimmed'}>
                            {item.payoutProviderTransferId || '-'}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <Group gap={6}>
                            <Badge size="xs" variant="light">{item.status}</Badge>
                            <Badge size="xs" variant="light" color={payRunPayoutColor(item.payoutStatus)}>
                              {item.payoutStatus}
                            </Badge>
                          </Group>
                        </Table.Td>
                        <Table.Td ta="right">
                          <Text fw={700}>{centsFromDollars(item.amountCents)}</Text>
                        </Table.Td>
                      </Table.Tr>
                    );
                  })}
                </Table.Tbody>
              </Table>
            </ScrollArea.Autosize>

            <Group justify="flex-end">
              <Button
                variant="default"
                leftSection={<Download size={14} />}
                onClick={() => void exportPayRunsCsv([selectedPayRun], `${selectedPayRun.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-payroll.csv`)}
              >
                Export CSV
              </Button>
              {canManage && selectedPayRun.status !== 'PAID' && selectedPayRun.status !== 'VOID' && (
                <Button
                  variant="default"
                  leftSection={<Pencil size={14} />}
                  onClick={() => openTransferModal(selectedPayRun)}
                >
                  Edit transfers
                </Button>
              )}
              {canManage && (
                <>
                {selectedPayRun.status === 'DRAFT' && (
                  <Button
                    variant="light"
                    loading={updatingPayRunId === selectedPayRun.id}
                    onClick={() => void updatePayRun(selectedPayRun.id, 'APPROVE')}
                  >
                    Approve
                  </Button>
                )}
                {selectedPayRun.status === 'APPROVED' && (
                  <Button
                    color="green"
                    variant="light"
                    onClick={() => openMarkPaidModal(selectedPayRun)}
                  >
                    Mark paid
                  </Button>
                )}
                {(selectedPayRun.status === 'DRAFT' || selectedPayRun.status === 'APPROVED') && (
                  <Button
                    variant="subtle"
                    color="red"
                    loading={updatingPayRunId === selectedPayRun.id}
                    onClick={() => openVoidModal(selectedPayRun)}
                  >
                    Void
                  </Button>
                )}
                </>
              )}
              </Group>
          </Stack>
        )}
      </Modal>

      <Modal
        opened={Boolean(markPaidPayRunId)}
        onClose={() => {
          setMarkPaidPayRunId(null);
          setMarkPaidDraft(defaultMarkPaidDraft());
          setMarkPaidError(null);
        }}
        title="Record staff payout"
        size="md"
        centered
      >
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            Mark {markPaidPayRun?.title ?? 'this pay run'} and its staff pay items as paid.
          </Text>
          <TextInput
            label="Payout provider"
            aria-label="Payout provider"
            placeholder="Check, ACH, manual, Stripe"
            value={markPaidDraft.payoutProvider}
            onChange={(event) => {
              const nextValue = event.currentTarget.value;
              setMarkPaidDraft((current) => ({
                ...current,
                payoutProvider: nextValue,
              }));
            }}
          />
          <TextInput
            label="Reference or batch ID"
            aria-label="Payout reference"
            placeholder="check-1024"
            value={markPaidDraft.payoutProviderBatchId}
            onChange={(event) => {
              const nextValue = event.currentTarget.value;
              setMarkPaidDraft((current) => ({
                ...current,
                payoutProviderBatchId: nextValue,
              }));
            }}
          />
          <Textarea
            label="Notes"
            aria-label="Payout notes"
            value={markPaidDraft.notes}
            onChange={(event) => {
              const nextValue = event.currentTarget.value;
              setMarkPaidDraft((current) => ({
                ...current,
                notes: nextValue,
              }));
            }}
            autosize
            minRows={3}
          />
          {markPaidError && <Text size="sm" c="red" fw={600}>{markPaidError}</Text>}
          <Group justify="flex-end">
            <Button
              variant="default"
              onClick={() => {
                setMarkPaidPayRunId(null);
                setMarkPaidDraft(defaultMarkPaidDraft());
                setMarkPaidError(null);
              }}
            >
              Cancel
            </Button>
            <Button
              color="green"
              loading={Boolean(markPaidPayRunId && updatingPayRunId === markPaidPayRunId)}
              onClick={() => void markPayRunPaid()}
            >
              Mark paid
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={Boolean(voidPayRunId)}
        onClose={() => {
          setVoidPayRunId(null);
          setVoidReason('');
          setVoidError(null);
        }}
        title="Void staff pay run"
        size="md"
        centered
      >
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            Void {voidPayRun?.title ?? 'this pay run'} and cancel its staff pay items.
          </Text>
          <Textarea
            label="Void reason"
            aria-label="Void reason"
            value={voidReason}
            onChange={(event) => setVoidReason(event.currentTarget.value)}
            autosize
            minRows={3}
            required
          />
          {voidError && <Text size="sm" c="red" fw={600}>{voidError}</Text>}
          <Group justify="flex-end">
            <Button
              variant="default"
              onClick={() => {
                setVoidPayRunId(null);
                setVoidReason('');
                setVoidError(null);
              }}
            >
              Cancel
            </Button>
            <Button
              color="red"
              loading={Boolean(voidPayRunId && updatingPayRunId === voidPayRunId)}
              onClick={() => void voidSelectedPayRun()}
            >
              Void pay run
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={Boolean(transferPayRunId)}
        onClose={() => {
          setTransferPayRunId(null);
          setTransferDraft([]);
          setTransferError(null);
        }}
        title="Edit transfer references"
        size="lg"
        centered
      >
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            Add item-level payout references for {transferPayRun?.title ?? 'this pay run'} before marking the batch paid.
          </Text>
          <ScrollArea.Autosize mah={360} type="scroll" scrollHideDelay={900} offsetScrollbars>
            <Stack gap="sm">
              {transferDraft.map((item) => (
                <TextInput
                  key={item.itemId}
                  label={item.label}
                  aria-label={`Transfer reference for ${item.label}`}
                  placeholder="transfer-1024"
                  value={item.payoutProviderTransferId}
                  onChange={(event) => {
                    const nextValue = event.currentTarget.value;
                    setTransferDraft((current) => current.map((draftItem) => (
                      draftItem.itemId === item.itemId
                        ? { ...draftItem, payoutProviderTransferId: nextValue }
                        : draftItem
                    )));
                  }}
                />
              ))}
            </Stack>
          </ScrollArea.Autosize>
          {transferError && <Text size="sm" c="red" fw={600}>{transferError}</Text>}
          <Group justify="flex-end">
            <Button
              variant="default"
              onClick={() => {
                setTransferPayRunId(null);
                setTransferDraft([]);
                setTransferError(null);
              }}
            >
              Cancel
            </Button>
            <Button
              loading={Boolean(transferPayRunId && updatingPayRunId === transferPayRunId)}
              onClick={() => void saveTransferReferences()}
            >
              Save references
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Group justify="space-between" align="flex-start">
        <Stack gap={2}>
          <Title order={5}>Finance and payroll</Title>
          <Text size="sm" c="dimmed">
            Organization-level revenue, refunds, labor costs, custom costs, and internal staff pay runs.
          </Text>
        </Stack>
        <Button variant="default" onClick={() => void loadFinance()} loading={loading}>
          Refresh
        </Button>
      </Group>

      <Paper withBorder radius="md" p="md" className="org-tab-surface">
        <Group align="end" gap="sm">
          <TextInput
            label="From"
            type="date"
            value={fromDate}
            onChange={(event) => setFromDate(event.currentTarget.value)}
          />
          <TextInput
            label="To"
            type="date"
            value={toDate}
            onChange={(event) => setToDate(event.currentTarget.value)}
          />
          <Button variant="light" onClick={() => void loadFinance()} loading={loading}>
            Apply
          </Button>
        </Group>
      </Paper>

      {error && <Alert color="red">{error}</Alert>}

      {loading && !finance ? (
        <Group gap="sm">
          <Loader size="sm" />
          <Text size="sm" c="dimmed">Loading finance...</Text>
        </Group>
      ) : finance ? (
        <>
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="md">
            <FinanceMetric
              label="Gross sales"
              value={finance.grossRevenueCents}
              tone="green"
              description="Paid organization, event, team, rental, and product bills."
            />
            <FinanceMetric
              label="Refunds and fees"
              value={-(finance.refundCents + finance.feeCents)}
              tone="red"
              description={`${centsFromDollars(-finance.refundCents)} refunds, ${centsFromDollars(-finance.feeCents)} fees.`}
            />
            <FinanceMetric
              label="Current profit"
              value={finance.actualProfitCents}
              tone={profitTone}
              description="Net revenue minus staff and custom costs."
            />
            <FinanceMetric
              label="Projected profit"
              value={finance.projectedProfitCents}
              tone={finance.futureCostCents > 0 ? 'orange' : projectedTone}
              description={`${centsFromDollars(finance.potentialRevenueCents)} potential revenue, ${centsFromDollars(-finance.futureCostCents)} future costs.`}
            />
          </SimpleGrid>

          <SimpleGrid cols={{ base: 1, md: 3 }} spacing="md">
            <Paper withBorder radius="md" p="md" className="org-tab-surface">
              <Text size="xs" fw={700} tt="uppercase" c="dimmed">Staff costs</Text>
              <Text size="lg" fw={800}>{centsFromDollars(-finance.staffCostCents)}</Text>
            </Paper>
            <Paper withBorder radius="md" p="md" className="org-tab-surface">
              <Text size="xs" fw={700} tt="uppercase" c="dimmed">Custom costs</Text>
              <Text size="lg" fw={800}>{centsFromDollars(-finance.customCostCents)}</Text>
            </Paper>
            <Paper withBorder radius="md" p="md" className="org-tab-surface">
              <Text size="xs" fw={700} tt="uppercase" c="dimmed">Warnings</Text>
              <Text size="lg" fw={800}>{finance.warnings.length}</Text>
            </Paper>
          </SimpleGrid>

          {finance.warnings.length > 0 && (
            <Alert color="yellow">
              <Stack gap={4}>
                {finance.warnings.map((warning) => (
                  <Text key={`${warning.code}-${warning.message}`} size="sm">{warning.message}</Text>
                ))}
              </Stack>
            </Alert>
          )}

          <SimpleGrid cols={{ base: 1, xl: 2 }} spacing="md">
            <Paper withBorder radius="md" p="md" className="org-tab-surface">
              <Group justify="space-between" align="center" mb="sm">
                <Title order={6}>Staff payroll ledger</Title>
                <Text size="sm" c="dimmed">{payRunLedgerRows.length} staff</Text>
              </Group>
              <ScrollArea.Autosize mah={320} type="scroll" scrollHideDelay={900} offsetScrollbars>
                <Table striped highlightOnHover withColumnBorders style={{ minWidth: 720 }}>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Staff</Table.Th>
                      <Table.Th>Items</Table.Th>
                      <Table.Th>Time</Table.Th>
                      <Table.Th ta="right">Draft</Table.Th>
                      <Table.Th ta="right">Approved</Table.Th>
                      <Table.Th ta="right">Paid</Table.Th>
                      <Table.Th ta="right">Total</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {payRunLedgerRows.length > 0 ? payRunLedgerRows.map((row) => (
                      <Table.Tr key={row.key}>
                        <Table.Td>{row.label}</Table.Td>
                        <Table.Td>{row.itemCount}</Table.Td>
                        <Table.Td>{formatLaborMinutes(row.minutes)}</Table.Td>
                        <Table.Td ta="right">{centsFromDollars(row.draftCents)}</Table.Td>
                        <Table.Td ta="right">{centsFromDollars(row.approvedCents)}</Table.Td>
                        <Table.Td ta="right">{centsFromDollars(row.paidCents)}</Table.Td>
                        <Table.Td ta="right">
                          <Text fw={700}>{centsFromDollars(row.totalCents)}</Text>
                        </Table.Td>
                      </Table.Tr>
                    )) : (
                      <Table.Tr>
                        <Table.Td colSpan={7}>
                          <Text size="sm" c="dimmed">No payroll items match the current filters.</Text>
                        </Table.Td>
                      </Table.Tr>
                    )}
                  </Table.Tbody>
                </Table>
              </ScrollArea.Autosize>
            </Paper>

            <Paper withBorder radius="md" p="md" className="org-tab-surface">
              <Group justify="space-between" align="center" mb="sm">
                <Title order={6}>Event and team profitability</Title>
                <Text size="sm" c="dimmed">{profitabilityRows.length} sources</Text>
              </Group>
              <ScrollArea.Autosize mah={320} type="scroll" scrollHideDelay={900} offsetScrollbars>
                <Table striped highlightOnHover withColumnBorders style={{ minWidth: 780 }}>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Source</Table.Th>
                      <Table.Th>Type</Table.Th>
                      <Table.Th>Items</Table.Th>
                      <Table.Th ta="right">Revenue</Table.Th>
                      <Table.Th ta="right">Costs</Table.Th>
                      <Table.Th ta="right">Profit</Table.Th>
                      <Table.Th>Actions</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {profitabilityRows.length > 0 ? profitabilityRows.map((row) => {
                      const target = row.type === 'Event' && row.sourceId
                        ? { label: row.name, href: `/events/${encodeURIComponent(row.sourceId)}?tab=details` }
                        : row.type === 'Team' && row.sourceId
                          ? { label: row.name, href: buildOrganizationCustomerPath(organizationId, 'teams', row.sourceId) }
                          : null;
                      return (
                        <Table.Tr key={row.key}>
                          <Table.Td>{row.name}</Table.Td>
                          <Table.Td>{row.type}</Table.Td>
                          <Table.Td>{row.itemCount}</Table.Td>
                          <Table.Td ta="right">{centsFromDollars(row.revenueCents)}</Table.Td>
                          <Table.Td ta="right">{centsFromDollars(-row.costCents)}</Table.Td>
                          <Table.Td ta="right">
                            <Text fw={700} c={row.profitCents >= 0 ? 'green' : 'red'}>
                              {centsFromDollars(row.profitCents)}
                            </Text>
                          </Table.Td>
                          <Table.Td>
                            <Button
                              size="xs"
                              variant="subtle"
                              leftSection={<ExternalLink size={12} />}
                              disabled={!target}
                              onClick={() => navigateToLineItemTarget(target)}
                            >
                              Open
                            </Button>
                          </Table.Td>
                        </Table.Tr>
                      );
                    }) : (
                      <Table.Tr>
                        <Table.Td colSpan={7}>
                          <Text size="sm" c="dimmed">No event or team line items for this range.</Text>
                        </Table.Td>
                      </Table.Tr>
                    )}
                  </Table.Tbody>
                </Table>
              </ScrollArea.Autosize>
            </Paper>
          </SimpleGrid>

          <Paper withBorder radius="md" p="md" className="org-tab-surface">
            <Group justify="space-between" align="center" mb="sm">
              <Title order={6}>Finance line items</Title>
              {canManage && (
                <Button size="xs" variant="light" leftSection={<Plus size={14} />} onClick={openNewLineItem}>
                  Add line item
                </Button>
              )}
            </Group>
            <ScrollArea.Autosize mah={440} type="scroll" scrollHideDelay={900} offsetScrollbars>
              <Table striped highlightOnHover withColumnBorders style={{ minWidth: 900 }}>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Date</Table.Th>
                    <Table.Th>Item</Table.Th>
                    <Table.Th>Category</Table.Th>
                    <Table.Th>Quantity</Table.Th>
                    <Table.Th>Status</Table.Th>
                    <Table.Th ta="right">Amount</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {sortedLineItems.length > 0 ? sortedLineItems.map((item) => {
                    const canEditLineItem = canManage && !item.isGenerated && Boolean(item.sourceId);
                    return (
                      <Table.Tr
                        key={item.id}
                        data-testid={canEditLineItem ? `finance-line-item-${item.sourceId}` : undefined}
                        onClick={canEditLineItem ? () => openEditLineItem(item) : undefined}
                        style={{ cursor: canEditLineItem ? 'pointer' : undefined }}
                      >
                        <Table.Td>{formatPeriod(item.serviceStartAt, item.serviceEndAt)}</Table.Td>
                        <Table.Td>
                          {renderLineItemName(item, canEditLineItem)}
                        </Table.Td>
                        <Table.Td>{item.category}</Table.Td>
                        <Table.Td>{formatQuantityAndUnit(item.quantity, item.unitLabel)}</Table.Td>
                        <Table.Td>
                          <Group gap={6}>
                            <Badge size="xs" variant="light">{formatLineItemStatus(item.status)}</Badge>
                            <Badge size="xs" color={item.timing === 'FUTURE' ? 'orange' : item.timing === 'WARNING' ? 'yellow' : 'green'} variant="light">
                              {formatLineItemTiming(item.timing)}
                            </Badge>
                          </Group>
                        </Table.Td>
                        <Table.Td ta="right">
                          <Text fw={700} c={item.amountCents >= 0 ? 'green' : 'red'}>
                            {centsFromDollars(item.amountCents)}
                          </Text>
                        </Table.Td>
                      </Table.Tr>
                    );
                  }) : (
                    <Table.Tr>
                      <Table.Td colSpan={6}>
                        <Text size="sm" c="dimmed">No finance line items for this range.</Text>
                      </Table.Td>
                    </Table.Tr>
                  )}
                </Table.Tbody>
              </Table>
            </ScrollArea.Autosize>
          </Paper>

          {canManage && (
            <Modal
              opened={quickBooksSettingsOpen}
              onClose={() => setQuickBooksSettingsOpen(false)}
              title="QuickBooks settings"
              size="xl"
              centered
            >
              <Stack gap="md">
                <Group justify="space-between" align="flex-start">
                  <Stack gap={2}>
                    <Group gap="xs">
                      <Badge
                        size="sm"
                        variant="light"
                        color={accountingStatusColor(quickBooksConnection?.status)}
                      >
                        {accountingStatusLabel(quickBooksConnection?.status)}
                      </Badge>
                      <Badge size="sm" variant="light" color={quickBooksMappingReady ? 'green' : 'yellow'}>
                        {quickBooksMappingReady ? 'Payroll mapping ready' : 'Payroll mapping needed'}
                      </Badge>
                    </Group>
                    <Text size="sm" c="dimmed">
                      Configure QuickBooks account mappings for payroll and finance line-item JournalEntry sync.
                    </Text>
                  </Stack>
                  <Group gap="xs">
                    <Button
                      size="xs"
                      variant="subtle"
                      loading={quickBooksAccountsLoading}
                      disabled={quickBooksMappingDisabled}
                      onClick={() => void loadQuickBooksAccounts()}
                    >
                      {quickBooksAccounts.length ? 'Refresh accounts' : 'Load accounts'}
                    </Button>
                    <Button
                      size="xs"
                      variant="subtle"
                      disabled={quickBooksMappingDisabled}
                      onClick={() => setQuickBooksManualMappingOpen((current) => !current)}
                    >
                      {quickBooksManualMappingOpen ? 'Hide manual entry' : 'Manual entry'}
                    </Button>
                  </Group>
                </Group>

                {quickBooksAccountsError && (
                  <Alert color="yellow" variant="light">
                    {quickBooksAccountsError}
                  </Alert>
                )}

                <Paper withBorder radius="md" p="md">
                  <Stack gap="sm">
                    <Group justify="space-between" align="center">
                      <Title order={6}>QuickBooks account settings</Title>
                      <Button
                        size="xs"
                        variant="light"
                        loading={quickBooksMappingSaving}
                        disabled={quickBooksMappingDisabled}
                        onClick={() => void saveQuickBooksMapping()}
                      >
                        Save account settings
                      </Button>
                    </Group>
                    <Text size="xs" c="dimmed">
                      Pick accounts from the connected QuickBooks chart of accounts. The finance clearing account balances revenue, refund, fee, and expense journal-entry rows.
                    </Text>
                    <SimpleGrid cols={{ base: 1, md: 3 }} spacing="sm">
                      <Select
                        label="Payroll expense account"
                        placeholder={quickBooksAccounts.length ? 'Select an expense account' : 'Load accounts or use manual entry'}
                        searchable
                        clearable
                        nothingFoundMessage="No accounts found"
                        data={expenseAccountOptions}
                        value={quickBooksMappingDraft.payrollExpenseAccountExternalId || null}
                        onChange={selectQuickBooksExpenseAccount}
                        disabled={quickBooksMappingDisabled}
                        description={selectedExpenseAccount?.accountType
                          ? `${selectedExpenseAccount.accountType}${selectedExpenseAccount.accountSubType ? ` - ${selectedExpenseAccount.accountSubType}` : ''}`
                          : 'Expense and cost accounts appear first.'}
                      />
                      <Select
                        label="Payroll liability or clearing account"
                        placeholder={quickBooksAccounts.length ? 'Select a liability account' : 'Load accounts or use manual entry'}
                        searchable
                        clearable
                        nothingFoundMessage="No accounts found"
                        data={liabilityAccountOptions}
                        value={quickBooksMappingDraft.payrollLiabilityAccountExternalId || null}
                        onChange={selectQuickBooksLiabilityAccount}
                        disabled={quickBooksMappingDisabled}
                        description={selectedLiabilityAccount?.accountType
                          ? `${selectedLiabilityAccount.accountType}${selectedLiabilityAccount.accountSubType ? ` - ${selectedLiabilityAccount.accountSubType}` : ''}`
                          : 'Liability, payable, and clearing accounts appear first.'}
                      />
                      <Select
                        label="Finance clearing account"
                        placeholder={quickBooksAccounts.length ? 'Select a clearing account' : 'Load accounts or use manual entry'}
                        searchable
                        clearable
                        nothingFoundMessage="No accounts found"
                        data={clearingAccountOptions}
                        value={quickBooksMappingDraft.financeClearingAccountExternalId || null}
                        onChange={selectQuickBooksClearingAccount}
                        disabled={quickBooksMappingDisabled}
                        description={selectedClearingAccount?.accountType
                          ? `${selectedClearingAccount.accountType}${selectedClearingAccount.accountSubType ? ` - ${selectedClearingAccount.accountSubType}` : ''}`
                          : 'Asset, bank, receivable, and clearing accounts appear first.'}
                      />
                    </SimpleGrid>
                    {quickBooksManualMappingOpen && (
                      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="sm">
                        <TextInput
                          label="Expense account ID"
                          value={quickBooksMappingDraft.payrollExpenseAccountExternalId}
                          onChange={(event) => updateQuickBooksMappingDraft({
                            payrollExpenseAccountExternalId: event.currentTarget.value,
                          })}
                          disabled={quickBooksMappingDisabled}
                        />
                        <TextInput
                          label="Expense account name"
                          value={quickBooksMappingDraft.payrollExpenseAccountName}
                          onChange={(event) => updateQuickBooksMappingDraft({
                            payrollExpenseAccountName: event.currentTarget.value,
                          })}
                          disabled={quickBooksMappingDisabled}
                        />
                        <TextInput
                          label="Liability account ID"
                          value={quickBooksMappingDraft.payrollLiabilityAccountExternalId}
                          onChange={(event) => updateQuickBooksMappingDraft({
                            payrollLiabilityAccountExternalId: event.currentTarget.value,
                          })}
                          disabled={quickBooksMappingDisabled}
                        />
                        <TextInput
                          label="Liability account name"
                          value={quickBooksMappingDraft.payrollLiabilityAccountName}
                          onChange={(event) => updateQuickBooksMappingDraft({
                            payrollLiabilityAccountName: event.currentTarget.value,
                          })}
                          disabled={quickBooksMappingDisabled}
                        />
                        <TextInput
                          label="Finance clearing account ID"
                          value={quickBooksMappingDraft.financeClearingAccountExternalId}
                          onChange={(event) => {
                            updateQuickBooksMappingDraft({
                              financeClearingAccountExternalId: event.currentTarget.value,
                            });
                            setJournalPreview(null);
                            setJournalSyncRecord(null);
                          }}
                          disabled={quickBooksMappingDisabled}
                        />
                        <TextInput
                          label="Finance clearing account name"
                          value={quickBooksMappingDraft.financeClearingAccountName}
                          onChange={(event) => {
                            updateQuickBooksMappingDraft({
                              financeClearingAccountName: event.currentTarget.value,
                            });
                            setJournalPreview(null);
                            setJournalSyncRecord(null);
                          }}
                          disabled={quickBooksMappingDisabled}
                        />
                      </SimpleGrid>
                    )}
                  </Stack>
                </Paper>

                <Paper withBorder radius="md" p="md">
                  <Stack gap="sm">
                    <Group justify="space-between" align="center">
                      <Stack gap={2}>
                        <Title order={6}>Financial category mappings</Title>
                        <Text size="xs" c="dimmed">
                          Map finance categories to QuickBooks accounts before previewing or syncing line-item JournalEntries.
                        </Text>
                      </Stack>
                      <Button
                        size="xs"
                        variant="light"
                        loading={categoryMappingSaving}
                        disabled={quickBooksCategoryMappingDisabled || categoryMappingDrafts.length === 0}
                        onClick={() => void saveCategoryAccountingMappings()}
                      >
                        Save category mappings
                      </Button>
                    </Group>
                    {categoryMappingError && (
                      <Alert color="red" variant="light">
                        {categoryMappingError}
                      </Alert>
                    )}
                    <ScrollArea.Autosize mah={360} type="scroll" scrollHideDelay={900} offsetScrollbars>
                      <Table striped highlightOnHover withColumnBorders style={{ minWidth: quickBooksManualMappingOpen ? 1120 : 860 }}>
                        <Table.Thead>
                          <Table.Tr>
                            <Table.Th>Category</Table.Th>
                            <Table.Th>Type</Table.Th>
                            <Table.Th>QuickBooks account</Table.Th>
                            {quickBooksManualMappingOpen && (
                              <>
                                <Table.Th>Account ID</Table.Th>
                                <Table.Th>Account name</Table.Th>
                              </>
                            )}
                            <Table.Th>Notes</Table.Th>
                          </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                          {categoryMappingDrafts.length > 0 ? categoryMappingDrafts.map((draft) => {
                            const selectedCategoryAccount = getSelectedCategoryAccount(draft);
                            return (
                              <Table.Tr key={draft.key}>
                                <Table.Td>
                                  <Text size="sm" fw={600}>{draft.category}</Text>
                                </Table.Td>
                                <Table.Td>
                                  <Badge size="xs" variant="light" color={accountingEntryTypeColor(draft.entryType)}>
                                    {accountingEntryTypeLabel(draft.entryType)}
                                  </Badge>
                                </Table.Td>
                                <Table.Td>
                                  <Select
                                    aria-label={`QuickBooks account for ${draft.category} ${accountingEntryTypeLabel(draft.entryType)}`}
                                    placeholder={quickBooksAccounts.length ? 'Select account' : 'Load accounts or use manual entry'}
                                    searchable
                                    clearable
                                    nothingFoundMessage="No accounts found"
                                    data={getCategoryAccountOptions(draft)}
                                    value={draft.accountExternalId || null}
                                    onChange={(value) => selectCategoryMappingAccount(draft.key, value)}
                                    disabled={quickBooksCategoryMappingDisabled}
                                    description={selectedCategoryAccount?.accountType
                                      ? `${selectedCategoryAccount.accountType}${selectedCategoryAccount.accountSubType ? ` - ${selectedCategoryAccount.accountSubType}` : ''}`
                                      : `${accountingEntryTypeLabel(draft.entryType)} accounts appear first.`}
                                  />
                                </Table.Td>
                                {quickBooksManualMappingOpen && (
                                  <>
                                    <Table.Td>
                                      <TextInput
                                        aria-label={`Account ID for ${draft.category} ${accountingEntryTypeLabel(draft.entryType)}`}
                                        value={draft.accountExternalId}
                                        onChange={(event) => updateCategoryMappingDraft(draft.key, {
                                          accountExternalId: event.currentTarget.value,
                                        })}
                                        disabled={quickBooksCategoryMappingDisabled}
                                      />
                                    </Table.Td>
                                    <Table.Td>
                                      <TextInput
                                        aria-label={`Account name for ${draft.category} ${accountingEntryTypeLabel(draft.entryType)}`}
                                        value={draft.accountName}
                                        onChange={(event) => updateCategoryMappingDraft(draft.key, {
                                          accountName: event.currentTarget.value,
                                        })}
                                        disabled={quickBooksCategoryMappingDisabled}
                                      />
                                    </Table.Td>
                                  </>
                                )}
                                <Table.Td>
                                  <TextInput
                                    aria-label={`Accounting notes for ${draft.category} ${accountingEntryTypeLabel(draft.entryType)}`}
                                    value={draft.notes}
                                    onChange={(event) => updateCategoryMappingDraft(draft.key, {
                                      notes: event.currentTarget.value,
                                    })}
                                    disabled={quickBooksCategoryMappingDisabled}
                                  />
                                </Table.Td>
                              </Table.Tr>
                            );
                          }) : (
                            <Table.Tr>
                              <Table.Td colSpan={quickBooksManualMappingOpen ? 6 : 4}>
                                <Text size="sm" c="dimmed">No finance categories are available yet.</Text>
                              </Table.Td>
                            </Table.Tr>
                          )}
                        </Table.Tbody>
                      </Table>
                    </ScrollArea.Autosize>
                  </Stack>
                </Paper>

                <Paper withBorder radius="md" p="md">
                  <Stack gap="sm">
                    <Group justify="space-between" align="center">
                      <Stack gap={2}>
                        <Title order={6}>Journal entry preview</Title>
                        <Text size="xs" c="dimmed">
                          Preview the QuickBooks JournalEntry rows for the selected finance date range, then sync the reviewed rows when every account is mapped.
                        </Text>
                      </Stack>
                      <Group gap="xs">
                        <Button
                          size="xs"
                          variant="light"
                          loading={journalPreviewLoading}
                          disabled={quickBooksCategoryMappingDisabled || journalSyncLoading}
                          onClick={() => void loadJournalEntryPreview()}
                        >
                          Preview journal entry
                        </Button>
                        <Button
                          size="xs"
                          loading={journalSyncLoading}
                          disabled={quickBooksCategoryMappingDisabled || journalPreviewLoading || !journalPreview?.readyToSync}
                          onClick={() => void syncJournalEntryToQuickBooks()}
                        >
                          Sync journal entry
                        </Button>
                      </Group>
                    </Group>
                    {journalPreviewError && (
                      <Alert color="red" variant="light">
                        {journalPreviewError}
                      </Alert>
                    )}
                    {journalSyncError && (
                      <Alert color="red" variant="light">
                        {journalSyncError}
                      </Alert>
                    )}
                    {journalSyncRecord?.status === 'SYNCED' && (
                      <Alert color="green" variant="light">
                        Synced to QuickBooks
                        {journalSyncRecord.externalTxnType ? ` ${journalSyncRecord.externalTxnType}` : ''}
                        {journalSyncRecord.externalTxnId ? ` ${journalSyncRecord.externalTxnId}` : ''}
                        {journalSyncRecord.externalTxnDocNumber ? ` (${journalSyncRecord.externalTxnDocNumber})` : ''}.
                      </Alert>
                    )}
                    {journalPreview && (
                      <Stack gap="sm">
                        <Group gap="xs">
                          <Badge color={journalPreview.readyToSync ? 'green' : 'yellow'} variant="light">
                            {journalPreview.readyToSync ? 'Ready to sync' : 'Needs mapping'}
                          </Badge>
                          <Badge color={journalPreview.isBalanced ? 'green' : 'red'} variant="light">
                            {journalPreview.isBalanced ? 'Balanced' : 'Unbalanced'}
                          </Badge>
                          <Badge variant="light">
                            {journalPreview.includedLineItemCount} line items
                          </Badge>
                          {journalPreview.skippedLineItemCount > 0 && (
                            <Badge color="gray" variant="light">
                              {journalPreview.skippedLineItemCount} skipped
                            </Badge>
                          )}
                        </Group>
                        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
                          <Stack gap={1}>
                            <Text size="xs" fw={700} tt="uppercase" c="dimmed">Txn date</Text>
                            <Text size="sm">{formatDate(journalPreview.txnDate)}</Text>
                          </Stack>
                          <Stack gap={1}>
                            <Text size="xs" fw={700} tt="uppercase" c="dimmed">Debit total</Text>
                            <Text size="sm" fw={700}>{centsFromDollars(journalPreview.debitTotalCents)}</Text>
                          </Stack>
                          <Stack gap={1}>
                            <Text size="xs" fw={700} tt="uppercase" c="dimmed">Credit total</Text>
                            <Text size="sm" fw={700}>{centsFromDollars(journalPreview.creditTotalCents)}</Text>
                          </Stack>
                        </SimpleGrid>
                        {journalPreview.warnings.length > 0 && (
                          <Alert color="yellow" variant="light">
                            <Stack gap={2}>
                              {journalPreview.warnings.map((warning) => (
                                <Text key={warning} size="sm">{warning}</Text>
                              ))}
                            </Stack>
                          </Alert>
                        )}
                        <ScrollArea.Autosize mah={320} type="scroll" scrollHideDelay={900} offsetScrollbars>
                          <Table striped highlightOnHover withColumnBorders style={{ minWidth: 980 }}>
                            <Table.Thead>
                              <Table.Tr>
                                <Table.Th>Line item</Table.Th>
                                <Table.Th>Posting</Table.Th>
                                <Table.Th>Account</Table.Th>
                                <Table.Th>Role</Table.Th>
                                <Table.Th>Description</Table.Th>
                                <Table.Th ta="right">Amount</Table.Th>
                              </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                              {journalPreview.lines.length > 0 ? journalPreview.lines.map((line) => (
                                <Table.Tr key={line.id}>
                                  <Table.Td>
                                    <Stack gap={1}>
                                      <Text size="sm" fw={600}>{line.lineItemLabel}</Text>
                                      <Text size="xs" c="dimmed">{line.category}</Text>
                                    </Stack>
                                  </Table.Td>
                                  <Table.Td>
                                    <Badge
                                      size="xs"
                                      color={line.postingType === 'Debit' ? 'blue' : 'green'}
                                      variant="light"
                                    >
                                      {line.postingType}
                                    </Badge>
                                  </Table.Td>
                                  <Table.Td>
                                    <Stack gap={1}>
                                      <Text size="sm" c={line.missingAccount ? 'red' : undefined} fw={line.missingAccount ? 700 : 500}>
                                        {line.accountName || 'Missing account'}
                                      </Text>
                                      {line.accountExternalId && (
                                        <Text size="xs" c="dimmed">ID {line.accountExternalId}</Text>
                                      )}
                                    </Stack>
                                  </Table.Td>
                                  <Table.Td>
                                    <Text size="xs" c="dimmed">
                                      {line.role === 'CLEARING_ACCOUNT' ? 'Clearing' : 'Mapped category'}
                                    </Text>
                                  </Table.Td>
                                  <Table.Td>
                                    <Text size="xs" lineClamp={2}>{line.description}</Text>
                                  </Table.Td>
                                  <Table.Td ta="right">
                                    <Text fw={700}>{centsFromDollars(line.amountCents)}</Text>
                                  </Table.Td>
                                </Table.Tr>
                              )) : (
                                <Table.Tr>
                                  <Table.Td colSpan={6}>
                                    <Text size="sm" c="dimmed">No journal entry rows are available for this range.</Text>
                                  </Table.Td>
                                </Table.Tr>
                              )}
                            </Table.Tbody>
                          </Table>
                        </ScrollArea.Autosize>
                      </Stack>
                    )}
                  </Stack>
                </Paper>
              </Stack>
            </Modal>
          )}

          <Paper withBorder radius="md" p="md" className="org-tab-surface">
            <Group justify="space-between" align="flex-start" mb="sm">
              <Stack gap={2}>
                <Group gap="xs">
                  <Title order={6}>QuickBooks</Title>
                  <Badge
                    size="sm"
                    variant="light"
                    color={accountingStatusColor(quickBooksConnection?.status)}
                  >
                    {accountingStatusLabel(quickBooksConnection?.status)}
                  </Badge>
                </Group>
                <Text size="sm" c="dimmed">
                  Accounting connection for payroll handoffs and future sync.
                </Text>
              </Stack>
              {canManage && (
                <Group gap="xs">
                  <Button
                    size="xs"
                    variant="light"
                    leftSection={<ExternalLink size={14} />}
                    loading={quickBooksSaving}
                    onClick={() => void connectQuickBooks()}
                  >
                    {quickBooksConnectionActionLabel(quickBooksConnection)}
                  </Button>
                  {quickBooksConnection?.status === 'CONNECTED' && (
                    <Button
                      size="xs"
                      variant="subtle"
                      color="red"
                      loading={quickBooksSaving}
                      onClick={() => void disconnectQuickBooks()}
                    >
                      Disconnect
                    </Button>
                  )}
                </Group>
              )}
            </Group>
            <SimpleGrid cols={{ base: 1, sm: 2, lg: 5 }} spacing="sm">
              <Stack gap={1}>
                <Text size="xs" fw={700} tt="uppercase" c="dimmed">Company</Text>
                <Text size="sm">
                  {quickBooksConnection
                    ? quickBooksConnection.externalCompanyName || accountingStatusLabel(quickBooksConnection.status)
                    : 'Not connected'}
                </Text>
              </Stack>
              <Stack gap={1}>
                <Text size="xs" fw={700} tt="uppercase" c="dimmed">Environment</Text>
                <Text size="sm" tt="capitalize">{quickBooksConnection?.environment || 'sandbox'}</Text>
              </Stack>
              <Stack gap={1}>
                <Text size="xs" fw={700} tt="uppercase" c="dimmed">Connected</Text>
                <Text size="sm">{formatDateTime(quickBooksConnection?.connectedAt)}</Text>
              </Stack>
              <Stack gap={1}>
                <Text size="xs" fw={700} tt="uppercase" c="dimmed">Access expires</Text>
                <Text size="sm">{formatDateTime(quickBooksConnection?.accessTokenExpiresAt)}</Text>
              </Stack>
              <Stack gap={1}>
                <Text size="xs" fw={700} tt="uppercase" c="dimmed">Last synced</Text>
                <Text size="sm">{formatDateTime(quickBooksConnection?.lastSyncedAt)}</Text>
              </Stack>
            </SimpleGrid>
            {quickBooksConnection?.lastIntuitTid && (
              <Text mt="sm" size="xs" c="dimmed">
                Last Intuit TID: {quickBooksConnection.lastIntuitTid}
              </Text>
            )}
            {quickBooksConnection?.scopes?.length ? (
              <Text mt="sm" size="xs" c="dimmed">
                {quickBooksConnection.scopes.join(' ')}
              </Text>
            ) : null}
            {canManage && (
              <Group mt="md" justify="space-between" align="center">
                <Group gap="xs">
                  <Badge size="sm" variant="light" color={quickBooksMappingReady ? 'green' : 'yellow'}>
                    {quickBooksMappingReady ? 'Payroll mapping ready' : 'Payroll mapping needed'}
                  </Badge>
                  <Badge size="sm" variant="light" color={configuredCategoryMappingCount > 0 ? 'blue' : 'gray'}>
                    {configuredCategoryMappingCount} category mappings
                  </Badge>
                </Group>
                <Button
                  size="xs"
                  variant="light"
                  leftSection={<Settings2 size={14} />}
                  aria-label="QuickBooks settings"
                  disabled={!quickBooksConnection}
                  onClick={() => setQuickBooksSettingsOpen(true)}
                >
                  Settings
                </Button>
              </Group>
            )}
            {quickBooksConnection?.lastError && (
              <Text mt="sm" size="sm" c="red" fw={600}>
                {quickBooksConnection.lastError}
              </Text>
            )}
            {quickBooksError && (
              <Text mt="sm" size="sm" c="red" fw={600}>
                {quickBooksError}
              </Text>
            )}
          </Paper>

          <Paper withBorder radius="md" p="md" className="org-tab-surface">
            <Group justify="space-between" align="flex-start" mb="sm">
              <Stack gap={2}>
                <Title order={6}>Staff pay runs</Title>
                <Text size="sm" c="dimmed">Create internal payroll batches from unpaid staff labor.</Text>
              </Stack>
              <Button
                size="xs"
                variant="default"
                leftSection={<Download size={14} />}
                onClick={() => void exportPayRunsCsv(filteredPayRuns)}
              >
                Export filtered CSV
              </Button>
            </Group>

            {canManage && (
              <Group align="end" gap="sm" mb="md">
                <TextInput
                  label="Pay run title"
                  placeholder="June payroll"
                  value={payRunTitle}
                  onChange={(event) => setPayRunTitle(event.currentTarget.value)}
                />
                <TextInput
                  label="Period start"
                  type="date"
                  value={payRunStart}
                  onChange={(event) => setPayRunStart(event.currentTarget.value)}
                />
                <TextInput
                  label="Period end"
                  type="date"
                  value={payRunEnd}
                  onChange={(event) => setPayRunEnd(event.currentTarget.value)}
                />
                <TextInput
                  label="Pay date"
                  type="date"
                  value={payRunPayDate}
                  onChange={(event) => setPayRunPayDate(event.currentTarget.value)}
                />
                <Button onClick={() => void createPayRun()} loading={payRunSaving}>
                  Create pay run
                </Button>
                {payrollError && (
                  <Text size="sm" c="red" fw={600}>
                    {payrollError}
                  </Text>
                )}
              </Group>
            )}

            <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="sm" mb="md">
              <Select
                label="Payroll status"
                data={[
                  { value: 'ALL', label: 'All statuses' },
                  { value: 'DRAFT', label: 'Draft' },
                  { value: 'APPROVED', label: 'Approved' },
                  { value: 'PAID', label: 'Paid' },
                  { value: 'VOID', label: 'Void' },
                ]}
                value={payRunStatusFilter}
                onChange={(value) => setPayRunStatusFilter((value as PayRunStatusFilter | null) ?? 'ALL')}
                allowDeselect={false}
              />
              <Select
                label="Staff"
                data={payRunStaffOptions}
                value={payRunStaffFilter}
                onChange={(value) => setPayRunStaffFilter(value ?? 'ALL')}
                searchable
                allowDeselect={false}
              />
              <TextInput
                label="Payroll from"
                type="date"
                value={payRunFromFilter}
                onChange={(event) => setPayRunFromFilter(event.currentTarget.value)}
              />
              <TextInput
                label="Payroll to"
                type="date"
                value={payRunToFilter}
                onChange={(event) => setPayRunToFilter(event.currentTarget.value)}
              />
            </SimpleGrid>

            <ScrollArea.Autosize mah={420} type="scroll" scrollHideDelay={900} offsetScrollbars>
              <Table striped highlightOnHover withColumnBorders style={{ minWidth: 1040 }}>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Pay run</Table.Th>
                    <Table.Th>Period</Table.Th>
                    <Table.Th>Pay date</Table.Th>
                    <Table.Th>Status</Table.Th>
                    <Table.Th>Export</Table.Th>
                    <Table.Th>Accounting</Table.Th>
                    <Table.Th>Items</Table.Th>
                    <Table.Th ta="right">Amount</Table.Th>
                    {canManage && <Table.Th>Actions</Table.Th>}
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {filteredPayRuns.length > 0 ? filteredPayRuns.map((payRun) => {
                    const quickBooksSync = getQuickBooksSync(payRun);
                    const quickBooksSyncEligible = isQuickBooksPayRunSyncEligible(payRun);
                    const quickBooksSyncNeedsMapping = quickBooksSyncEligible
                      && quickBooksConnection?.status === 'CONNECTED'
                      && !quickBooksMappingReady
                      && quickBooksSync?.status !== 'SYNCED';
                    const quickBooksSyncError = quickBooksSyncNeedsMapping
                      ? 'Set QuickBooks payroll account mapping before syncing.'
                      : quickBooksSyncErrorMessage(quickBooksSync, quickBooksConnection);
                    const canSyncPayRunToQuickBooks = canManage
                      && quickBooksConnection?.status === 'CONNECTED'
                      && quickBooksMappingReady
                      && quickBooksSyncEligible
                      && quickBooksSync?.status !== 'SYNCED';
                    const canReconnectQuickBooks = canManage
                      && quickBooksConnection?.status === 'REAUTH_REQUIRED'
                      && quickBooksSyncEligible
                      && quickBooksSync?.status !== 'SYNCED';
                    return (
                    <Table.Tr
                      key={payRun.id}
                      onClick={() => setSelectedPayRunId(payRun.id)}
                      style={{ cursor: 'pointer' }}
                    >
                      <Table.Td>
                        <Stack gap={1}>
                          <button
                            type="button"
                            aria-label={`View pay run ${payRun.title}`}
                            className="block w-full border-0 bg-transparent p-0 text-left"
                            onClick={(event) => {
                              event.stopPropagation();
                              setSelectedPayRunId(payRun.id);
                            }}
                          >
                            <Text size="sm" fw={600}>{payRun.title}</Text>
                          </button>
                          {payRun.items.slice(0, 2).map((item) => (
                            <Text key={item.id} size="xs" c="dimmed">{item.label} • {centsFromDollars(item.amountCents)}</Text>
                          ))}
                          {payRun.items.length > 2 && (
                            <Text size="xs" c="dimmed">+{payRun.items.length - 2} more</Text>
                          )}
                        </Stack>
                      </Table.Td>
                      <Table.Td>{formatPeriod(payRun.periodStart, payRun.periodEnd)}</Table.Td>
                      <Table.Td>{formatDate(payRun.scheduledPayDate)}</Table.Td>
                      <Table.Td>
                        <Group gap={6}>
                          <Badge size="xs" variant="light">{payRun.status}</Badge>
                          <Badge size="xs" variant="light" color={payRunPayoutColor(payRun.payoutStatus)}>
                            {payRun.payoutStatus}
                          </Badge>
                        </Group>
                      </Table.Td>
                      <Table.Td>
                        <Stack gap={1}>
                          <Text size="sm" fw={payRun.exportedAt ? 600 : 400} c={payRun.exportedAt ? undefined : 'dimmed'}>
                            {formatPayRunExportStatus(payRun)}
                          </Text>
                          {payRun.exportedAt && (
                            <Text size="xs" c="dimmed">{formatDateTime(payRun.exportedAt)}</Text>
                          )}
                        </Stack>
                      </Table.Td>
                      <Table.Td>
                        <Stack gap={2}>
                          <Group gap={6}>
                            <Badge
                              size="xs"
                              variant="light"
                              color={quickBooksSyncNeedsMapping ? 'yellow' : quickBooksSyncStatusColor(quickBooksSync, quickBooksConnection)}
                            >
                              {quickBooksSyncNeedsMapping ? 'Needs mapping' : quickBooksSyncStatusLabel(quickBooksSync, quickBooksConnection)}
                            </Badge>
                            <Text size="xs" c="dimmed">QBO</Text>
                          </Group>
                          {quickBooksSync?.externalTxnId && (
                            <Text size="xs" c="dimmed">
                              {quickBooksSync.externalTxnType ?? 'Txn'} {quickBooksSync.externalTxnDocNumber || quickBooksSync.externalTxnId}
                            </Text>
                          )}
                          {quickBooksSync?.syncedAt && (
                            <Text size="xs" c="dimmed">{formatDateTime(quickBooksSync.syncedAt)}</Text>
                          )}
                          {quickBooksSync?.intuitTid && (
                            <Text size="xs" c="dimmed">TID {quickBooksSync.intuitTid}</Text>
                          )}
                          {quickBooksSyncError && (
                            <Text
                              size="xs"
                              c={
                                quickBooksSyncNeedsMapping
                                  ? 'orange'
                                  : isRetryableQuickBooksReauthSync(quickBooksSync, quickBooksConnection)
                                    ? 'blue'
                                    : 'red'
                              }
                            >
                              {quickBooksSyncError}
                            </Text>
                          )}
                        </Stack>
                      </Table.Td>
                      <Table.Td>{payRun.itemCount}</Table.Td>
                      <Table.Td ta="right">
                        <Text fw={700}>{centsFromDollars(payRun.totalAmountCents)}</Text>
                      </Table.Td>
                      {canManage && (
                        <Table.Td>
                          <Group gap="xs">
                            <Button
                              size="xs"
                              variant="default"
                              leftSection={<Download size={12} />}
                              onClick={(event) => {
                                event.stopPropagation();
                                void exportPayRunsCsv([payRun], `${payRun.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-payroll.csv`);
                              }}
                            >
                              Export
                            </Button>
                            {(payRun.status === 'APPROVED' || payRun.status === 'PAID') && (
                              <>
                                {canReconnectQuickBooks && (
                                  <Button
                                    size="xs"
                                    variant="light"
                                    leftSection={<ExternalLink size={12} />}
                                    loading={quickBooksSaving}
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      void connectQuickBooks();
                                    }}
                                  >
                                    Reconnect QBO
                                  </Button>
                                )}
                                <Button
                                  size="xs"
                                  variant="light"
                                  disabled={!canSyncPayRunToQuickBooks}
                                  loading={syncingQuickBooksPayRunId === payRun.id}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    void syncPayRunToQuickBooks(payRun);
                                  }}
                                >
                                  {quickBooksPayRunActionLabel(quickBooksSync)}
                                </Button>
                              </>
                            )}
                            {payRun.status !== 'PAID' && payRun.status !== 'VOID' && (
                              <Button
                                size="xs"
                                variant="default"
                                leftSection={<Pencil size={12} />}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  openTransferModal(payRun);
                                }}
                              >
                                Transfers
                              </Button>
                            )}
                            {payRun.status === 'DRAFT' && (
                              <Button
                                size="xs"
                                variant="light"
                                loading={updatingPayRunId === payRun.id}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void updatePayRun(payRun.id, 'APPROVE');
                                }}
                              >
                                Approve
                              </Button>
                            )}
                            {payRun.status === 'APPROVED' && (
                              <Button
                                size="xs"
                                variant="light"
                                color="green"
                                loading={updatingPayRunId === payRun.id}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  openMarkPaidModal(payRun);
                                }}
                              >
                                Mark paid
                              </Button>
                            )}
                            {(payRun.status === 'DRAFT' || payRun.status === 'APPROVED') && (
                              <Button
                                size="xs"
                                variant="subtle"
                                color="red"
                                loading={updatingPayRunId === payRun.id}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  openVoidModal(payRun);
                                }}
                              >
                                Void
                              </Button>
                            )}
                          </Group>
                        </Table.Td>
                      )}
                    </Table.Tr>
                    );
                  }) : (
                    <Table.Tr>
                      <Table.Td colSpan={canManage ? 9 : 8}>
                        <Text size="sm" c="dimmed">No staff pay runs match the current filters.</Text>
                      </Table.Td>
                    </Table.Tr>
                  )}
                </Table.Tbody>
              </Table>
            </ScrollArea.Autosize>
          </Paper>
        </>
      ) : null}
    </Stack>
  );
}
