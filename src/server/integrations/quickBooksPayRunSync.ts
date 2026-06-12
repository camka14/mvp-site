import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import {
  isQuickBooksReauthError,
  quickBooksApiFetch,
  QuickBooksIntegrationError,
  QUICKBOOKS_PROVIDER,
} from '@/server/integrations/quickBooksConnection';

type PrismaLike = any;

type FetchLike = typeof fetch;

type StaffPayRunForSync = {
  id: string;
  organizationId: string;
  title: string;
  periodStart: Date;
  periodEnd: Date;
  scheduledPayDate?: Date | null;
  status: string;
  totalAmountCents: number;
};

type QuickBooksPayRunConnectionMapping = {
  payrollExpenseAccountExternalId?: string | null;
  payrollExpenseAccountName?: string | null;
  payrollLiabilityAccountExternalId?: string | null;
  payrollLiabilityAccountName?: string | null;
};

type ValidatedQuickBooksPayRunMapping = {
  payrollExpenseAccountExternalId: string;
  payrollExpenseAccountName: string | null;
  payrollLiabilityAccountExternalId: string;
  payrollLiabilityAccountName: string | null;
};

export class QuickBooksPayRunSyncError extends Error {
  constructor(
    message: string,
    public status = 400,
    public code?: string | null,
  ) {
    super(message);
    this.name = 'QuickBooksPayRunSyncError';
  }
}

const createId = (prefix: string): string => `${prefix}_${crypto.randomUUID()}`;

const centsToQuickBooksAmount = (cents: number): number => (
  Number((Math.max(0, cents) / 100).toFixed(2))
);

const dateOnly = (value: Date | null | undefined): string | undefined => {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    return undefined;
  }
  return value.toISOString().slice(0, 10);
};

const normalizeText = (value: unknown, maxLength = 1000): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized ? normalized.slice(0, maxLength) : null;
};

const resolveSyncErrorMessage = (error: unknown): string => {
  if (error instanceof QuickBooksIntegrationError) {
    if (error.isReauthRequired) {
      return 'Reconnect QuickBooks before syncing this pay run.';
    }
    return 'QuickBooks rejected the pay-run sync request.';
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message.slice(0, 500);
  }
  return 'QuickBooks pay-run sync failed.';
};

const buildAccountRef = (id: string, name?: string | null) => ({
  value: id,
  ...(name?.trim() ? { name: name.trim() } : {}),
});

export const buildQuickBooksStaffPayRunJournalEntry = ({
  payRun,
  mapping,
}: {
  payRun: StaffPayRunForSync;
  mapping: ValidatedQuickBooksPayRunMapping;
}) => {
  const amount = centsToQuickBooksAmount(payRun.totalAmountCents);
  const period = `${dateOnly(payRun.periodStart) ?? 'unknown'} to ${dateOnly(payRun.periodEnd) ?? 'unknown'}`;
  const description = `BracketIQ staff pay run ${payRun.title}`;

  return {
    TxnDate: dateOnly(payRun.scheduledPayDate) ?? dateOnly(payRun.periodEnd),
    PrivateNote: `${description} (${period})`,
    Line: [
      {
        DetailType: 'JournalEntryLineDetail',
        Amount: amount,
        Description: `Payroll expense: ${payRun.title}`,
        JournalEntryLineDetail: {
          PostingType: 'Debit',
          AccountRef: buildAccountRef(
            mapping.payrollExpenseAccountExternalId,
            mapping.payrollExpenseAccountName,
          ),
        },
      },
      {
        DetailType: 'JournalEntryLineDetail',
        Amount: amount,
        Description: `Payroll liability: ${payRun.title}`,
        JournalEntryLineDetail: {
          PostingType: 'Credit',
          AccountRef: buildAccountRef(
            mapping.payrollLiabilityAccountExternalId,
            mapping.payrollLiabilityAccountName,
          ),
        },
      },
    ],
  };
};

const validatePayRunForSync = (payRun: StaffPayRunForSync | null): StaffPayRunForSync => {
  if (!payRun) {
    throw new QuickBooksPayRunSyncError('Pay run not found.', 404);
  }
  if (payRun.status !== 'APPROVED' && payRun.status !== 'PAID') {
    throw new QuickBooksPayRunSyncError('Only approved or paid staff pay runs can be synced to QuickBooks.', 400);
  }
  if (payRun.totalAmountCents <= 0) {
    throw new QuickBooksPayRunSyncError('Pay run total must be greater than zero before syncing to QuickBooks.', 400);
  }
  return payRun;
};

const validateConnectionMapping = (
  mapping: QuickBooksPayRunConnectionMapping | null,
) => {
  const payrollExpenseAccountExternalId = normalizeText(mapping?.payrollExpenseAccountExternalId, 80);
  const payrollLiabilityAccountExternalId = normalizeText(mapping?.payrollLiabilityAccountExternalId, 80);
  if (!payrollExpenseAccountExternalId || !payrollLiabilityAccountExternalId) {
    throw new QuickBooksPayRunSyncError(
      'Set QuickBooks payroll expense and liability account IDs before syncing pay runs.',
      400,
      'MISSING_ACCOUNT_MAPPING',
    );
  }
  return {
    payrollExpenseAccountExternalId,
    payrollExpenseAccountName: normalizeText(mapping?.payrollExpenseAccountName, 160),
    payrollLiabilityAccountExternalId,
    payrollLiabilityAccountName: normalizeText(mapping?.payrollLiabilityAccountName, 160),
  };
};

const summarizeJournalEntryRequest = (payload: ReturnType<typeof buildQuickBooksStaffPayRunJournalEntry>) => ({
  txnDate: payload.TxnDate ?? null,
  lineCount: payload.Line.length,
  amount: payload.Line[0]?.Amount ?? null,
  postingTypes: payload.Line.map((line) => line.JournalEntryLineDetail.PostingType),
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

export const syncStaffPayRunToQuickBooks = async ({
  organizationId,
  payRunId,
  actingUserId,
  client = prisma,
  fetchImpl,
  now = new Date(),
}: {
  organizationId: string;
  payRunId: string;
  actingUserId: string;
  client?: PrismaLike;
  fetchImpl?: FetchLike;
  now?: Date;
}) => {
  const [payRunRow, connectionRow, existingSync] = await Promise.all([
    client.staffPayRun.findFirst({
      where: {
        id: payRunId,
        organizationId,
      },
    }),
    client.organizationAccountingConnections.findUnique({
      where: {
        organizationId_provider: {
          organizationId,
          provider: QUICKBOOKS_PROVIDER,
        },
      },
      select: {
        payrollExpenseAccountExternalId: true,
        payrollExpenseAccountName: true,
        payrollLiabilityAccountExternalId: true,
        payrollLiabilityAccountName: true,
      },
    }),
    client.accountingSyncRecords.findUnique({
      where: {
        provider_sourceType_staffPayRunId: {
          provider: QUICKBOOKS_PROVIDER,
          sourceType: 'STAFF_PAY_RUN',
          staffPayRunId: payRunId,
        },
      },
    }),
  ]);

  const payRun = validatePayRunForSync(payRunRow);
  const mapping = validateConnectionMapping(connectionRow);
  if (existingSync?.status === 'SYNCED') {
    return {
      payRun,
      syncRecord: existingSync,
      alreadySynced: true,
    };
  }

  const journalEntryPayload = buildQuickBooksStaffPayRunJournalEntry({ payRun, mapping });
  const requestSummary = summarizeJournalEntryRequest(journalEntryPayload);
  const syncRecord = await client.accountingSyncRecords.upsert({
    where: {
      provider_sourceType_staffPayRunId: {
        provider: QUICKBOOKS_PROVIDER,
        sourceType: 'STAFF_PAY_RUN',
        staffPayRunId: payRunId,
      },
    },
    create: {
      id: createId('accounting_sync'),
      organizationId,
      provider: QUICKBOOKS_PROVIDER,
      sourceType: 'STAFF_PAY_RUN',
      staffPayRunId: payRunId,
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
      body: journalEntryPayload,
      client,
      fetchImpl,
    });
    const journalEntry = parseJournalEntryResponse(result.payload);
    if (!journalEntry.id) {
      throw new QuickBooksPayRunSyncError('QuickBooks did not return a journal entry id.', 502, 'MISSING_JOURNAL_ENTRY_ID');
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
    const updatedPayRun = await client.staffPayRun.update({
      where: { id: payRunId },
      data: {
        exportedAt: now,
        exportedByUserId: actingUserId,
        exportCount: { increment: 1 },
        lastExportFormat: 'QUICKBOOKS_JOURNAL_ENTRY',
        updatedBy: actingUserId,
      },
    });
    return {
      payRun: updatedPayRun,
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
          : error instanceof QuickBooksPayRunSyncError
            ? error.code ?? null
            : null,
        errorMessage: syncErrorMessage,
        updatedBy: actingUserId,
      },
    });
    if (error instanceof QuickBooksPayRunSyncError) {
      throw error;
    }
    throw new QuickBooksPayRunSyncError(
      syncErrorMessage,
      isReauthRequired ? 409 : 502,
      isReauthRequired ? 'REAUTH_REQUIRED' : 'QUICKBOOKS_SYNC_FAILED',
    );
  }
};
