import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { loadOrganizationFinanceSummary } from '@/server/finance/financeRepository';
import { listOrganizationFinanceCategoryAccountingMappings } from '@/server/integrations/financeCategoryAccountingMappings';
import {
  isQuickBooksReauthError,
  quickBooksApiFetch,
  QuickBooksIntegrationError,
  QUICKBOOKS_PROVIDER,
} from '@/server/integrations/quickBooksConnection';
import {
  buildQuickBooksFinanceJournalEntryPreview,
  type QuickBooksFinanceJournalEntryPreview,
} from '@/server/integrations/quickBooksFinanceJournalPreview';

type PrismaLike = any;

type FetchLike = typeof fetch;

type FinanceJournalConnectionMapping = {
  status?: string | null;
  financeClearingAccountExternalId?: string | null;
  financeClearingAccountName?: string | null;
};

export class QuickBooksFinanceJournalSyncError extends Error {
  constructor(
    message: string,
    public status = 400,
    public code?: string | null,
  ) {
    super(message);
    this.name = 'QuickBooksFinanceJournalSyncError';
  }
}

const createId = (prefix: string): string => `${prefix}_${crypto.randomUUID()}`;

const normalizeText = (value: unknown, maxLength = 1000): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized ? normalized.slice(0, maxLength) : null;
};

const dateOnly = (value?: Date | string | null): string | null => {
  if (!value) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return normalizeText(typeof value === 'string' ? value : null, 40);
  }
  return date.toISOString().slice(0, 10);
};

export const buildFinanceJournalSyncSourceKey = ({
  organizationId,
  from,
  to,
}: {
  organizationId: string;
  from?: string | null;
  to?: string | null;
}): string => [
  'organization',
  organizationId,
  'finance-journal',
  dateOnly(from) ?? 'start',
  dateOnly(to) ?? 'end',
].join(':');

const summarizeJournalEntryRequest = (
  preview: QuickBooksFinanceJournalEntryPreview,
  sourceKey: string,
) => ({
  sourceKey,
  txnDate: preview.txnDate,
  lineCount: preview.lines.length,
  includedLineItemCount: preview.includedLineItemCount,
  skippedLineItemCount: preview.skippedLineItemCount,
  unmappedLineItemCount: preview.unmappedLineItemCount,
  debitTotalCents: preview.debitTotalCents,
  creditTotalCents: preview.creditTotalCents,
  lineItemIds: [...new Set(preview.lines.map((line) => line.lineItemId))],
});

const parseJournalEntryResponse = (payload: unknown) => {
  const record = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  const journalEntry = record.JournalEntry && typeof record.JournalEntry === 'object'
    ? record.JournalEntry as Record<string, unknown>
    : {};
  return {
    id: normalizeText(journalEntry.Id, 120),
    docNumber: normalizeText(journalEntry.DocNumber, 120),
    syncToken: normalizeText(journalEntry.SyncToken, 120),
  };
};

const resolveSyncErrorMessage = (error: unknown): string => {
  if (error instanceof QuickBooksIntegrationError) {
    if (error.isReauthRequired) {
      return 'Reconnect QuickBooks before syncing this finance journal entry.';
    }
    return 'QuickBooks rejected the finance journal-entry sync request.';
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message.slice(0, 500);
  }
  return 'QuickBooks finance journal-entry sync failed.';
};

const validateConnectionForPreview = (connection: FinanceJournalConnectionMapping | null) => {
  if (!connection || connection.status === 'DISCONNECTED') {
    throw new QuickBooksFinanceJournalSyncError('Connect QuickBooks before syncing finance journal entries.', 400);
  }
  if (connection.status === 'REAUTH_REQUIRED') {
    throw new QuickBooksFinanceJournalSyncError(
      'Reconnect QuickBooks before syncing finance journal entries.',
      409,
      'REAUTH_REQUIRED',
    );
  }
  return connection;
};

const validatePreviewForSync = (preview: QuickBooksFinanceJournalEntryPreview) => {
  if (preview.readyToSync) {
    return;
  }
  const warningText = preview.warnings.length
    ? ` ${preview.warnings.join(' ')}`
    : '';
  throw new QuickBooksFinanceJournalSyncError(
    `Resolve the QuickBooks account mappings before syncing this journal entry.${warningText}`.slice(0, 800),
    400,
    'MISSING_ACCOUNT_MAPPING',
  );
};

export const syncOrganizationFinanceJournalEntryToQuickBooks = async ({
  organizationId,
  actingUserId,
  from,
  to,
  client = prisma,
  fetchImpl,
  now = new Date(),
}: {
  organizationId: string;
  actingUserId: string;
  from?: string | null;
  to?: string | null;
  client?: PrismaLike;
  fetchImpl?: FetchLike;
  now?: Date;
}) => {
  const sourceKey = buildFinanceJournalSyncSourceKey({ organizationId, from, to });
  const [connectionRow, finance, mappings, existingSync] = await Promise.all([
    client.organizationAccountingConnections.findUnique({
      where: {
        organizationId_provider: {
          organizationId,
          provider: QUICKBOOKS_PROVIDER,
        },
      },
      select: {
        status: true,
        financeClearingAccountExternalId: true,
        financeClearingAccountName: true,
      },
    }),
    loadOrganizationFinanceSummary(organizationId, client, { from, to }),
    listOrganizationFinanceCategoryAccountingMappings(organizationId, client),
    client.accountingSyncRecords.findUnique({
      where: {
        provider_sourceType_sourceKey: {
          provider: QUICKBOOKS_PROVIDER,
          sourceType: 'FINANCE_JOURNAL_ENTRY',
          sourceKey,
        },
      },
    }),
  ]);
  const connection = validateConnectionForPreview(connectionRow);
  if (!finance) {
    throw new QuickBooksFinanceJournalSyncError('Organization finance is unavailable.', 404);
  }

  const preview = buildQuickBooksFinanceJournalEntryPreview({
    finance,
    mappings,
    clearingMapping: connection,
    from,
    to,
    now,
  });
  validatePreviewForSync(preview);

  if (existingSync?.status === 'SYNCED') {
    return {
      preview,
      syncRecord: existingSync,
      alreadySynced: true,
    };
  }

  const requestSummary = summarizeJournalEntryRequest(preview, sourceKey);
  const syncRecord = await client.accountingSyncRecords.upsert({
    where: {
      provider_sourceType_sourceKey: {
        provider: QUICKBOOKS_PROVIDER,
        sourceType: 'FINANCE_JOURNAL_ENTRY',
        sourceKey,
      },
    },
    create: {
      id: createId('accounting_sync'),
      organizationId,
      provider: QUICKBOOKS_PROVIDER,
      sourceType: 'FINANCE_JOURNAL_ENTRY',
      sourceKey,
      status: 'PENDING',
      requestSummary,
      errorCode: null,
      errorMessage: null,
      createdBy: actingUserId,
      updatedBy: actingUserId,
    },
    update: {
      status: 'PENDING',
      requestSummary,
      errorCode: null,
      errorMessage: null,
      updatedBy: actingUserId,
    },
  });

  try {
    const result = await quickBooksApiFetch({
      organizationId,
      actingUserId,
      path: '/journalentry',
      method: 'POST',
      body: preview.journalEntryPayload,
      client,
      fetchImpl,
    });
    const journalEntry = parseJournalEntryResponse(result.payload);
    if (!journalEntry.id) {
      throw new QuickBooksFinanceJournalSyncError(
        'QuickBooks did not return a journal entry id.',
        502,
        'MISSING_JOURNAL_ENTRY_ID',
      );
    }

    const updatedSync = await client.accountingSyncRecords.update({
      where: { id: syncRecord.id },
      data: {
        status: 'SYNCED',
        externalTxnId: journalEntry.id,
        externalTxnType: 'JournalEntry',
        externalTxnDocNumber: journalEntry.docNumber,
        intuitTid: result.intuitTid,
        errorCode: null,
        errorMessage: null,
        responseSummary: {
          journalEntryId: journalEntry.id,
          docNumber: journalEntry.docNumber,
          syncToken: journalEntry.syncToken,
        },
        syncedAt: now,
        syncedByUserId: actingUserId,
        updatedBy: actingUserId,
      },
    });

    return {
      preview,
      syncRecord: updatedSync,
      alreadySynced: false,
    };
  } catch (error) {
    const isReauthRequired = isQuickBooksReauthError(error);
    const syncErrorMessage = resolveSyncErrorMessage(error);
    await client.accountingSyncRecords.update({
      where: { id: syncRecord.id },
      data: {
        status: isReauthRequired ? 'REAUTH_REQUIRED' : 'FAILED',
        intuitTid: error instanceof QuickBooksIntegrationError ? error.intuitTid ?? null : null,
        errorCode: error instanceof QuickBooksIntegrationError
          ? error.code ?? null
          : error instanceof QuickBooksFinanceJournalSyncError
            ? error.code ?? null
            : null,
        errorMessage: syncErrorMessage,
        updatedBy: actingUserId,
      },
    });
    if (error instanceof QuickBooksFinanceJournalSyncError) {
      throw error;
    }
    throw new QuickBooksFinanceJournalSyncError(
      syncErrorMessage,
      isReauthRequired ? 409 : 502,
      isReauthRequired ? 'REAUTH_REQUIRED' : 'QUICKBOOKS_SYNC_FAILED',
    );
  }
};
